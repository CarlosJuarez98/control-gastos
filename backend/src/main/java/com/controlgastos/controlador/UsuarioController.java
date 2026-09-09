package com.controlgastos.controlador;

import java.util.List;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.controlgastos.dto.UsuarioDto;
import com.controlgastos.servicio.UsuarioAdminService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

@RestController
@RequestMapping("/api/usuarios")
public class UsuarioController {

    private final UsuarioAdminService usuarioAdminService;

    public UsuarioController(UsuarioAdminService usuarioAdminService) {
        this.usuarioAdminService = usuarioAdminService;
    }

    public record CrearUsuarioRequest(
            @NotBlank String usuario,
            @NotBlank String password,
            String rol) {
    }

    public record PasswordRequest(@NotBlank String password) {
    }

    public record NombreRequest(@NotBlank String usuario) {
    }

    public record ActivoRequest(boolean activo) {
    }

    public record RolRequest(@NotBlank String rol) {
    }

    @GetMapping
    public List<UsuarioDto> listar() {
        return usuarioAdminService.listar();
    }

    @PostMapping
    public UsuarioDto crear(@Valid @RequestBody CrearUsuarioRequest body) {
        return usuarioAdminService.crear(body.usuario(), body.password(), body.rol());
    }

    @PutMapping("/{id}/password")
    public UsuarioDto cambiarPassword(@PathVariable Long id, @Valid @RequestBody PasswordRequest body) {
        return usuarioAdminService.cambiarPassword(id, body.password());
    }

    @PutMapping("/{id}/nombre")
    public UsuarioDto cambiarNombre(@PathVariable Long id, @Valid @RequestBody NombreRequest body) {
        return usuarioAdminService.cambiarNombre(id, body.usuario());
    }

    @PutMapping("/{id}/activo")
    public UsuarioDto cambiarActivo(
            @PathVariable Long id,
            @RequestBody ActivoRequest body,
            Authentication authentication) {
        return usuarioAdminService.cambiarActivo(id, body.activo(), authentication.getName());
    }

    @PutMapping("/{id}/rol")
    public UsuarioDto cambiarRol(
            @PathVariable Long id,
            @Valid @RequestBody RolRequest body,
            Authentication authentication) {
        return usuarioAdminService.cambiarRol(id, body.rol(), authentication.getName());
    }

    @DeleteMapping("/{id}")
    public void eliminar(@PathVariable Long id, Authentication authentication) {
        usuarioAdminService.eliminar(id, authentication.getName());
    }
}
