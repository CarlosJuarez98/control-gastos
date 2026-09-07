package com.controlgastos.repositorio;

import com.controlgastos.modelo.MovimientoCuenta;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface MovimientoCuentaRepository extends JpaRepository<MovimientoCuenta, Long> {
    List<MovimientoCuenta> findByCuentaIdOrderByFechaDescIdDesc(Long cuentaId);
    List<MovimientoCuenta> findAllByOrderByFechaDescIdDesc();

    /** Pagos a deudas (abonos) en el periodo; excluye préstamos otorgados. */
    @Query("""
            select coalesce(sum(m.monto), 0) from MovimientoCuenta m
            where upper(m.tipo) = 'ABONO'
              and m.cuenta.tipo <> 'PRESTAMO_OTORGADO'
              and m.fecha between ?1 and ?2
            """)
    BigDecimal sumaAbonosEntre(LocalDate desde, LocalDate hasta);

    @Query("""
            select coalesce(sum(m.monto), 0) from MovimientoCuenta m
            where upper(m.tipo) = 'ABONO'
              and m.cuenta.tipo <> 'PRESTAMO_OTORGADO'
            """)
    BigDecimal sumaAbonosTotal();

    /** Abonos/reembolsos posteriores a una fecha (para reconstruir deuda al cierre). */
    @Query("""
            select coalesce(sum(m.monto), 0) from MovimientoCuenta m
            where upper(m.tipo) in ('ABONO', 'REEMBOLSO')
              and m.cuenta.tipo <> 'PRESTAMO_OTORGADO'
              and m.fecha > ?1
            """)
    BigDecimal sumaPagosDespues(LocalDate fecha);

    @Query("""
            select coalesce(sum(m.monto), 0) from MovimientoCuenta m
            where upper(m.tipo) in ('CARGO', 'INTERES')
              and m.cuenta.tipo <> 'PRESTAMO_OTORGADO'
              and m.fecha > ?1
            """)
    BigDecimal sumaCargosDespues(LocalDate fecha);

    @Query("select coalesce(max(m.id), 0) from MovimientoCuenta m")
    Long maxId();

    @Query("select coalesce(max(m.id), 0) from MovimientoCuenta m where m.fecha < ?1")
    Long maxIdAntesDe(LocalDate fecha);

    @Query("""
            select coalesce(sum(m.monto), 0) from MovimientoCuenta m
            where upper(m.tipo) = 'ABONO'
              and m.cuenta.tipo <> 'PRESTAMO_OTORGADO'
              and m.id > ?1
            """)
    BigDecimal sumaAbonosDespuesDeId(Long id);
}
