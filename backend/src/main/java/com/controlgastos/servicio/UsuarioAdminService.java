package com.controlgastos.servicio;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.controlgastos.dto.UsuarioDto;
import com.controlgastos.modelo.UsuarioAcceso;
import com.controlgastos.repositorio.UsuarioAccesoRepository;
import com.controlgastos.seguridad.PasswordDigests;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

@Service
public class UsuarioAdminService {

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

    public UsuarioAdminService(
            UsuarioAccesoRepository usuarioAccesoRepository,
            PasswordEncoder passwordEncoder) {
        this.usuarioAccesoRepository = usuarioAccesoRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public List<UsuarioDto> listar() {
        return usuarioAccesoRepository.findAll().stream()
                .sorted((a, b) -> a.getUsuario().compareToIgnoreCase(b.getUsuario()))
                .map(this::toDto)
                .toList();
    }

    @Transactional
    public UsuarioDto crear(String usuario, String passwordPresentado, String rol) {
        String nombre = normalizarUsuario(usuario);
        if (usuarioAccesoRepository.findByUsuarioIgnoreCase(nombre).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ese usuario ya existe");
        }
        UsuarioAcceso entity = new UsuarioAcceso();
        entity.setUsuario(nombre);
        entity.setPasswordHash(passwordEncoder.encode(normalizarPassword(passwordPresentado)));
        entity.setRol(normalizarRol(rol));
        entity.setActivo(true);
        return toDto(usuarioAccesoRepository.save(entity));
    }

    @Transactional
    public UsuarioDto cambiarPassword(Long id, String passwordPresentado) {
        UsuarioAcceso entity = buscar(id);
        entity.setPasswordHash(passwordEncoder.encode(normalizarPassword(passwordPresentado)));
        return toDto(usuarioAccesoRepository.save(entity));
    }

    @Transactional
    public UsuarioDto cambiarNombre(Long id, String nuevoUsuario) {
        UsuarioAcceso entity = buscar(id);
        return renombrar(entity, nuevoUsuario);
    }

    @Transactional
    public UsuarioDto actualizarPerfilPropio(String actor, String nuevoUsuario, String passwordPresentado) {
        UsuarioAcceso entity = usuarioAccesoRepository.findByUsuarioIgnoreCase(actor)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
        boolean cambio = false;
        if (nuevoUsuario != null && !nuevoUsuario.isBlank()
                && !entity.getUsuario().equalsIgnoreCase(nuevoUsuario.trim())) {
            renombrar(entity, nuevoUsuario);
            cambio = true;
        }
        if (passwordPresentado != null && !passwordPresentado.isBlank()) {
            entity.setPasswordHash(passwordEncoder.encode(normalizarPassword(passwordPresentado)));
            usuarioAccesoRepository.save(entity);
            cambio = true;
        }
        if (!cambio) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indica un nombre o contraseña nuevos");
        }
        return toDto(entity);
    }

    private UsuarioDto renombrar(UsuarioAcceso entity, String nuevoUsuario) {
        String anterior = entity.getUsuario();
        String nombre = normalizarUsuario(nuevoUsuario);
        if (anterior.equalsIgnoreCase(nombre)) {
            return toDto(entity);
        }
        if (usuarioAccesoRepository.findByUsuarioIgnoreCase(nombre).isPresent()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ese usuario ya existe");
        }
        entity.setUsuario(nombre);
        UsuarioAcceso guardado = usuarioAccesoRepository.save(entity);
        for (String tabla : TABLAS_PROPIETARIO) {
            entityManager.createNativeQuery(
                    "UPDATE " + tabla + " SET PROPIETARIO = :nuevo WHERE PROPIETARIO = :anterior")
                    .setParameter("nuevo", nombre)
                    .setParameter("anterior", anterior)
                    .executeUpdate();
        }
        return toDto(guardado);
    }

