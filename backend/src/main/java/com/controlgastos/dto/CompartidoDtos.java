package com.controlgastos.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class CompartidoDtos {

    private CompartidoDtos() {}

    public record RegistrarGastoRequest(
            String tipo,
            String concepto,
            BigDecimal monto,
            LocalDate fecha,
            List<Long> personaIds,
            String formaPago,
            Long cuentaId,
            Integer meses,
            Long servicioFijoId,
            String periodo,
            /**
             * Si false, tú no entras al reparto (solo prestas efectivo/TDC).
             * Default true.
             */
            Boolean incluyePrincipal,
            /**
             * Perfiles/cuotas de cada persona (mismo orden que personaIds). Null = 1 c/u.
             * Ej. streaming: alguien con 3 perfiles → 3.
             */
            List<Integer> perfiles,
            /** Tus perfiles si incluyePrincipal. Default 1. */
            Integer perfilesPrincipal
    ) {}

    public record RecalcularRequest(
            List<Long> personaIds,
            /** Si true, quien entra/sale a mitad de mes pesa solo los días correspondientes. */
            Boolean proporcionalDias,
            /** Día en que se integró la(s) persona(s) nueva(s). Default = hoy. */
            java.time.LocalDate fechaIngreso,
            /** Día en que salió quien se quitó del reparto. Default = hoy. */
            java.time.LocalDate fechaSalida,
            /** Si false, tú sales del reparto. Default = conservar / true. */
            Boolean incluyePrincipal,
            List<Integer> perfiles,
            Integer perfilesPrincipal
    ) {}

    public record ServicioFijoRequest(
            String concepto,
            BigDecimal monto,
            List<Long> personaIds,
            /** Día del mes (1–31). Si el mes no lo tiene, se cobra el último día. */
            Integer diaCobro,
            /** Si false, al cobrar no te toca cuota (solo prestas el pago). Default true. */
            Boolean incluyePrincipal,
            /**
             * Si false, otro paga el servicio: tu parte se sincroniza a Mensuales como fijo.
             * Default true (tú cobras / pagas).
             */
            Boolean yoPago,
            List<Integer> perfiles,
            Integer perfilesPrincipal
    ) {}

    public record CobrarServicioRequest(
            LocalDate fecha,
            String formaPago,
            Long cuentaId,
            Integer meses,
            String periodo
    ) {}

    public record PeriodoPendiente(
            String periodo,
            String concepto,
            LocalDate fechaCobro,
            Long gastoCompartidoId,
            BigDecimal cargo,
            BigDecimal pagado,
            BigDecimal pendiente
    ) {}

    /** Total pendiente agrupado por servicio / cuenta (CFE, internet…). */
    public record CuentaPendiente(
            String concepto,
            BigDecimal pendiente,
            /** Anticipo ya reservado para esta cuenta (aún sin deuda). */
            BigDecimal anticipo,
            String detalle
    ) {}

    public record PersonaResumen(
            Long id,
            String nombre,
            boolean activa,
            BigDecimal debe,
            BigDecimal aFavor,
            BigDecimal efectivoGuardado,
            List<PeriodoPendiente> periodos,
            List<CuentaPendiente> porCuenta,
            String detalleDeuda
    ) {}

    public record AbonoRequest(
            BigDecimal monto,
            LocalDate fecha,
            String medio,
            String concepto,
            /** Cuenta destino (Spotify, CFE…). Null = general FIFO. */
            String conceptoDestino,
            /** Solo si medio=PRESTADO: EFECTIVO | TARJETA. */
            String formaPagoPrestamo,
            /** Solo si formaPagoPrestamo=TARJETA. */
            Long cuentaId
    ) {}

    /** Manda parte del a favor general a una cuenta concreta (sin dinero nuevo). */
    public record AplicarAnticipoRequest(
            String conceptoDestino,
            BigDecimal monto
    ) {}

    /**
     * Les entregas su a favor en efectivo y/o les prestas de más.
     * El préstamo puede salir de efectivo (baja disponible) o de TDC (cargo hasta el corte).
     */
    public record EntregarFavorPrestamoRequest(
            BigDecimal montoFavor,
            BigDecimal montoPrestamo,
            LocalDate fecha,
            /** EFECTIVO | TARJETA — forma del préstamo (el a favor siempre es efectivo). */
            String formaPagoPrestamo,
            Long cuentaId
    ) {}

    public record EntregarFavorPrestamoResponse(
            BigDecimal entregado,
            BigDecimal deFavor,
            BigDecimal prestamo,
            BigDecimal quedaDebiendo,
            String mensaje
    ) {}

    /** Adelanta N meses de un servicio fijo (cuota × meses → abono / anticipo). */
    public record AdelantoFijoRequest(
            Long servicioFijoId,
            Integer meses,
            LocalDate fecha,
            String medio
    ) {}

    public record GuardadoRequest(
            BigDecimal monto,
            LocalDate fecha,
            String tipo,
            String concepto
    ) {}

    /** Totales pendientes de todos, agrupados por servicio/cuenta (Internet, Spotify…). */
    public record CuentaGlobalResumen(
            String concepto,
            /** Lo que aún te deben de esta cuenta (otros). */
            BigDecimal pendiente,
            BigDecimal anticipo,
            /** Monto original de la(s) deuda(s) abierta(s), incl. tu parte. */
            BigDecimal total,
            int personas,
            List<String> deudores
    ) {}

    /** Gastos compartidos que cargaste a una TDC (cuánto subió esa tarjeta). */
    public record TdcCargaResumen(
            Long cuentaId,
            String nombre,
            BigDecimal monto,
            int gastos,
            List<String> conceptos
    ) {}

    public record ResumenCompartido(
            List<PersonaResumen> personas,
            BigDecimal totalMeDeben,
            BigDecimal totalAFavor,
            BigDecimal totalGuardado,
            List<CuentaGlobalResumen> porCuenta,
            List<TdcCargaResumen> porTdc,
            /** Fijos «Yo pago» cuyo día de cobro ya pasó este mes y aún no se cobraron. */
            List<FijoPendienteCobro> fijosPendientesCobro
    ) {}

    public record FijoPendienteCobro(
            Long id,
            String concepto,
            BigDecimal monto,
            Integer diaCobro,
            String periodo,
            LocalDate fechaCobro
    ) {}

    public record AnularGastoResponse(
            BigDecimal abonosQueQuedanAFavor,
            String mensaje
    ) {}
}
