package com.controlgastos.controlador;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.controlgastos.seguridad.PasswordDigests;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository securityContextRepository;

    public AuthController(
            AuthenticationManager authenticationManager,
            SecurityContextRepository securityContextRepository) {
        this.authenticationManager = authenticationManager;
        this.securityContextRepository = securityContextRepository;
    }

    /**
     * {@code password} puede venir ya como SHA-256 hex (cliente) o en claro (compat).
     * En ambos casos se compara contra BCrypt en Oracle; nunca se guarda el claro.
     */
    public record LoginRequest(
            @NotBlank String usuario,
            @NotBlank String password) {
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(
            @Valid @RequestBody LoginRequest body,
            HttpServletRequest request,
            HttpServletResponse response) {
        try {
            String presentado = normalizarPasswordPresentado(body.password());
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(body.usuario(), presentado));
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(authentication);
            SecurityContextHolder.setContext(context);
            securityContextRepository.saveContext(context, request, response);
            return ResponseEntity.ok(Map.of(
                    "autenticado", true,
                    "usuario", authentication.getName(),
                    "rol", rolDe(authentication)));
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Usuario o contraseña incorrectos"));
        }
    }

    @GetMapping("/me")
    public Map<String, Object> me(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            return Map.of("autenticado", false);
        }
        return Map.of(
                "autenticado", true,
                "usuario", authentication.getName(),
                "rol", rolDe(authentication));
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
