# Despliegue en la nube — Control de gastos

Objetivo: abrir la app desde cualquier lugar (celular / otra red) sin dejar la PC encendida.

## Ramas git (local / nube)

Ver **`BRANCHES.md`**.

- Desarrollo diario en la rama **`local`**.
- Deploy a OCI desde la rama **`nube`**.
- Al decir **"sube a la nube"**: merge `local` → `nube`, luego deploy de **código** (sin sync de datos).

## Realidad en Ampere (ARM)

Las VMs **Always Free Ampere A1** son **ARM**. La imagen Docker de **Oracle XE** (`gvenzl/oracle-xe`) es **amd64** y **no corre bien** (o no corre) en Ampere.

**Camino recomendado:** Oracle **Autonomous Database (ATP) Always Free** + solo el contenedor de la API con `docker-compose.cloud-atp.yml`.

Opcional: `docker-compose.cloud.yml` (Oracle XE en Docker) solo tiene sentido en VMs **amd64** donde XE sí arranca.

## Antes de desplegar

1. Prueba en local con `dev.bat` (Oracle XE local + API + Angular hot-reload).
2. Confirma login y datos multi-usuario.
3. Prepara un wallet ATP y un `.env.cloud` (nunca lo subas a git).

## Flujo de trabajo (local primero)

1. Trabajas solo en **local**.
2. Cuando indiques **“sube a la nube”**:
   - se redespliega **código** si cambió
   - **no** se sincronizan datos (nube = datos reales; local = pruebas)
3. Datos solo si pides **“sube datos”** o **“baja datos”** → `SYNC-DATOS.md`
4. La nube no se toca hasta que lo pidas.

## Multi-usuario

- Cada usuario ve **solo sus datos** (ingresos, gastos, cuentas, saldos).
- Solo el rol **ADMIN** gestiona usuarios (`/api/usuarios` y pantalla Usuarios).
- La app pública suele quedar en `http://TU_IP:8081/`.

## 1) VM + ATP (Ampere)

1. Cuenta en https://www.oracle.com/cloud/free/
2. VM **Ampere A1** Ubuntu 22.04; anota la **IP pública**.
3. En la VCN abre el puerto **8081** (y **443** si usas HTTPS).
4. Crea un **Autonomous Database** Always Free; descarga el **wallet** (zip).
5. En el servidor: Docker + compose v2.

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker ubuntu
# cierra sesión SSH y vuelve a entrar
```

## 2) Subir el proyecto y el wallet

Desde tu PC (PowerShell):

```powershell
scp -r A:\Programas-java\control-gastos ubuntu@TU_IP_PUBLICA:~/control-gastos
```

En el servidor:

```bash
cd ~/control-gastos
mkdir -p wallet
# Descomprime el Wallet_*.zip dentro de ./wallet (tnsnames.ora, sqlnet.ora, etc.)
cp .env.cloud.example .env.cloud
nano .env.cloud
```

Ajusta en `.env.cloud`:

- `SPRING_DATASOURCE_URL` (ej. `jdbc:oracle:thin:@cgatodb_tp` según el alias del wallet)
- `SPRING_DATASOURCE_USERNAME` / `SPRING_DATASOURCE_PASSWORD`
- `APP_AUTH_USERNAME` / `APP_AUTH_PASSWORD`
- `APP_CORS_ALLOWED_ORIGINS=http://TU_IP:8081`

## 3) Arrancar (ATP)

```bash
cd ~/control-gastos
docker compose -f docker-compose.cloud-atp.yml --env-file .env.cloud up -d --build
docker compose -f docker-compose.cloud-atp.yml ps
docker logs -f control-gastos-api
```

App (HTTPS, única URL pública): `https://gastos.TU_IP.sslip.io/`  
(ej. IP `163.192.146.143` → `https://gastos.163.192.146.143.sslip.io/`)

El puerto directo `http://TU_IP:8081/` **no** se publica en la nube (solo red Docker → Caddy), para no entrar por HTTP sin PWA/cookies Secure.

Login: usuario de `.env.cloud` (o el usuario real en ATP).

### HTTPS gratis + renovación automática

En la VM compartida ya corre **Caddy** (Let's Encrypt) con productos-limpieza en `:80`/`:443`.  
No hace falta segundo Caddy: se añade el host de gastos al mismo `Caddyfile` y se conecta Caddy a la red Docker de control-gastos.

```bash
# En ~/productos-limpieza/Caddyfile (además del bloque de productos):
gastos.TU_IP.sslip.io {
  encode gzip
  reverse_proxy control-gastos-api:8081
}

docker network connect control-gastos_default productos-limpieza-caddy
docker exec productos-limpieza-caddy caddy reload --config /etc/caddy/Caddyfile
```

**Obligatorio en OCI (una sola vez):** en la Security List (o NSG) de la VCN de la VM, ingress TCP **80** y **443** desde `0.0.0.0/0`.  
Sin eso Let's Encrypt no puede validar y el certificado no sale (timeout). El firewall de la VM (`firewalld`) ya tiene 80/443; el bloqueo típico es la Security List de Oracle.

En consola OCI: **Networking → Virtual Cloud Networks → (tu VCN) → Security Lists → Ingress Rules → Add**:
- Source CIDR `0.0.0.0/0`, TCP, Destination port **80**
- Source CIDR `0.0.0.0/0`, TCP, Destination port **443**

En `.env.cloud` (cuando HTTPS ya responda):

```bash
APP_CORS_ALLOWED_ORIGINS=https://gastos.TU_IP.sslip.io
SERVER_SERVLET_SESSION_COOKIE_SECURE=true
```

Luego recrear el API: `docker compose -f docker-compose.cloud-atp.yml --env-file .env.cloud up -d`

`sslip.io` es un DNS gratis que resuelve `*.IP.sslip.io` → esa IP. Caddy pide y **renueva solo** el certificado Let's Encrypt. Sin coste.

## 4) Opción amd64 + Oracle XE (opcional)

Si la VM es **x86_64** y quieres Oracle en Docker:

```bash
docker compose -f docker-compose.cloud.yml --env-file .env.cloud up -d --build
```

Ese compose usa variables `ORACLE_*` (ver historial / `.env` local). En Ampere ARM **no** uses este camino.

## Seguridad

- No subas `.env.cloud`, `wallet/` ni `Wallet*.zip` a git
- No abras puertos de base de datos a internet
- Cambia todas las contraseñas antes de producción