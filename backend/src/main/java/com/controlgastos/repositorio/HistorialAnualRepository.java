package com.controlgastos.repositorio;

import com.controlgastos.modelo.HistorialAnual;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface HistorialAnualRepository extends JpaRepository<HistorialAnual, Long> {
    List<HistorialAnual> findByPropietarioOrderByAnioDesc(String propietario);

    Optional<HistorialAnual> findByPropietarioAndAnio(String propietario, int anio);
}
