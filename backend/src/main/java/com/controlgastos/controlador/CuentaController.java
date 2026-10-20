package com.controlgastos.controlador;

import com.controlgastos.modelo.Cuenta;
import com.controlgastos.modelo.MovimientoCuenta;
import com.controlgastos.servicio.FinanzasService;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/cuentas")
public class CuentaController {

    private final FinanzasService service;

    public CuentaController(FinanzasService service) {
        this.service = service;
    }

    public record LiquidarRequest(LocalDate fecha, BigDecimal montoPago) {}

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

    @DeleteMapping("/{id}")
    public void eliminar(@PathVariable Long id) {
        service.archivarCuenta(id);
    }

    @GetMapping("/{id}/movimientos")
    public List<MovimientoCuenta> movimientos(@PathVariable Long id) {
        return service.movimientosDeCuenta(id);
    }

    @PostMapping("/{id}/movimientos")
    public MovimientoCuenta agregarMovimiento(@PathVariable Long id, @RequestBody MovimientoCuenta mov) {
        return service.agregarMovimiento(id, mov);
    }

    @PutMapping("/{id}/movimientos/{movimientoId}")
    public MovimientoCuenta actualizarMovimiento(
            @PathVariable Long id,
            @PathVariable Long movimientoId,
            @RequestBody MovimientoCuenta mov) {
        return service.actualizarMovimiento(id, movimientoId, mov);
    }

    @DeleteMapping("/{id}/movimientos/{movimientoId}")
    public void eliminarMovimiento(@PathVariable Long id, @PathVariable Long movimientoId) {
        service.eliminarMovimiento(id, movimientoId);
    }

    /** Pagas un monto; el resto del saldo se condona (no sale de disponible). */
    @PostMapping("/{id}/liquidar")
    public Map<String, Object> liquidar(@PathVariable Long id, @RequestBody LiquidarRequest body) {
        LocalDate fecha = body != null ? body.fecha() : null;
        BigDecimal pago = body != null ? body.montoPago() : null;
        return service.liquidarCuenta(id, fecha, pago);
    }
}
