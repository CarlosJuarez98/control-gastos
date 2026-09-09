package com.controlgastos.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.controlgastos.modelo.UsuarioAcceso;
import com.controlgastos.repositorio.UsuarioAccesoRepository;
import com.controlgastos.seguridad.PasswordDigests;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

/**
 * Semilla del primer admin solo si CG_USUARIO está vacía.
 * Si el admin se renombra (p. ej. admin → Carlos), no se vuelve a crear al reiniciar.
 * También limpia un "admin" fantasma recreado por versiones viejas del bootstrap.
 */
@Component
@Order(0)
public class UsuarioBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(UsuarioBootstrap.class);

    private static final String[] TABLAS_PROPIETARIO = {
            "CG_INGRESO",
            "CG_GASTO",
            "CG_GASTO_MENSUAL",
            "CG_CUENTA",
            "CG_MOVIMIENTO",
            "CG_SALDO",
            "CG_DENOMINACION"
    };

    private final UsuarioAccesoRepository usuarioAccesoRepository;
    private final PasswordEncoder passwordEncoder;

    @PersistenceContext
    private EntityManager entityManager;

    @Value("${app.auth.username}")
    private String username;

    @Value("${app.auth.password}")
    private String passwordPlanoSemilla;

    public UsuarioBootstrap(
            UsuarioAccesoRepository usuarioAccesoRepository,
            PasswordEncoder passwordEncoder) {
        this.usuarioAccesoRepository = usuarioAccesoRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        long existentes = usuarioAccesoRepository.count();
        if (existentes > 0) {
            limpiarSemillaFantasma();
            log.info("CG_USUARIO ya tiene {} usuario(s); no se recrea la semilla '{}'",
                    usuarioAccesoRepository.count(), username);
            return;
        }

        String digest = PasswordDigests.sha256Hex(passwordPlanoSemilla);
        UsuarioAcceso usuario = new UsuarioAcceso();
        usuario.setUsuario(username);
        usuario.setActivo(true);
        usuario.setRol(UsuarioAcceso.ROL_ADMIN);
        usuario.setPasswordHash(passwordEncoder.encode(digest));
        usuarioAccesoRepository.save(usuario);
        log.info("Usuario admin semilla '{}' creado en CG_USUARIO (PASSWORD_HASH = BCrypt)", username);
    }

    /**
     * Si quedó un usuario semilla (admin) vacío y ya hay otro admin activo
     * (porque se renombró), lo elimina. No toca usuarios con datos.
     */
    private void limpiarSemillaFantasma() {
        usuarioAccesoRepository.findByUsuarioIgnoreCase(username).ifPresent(seed -> {
            boolean otroAdmin = usuarioAccesoRepository.findAll().stream()
                    .filter(UsuarioAcceso::isActivo)
                    .filter(UsuarioAcceso::esAdmin)
                    .anyMatch(u -> !u.getId().equals(seed.getId()));
            if (!otroAdmin || tieneDatos(seed.getUsuario())) {
                return;
            }
            usuarioAccesoRepository.delete(seed);
            log.info("Eliminado usuario semilla fantasma '{}' (sin datos; hay otro admin)", username);
        });
    }

    private boolean tieneDatos(String propietario) {
        for (String tabla : TABLAS_PROPIETARIO) {
            Number n = (Number) entityManager.createNativeQuery(
                    "SELECT COUNT(*) FROM " + tabla + " WHERE PROPIETARIO = :u")
                    .setParameter("u", propietario)
                    .getSingleResult();
            if (n != null && n.longValue() > 0) {
                return true;
            }
        }
        return false;
    }
}
