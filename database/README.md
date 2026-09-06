# Oracle propio de Control de gastos

Contenedor Docker: `oracle-control-gastos` (puerto host **1522**).

No usa ni modifica el Oracle de Mesa Lista (`oracle-mesa-lista` / puerto 1521).

## Conexión (SQL Developer / JDBC)

| Campo | Valor |
|-------|--------|
| Host | `localhost` |
| Puerto | `1522` |
| Servicio | `XEPDB1` |
| Usuario | `controlgastos` |
| Contraseña | `ControlGastos2026` |

## Arrancar solo la base

```powershell
cd A:\Programas\control-gastos
docker compose up -d oracle
```

## Reimportar Excel

Con la app detenida, conectado como `controlgastos`:

```sql
DROP TABLE CG_MOVIMIENTO CASCADE CONSTRAINTS;
DROP TABLE CG_DENOMINACION CASCADE CONSTRAINTS;
DROP TABLE CG_SALDO CASCADE CONSTRAINTS;
DROP TABLE CG_GASTO CASCADE CONSTRAINTS;
DROP TABLE CG_INGRESO CASCADE CONSTRAINTS;
DROP TABLE CG_GASTO_MENSUAL CASCADE CONSTRAINTS;
DROP TABLE CG_CUENTA CASCADE CONSTRAINTS;
```

Al volver a iniciar la app, vuelve a cargar `seed-data.json`.
