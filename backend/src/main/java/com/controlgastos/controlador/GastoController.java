package com.controlgastos.controlador;

import com.controlgastos.modelo.Gasto;
import com.controlgastos.servicio.FinanzasService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/gastos")
public class GastoController {

    private final FinanzasService service;

    public GastoController(FinanzasService service) {
        this.service = service;
    }

    @GetMapping
    public List<Gasto> listar(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        return service.listarGastos(desde, hasta);
    }

    @PostMapping
    public Gasto crear(@RequestBody Gasto gasto) {
        gasto.setId(null);
        return service.guardarGasto(gasto);
    }

    @PutMapping("/{id}")
    public Gasto actualizar(@PathVariable Long id, @RequestBody Gasto gasto) {
        gasto.setId(id);
        return service.guardarGasto(gasto);
    }

    @DeleteMapping("/{id}")
    public void eliminar(@PathVariable Long id) {
        service.eliminarGasto(id);
    }
}
