package com.controlgastos.config;

import com.controlgastos.modelo.Cuenta;
import com.controlgastos.modelo.GastoMensual;
import com.controlgastos.modelo.MovimientoCuenta;
import com.controlgastos.repositorio.CuentaRepository;
import com.controlgastos.repositorio.GastoMensualRepository;
import com.controlgastos.repositorio.MovimientoCuentaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Una sola vez al arrancar: todos los CARGO de PRESTAMO ya existentes pasan a
 * «Saldo histórico» (deuda igual; no suman disponible).
 * Los préstamos que se den de alta después siguen con «Préstamo recibido» y sí suman
 * si su fecha es ≥ app.prestamo.disponible-desde.
 */
@Component
@Order(27)
public class PrestamoHistoricoDisponibleMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PrestamoHistoricoDisponibleMigrator.class);
    private static final String MARCA = "__PRESTAMO_DISP_CUTOFF_V1__";
    private static final String CONCEPTO_HISTORICO = "Saldo histórico";

    private final CuentaRepository cuentaRepository;
    private final MovimientoCuentaRepository movimientoRepository;
    private final GastoMensualRepository gastoMensualRepository;
    private final LocalDate disponibleDesde;

    public PrestamoHistoricoDisponibleMigrator(
            CuentaRepository cuentaRepository,
            MovimientoCuentaRepository movimientoRepository,
            GastoMensualRepository gastoMensualRepository,
            @Value("${app.prestamo.disponible-desde:2026-10-20}") String disponibleDesde) {
        this.cuentaRepository = cuentaRepository;
        this.movimientoRepository = movimientoRepository;
        this.gastoMensualRepository = gastoMensualRepository;
        this.disponibleDesde = LocalDate.parse(disponibleDesde.trim());
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (gastoMensualRepository.findAll().stream().anyMatch(g -> MARCA.equals(g.getMotivo()))) {
            return;
        }

        LocalDate histFecha = disponibleDesde.minusDays(1);
        int marcados = 0;
        for (Cuenta c : cuentaRepository.findAll()) {
            if (c.getTipo() == null || !"PRESTAMO".equalsIgnoreCase(c.getTipo().trim())) continue;
            String u = c.getPropietario();
            if (u == null || u.isBlank() || c.getId() == null) continue;

            List<MovimientoCuenta> movs =
                    movimientoRepository.findByPropietarioAndCuentaIdOrderByFechaDescIdDesc(u, c.getId());
            for (MovimientoCuenta m : movs) {
                if (m.getTipo() == null || !"CARGO".equalsIgnoreCase(m.getTipo().trim())) continue;
                String conc = m.getConcepto() == null ? "" : m.getConcepto().trim();
                if (CONCEPTO_HISTORICO.equalsIgnoreCase(conc)) continue;
                m.setConcepto(CONCEPTO_HISTORICO);
                if (m.getFecha() == null || !m.getFecha().isBefore(disponibleDesde)) {
                    m.setFecha(histFecha);
                }
                movimientoRepository.save(m);
                marcados++;
            }
        }

        GastoMensual marca = new GastoMensual();
        marca.setMotivo(MARCA);
        marca.setMonto(BigDecimal.ZERO);
        marca.setActivo(false);
        marca.setPropietario("_system");
        gastoMensualRepository.save(marca);

        log.info(
                "Préstamo: {} CARGO(s) → Saldo histórico (no suman disponible). Nuevos desde {} sí cuentan.",
                marcados,
                disponibleDesde);
    }
}
