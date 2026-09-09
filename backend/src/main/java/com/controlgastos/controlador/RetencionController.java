package com.controlgastos.controlador;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.controlgastos.servicio.RetencionHistoricoService;
import com.controlgastos.servicio.RetencionHistoricoService.Resultado;

@RestController
@RequestMapping("/api/retencion")
public class RetencionController {

    private final RetencionHistoricoService retencionHistoricoService;

    public RetencionController(RetencionHistoricoService retencionHistoricoService) {
        this.retencionHistoricoService = retencionHistoricoService;
    }

    /** Ejecuta ya la limpieza (solo ADMIN). Útil para probar sin esperar el cron. */
    @PostMapping("/ejecutar")
    public Resultado ejecutar() {
        return retencionHistoricoService.ejecutar();
    }
}
