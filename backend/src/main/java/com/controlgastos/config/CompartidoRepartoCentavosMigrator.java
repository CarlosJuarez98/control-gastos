package com.controlgastos.config;

import com.controlgastos.modelo.GastoCompartido;
import com.controlgastos.modelo.MovimientoPersonaCompartida;
import com.controlgastos.modelo.ParteGastoCompartido;
import com.controlgastos.repositorio.GastoCompartidoRepository;
import com.controlgastos.repositorio.MovimientoPersonaCompartidaRepository;
import com.controlgastos.servicio.RepartoEnteros;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Reaplica repartos en centavos a gastos compartidos cuyas partes siguen el
 * viejo redondeo a peso entero (ej. Netflix 370 → 92/186/92 en vez de 92.50/185/92.50).
 * Así el a favor (René 7.50, Tío Juan 15) cuadra con el abono real.
 */
@Component
@Order(26)
public class CompartidoRepartoCentavosMigrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CompartidoRepartoCentavosMigrator.class);

    private final GastoCompartidoRepository gastoRepository;
    private final MovimientoPersonaCompartidaRepository movimientoRepository;

    public CompartidoRepartoCentavosMigrator(
            GastoCompartidoRepository gastoRepository,
            MovimientoPersonaCompartidaRepository movimientoRepository) {
        this.gastoRepository = gastoRepository;
        this.movimientoRepository = movimientoRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        int gastos = 0;
        int deudas = 0;
        for (GastoCompartido gc : gastoRepository.findAll()) {
            if (gc.isAnulado() || gc.getMontoTotal() == null) {
                continue;
            }
            List<ParteGastoCompartido> partes = new ArrayList<>(gc.getPartes());
            if (partes.isEmpty()) {
                continue;
            }
            partes.sort(Comparator
                    .comparing((ParteGastoCompartido p) -> !p.isEsPrincipal())
                    .thenComparing(p -> p.getId() == null ? 0L : p.getId()));

            List<Integer> pesos = new ArrayList<>();
            List<BigDecimal> actuales = new ArrayList<>();
            boolean incluyePrincipal = false;
            for (ParteGastoCompartido p : partes) {
                if (p.isEsPrincipal()) {
                    incluyePrincipal = p.getMonto() != null && p.getMonto().compareTo(BigDecimal.ZERO) > 0;
                    if (!incluyePrincipal) {
                        continue;
                    }
                }
                pesos.add(p.getPerfiles());
                actuales.add(scale2(p.getMonto()));
            }
            if (pesos.isEmpty()) {
                continue;
            }

            List<BigDecimal> enteros = RepartoEnteros.repartirPesosPonderado(gc.getMontoTotal(), pesos);
            List<BigDecimal> centavos = RepartoEnteros.repartirPesosPonderadoCentavos(gc.getMontoTotal(), pesos);
            if (enteros.equals(centavos)) {
                continue;
            }
            if (!mismasPartes(actuales, enteros)) {
                // Ya corregido o reparto manual distinto
                continue;
            }

            int idx = 0;
            for (ParteGastoCompartido p : partes) {
                if (p.isEsPrincipal() && !incluyePrincipal) {
                    continue;
                }
                BigDecimal nuevo = centavos.get(idx++);
                p.setMonto(nuevo);
            }
            gastoRepository.save(gc);
            gastos++;

            String prop = gc.getPropietario();
            for (MovimientoPersonaCompartida m : movimientoRepository
                    .findByGastoCompartidoIdAndPropietario(gc.getId(), prop)) {
                if (m.isAnulado() || !MovimientoPersonaCompartida.DEUDA.equals(m.getTipo())) {
                    continue;
                }
                if (m.getPersona() == null || m.getPersona().getId() == null) {
                    continue;
                }
                Long pid = m.getPersona().getId();
                for (ParteGastoCompartido p : partes) {
                    if (p.isEsPrincipal() || p.getPersona() == null) {
                        continue;
                    }
                    if (pid.equals(p.getPersona().getId())) {
                        BigDecimal antes = scale2(m.getMonto());
                        BigDecimal despues = scale2(p.getMonto());
                        if (antes.compareTo(despues) != 0) {
                            m.setMonto(despues);
                            movimientoRepository.save(m);
                            deudas++;
                        }
                        break;
                    }
                }
            }
        }
        if (gastos > 0) {
            log.info("Compartido: {} gasto(s) repartidos a centavos ({} deuda(s) ajustada(s))", gastos, deudas);
        }
    }

    private static boolean mismasPartes(List<BigDecimal> a, List<BigDecimal> b) {
        if (a.size() != b.size()) {
            return false;
        }
        for (int i = 0; i < a.size(); i++) {
            if (a.get(i).compareTo(b.get(i)) != 0) {
                return false;
            }
        }
        return true;
    }

    private static BigDecimal scale2(BigDecimal v) {
        if (v == null) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.UNNECESSARY);
        }
        return v.setScale(2, RoundingMode.HALF_UP);
    }
}
