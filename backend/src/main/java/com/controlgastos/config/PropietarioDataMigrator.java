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

import com.controlgastos.modelo.UsuarioAcceso;
import com.controlgastos.repositorio.UsuarioAccesoRepository;

/**
 * Dueño de filas sin propietario = primer ADMIN activo de CG_USUARIO (tabla Usuarios).
 * También remapea el legado {@code admin} → ese ADMIN (p. ej. Carlos) cuando ya no hay login "admin".
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

    private final UsuarioAccesoRepository usuarioAccesoRepository;

    @PersistenceContext
    private EntityManager entityManager;

    public PropietarioDataMigrator(UsuarioAccesoRepository usuarioAccesoRepository) {
        this.usuarioAccesoRepository = usuarioAccesoRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        String dueño = resolverDueñoPorDefecto();
        if (dueño == null) {
            return;
        }

        int sinDueño = 0;
        for (String tabla : TABLAS) {
            sinDueño += entityManager.createNativeQuery(
                            "UPDATE " + tabla
                                    + " SET PROPIETARIO = :p"
                                    + " WHERE PROPIETARIO IS NULL OR PROPIETARIO = ''")
                    .setParameter("p", dueño)
                    .executeUpdate();
        }
        if (sinDueño > 0) {
            log.info("Propietario '{}' asignado a {} filas sin dueño", dueño, sinDueño);
        }

        // admin y Carlos son la misma persona si el login semilla ya se renombró
        boolean existeLoginAdmin = usuarioAccesoRepository.findByUsuarioIgnoreCase("admin").isPresent();
        if (!existeLoginAdmin && !"admin".equalsIgnoreCase(dueño)) {
            int remapeadas = 0;
            for (String tabla : TABLAS) {
                remapeadas += entityManager.createNativeQuery(
                                "UPDATE " + tabla
                                        + " SET PROPIETARIO = :nuevo"
                                        + " WHERE PROPIETARIO = 'admin'")
                        .setParameter("nuevo", dueño)
                        .executeUpdate();
            }
            if (remapeadas > 0) {
                log.info("Remapeado propietario legado 'admin' → '{}' en {} filas", dueño, remapeadas);
            }
        }
    }

    private String resolverDueñoPorDefecto() {
        return usuarioAccesoRepository.findAll().stream()
                .filter(UsuarioAcceso::isActivo)
                .filter(UsuarioAcceso::esAdmin)
                .map(UsuarioAcceso::getUsuario)
                .findFirst()
                .orElse(null);
    }
}
