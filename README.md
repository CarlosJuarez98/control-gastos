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

- Usuario por defecto: `admin`
- Contraseña: `APP_AUTH_PASSWORD` (local en `application.properties`; nube en `.env.cloud`)

Seguridad: el navegador envía **SHA-256** (no la clave en claro); en Oracle solo se guarda **BCrypt**.

## Multi-usuario

- Cada usuario tiene **sus propios datos** (ingresos, gastos, cuentas, saldos).
- Solo **ADMIN** crea/activa usuarios y cambia roles o contraseñas (pantalla Usuarios / `/api/usuarios`).

## Nube

Guía completa: [`DEPLOY-NUBE.md`](DEPLOY-NUBE.md).  
Sync de datos (solo lo nuevo): [`SYNC-DATOS.md`](SYNC-DATOS.md).

**Flujo:** local primero → cuando digas “sube a la nube”, se sube código (si cambió) + **datos nuevos** (incremental).

- En **Ampere ARM** no uses Oracle XE en Docker → **ATP Always Free** + `docker-compose.cloud-atp.yml`
- Opcional en VMs **amd64**: `docker-compose.cloud.yml` (XE en contenedor)
- URL típica: `http://TU_IP:8081/`

Copia `.env.cloud.example` → `.env.cloud` (no subir secretos ni `wallet/`).

## Base de datos local

| Campo | Valor |
|-------|--------|
| Contenedor | `oracle-control-gastos` |
| Host | `localhost` |
| Puerto | **1522** |
| Servicio | `XEPDB1` |
| Usuario | `controlgastos` |

Tablas: `CG_INGRESO`, `CG_GASTO`, `CG_GASTO_MENSUAL`, `CG_CUENTA`, `CG_MOVIMIENTO`, `CG_SALDO`, `CG_DENOMINACION`, `CG_USUARIO`.

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
| POST | `/api/auth/login` | Iniciar sesión |
| GET | `/api/auth/me` | Estado de sesión |
| POST | `/api/auth/logout` | Cerrar sesión |
| GET/POST/PUT | `/api/usuarios` | Gestión de usuarios (solo ADMIN) |