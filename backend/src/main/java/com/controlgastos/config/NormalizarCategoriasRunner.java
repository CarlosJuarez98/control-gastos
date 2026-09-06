package com.controlgastos.config;

import com.controlgastos.servicio.FinanzasService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Component
@Order(2)
public class NormalizarCategoriasRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(NormalizarCategoriasRunner.class);

    private final FinanzasService finanzasService;

    public NormalizarCategoriasRunner(FinanzasService finanzasService) {
        this.finanzasService = finanzasService;
    }

    @Override
    public void run(ApplicationArguments args) {
        int n = finanzasService.normalizarCategoriasExistentes();
        if (n > 0) {
            log.info("Categorías de gasto unificadas: {} registros actualizados", n);
        }
    }
}
