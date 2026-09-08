package com.controlgastos.seguridad;

import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public final class Sesion {

    private Sesion() {
    }

    /** Usuario autenticado actual; lanza si no hay sesión. */
    public static String usuario() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null
                || !auth.isAuthenticated()
                || auth instanceof AnonymousAuthenticationToken
                || auth.getPrincipal() == null
                || "anonymousUser".equals(auth.getPrincipal())) {
            throw new IllegalStateException("No hay usuario autenticado");
        }
        return auth.getName();
    }
}
