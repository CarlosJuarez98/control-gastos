# Control de gastos

App en **español** con **Angular 19** + **Spring Boot 3** + **Oracle XE propio** (Docker separado; no usa Mesa Lista).

Importa tu Excel `Control de gastos.xlsx` al arrancar (ingresos, gastos, fijos mensuales, deudas/cuentas, saldo y efectivo).

## Arranque rápido

```powershell
cd A:\Programas\control-gastos
.\empaquetar.bat   # solo la primera vez o si cambias código
.\iniciar.bat      # o iniciar-control-gastos.bat
```

`iniciar.bat` levanta el Oracle de este proyecto y abre la app.

| Servicio | Este proyecto | Mesa Lista |
|----------|---------------|------------|
| App / API | **8081** | 8080 |
| Oracle | **1522** | 1521 |
| Oracle EM | **5501** | 5500 |
| Angular (dev) | **4201** | 4200 |

App: http://localhost:8081

## Desarrollo

```powershell
# Oracle propio
cd A:\Programas\control-gastos
docker compose up -d oracle

# Terminal 1 — API (puerto 8081)
cd backend
mvn spring-boot:run

# Terminal 2 — Angular (puerto 4201, proxy a :8081)
cd ..\frontend
npm install
npm start
```

Frontend: http://localhost:4201

## Base de datos (solo este proyecto)

| Campo | Valor |
|-------|--------|
| Contenedor | `oracle-control-gastos` |
| Host | `localhost` |
| Puerto | `1522` |
| Servicio | `XEPDB1` |
| Usuario | `controlgastos` |
| Contraseña | `ControlGastos2026` |

Tablas: `CG_INGRESO`, `CG_GASTO`, `CG_GASTO_MENSUAL`, `CG_CUENTA`, `CG_MOVIMIENTO`, `CG_SALDO`, `CG_DENOMINACION`.

La importación del Excel solo corre si las tablas están vacías. Para reimportar, borra las tablas `CG_*` (ver `database/README.md`) o prueba con H2:

```powershell
java -jar backend\target\control-gastos-1.0.0.jar --spring.profiles.active=h2
```

## Estructura

- `backend/` — API REST Spring Boot
- `frontend/` — Angular
- `_import/` — JSON generado desde el Excel
- `docker-compose.yml` — Oracle propio + API
- `empaquetar.bat` / `iniciar-control-gastos.bat`

## API

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/resumen` | Totales y desglose |
| GET/POST | `/api/ingresos` | Ingresos |
| GET/POST | `/api/gastos` | Gastos adicionales |
| GET/POST | `/api/gastos-mensuales` | Fijos mensuales |
| GET/POST | `/api/cuentas` | Deudas / cuentas |
| GET/POST | `/api/cuentas/{id}/movimientos` | Abonos, cargos, intereses |
| GET/PUT | `/api/saldo` | Snapshot de liquidez |
