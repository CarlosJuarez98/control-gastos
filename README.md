# Control de gastos

App en **español** con **Angular 19** + **Spring Boot 3** + **Oracle XE propio** (Docker separado; no usa Mesa Lista).

La **fuente de verdad es Oracle**: ingresos, gastos, deudas y saldos viven en la base. No se reimporta Excel al arrancar.

## Arranque

### Uso normal (todo en Docker)

Doble clic en:

```text
iniciar.bat
```

Levanta Oracle, la API (8081), Angular embebido y abre el navegador.

### Desarrollo del front (BD real + hot-reload)

Doble clic en:

```text
dev.bat
```

- **Oracle** en Docker (puerto **1522**)
- **API** local con Maven → **8081** (misma BD)
- **Angular** con `ng serve` → **4201** (recarga al guardar)

Abre: http://127.0.0.1:4201/

| Servicio | Este proyecto | Otros |
|----------|---------------|-------|
| Angular | **4201** | Mesa 4200 · Limpieza 4202 |
| API | **8081** | Mesa 8080 · Limpieza 8083 |
| Oracle | **1522** | Mesa 1521 · Limpieza 1551 |

App (Docker): http://127.0.0.1:8081/  
App (dev): http://127.0.0.1:4201/

## Desarrollo manual (opcional)

```powershell
cd A:\Programas-java\control-gastos
docker compose up -d oracle

cd backend
mvn spring-boot:run

cd ..\frontend
npm start
```

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

El volumen Docker de Oracle conserva tus datos entre reinicios. No borres el contenedor/volumen si quieres mantener el historial.

## Estructura

- `backend/` — API REST Spring Boot
- `frontend/` — Angular
- `docker-compose.yml` — Oracle propio + API
- `iniciar.bat` — Oracle + API + Angular + navegador
- `dev.bat` — Oracle + API local + Angular hot-reload

## API

| Método | Ruta | Uso |
|--------|------|-----|
| GET | `/api/resumen` | Totales y desglose |
| GET/POST | `/api/ingresos` | Ingresos |
| GET/POST | `/api/gastos` | Gastos adicionales |
| GET/POST | `/api/gastos-mensuales` | Fijos mensuales |
| GET/POST | `/api/cuentas` | Deudas / cuentas |
| GET/PUT | `/api/saldo` | Cortes de liquidez |
