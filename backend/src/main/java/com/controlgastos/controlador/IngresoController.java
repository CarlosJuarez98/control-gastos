package com.controlgastos.controlador;

import com.controlgastos.modelo.Ingreso;
import com.controlgastos.servicio.FinanzasService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/ingresos")
public class IngresoController {

    private final FinanzasService service;

    public IngresoController(FinanzasService service) {
        this.service = service;
    }

    @GetMapping
    public List<Ingreso> listar(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        return service.listarIngresos(desde, hasta);
    }

    @PostMapping
    public Ingreso crear(@Valid @RequestBody Ingreso ingreso) {
        ingreso.setId(null);
        return service.guardarIngreso(ingreso);
    }

    @PutMapping("/{id}")
    public Ingreso actualizar(@PathVariable Long id, @RequestBody Ingreso ingreso) {
        ingreso.setId(id);
        return service.guardarIngreso(ingreso);
    }

    @DeleteMapping("/{id}")
    public void eliminar(@PathVariable Long id) {
        service.eliminarIngreso(id);
    }
}
