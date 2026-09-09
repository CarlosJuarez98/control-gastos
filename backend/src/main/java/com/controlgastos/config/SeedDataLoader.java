package com.controlgastos.config;

import com.controlgastos.modelo.Cuenta;
import com.controlgastos.repositorio.CuentaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Ajustes ligeros al arrancar. La fuente de verdad es Oracle: no se importa Excel ni seed.
 */
@Component
@Order(2)
public class SeedDataLoader implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedDataLoader.class);

    private final CuentaRepository cuentaRepository;

    public SeedDataLoader(CuentaRepository cuentaRepository) {
        this.cuentaRepository = cuentaRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        corregirClasificacionCuentas();
        log.info("Datos: fuente de verdad = Oracle (sin importar Excel/seed)");
    }

    /** Idempotente: corrige tipos si quedaron mal de migraciones viejas. */
    private void corregirClasificacionCuentas() {
        buscarCuentaAdmin("Deudor Papa").ifPresent(c -> {
            if (c.getTipo() != null && "PRESTAMO_OTORGADO".equalsIgnoreCase(c.getTipo())) {
                c.setTipo("PRESTAMO");
                cuentaRepository.save(c);
                log.info("Cuenta 'Deudor Papa' reclasificada a PRESTAMO (deuda propia)");
            }
        });
        buscarCuentaAdmin("Mercado Libre").ifPresent(c -> {
            if (c.getTipo() == null || !"TDC".equalsIgnoreCase(c.getTipo())) {
                c.setTipo("TDC");
                cuentaRepository.save(c);
                log.info("Cuenta 'Mercado Libre' reclasificada a TDC");
            }
        });
    }

    private Optional<Cuenta> buscarCuentaAdmin(String nombre) {
        for (String dueño : new String[] { "Carlos", "admin" }) {
            Optional<Cuenta> c = cuentaRepository.findByPropietarioAndNombreIgnoreCase(dueño, nombre);
            if (c.isPresent()) {
                return c;
            }
        }
        return cuentaRepository.findByPropietarioAndNombreIgnoreCase(null, nombre);
    }
}
