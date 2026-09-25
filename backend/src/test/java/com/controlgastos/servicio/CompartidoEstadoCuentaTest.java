package com.controlgastos.servicio;

import com.controlgastos.dto.CompartidoDtos.PeriodoPendiente;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class CompartidoEstadoCuentaTest {

    @Test
    void abonoDeMasPasaAlSiguienteMes() {
        var r = CompartidoEstadoCuenta.calcular(
                List.of(cargo("2026-09", "CFE", "100")),
                new BigDecimal("130"));
        assertTrue(r.periodosPendientes().isEmpty());
        assertEquals(0, r.anticipo().compareTo(new BigDecimal("30.00")));
        assertTrue(r.detalle().contains("anticipo"));
    }

    @Test
    void anticipoReduceMesSiguienteSiAbonoSinFecha() {
        // Compat: abono sin fecha (limite = MAX) puede cubrir varios cargos
        var r = CompartidoEstadoCuenta.calcular(
                List.of(
                        cargo("2026-08", "CFE", "100"),
                        cargo("2026-09", "CFE", "100")),
                new BigDecimal("130"));
        assertEquals(1, r.periodosPendientes().size());
        PeriodoPendiente sep = r.periodosPendientes().get(0);
        assertEquals("2026-09", sep.periodo());
        assertEquals(0, sep.pendiente().compareTo(new BigDecimal("70.00")));
    }

    @Test
    void aFavorNoReduceDeudaPosteriorHastaConfirmar() {
        // Abonó de más en agosto → a favor $30; septiembre nuevo no se come solo
        var r = CompartidoEstadoCuenta.calcular(
                List.of(
                        new CompartidoEstadoCuenta.Cargo(
                                "2026-08", "CFE", LocalDate.of(2026, 8, 5), 1L, new BigDecimal("100")),
                        new CompartidoEstadoCuenta.Cargo(
                                "2026-09", "CFE", LocalDate.of(2026, 9, 5), 2L, new BigDecimal("100"))),
                List.of(new CompartidoEstadoCuenta.Abono(
                        new BigDecimal("130"), null, false, LocalDate.of(2026, 8, 10))));
        assertEquals(1, r.periodosPendientes().size());
        assertEquals("2026-09", r.periodosPendientes().get(0).periodo());
        assertEquals(0, r.periodosPendientes().get(0).pendiente().compareTo(new BigDecimal("100.00")));
        assertEquals(0, r.anticipo().compareTo(new BigDecimal("30.00")));
    }

    @Test
    void confirmarAnticipoSiCubreDeudaNueva() {
        var r = CompartidoEstadoCuenta.calcular(
                List.of(
                        new CompartidoEstadoCuenta.Cargo(
                                "2026-08", "CFE", LocalDate.of(2026, 8, 5), 1L, new BigDecimal("100")),
                        new CompartidoEstadoCuenta.Cargo(
                                "2026-09", "CFE", LocalDate.of(2026, 9, 5), 2L, new BigDecimal("100"))),
                List.of(
                        new CompartidoEstadoCuenta.Abono(
                                new BigDecimal("130"), null, false, LocalDate.of(2026, 8, 10)),
                        new CompartidoEstadoCuenta.Abono(
                                new BigDecimal("30"), "CFE", true, LocalDate.of(2026, 9, 6))));
        assertEquals(1, r.periodosPendientes().size());
        assertEquals(0, r.periodosPendientes().get(0).pendiente().compareTo(new BigDecimal("70.00")));
        assertEquals(0, r.anticipo().compareTo(BigDecimal.ZERO.setScale(2)));
    }

    @Test
    void variasCuentasDesglose() {
        var r = CompartidoEstadoCuenta.calcular(
                List.of(
                        cargo("2026-09", "Internet fijo", "100"),
                        cargo("2026-09", "CFE", "80")),
                BigDecimal.ZERO);
        assertEquals(2, r.porCuenta().size());
        assertTrue(r.detalle().contains("CFE"));
        assertTrue(r.detalle().contains("Internet fijo"));
    }

    @Test
    void abonoDirigidoSoloASpotify() {
        // Debe CFE 100 e Internet 100; abona 80 a Internet → CFE sigue 100, Internet 20
        var r = CompartidoEstadoCuenta.calcular(
                List.of(
                        cargo("2026-09", "CFE", "100"),
                        cargo("2026-09", "Internet", "100")),
                List.of(new CompartidoEstadoCuenta.Abono(new BigDecimal("80"), "Internet", false)));
        assertEquals(0, r.porCuenta().stream()
                .filter(c -> c.concepto().equals("CFE")).findFirst().orElseThrow()
                .pendiente().compareTo(new BigDecimal("100.00")));
        assertEquals(0, r.porCuenta().stream()
                .filter(c -> c.concepto().equals("Internet")).findFirst().orElseThrow()
                .pendiente().compareTo(new BigDecimal("20.00")));
    }

    @Test
    void aplicarAnticipoASpotify() {
        // A favor general 50 (abono 150 - deuda CFE 100); manda 50 a Spotify (sin deuda) → anticipo Spotify
        var r = CompartidoEstadoCuenta.calcular(
                List.of(cargo("2026-09", "CFE", "100")),
                List.of(
                        new CompartidoEstadoCuenta.Abono(new BigDecimal("150"), null, false),
                        new CompartidoEstadoCuenta.Abono(new BigDecimal("50"), "Spotify", true)));
        assertTrue(r.periodosPendientes().isEmpty());
        assertEquals(0, r.anticipo().compareTo(new BigDecimal("50.00")));
        assertTrue(r.detalle().toLowerCase().contains("spotify"));
    }

    private static CompartidoEstadoCuenta.Cargo cargo(String periodo, String concepto, String monto) {
        return new CompartidoEstadoCuenta.Cargo(
                periodo, concepto, LocalDate.of(2026, 9, 1), 1L, new BigDecimal(monto));
    }

    @Test
    void prestamoUnificaConceptoCorto() {
        assertEquals("Préstamo", CompartidoEstadoCuenta.conceptoCorto("Préstamo (TDC)"));
        assertEquals("Préstamo", CompartidoEstadoCuenta.conceptoCorto("Préstamo (efectivo)"));
        assertEquals("Préstamo", CompartidoEstadoCuenta.normalizarDestino("Préstamo"));
    }

    @Test
    void abonoDirigidoAPrestamoCubreDeudaPrestamoTdc() {
        var r = CompartidoEstadoCuenta.calcular(
                List.of(new CompartidoEstadoCuenta.Cargo(
                        "otros", "Préstamo (TDC)", LocalDate.of(2026, 9, 1), null, new BigDecimal("100"))),
                List.of(new CompartidoEstadoCuenta.Abono(new BigDecimal("100"), "Préstamo", false)));
        assertTrue(r.periodosPendientes().isEmpty());
        assertEquals(0, r.totalPendiente().compareTo(BigDecimal.ZERO.setScale(2)));
    }

    @Test
    void pagadoDeGastoConFifo() {
        var cargos = List.of(
                new CompartidoEstadoCuenta.Cargo("2026-08", "CFE", LocalDate.of(2026, 8, 1), 1L, new BigDecimal("100")),
                new CompartidoEstadoCuenta.Cargo("2026-09", "CFE", LocalDate.of(2026, 9, 1), 2L, new BigDecimal("100")));
        var abonos = List.of(new CompartidoEstadoCuenta.Abono(new BigDecimal("150"), null, false));
        assertEquals(0, CompartidoEstadoCuenta.pagadoDeGasto(cargos, abonos, 1L).compareTo(new BigDecimal("100.00")));
        assertEquals(0, CompartidoEstadoCuenta.pagadoDeGasto(cargos, abonos, 2L).compareTo(new BigDecimal("50.00")));
    }
}