package com.controlgastos.repositorio;

import com.controlgastos.modelo.MovimientoCuenta;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface MovimientoCuentaRepository extends JpaRepository<MovimientoCuenta, Long> {
    List<MovimientoCuenta> findByCuentaIdOrderByFechaDescIdDesc(Long cuentaId);
    List<MovimientoCuenta> findAllByOrderByFechaDescIdDesc();
}
