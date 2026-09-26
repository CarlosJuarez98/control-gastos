package com.controlgastos.controlador;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.controlgastos.dto.UsuarioDto;
import com.controlgastos.modelo.UsuarioAcceso;
import com.controlgastos.repositorio.UsuarioAccesoRepository;
import com.controlgastos.seguridad.PasswordDigests;
import com.controlgastos.servicio.UsuarioAdminService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    public static final String ATTR_TIMEOUT = "cg.sessionTimeoutSec";
    public static final int TIMEOUT_NORMAL_SEC = 20 * 60;
    public static final int TIMEOUT_RECORDAR_SEC = 7 * 24 * 60 * 60;

    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository securityContextRepository;
    private final UsuarioAdminService usuarioAdminService;
    private final UsuarioAccesoRepository usuarioAccesoRepository;
    private final PasswordEncoder passwordEncoder;

    public AuthController(
            AuthenticationManager authenticationManager,
            SecurityContextRepository securityContextRepository,
            UsuarioAdminService usuarioAdminService,
            UsuarioAccesoRepository usuarioAccesoRepository,
            PasswordEncoder passwordEncoder) {
        this.authenticationManager = authenticationManager;
        this.securityContextRepository = securityContextRepository;
        this.usuarioAdminService = usuarioAdminService;
        this.usuarioAccesoRepository = usuarioAccesoRepository;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * {@code password} puede venir ya como SHA-256 hex (cliente) o en claro (compat).
     * En ambos casos se compara contra BCrypt en Oracle; nunca se guarda el claro.
     */
    public record LoginRequest(
            @NotBlank String usuario,
            @NotBlank String password,
            Boolean recordar) {
    }

    public record PasswordChangeRequest(
            @NotBlank String actual,
            @NotBlank String nueva) {
    }

    /** Actualiza nombre y/o contraseña del usuario autenticado. */
    public record PerfilRequest(String usuario, String password) {
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(
            @Valid @RequestBody LoginRequest body,
            HttpServletRequest request,
            HttpServletResponse response) {
        try {
            String presentado = normalizarPasswordPresentado(body.password());
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(body.usuario().trim(), presentado));
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(authentication);
            SecurityContextHolder.setContext(context);
            securityContextRepository.saveContext(context, request, response);

            int timeout = Boolean.TRUE.equals(body.recordar()) ? TIMEOUT_RECORDAR_SEC : TIMEOUT_NORMAL_SEC;
            HttpSession session = request.getSession(true);
            session.setAttribute(ATTR_TIMEOUT, timeout);
            session.setMaxInactiveInterval(timeout);

            return ResponseEntity.ok(Map.of(
                    "autenticado", true,
                    "usuario", authentication.getName(),
                    "rol", rolDe(authentication),
                    "recordar", Boolean.TRUE.equals(body.recordar())));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Usuario o contraseña incorrectos"));
        }
    }

    @GetMapping("/me")
    public Map<String, Object> me(Authentication authentication, HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            Object stored = session.getAttribute(ATTR_TIMEOUT);
            int timeout = stored instanceof Integer i ? i : TIMEOUT_NORMAL_SEC;
            session.setMaxInactiveInterval(timeout);
        }
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            return Map.of("autenticado", false);
        }
        return Map.of(
                "autenticado", true,
                "usuario", authentication.getName(),
                "rol", rolDe(authentication));
    }

    /** El usuario autenticado cambia su propia contraseña. */
    @PutMapping("/password")
    public ResponseEntity<?> cambiarPassword(
            @Valid @RequestBody PasswordChangeRequest body,
            Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "No autenticado"));
        }
        String login = authentication.getName();
        UsuarioAcceso entity = usuarioAccesoRepository.findByUsuarioIgnoreCase(login)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "Usuario no encontrado"));
        String actual = normalizarPasswordPresentado(body.actual());
        if (!passwordEncoder.matches(actual, entity.getPasswordHash())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "La contraseña actual no es correcta"));
        }
        String nueva = normalizarPasswordPresentado(body.nueva());
        if (nueva.length() < 8 && !nueva.matches("(?i)[a-f0-9]{64}")) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "La nueva contraseña debe tener al menos 8 caracteres"));
        }
        entity.setPasswordHash(passwordEncoder.encode(nueva));
        usuarioAccesoRepository.save(entity);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PutMapping("/perfil")
    public ResponseEntity<?> actualizarPerfil(
            @RequestBody PerfilRequest body,
            Authentication authentication,
            HttpServletRequest request,
            HttpServletResponse response) {
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "No autenticado"));
        }
        try {
            UsuarioDto dto = usuarioAdminService.actualizarPerfilPropio(
                    authentication.getName(),
                    body.usuario(),
                    body.password());
            if (!authentication.getName().equalsIgnoreCase(dto.usuario())) {
                Authentication nueva = new UsernamePasswordAuthenticationToken(
                        dto.usuario(),
                        authentication.getCredentials(),
                        authentication.getAuthorities());
                SecurityContext context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(nueva);
                SecurityContextHolder.setContext(context);
                securityContextRepository.saveContext(context, request, response);
            }
            return ResponseEntity.ok(Map.of(
                    "autenticado", true,
                    "usuario", dto.usuario(),
                    "rol", dto.rol() != null ? dto.rol() : rolDe(authentication)));
        } catch (org.springframework.web.server.ResponseStatusException ex) {
            String msg = ex.getReason() != null ? ex.getReason() : "No se pudo actualizar el perfil";
            return ResponseEntity.status(ex.getStatusCode()).body(Map.of("error", msg));
        }
    }

    private static String rolDe(Authentication authentication) {
        return authentication.getAuthorities().stream()
                .map(a -> a.getAuthority())
                .filter(a -> a.startsWith("ROLE_"))
                .map(a -> a.substring(5))
                .findFirst()
                .orElse("USER");
    }

    private static String normalizarPasswordPresentado(String password) {
        String value = password.trim();
        if (value.matches("(?i)[a-f0-9]{64}")) {
            return value.toLowerCase();
        }
        return PasswordDigests.sha256Hex(value);
    }
}
