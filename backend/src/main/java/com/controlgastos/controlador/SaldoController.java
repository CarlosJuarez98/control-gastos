package com.controlgastos.controlador;

import com.controlgastos.modelo.DenominacionEfectivo;
import com.controlgastos.modelo.SaldoSnapshot;
import com.controlgastos.servicio.FinanzasService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/saldo")
public class SaldoController {

    private final FinanzasService service;

    public SaldoController(FinanzasService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Object> actual() {
        SaldoSnapshot s = service.saldoActual();
        return Map.of(
                "saldo", s == null ? Map.of() : s,
                "denominaciones", service.listarDenominaciones()
        );
    }

    @PutMapping
    public SaldoSnapshot guardar(@RequestBody SaldoSnapshot saldo) {
        return service.guardarSaldo(saldo);
    }

    @PutMapping("/denominaciones")
    public List<DenominacionEfectivo> denominaciones(@RequestBody List<DenominacionEfectivo> items) {
        items.forEach(i -> i.setId(null));
        return service.guardarDenominaciones(items);
    }
}
