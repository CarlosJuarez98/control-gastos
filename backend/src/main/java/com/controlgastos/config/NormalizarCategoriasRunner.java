package com.controlgastos.config;

import com.controlgastos.modelo.Gasto;
import com.controlgastos.repositorio.GastoRepository;
import com.controlgastos.servicio.CategoriaGastoNormalizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Unifica categorías al arranque (sin sesión de usuario).
 */
@Component
@Order(3)
public class NormalizarCategoriasRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(NormalizarCategoriasRunner.class);

    private final GastoRepository gastoRepository;

    public NormalizarCategoriasRunner(GastoRepository gastoRepository) {
        this.gastoRepository = gastoRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        int cambios = 0;
        for (Gasto g : gastoRepository.findAll()) {
            String canonica = CategoriaGastoNormalizer.normalizar(g.getCategoria());
            if (!canonica.equals(g.getCategoria())) {
                g.setCategoria(canonica);
                gastoRepository.save(g);
                cambios++;
            }
        }
        if (cambios > 0) {
            log.info("Categorías de gasto unificadas: {} registros actualizados", cambios);
        }
    }
}
