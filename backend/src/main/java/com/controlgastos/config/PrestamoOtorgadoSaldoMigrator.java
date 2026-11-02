package com.controlgastos.config;

import com.controlgastos.modelo.Cuenta;
import com.controlgastos.modelo.MovimientoCuenta;
import com.controlgastos.repositorio.CuentaRepository;
import com.controlgastos.repositorio.MovimientoCuentaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Locale;

/**
 * Prestamista: el saldo debe ser CARGO + INTERÉS − cobros (mismo ledger que «Te deben»).
 * Corrige cuentas donde el saldo quedó desfasado de los movimientos.
 */
@Component
@Order(28)
public class PrestamoOtorgadoSaldoMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PrestamoOtorgadoSaldoMigrator.class);
    private static final BigDecimal EPS = new BigDecimal("0.005");

    private final CuentaRepository cuentaRepository;
    private final MovimientoCuentaRepository movimientoRepository;

    public PrestamoOtorgadoSaldoMigrator(
            CuentaRepository cuentaRepository,
            MovimientoCuentaRepository movimientoRepository) {
        this.cuentaRepository = cuentaRepository;
        this.movimientoRepository = movimientoRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        int corregidas = 0;
        for (Cuenta c : cuentaRepository.findAll()) {
            if (c.isArchivada()) continue;
            if (c.getTipo() == null || !"PRESTAMO_OTORGADO".equalsIgnoreCase(c.getTipo().trim())) continue;
            String u = c.getPropietario();
            if (u == null || u.isBlank() || c.getId() == null) continue;

            BigDecimal desdeMovs = saldoDesdeMovimientos(u, c.getId());
            BigDecimal actual = c.getSaldoActual() == null ? BigDecimal.ZERO : c.getSaldoActual();
            if (actual.subtract(desdeMovs).abs().compareTo(EPS) <= 0) continue;

            log.warn(
                    "Prestamista «{}» (id={}): saldo {} → {} (desde movimientos)",
                    c.getNombre(),
                    c.getId(),
                    actual,
                    desdeMovs);
            c.setSaldoActual(desdeMovs);
            cuentaRepository.save(c);
            corregidas++;
        }
        if (corregidas > 0) {
            log.info("Prestamista: {} saldo(s) alineados con el ledger", corregidas);
        }
    }

    private BigDecimal saldoDesdeMovimientos(String propietario, Long cuentaId) {
        List<MovimientoCuenta> movs =
                movimientoRepository.findByPropietarioAndCuentaIdOrderByFechaDescIdDesc(propietario, cuentaId);
        BigDecimal saldo = BigDecimal.ZERO;
        for (MovimientoCuenta m : movs) {
            if (m.getMonto() == null || m.getTipo() == null) continue;
            String tipo = m.getTipo().trim().toUpperCase(Locale.ROOT);
            BigDecimal monto = m.getMonto();
            switch (tipo) {
                case "CARGO", "INTERES" -> saldo = saldo.add(monto);
                case "ABONO", "REEMBOLSO", "CONDONACION" -> saldo = saldo.subtract(monto);
                default -> { }
            }
        }
        return saldo.setScale(2, RoundingMode.HALF_UP);
    }
}
