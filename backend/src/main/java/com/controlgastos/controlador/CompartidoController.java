package com.controlgastos.controlador;

import com.controlgastos.dto.CompartidoDtos.*;
import com.controlgastos.modelo.GastoCompartido;
import com.controlgastos.modelo.MovimientoPersonaCompartida;
import com.controlgastos.modelo.PersonaCompartida;
import com.controlgastos.modelo.ServicioFijoCompartido;
import com.controlgastos.servicio.CompartidoService;
import com.controlgastos.servicio.RepartoEnteros;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/compartido")
public class CompartidoController {

    private final CompartidoService service;

    public CompartidoController(CompartidoService service) {
        this.service = service;
    }

    @GetMapping("/personas")
    public List<PersonaCompartida> listarPersonas(
            @RequestParam(defaultValue = "false") boolean incluirInactivas) {
        return service.listarPersonas(incluirInactivas);
    }

    @GetMapping("/personas/{id}")
    public PersonaCompartida detallePersona(@PathVariable Long id) {
        return service.obtenerPersona(id);
    }

    @PostMapping("/personas")
    public PersonaCompartida crearPersona(@RequestBody PersonaCompartida body) {
        body.setId(null);
        return service.guardarPersona(body);
    }

    @PutMapping("/personas/{id}")
    public PersonaCompartida actualizarPersona(@PathVariable Long id, @RequestBody PersonaCompartida body) {
        body.setId(id);
        return service.guardarPersona(body);
    }

    @DeleteMapping("/personas/{id}")
    public void desactivarPersona(@PathVariable Long id) {
        service.desactivarPersona(id);
    }

    @PostMapping("/personas/{id}/reactivar")
    public PersonaCompartida reactivarPersona(@PathVariable Long id) {
        return service.reactivarPersona(id);
    }

    @PostMapping("/personas/{id}/abonos")
    public MovimientoPersonaCompartida abonar(@PathVariable Long id, @RequestBody AbonoRequest body) {
        return service.registrarAbono(id, body);
    }

    @PostMapping("/personas/{id}/aplicar-anticipo")
    public MovimientoPersonaCompartida aplicarAnticipo(
            @PathVariable Long id, @RequestBody AplicarAnticipoRequest body) {
        return service.aplicarAnticipo(id, body);
    }

    @PostMapping("/personas/{id}/entregar-favor-prestamo")
    public EntregarFavorPrestamoResponse entregarFavorPrestamo(
            @PathVariable Long id, @RequestBody EntregarFavorPrestamoRequest body) {
        return service.entregarFavorYPrestamo(id, body);
    }

    @PostMapping("/personas/{id}/adelanto-fijo")
    public MovimientoPersonaCompartida adelantoFijo(
            @PathVariable Long id, @RequestBody AdelantoFijoRequest body) {
        return service.registrarAdelantoFijo(id, body);
    }

    @PostMapping("/personas/{id}/guardado")
    public MovimientoPersonaCompartida guardado(@PathVariable Long id, @RequestBody GuardadoRequest body) {
        return service.registrarGuardado(id, body);
    }

    @GetMapping("/personas/{id}/movimientos")
    public List<MovimientoPersonaCompartida> movimientosPersona(@PathVariable Long id) {
        return service.movimientosPersona(id);
    }

    @GetMapping("/gastos")
    public List<GastoCompartido> listarGastos() {
        return service.listarGastos();
    }

    @GetMapping("/gastos/{id}")
    public GastoCompartido detalleGasto(@PathVariable Long id) {
        return service.obtenerGasto(id);
    }

    @PostMapping("/gastos")
    public GastoCompartido registrarGasto(@RequestBody RegistrarGastoRequest body) {
        return service.registrarGasto(body);
    }

    @PostMapping("/gastos/{id}/recalcular")
    public GastoCompartido recalcular(@PathVariable Long id, @RequestBody RecalcularRequest body) {
        return service.recalcularParticipantes(id, body);
    }

    @DeleteMapping("/gastos/{id}")
    public AnularGastoResponse anularGasto(@PathVariable Long id) {
        return service.anularGasto(id);
    }

    @GetMapping("/servicios-fijos")
    public List<ServicioFijoCompartido> listarServiciosFijos() {
        return service.listarServiciosFijos();
    }

    @PostMapping("/servicios-fijos")
    public ServicioFijoCompartido crearServicioFijo(@RequestBody ServicioFijoRequest body) {
        return service.guardarServicioFijo(null, body);
    }

    @PutMapping("/servicios-fijos/{id}")
    public ServicioFijoCompartido actualizarServicioFijo(
            @PathVariable Long id, @RequestBody ServicioFijoRequest body) {
        return service.guardarServicioFijo(id, body);
    }

    @DeleteMapping("/servicios-fijos/{id}")
    public void desactivarServicioFijo(@PathVariable Long id) {
        service.desactivarServicioFijo(id);
    }

    @PostMapping("/servicios-fijos/{id}/cobrar")
    public GastoCompartido cobrarServicioFijo(
            @PathVariable Long id, @RequestBody(required = false) CobrarServicioRequest body) {
        return service.cobrarServicioFijo(id, body);
    }

    @GetMapping("/resumen")
    public ResumenCompartido resumen() {
        return service.resumen();
    }

    @GetMapping("/movimientos")
    public List<MovimientoPersonaCompartida> movimientos() {
        return service.movimientosTodos();
    }

    /** Vista previa: índice 0 = principal (tú, paga el piso); resto = demás. */
    @GetMapping("/reparto")
    public Map<String, Object> previewReparto(
            @RequestParam BigDecimal monto,
            @RequestParam int personas) {
        List<BigDecimal> partes = RepartoEnteros.repartirPesos(monto, personas);
        return Map.of(
                "monto", monto,
                "personas", personas,
                "partePrincipal", partes.get(0),
                "partesOtros", partes.subList(1, partes.size()),
                "partes", partes
        );
    }
}
