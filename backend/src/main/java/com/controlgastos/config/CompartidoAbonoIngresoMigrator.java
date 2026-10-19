package com.controlgastos.config;

import com.controlgastos.modelo.Ingreso;
import com.controlgastos.modelo.MovimientoPersonaCompartida;
import com.controlgastos.repositorio.IngresoRepository;
import com.controlgastos.repositorio.MovimientoPersonaCompartidaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Restaura ingresos faltantes de abonos en efectivo de Compartido
 * (antes Mon los tenía desligados). Prefijo {@code Compartido - } para
 * separarlas en las cards de Ingresos/Saldo.
 */
@Component
@Order(25)
public class CompartidoAbonoIngresoMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CompartidoAbonoIngresoMigrator.class);

    private final MovimientoPersonaCompartidaRepository movimientoRepository;
    private final IngresoRepository ingresoRepository;

    public CompartidoAbonoIngresoMigrator(
            MovimientoPersonaCompartidaRepository movimientoRepository,
            IngresoRepository ingresoRepository) {
        this.movimientoRepository = movimientoRepository;
        this.ingresoRepository = ingresoRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        List<MovimientoPersonaCompartida> todos = movimientoRepository.findAll();
        int restaurados = 0;
        for (MovimientoPersonaCompartida m : todos) {
            if (m.isAnulado()) continue;
            if (!MovimientoPersonaCompartida.ABONO.equals(m.getTipo())) continue;
            if (m.getIngresoId() != null) continue;
            if (m.isDesdeGuardado() || m.isDesdeAnticipo()) continue;
            if (m.getGastoId() != null) continue;
            if (m.getPersona() == null) continue;
            String u = m.getPropietario();
            if (u == null || u.isBlank()) continue;
            if (m.getMonto() == null || m.getMonto().signum() <= 0) continue;

            String concepto = m.getConcepto();
            if (concepto == null || concepto.isBlank()) {
                concepto = "Abono";
            }
            String quien = m.getPersona().getNombre() == null ? "?" : m.getPersona().getNombre().trim();
            Ingreso ingreso = new Ingreso();
            ingreso.setPropietario(u);
            ingreso.setFecha(m.getFecha());
            ingreso.setMonto(m.getMonto());
            ingreso.setConcepto("Compartido - " + quien + ": " + concepto);
            Ingreso saved = ingresoRepository.save(ingreso);
            m.setIngresoId(saved.getId());
            movimientoRepository.save(m);
            restaurados++;
        }
        if (restaurados > 0) {
            log.info("Compartido: {} abono(s) restaurados como Ingreso (cards De compartidos)", restaurados);
        }
    }
}
