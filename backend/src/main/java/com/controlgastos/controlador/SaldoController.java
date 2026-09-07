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
        java.util.HashMap<String, Object> out = new java.util.HashMap<>();
        out.put("saldo", s == null ? Map.of() : s);
        out.put("denominaciones", service.listarDenominaciones());
        out.put("historial", service.listarSaldos());
        out.put("esperado", service.calcularEsperadoActual());
        return out;
    }

    @PutMapping
    public SaldoSnapshot guardar(@RequestBody SaldoSnapshot saldo) {
        return service.guardarSaldo(saldo);
    }

    @PutMapping("/{id}")
    public SaldoSnapshot actualizar(@PathVariable Long id, @RequestBody SaldoSnapshot saldo) {
        return service.actualizarSaldo(id, saldo);
    }

    @DeleteMapping("/{id}")
    public void eliminar(@PathVariable Long id) {
        service.eliminarSaldo(id);
    }

    @PutMapping("/denominaciones")
    public List<DenominacionEfectivo> denominaciones(@RequestBody List<DenominacionEfectivo> items) {
        items.forEach(i -> i.setId(null));
        return service.guardarDenominaciones(items);
    }
}
