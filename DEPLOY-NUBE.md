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

App: `http://TU_IP:8081/`  
Login: usuario de `.env.cloud` (por defecto documentado como `admin`).

En `.env.cloud` (HTTP):

```bash
APP_CORS_ALLOWED_ORIGINS=http://TU_IP:8081
SERVER_SERVLET_SESSION_COOKIE_SECURE=false
```

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