# Schema Oracle — Control de gastos

Hibernate usa `ddl-auto=update`: **crea/amplía** tablas y columnas, **no borra** nada.
Tras deploy a la nube, conviene verificar columnas críticas (sobre todo MSI / disposición / Compartido).

## Checklist post-deploy (ATP o local)

En SQL Developer / sqlplus, contra el esquema `controlgastos`:

```sql
-- Debe devolver filas (si falta alguna, hibernate no migró o hay error de arranque)
SELECT table_name FROM user_tables
WHERE table_name IN (
  'CG_USUARIO','CG_CUENTA','CG_INGRESO','CG_GASTO','CG_GASTO_MENSUAL',
  'CG_MOVIMIENTO','CG_SALDO','CG_DENOMINACION','CG_HISTORIAL_ANUAL',
  'CG_PERSONA_COMPARTIDA','CG_SERVICIO_FIJO_COMPARTIDO',
  'CG_GASTO_COMPARTIDO','CG_PARTE_GASTO_COMPARTIDO','CG_MOV_PERSONA_COMPARTIDA'
)
ORDER BY 1;

-- Columnas MSI / disposición
SELECT column_name FROM user_tab_columns
WHERE table_name = 'CG_GASTO' AND column_name IN ('MESES','CUOTA_MENSUAL','FORMA_PAGO');

SELECT column_name FROM user_tab_columns
WHERE table_name = 'CG_GASTO_MENSUAL'
  AND column_name IN (
    'MESES_TOTALES','MESES_RESTANTES','MONTO_TOTAL',
    'GASTO_ORIGEN_ID','SERVICIO_FIJO_COMPARTIDO_ID','DIA_PAGO'
  );
```

También: `database/verify-schema.sql` (script listo para pegar).

## Tablas

| Tabla | Uso |
|-------|-----|
| `CG_USUARIO` | Logins (Carlos, Mon, …); dueño = nombre de usuario |
| `CG_CUENTA` | Deudas / TDC |
| `CG_INGRESO` | Ingresos |
| `CG_GASTO` | Gastos; disposición: `MONTO`=recibido, `CUOTA_MENSUAL`=total banco |
| `CG_GASTO_MENSUAL` | Fijos + planes MSI |
| `CG_MOVIMIENTO` | Movimientos de cuenta |
| `CG_SALDO` | Cortes de liquidez |
| `CG_DENOMINACION` | Efectivo contado |
| `CG_HISTORIAL_ANUAL` | Totales por año |
| `CG_PERSONA_COMPARTIDA` | Personas Compartido |
| `CG_SERVICIO_FIJO_COMPARTIDO` | Plantillas de fijos compartidos |
| `CG_GASTO_COMPARTIDO` | Gastos/deudas compartidos |
| `CG_PARTE_GASTO_COMPARTIDO` | Partes por persona (sin `PROPIETARIO`; cuelga del gasto) |
| `CG_MOV_PERSONA_COMPARTIDA` | Abonos / deudas por persona |

## Limpieza

Columnas muertas: `database/cleanup-unused.sql` (Hibernate no las quita).
