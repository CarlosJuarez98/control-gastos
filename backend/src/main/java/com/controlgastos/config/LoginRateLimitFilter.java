package com.controlgastos.config;

import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;

@Component
public class LoginRateLimitFilter extends OncePerRequestFilter {

    private static final int MAX_FAILED = 20;
    private static final long WINDOW_MS = 15 * 60 * 1000L;

    private final ConcurrentHashMap<String, AttemptWindow> byIp = new ConcurrentHashMap<>();

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        if (!esLoginPost(request)) {
            filterChain.doFilter(request, response);
            return;
        }
        String ip = clientIp(request);
        if (demasiadosIntentos(ip)) {
            response.setStatus(429);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"error\":\"Demasiados intentos. Espera unos minutos.\"}");
            return;
        }
        StatusCapture wrapped = new StatusCapture(response);
        filterChain.doFilter(request, wrapped);
        if (wrapped.status == HttpServletResponse.SC_UNAUTHORIZED) {
            registrarFallo(ip);
        }
    }

    private static boolean esLoginPost(HttpServletRequest request) {
        return HttpMethod.POST.matches(request.getMethod())
                && request.getRequestURI() != null
                && request.getRequestURI().endsWith("/api/auth/login");
    }

    private boolean demasiadosIntentos(String ip) {
        AttemptWindow window = byIp.get(ip);
        if (window == null) {
            return false;
        }
        window.purgeOld();
        return window.count >= MAX_FAILED;
    }

    private void registrarFallo(String ip) {
        long now = System.currentTimeMillis();
        byIp.compute(ip, (key, window) -> {
            AttemptWindow w = window != null ? window : new AttemptWindow();
            w.purgeBefore(now - WINDOW_MS);
            w.timestamps.add(now);
            w.count = w.timestamps.size();
            return w;
        });
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private static final class AttemptWindow {
        private final java.util.ArrayList<Long> timestamps = new java.util.ArrayList<>();
        private int count;

        void purgeOld() {
            purgeBefore(System.currentTimeMillis() - WINDOW_MS);
        }

        void purgeBefore(long cutoff) {
            timestamps.removeIf(t -> t < cutoff);
            count = timestamps.size();
        }
    }

    private static final class StatusCapture extends HttpServletResponseWrapper {
        private int status = HttpServletResponse.SC_OK;

        StatusCapture(HttpServletResponse response) {
            super(response);
        }

        @Override
        public void setStatus(int sc) {
            status = sc;
            super.setStatus(sc);
        }

        @Override
        public void sendError(int sc) throws IOException {
            status = sc;
            super.sendError(sc);
        }

        @Override
        public void sendError(int sc, String msg) throws IOException {
            status = sc;
            super.sendError(sc, msg);
        }
    }
}
