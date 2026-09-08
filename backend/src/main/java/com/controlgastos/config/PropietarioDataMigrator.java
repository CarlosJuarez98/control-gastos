package com.controlgastos.config;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Asigna filas sin propietario al usuario admin (datos previos a multi-usuario).
 */
@Component
@Order(1)
public class PropietarioDataMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PropietarioDataMigrator.class);

    private static final String[] TABLAS = {
            "CG_INGRESO",
            "CG_GASTO",
            "CG_GASTO_MENSUAL",
            "CG_CUENTA",
            "CG_MOVIMIENTO",
            "CG_SALDO",
            "CG_DENOMINACION"
    };

    @PersistenceContext
    private EntityManager entityManager;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        int total = 0;
        for (String tabla : TABLAS) {
            total += entityManager.createNativeQuery(
                    "UPDATE " + tabla
                            + " SET PROPIETARIO = 'admin'"
                            + " WHERE PROPIETARIO IS NULL OR PROPIETARIO = ''")
                    .executeUpdate();
        }
        if (total > 0) {
            log.info("Propietario asignado a admin en {} filas sin dueño", total);
        }
    }
}
