package com.controlgastos.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

/**
 * La sesión HTTP guarda el idle en servidor; la cookie CGSESSION por defecto es
 * “de sesión” (se borra al cerrar el navegador/app). Con “Recordarme” hay que
 * poner Max-Age para que sobreviva al cerrar el cliente.
 */
@Component
public class SessionCookieHelper {

    public static final String COOKIE_NAME = "CGSESSION";

    @Value("${server.servlet.session.cookie.secure:false}")
    private boolean cookieSecure;

    @Value("${server.servlet.session.cookie.path:/}")
    private String cookiePath;

    /** Emite CGSESSION con Max-Age (recordar) o cookie de sesión (sin recordar). */
    public void emitirCookieSesion(HttpServletRequest request, HttpServletResponse response, int maxAgeSec) {
        HttpSession session = request.getSession(false);
        if (session == null) {
            return;
        }
        ResponseCookie.ResponseCookieBuilder b = ResponseCookie.from(COOKIE_NAME, session.getId())
                .httpOnly(true)
                .path(cookiePath == null || cookiePath.isBlank() ? "/" : cookiePath)
                .sameSite("Lax")
                .secure(cookieSecure);
        if (maxAgeSec > 0) {
            b.maxAge(maxAgeSec);
        }
        // maxAgeSec <= 0 → sin Max-Age = cookie de sesión del navegador
        response.addHeader(HttpHeaders.SET_COOKIE, b.build().toString());
    }

    /** Borra la cookie (logout / sesión inválida). */
    public void borrarCookie(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, "")
                .httpOnly(true)
                .path(cookiePath == null || cookiePath.isBlank() ? "/" : cookiePath)
                .sameSite("Lax")
                .secure(cookieSecure)
                .maxAge(0)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}
