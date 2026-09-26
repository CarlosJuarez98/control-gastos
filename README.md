# Control de gastos

App en **español** con **Angular 19** + **Spring Boot 3** + **Oracle** (fuente de verdad en BD; no se reimporta Excel al arrancar).

## Desarrollo local

Doble clic en `dev.bat`:

- **Oracle XE** en Docker (puerto **1522**)
- **API** local con Maven → **8081**
- **Angular** con `ng serve` → **4201** (recarga al guardar)

Abre: http://127.0.0.1:4201/

Uso “todo en Docker”: `iniciar.bat` → app en http://127.0.0.1:8081/

| Servicio | Este proyecto | Otros |
|----------|---------------|-------|
| Angular | **4201** | Mesa 4200 · Limpieza 4202 |
| API | **8081** | Mesa 8080 · Limpieza 8083 |
| Oracle | **1522** | Mesa 1521 · Limpieza 1551 |

## Login

Usuarios reales viven en la tabla **Usuarios** (`CG_USUARIO`), tipicamente `Carlos` y `Mon` (la semilla antigua `admin` se remapea a Carlos).

Contraseña: la que configures en Usuarios / bootstrap (`APP_AUTH_PASSWORD` solo aplica al sembrar el primer ADMIN).

Seguridad: el navegador envía **SHA-256** (no la clave en claro); en Oracle solo se guarda **BCrypt**.

## Multi-usuario

- Cada usuario tiene **sus propios datos** (ingresos, gastos, cuentas, saldos, Compartido).
- Solo **ADMIN** crea/activa usuarios y cambia roles o contraseñas (pantalla Usuarios / `/api/usuarios`).

## Nube

Guía completa: [`DEPLOY-NUBE.md`](DEPLOY-NUBE.md).  
Sync de datos (solo lo nuevo): [`SYNC-DATOS.md`](SYNC-DATOS.md).  
Schema / checklist: [`database/SCHEMA.md`](database/SCHEMA.md).

**Flujo:** local primero → “sube a la nube” = **solo código**. Datos con “sube datos” / “baja datos” (`SYNC-DATOS.md`).

- En **Ampere ARM** no uses Oracle XE en Docker → **ATP Always Free** + `docker-compose.cloud-atp.yml`
- Opcional en VMs **amd64**: `docker-compose.cloud.yml` (XE en contenedor)
- URL pública: `https://gastos.TU_IP.sslip.io/`

Copia `.env.cloud.example` → `.env.cloud` (no subir secretos ni `wallet/`).

## Base de datos local

| Campo | Valor |
|-------|--------|
| Contenedor | `oracle-control-gastos` |
| Host | `localhost` |
| Puerto | **1522** |
| Servicio | `XEPDB1` |
| Usuario | `controlgastos` |

Tablas: ver [`database/SCHEMA.md`](database/SCHEMA.md).

## Estructura

- `backend/` — API REST Spring Boot
- `frontend/` — Angular
- `docker-compose.yml` — Oracle local + API
- `docker-compose.cloud-atp.yml` — API + ATP (Ampere)
- `docker-compose.cloud.yml` — XE + API (amd64)
- `dev.bat` / `iniciar.bat` — arranque local

## API

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/resumen` | Totales y desglose |
| GET/POST | `/api/ingresos` | Ingresos |
| GET/POST | `/api/gastos` | Gastos adicionales |
| GET/POST | `/api/gastos-mensuales` | Fijos mensuales |
| GET/POST | `/api/cuentas` | Deudas / cuentas |
| GET/PUT | `/api/saldo` | Cortes de liquidez |
| GET/POST | `/api/compartido/**` | Gastos y personas compartidas |
| POST | `/api/auth/login` | Iniciar sesión |
| GET | `/api/auth/me` | Estado de sesión |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET/POST/PUT | `/api/usuarios` | Gestión de usuarios (solo ADMIN) |
