package com.controlgastos.repositorio;

import com.controlgastos.modelo.MovimientoCuenta;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public interface MovimientoCuentaRepository extends JpaRepository<MovimientoCuenta, Long> {
    List<MovimientoCuenta> findByPropietarioAndCuentaIdOrderByFechaDescIdDesc(String propietario, Long cuentaId);

    List<MovimientoCuenta> findByPropietarioOrderByFechaDescIdDesc(String propietario);

    /** Pagos a deudas (abonos) en el periodo; excluye préstamos otorgados. */
    @Query("""
            select coalesce(sum(m.monto), 0) from MovimientoCuenta m
            where m.propietario = ?1
              and upper(m.tipo) = 'ABONO'
              and m.cuenta.tipo <> 'PRESTAMO_OTORGADO'
              and m.fecha between ?2 and ?3
            """)
    BigDecimal sumaAbonosEntre(String propietario, LocalDate desde, LocalDate hasta);

    @Query("""
            select coalesce(sum(m.monto), 0) from MovimientoCuenta m
            where m.propietario = ?1
              and upper(m.tipo) = 'ABONO'
              and m.cuenta.tipo <> 'PRESTAMO_OTORGADO'
            """)
    BigDecimal sumaAbonosTotal(String propietario);

    /** Abonos/reembolsos posteriores a una fecha (para reconstruir deuda al cierre). */
    @Query("""
            select coalesce(sum(m.monto), 0) from MovimientoCuenta m
            where m.propietario = ?1
              and upper(m.tipo) in ('ABONO', 'REEMBOLSO')
              and m.cuenta.tipo <> 'PRESTAMO_OTORGADO'
              and m.fecha > ?2
            """)
    BigDecimal sumaPagosDespues(String propietario, LocalDate fecha);

    @Query("""
            select coalesce(sum(m.monto), 0) from MovimientoCuenta m
            where m.propietario = ?1
              and upper(m.tipo) in ('CARGO', 'INTERES')
              and m.cuenta.tipo <> 'PRESTAMO_OTORGADO'
              and m.fecha > ?2
            """)
    BigDecimal sumaCargosDespues(String propietario, LocalDate fecha);

    @Query("select coalesce(max(m.id), 0) from MovimientoCuenta m where m.propietario = ?1")
    Long maxId(String propietario);

    @Query("select coalesce(max(m.id), 0) from MovimientoCuenta m where m.propietario = ?1 and m.fecha < ?2")
    Long maxIdAntesDe(String propietario, LocalDate fecha);

    @Query("""
            select coalesce(sum(m.monto), 0) from MovimientoCuenta m
            where m.propietario = ?1
              and upper(m.tipo) = 'ABONO'
              and m.cuenta.tipo <> 'PRESTAMO_OTORGADO'
              and m.id > ?2
            """)
    BigDecimal sumaAbonosDespuesDeId(String propietario, Long id);

    /** Dinero prestado (CARGO en cuentas prestamista). */
    @Query("""
            select coalesce(sum(m.monto), 0) from MovimientoCuenta m
            where m.propietario = ?1
              and upper(m.tipo) = 'CARGO'
              and m.cuenta.tipo = 'PRESTAMO_OTORGADO'
            """)
    BigDecimal sumaPrestamosOtorgadosTotal(String propietario);

    @Query("""
            select coalesce(sum(m.monto), 0) from MovimientoCuenta m
            where m.propietario = ?1
              and upper(m.tipo) = 'CARGO'
              and m.cuenta.tipo = 'PRESTAMO_OTORGADO'
              and m.id > ?2
            """)
    BigDecimal sumaPrestamosOtorgadosDespuesDeId(String propietario, Long id);

    /** Cobros de préstamos otorgados (vuelve liquidez). */
    @Query("""
            select coalesce(sum(m.monto), 0) from MovimientoCuenta m
            where m.propietario = ?1
              and upper(m.tipo) in ('ABONO', 'REEMBOLSO')
              and m.cuenta.tipo = 'PRESTAMO_OTORGADO'
            """)
    BigDecimal sumaCobrosPrestamoOtorgadoTotal(String propietario);

    @Query("""
            select coalesce(sum(m.monto), 0) from MovimientoCuenta m
            where m.propietario = ?1
              and upper(m.tipo) in ('ABONO', 'REEMBOLSO')
              and m.cuenta.tipo = 'PRESTAMO_OTORGADO'
              and m.id > ?2
            """)
    BigDecimal sumaCobrosPrestamoOtorgadoDespuesDeId(String propietario, Long id);
}