    @Transactional
    public UsuarioDto cambiarActivo(Long id, boolean activo, String actor) {
        UsuarioAcceso entity = buscar(id);
        if (!activo) {
            // Primero: nunca dejar el sistema sin admin activo (aunque sea tu propio perfil).
            if (entity.esAdmin() && entity.isActivo() && contarAdminsActivos() <= 1) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "No se puede pausar: es el único administrador. Crea otro ADMIN antes.");
            }
            if (entity.getUsuario().equalsIgnoreCase(actor)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No puedes desactivar tu propio usuario");
            }
        }
        entity.setActivo(activo);
        return toDto(usuarioAccesoRepository.save(entity));
    }

    @Transactional
    public UsuarioDto cambiarRol(Long id, String rol, String actor) {
        UsuarioAcceso entity = buscar(id);
        String nuevoRol = normalizarRol(rol);
        if (entity.esAdmin()
                && UsuarioAcceso.ROL_USER.equals(nuevoRol)
                && entity.isActivo()
                && contarAdminsActivos() <= 1) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "No se puede quitar el rol ADMIN: es el único administrador activo");
        }
        if (entity.getUsuario().equalsIgnoreCase(actor)
                && UsuarioAcceso.ROL_USER.equals(nuevoRol)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No puedes quitarte el rol admin a ti mismo");
        }
        entity.setRol(nuevoRol);
        return toDto(usuarioAccesoRepository.save(entity));
    }

    @Transactional
    public void eliminar(Long id, String actor) {
        UsuarioAcceso entity = buscar(id);
        if (entity.getUsuario().equalsIgnoreCase(actor)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No puedes eliminar tu propio usuario");
        }
        if (entity.esAdmin() && entity.isActivo() && contarAdminsActivos() <= 1) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "No se puede eliminar: es el único administrador activo");
        }
        if (tieneDatos(entity.getUsuario())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Ese usuario aún tiene datos; desactívalo o migra sus movimientos antes de borrarlo");
        }
        usuarioAccesoRepository.delete(entity);
    }

    /** True si el login aparece como propietario en alguna tabla de datos. */
    private boolean tieneDatos(String usuario) {
        for (String tabla : TABLAS_PROPIETARIO) {
            Number n = (Number) entityManager.createNativeQuery(
                    "SELECT COUNT(*) FROM " + tabla + " WHERE PROPIETARIO = :u")
                    .setParameter("u", usuario)
                    .getSingleResult();
            if (n != null && n.longValue() > 0) {
                return true;
            }
        }
        return false;
    }

    private long contarAdminsActivos() {
        return usuarioAccesoRepository.findAll().stream()
                .filter(UsuarioAcceso::isActivo)
                .filter(UsuarioAcceso::esAdmin)
                .count();
    }

    private UsuarioAcceso buscar(Long id) {
        return usuarioAccesoRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado"));
    }

    private static String normalizarUsuario(String usuario) {
        if (usuario == null || usuario.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El usuario es obligatorio");
        }
        String nombre = usuario.trim();
        if (nombre.length() < 3 || nombre.length() > 80) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Usuario entre 3 y 80 caracteres");
        }
        if (!nombre.matches("[\\w.\\-áéíóúÁÉÍÓÚñÑ]+")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Usuario con caracteres no permitidos");
        }
        return nombre;
    }

    private static String normalizarRol(String rol) {
        if (rol == null || rol.isBlank()) {
            return UsuarioAcceso.ROL_USER;
        }
        String value = rol.trim().toUpperCase();
        if (!UsuarioAcceso.ROL_ADMIN.equals(value) && !UsuarioAcceso.ROL_USER.equals(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rol inválido (ADMIN o USER)");
        }
        return value;
    }

    private static String normalizarPassword(String password) {
        if (password == null || password.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La contraseña es obligatoria");
        }
        String value = password.trim();
        if (value.matches("(?i)[a-f0-9]{64}")) {
            return value.toLowerCase();
        }
        return PasswordDigests.sha256Hex(value);
    }

    private UsuarioDto toDto(UsuarioAcceso u) {
        return new UsuarioDto(u.getId(), u.getUsuario(), u.getRol(), u.isActivo());
    }
}
