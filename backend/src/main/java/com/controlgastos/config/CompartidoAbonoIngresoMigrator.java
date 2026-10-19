package com.controlgastos.config;

import com.controlgastos.modelo.MovimientoPersonaCompartida;
import com.controlgastos.repositorio.IngresoRepository;
import com.controlgastos.repositorio.MovimientoPersonaCompartidaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Usuarios con abonos-sin-ingreso (p. ej. Mon): quita ingresos que se hayan
 * creado por error al registrar abonos de Compartido. El ledger compartido se conserva.
 */
@Component
@Order(25)
public class CompartidoAbonoIngresoMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CompartidoAbonoIngresoMigrator.class);

    private final MovimientoPersonaCompartidaRepository movimientoRepository;
    private final IngresoRepository ingresoRepository;
    private final Set<String> abonosSinIngreso;

    public CompartidoAbonoIngresoMigrator(
            MovimientoPersonaCompartidaRepository movimientoRepository,
            IngresoRepository ingresoRepository,
            @Value("${app.compartido.abonos-sin-ingreso:Mon}") String abonosSinIngresoCsv) {
        this.movimientoRepository = movimientoRepository;
        this.ingresoRepository = ingresoRepository;
        this.abonosSinIngreso = Arrays.stream(abonosSinIngresoCsv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(s -> s.toLowerCase(Locale.ROOT))
                .collect(Collectors.toUnmodifiableSet());
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (abonosSinIngreso.isEmpty()) {
            return;
        }
        List<MovimientoPersonaCompartida> todos = movimientoRepository.findAll();
        int limpios = 0;
        for (MovimientoPersonaCompartida m : todos) {
            if (m.isAnulado()) continue;
            if (!MovimientoPersonaCompartida.ABONO.equals(m.getTipo())) continue;
            if (m.getIngresoId() == null) continue;
            String u = m.getPropietario();
            if (u == null || !abonosSinIngreso.contains(u.trim().toLowerCase(Locale.ROOT))) continue;

            Long ingresoId = m.getIngresoId();
            ingresoRepository.findById(ingresoId).ifPresent(ing -> {
                if (u.equalsIgnoreCase(ing.getPropietario())) {
                    ingresoRepository.delete(ing);
                }
            });
            m.setIngresoId(null);
            movimientoRepository.save(m);
            limpios++;
        }
        if (limpios > 0) {
            log.info("Compartido: {} abono(s) de {} desligados de Ingresos", limpios, abonosSinIngreso);
        }
    }
}
