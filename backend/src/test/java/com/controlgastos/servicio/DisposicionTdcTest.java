package com.controlgastos.servicio;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class DisposicionTdcTest {

    @Test
    void contadoCargoEsTotalBancoNoRecibido() {
        BigDecimal recibido = new BigDecimal("2000.00");
        BigDecimal total = new BigDecimal("2287.47");
        BigDecimal cargo = DisposicionTdc.cargoTdc(true, total, recibido);
        assertEquals(0, cargo.compareTo(total));
        assertTrue(cargo.compareTo(recibido) > 0);
        assertEquals(0, DisposicionTdc.interes(total, recibido).compareTo(new BigDecimal("287.47")));
    }

    @Test
    void sinDisposicionCargoEsMontoGasto() {
        BigDecimal monto = new BigDecimal("500.00");
        assertEquals(0, DisposicionTdc.cargoTdc(false, new BigDecimal("999"), monto).compareTo(monto));
        assertEquals(0, DisposicionTdc.cargoTdc(true, null, monto).compareTo(monto));
    }

    @Test
    void totalMenorQueRecibidoFalla() {
        assertThrows(IllegalArgumentException.class,
                () -> DisposicionTdc.normalizarTotalBanco(new BigDecimal("100"), new BigDecimal("200")));
    }

    @Test
    void totalObligatorio() {
        assertThrows(IllegalArgumentException.class,
                () -> DisposicionTdc.normalizarTotalBanco(null, new BigDecimal("100")));
        assertThrows(IllegalArgumentException.class,
                () -> DisposicionTdc.normalizarTotalBanco(BigDecimal.ZERO, new BigDecimal("100")));
    }

    @Test
    void conceptoIncluyeInteres() {
        String c = DisposicionTdc.conceptoConInteres(
                "Disposición", new BigDecimal("2287.47"), new BigDecimal("2000.00"));
        assertTrue(c.contains("interés $287.47"));
    }

    @Test
    void planMesesUsaTotalBanco() {
        BigDecimal total = DisposicionTdc.normalizarTotalBanco(
                new BigDecimal("2287.47"), new BigDecimal("2000.00"));
        CuotasPlan.Resultado plan = CuotasPlan.deTotal(total, 3);
        assertEquals(0, plan.total().compareTo(total));
        assertEquals(0, plan.cuotaRegular().multiply(BigDecimal.valueOf(2)).add(plan.cuotaUltima())
                .compareTo(total));
    }
}
