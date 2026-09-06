package com.controlgastos.controlador;

import com.controlgastos.modelo.Cuenta;
import com.controlgastos.modelo.MovimientoCuenta;
import com.controlgastos.servicio.FinanzasService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/cuentas")
public class CuentaController {

    private final FinanzasService service;

    public CuentaController(FinanzasService service) {
        this.service = service;
    }

    @GetMapping
    public List<Cuenta> listar() {
        return service.listarCuentas();
    }

    @GetMapping("/{id}")
    public Cuenta detalle(@PathVariable Long id) {
        return service.obtenerCuenta(id);
    }

    @PostMapping
    public Cuenta crear(@RequestBody Cuenta cuenta) {
        cuenta.setId(null);
        return service.guardarCuenta(cuenta);
    }

    @PutMapping("/{id}")
    public Cuenta actualizar(@PathVariable Long id, @RequestBody Cuenta cuenta) {
        cuenta.setId(id);
        return service.guardarCuenta(cuenta);
    }

    @GetMapping("/{id}/movimientos")
    public List<MovimientoCuenta> movimientos(@PathVariable Long id) {
        return service.movimientosDeCuenta(id);
    }

    @PostMapping("/{id}/movimientos")
    public MovimientoCuenta agregarMovimiento(@PathVariable Long id, @RequestBody MovimientoCuenta mov) {
        return service.agregarMovimiento(id, mov);
    }
}
