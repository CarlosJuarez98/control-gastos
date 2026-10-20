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
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

/**
 * Préstamos recibidos (tipo PRESTAMO) creados solo con saldo inicial no
 * generaban CARGO: la deuda subía pero el disponible no.
 * Reconstruye el CARGO faltante sin tocar el saldo de la cuenta.
 */
@Component
@Order(26)
public class PrestamoRecibidoCargoMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PrestamoRecibidoCargoMigrator.class);
    private static final BigDecimal EPS = new BigDecimal("0.005");

    private final CuentaRepository cuentaRepository;
    private final MovimientoCuentaRepository movimientoRepository;

    public PrestamoRecibidoCargoMigrator(
            CuentaRepository cuentaRepository,
            MovimientoCuentaRepository movimientoRepository) {
        this.cuentaRepository = cuentaRepository;
        this.movimientoRepository = movimientoRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        int creados = 0;
        for (Cuenta c : cuentaRepository.findAll()) {
            if (c.isArchivada()) continue;
            if (c.getTipo() == null || !"PRESTAMO".equalsIgnoreCase(c.getTipo().trim())) continue;
            String u = c.getPropietario();
            if (u == null || u.isBlank() || c.getId() == null) continue;

            List<MovimientoCuenta> movs =
                    movimientoRepository.findByPropietarioAndCuentaIdOrderByFechaDescIdDesc(u, c.getId());
            BigDecimal cargos = BigDecimal.ZERO;
            BigDecimal interes = BigDecimal.ZERO;
            BigDecimal pagos = BigDecimal.ZERO;
            LocalDate fechaMasAntigua = null;
            for (MovimientoCuenta m : movs) {
                if (m.getMonto() == null) continue;
                String tipo = m.getTipo() == null ? "" : m.getTipo().trim().toUpperCase(Locale.ROOT);
                switch (tipo) {
                    case "CARGO" -> cargos = cargos.add(m.getMonto());
                    case "INTERES" -> interes = interes.add(m.getMonto());
                    case "ABONO", "REEMBOLSO" -> pagos = pagos.add(m.getMonto());
                    default -> { }
                }
                if (m.getFecha() != null && (fechaMasAntigua == null || m.getFecha().isBefore(fechaMasAntigua))) {
                    fechaMasAntigua = m.getFecha();
                }
            }

            BigDecimal saldo = c.getSaldoActual() == null ? BigDecimal.ZERO : c.getSaldoActual();
            // saldo ≈ cargos + interés − pagos → cargo faltante = saldo − cargos − interés + pagos
            BigDecimal faltante = saldo.subtract(cargos).subtract(interes).add(pagos);
            if (faltante.compareTo(EPS) <= 0) continue;

            MovimientoCuenta mov = new MovimientoCuenta();
            mov.setCuenta(c);
            mov.setPropietario(u);
            mov.setFecha(fechaMasAntigua != null ? fechaMasAntigua : LocalDate.now());
            mov.setTipo("CARGO");
            mov.setMonto(faltante);
            mov.setConcepto("Préstamo recibido");
            movimientoRepository.save(mov);
            creados++;
        }
        if (creados > 0) {
            log.info("Préstamo: {} CARGO(s) de desembolso restaurados (suben disponible)", creados);
        }
    }
}
