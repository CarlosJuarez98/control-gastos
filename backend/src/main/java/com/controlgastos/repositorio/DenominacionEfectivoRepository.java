package com.controlgastos.repositorio;

import com.controlgastos.modelo.DenominacionEfectivo;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface DenominacionEfectivoRepository extends JpaRepository<DenominacionEfectivo, Long> {
    List<DenominacionEfectivo> findAllByOrderByValorDesc();
}
