# Oracle propio de Control de gastos

Contenedor Docker: `oracle-control-gastos` (puerto host **1522**).

No usa ni modifica el Oracle de Mesa Lista (`oracle-mesa-lista` / puerto 1521).

La **fuente de verdad** es esta base: la app ya no importa Excel ni `seed-data.json` al arrancar.

Schema detallado y checklist post-deploy: [`SCHEMA.md`](SCHEMA.md).

## Conexión (SQL Developer / JDBC)

| Campo | Valor |
|-------|--------|
| Host | `localhost` |
| Puerto | `1522` |
| Servicio | `XEPDB1` |
| Usuario | `controlgastos` |
| Contraseña | `ControlGastos2026` (solo local Docker) |

## Arrancar solo la base

```powershell
cd A:\Programas-java\control-gastos
docker compose up -d oracle
```

## Conservar datos

El volumen Docker `oracle-control-gastos-data` guarda todo. Usa `docker compose stop` / `start`; no hagas `docker compose down -v` salvo que quieras borrar la BD.

## Tablas

Core: `CG_USUARIO`, `CG_INGRESO`, `CG_GASTO`, `CG_GASTO_MENSUAL`, `CG_CUENTA`, `CG_MOVIMIENTO`, `CG_SALDO`, `CG_DENOMINACION`, `CG_HISTORIAL_ANUAL`.

Compartido: `CG_PERSONA_COMPARTIDA`, `CG_SERVICIO_FIJO_COMPARTIDO`, `CG_GASTO_COMPARTIDO`, `CG_PARTE_GASTO_COMPARTIDO`, `CG_MOV_PERSONA_COMPARTIDA`.

Verificación: `database/verify-schema.sql`.

## Limpieza de columnas/datos muertos

Si se retiraron campos del código (p. ej. `LINEA_CREDITO`, `DINERO_TARJETA`, `DEUDA_TOTAL` en saldo), ejecuta:

```text
database/cleanup-unused.sql
```

Hibernate `ddl-auto=update` no borra columnas; hace falta el script.
