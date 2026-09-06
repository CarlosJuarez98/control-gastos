package com.controlgastos.repositorio;

import com.controlgastos.modelo.Cuenta;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.math.BigDecimal;
import java.util.Optional;

public interface CuentaRepository extends JpaRepository<Cuenta, Long> {
    Optional<Cuenta> findByNombreIgnoreCase(String nombre);

    @Query("select coalesce(sum(c.saldoActual), 0) from Cuenta c where c.tipo <> 'PRESTAMO_OTORGADO'")
    BigDecimal sumaDeudas();
}
