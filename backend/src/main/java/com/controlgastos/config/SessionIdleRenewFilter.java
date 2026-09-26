package com.controlgastos.config;

import java.io.IOException;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.controlgastos.controlador.AuthController;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

/** Renueva idle timeout (20 min / 7 días) en cada petición. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class SessionIdleRenewFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        HttpSession session = request.getSession(false);
        if (session != null) {
            Object stored = session.getAttribute(AuthController.ATTR_TIMEOUT);
            int timeout = stored instanceof Integer i ? i : AuthController.TIMEOUT_NORMAL_SEC;
            session.setMaxInactiveInterval(timeout);
        }
        filterChain.doFilter(request, response);
    }
}
