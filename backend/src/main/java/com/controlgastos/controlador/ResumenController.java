package com.controlgastos.controlador;

import com.controlgastos.dto.ResumenResponse;
import com.controlgastos.servicio.FinanzasService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/resumen")
public class ResumenController {

    private final FinanzasService service;

    public ResumenController(FinanzasService service) {
        this.service = service;
    }

    @GetMapping
    public ResumenResponse resumen(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        return service.resumen(desde, hasta);
    }
}
