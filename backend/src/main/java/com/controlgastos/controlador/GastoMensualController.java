package com.controlgastos.controlador;

import com.controlgastos.modelo.GastoMensual;
import com.controlgastos.servicio.FinanzasService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/gastos-mensuales")
public class GastoMensualController {

    private final FinanzasService service;

    public GastoMensualController(FinanzasService service) {
        this.service = service;
    }

    @GetMapping
    public List<GastoMensual> listar() {
        return service.listarMensuales();
    }

    @PostMapping
    public GastoMensual crear(@RequestBody GastoMensual g) {
        g.setId(null);
        g.setActivo(true);
        return service.guardarMensual(g);
    }

    @PutMapping("/{id}")
    public GastoMensual actualizar(@PathVariable Long id, @RequestBody GastoMensual g) {
        g.setId(id);
        return service.guardarMensual(g);
    }

    @DeleteMapping("/{id}")
    public void eliminar(@PathVariable Long id) {
        service.eliminarMensual(id);
    }
}
