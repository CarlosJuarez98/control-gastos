package com.controlgastos.repositorio;

import com.controlgastos.modelo.GastoMensual;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface GastoMensualRepository extends JpaRepository<GastoMensual, Long> {
    List<GastoMensual> findByActivoTrueOrderByMotivoAsc();
}
