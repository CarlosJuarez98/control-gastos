package com.controlgastos.repositorio;

import com.controlgastos.modelo.GastoMensual;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface GastoMensualRepository extends JpaRepository<GastoMensual, Long> {
    List<GastoMensual> findByPropietarioAndActivoTrueOrderByMotivoAsc(String propietario);

    Optional<GastoMensual> findByGastoOrigenIdAndActivoTrue(Long gastoOrigenId);

    List<GastoMensual> findByGastoOrigenId(Long gastoOrigenId);
}
