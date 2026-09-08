package com.controlgastos.repositorio;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.controlgastos.modelo.UsuarioAcceso;

public interface UsuarioAccesoRepository extends JpaRepository<UsuarioAcceso, Long> {
    Optional<UsuarioAcceso> findByUsuarioIgnoreCase(String usuario);
}
