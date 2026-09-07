-- Limpieza de columnas y datos muertos (Oracle controlgastos).
-- Hibernate ddl-auto=update NO elimina columnas; hay que hacerlo a mano.

-- Columnas que la app ya no usa
ALTER TABLE CG_CUENTA DROP COLUMN LINEA_CREDITO;
ALTER TABLE CG_SALDO DROP COLUMN DINERO_TARJETA;
ALTER TABLE CG_SALDO DROP COLUMN DEUDA_TOTAL;

-- Cuentas vacías sin movimientos ni gastos (basura del seed antiguo)
DELETE FROM CG_CUENTA c
 WHERE NVL(c.SALDO_ACTUAL, 0) = 0
   AND NOT EXISTS (SELECT 1 FROM CG_MOVIMIENTO m WHERE m.CUENTA_ID = c.ID)
   AND NOT EXISTS (SELECT 1 FROM CG_GASTO g WHERE g.CUENTA_ID = c.ID);

COMMIT;
