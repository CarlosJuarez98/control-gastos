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

/**
 * Asegura el usuario admin inicial en Oracle.
 * Flujo: contraseña → SHA-256 → BCrypt. En CG_USUARIO solo se guarda el BCrypt.
 */
@Component
@Order(0)
public class UsuarioBootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(UsuarioBootstrap.class);

    private final UsuarioAccesoRepository usuarioAccesoRepository;
    private final PasswordEncoder passwordEncoder;

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
        String digest = PasswordDigests.sha256Hex(passwordPlanoSemilla);
        UsuarioAcceso usuario = usuarioAccesoRepository.findByUsuarioIgnoreCase(username)
                .orElseGet(UsuarioAcceso::new);
        boolean nuevo = usuario.getId() == null;
        boolean cambiarHash = nuevo
                || usuario.getPasswordHash() == null
                || !passwordEncoder.matches(digest, usuario.getPasswordHash());

        usuario.setUsuario(username);
        usuario.setActivo(true);
        usuario.setRol(UsuarioAcceso.ROL_ADMIN);
        if (cambiarHash) {
            usuario.setPasswordHash(passwordEncoder.encode(digest));
        }
        usuarioAccesoRepository.save(usuario);
        log.info(
                "Usuario admin {} en CG_USUARIO (PASSWORD_HASH = BCrypt, no reversible)",
                nuevo ? "creado" : (cambiarHash ? "actualizado" : "ok"));
    }
}
