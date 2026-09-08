package com.controlgastos.servicio;

import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import com.controlgastos.modelo.UsuarioAcceso;
import com.controlgastos.repositorio.UsuarioAccesoRepository;

@Service
public class DbUserDetailsService implements UserDetailsService {

    private final UsuarioAccesoRepository usuarioAccesoRepository;

    public DbUserDetailsService(UsuarioAccesoRepository usuarioAccesoRepository) {
        this.usuarioAccesoRepository = usuarioAccesoRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        UsuarioAcceso usuario = usuarioAccesoRepository.findByUsuarioIgnoreCase(username)
                .orElseThrow(() -> new UsernameNotFoundException("Usuario no encontrado"));
        if (!usuario.isActivo()) {
            throw new UsernameNotFoundException("Usuario inactivo");
        }
        String rol = usuario.getRol() == null || usuario.getRol().isBlank()
                ? UsuarioAcceso.ROL_USER
                : usuario.getRol().trim().toUpperCase();
        return User.withUsername(usuario.getUsuario())
                .password(usuario.getPasswordHash())
                .roles(rol)
                .disabled(!usuario.isActivo())
                .build();
    }
}
