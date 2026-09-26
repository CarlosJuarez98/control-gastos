package com.controlgastos.servicio;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class CuotasPlanTest {

    @Test
    void tresPagosConResiduoEnUltima() {
        // 2287.47 / 3 = 762.49 → 762.49*2=1524.98 → última 762.49 (exacto)
        CuotasPlan.Resultado r = CuotasPlan.deTotal(new BigDecimal("2287.47"), 3);
        assertEquals(new BigDecimal("762.49"), r.cuotaRegular());
        assertEquals(new BigDecimal("762.49"), r.cuotaUltima());
        assertFalse(r.ultimaDifiere());
    }

    @Test
    void totalQueNoDivideExacto() {
        // 1000 / 3 = 333.33 → 333.33*2=666.66 → última 333.34
        CuotasPlan.Resultado r = CuotasPlan.deTotal(new BigDecimal("1000.00"), 3);
        assertEquals(new BigDecimal("333.33"), r.cuotaRegular());
        assertEquals(new BigDecimal("333.34"), r.cuotaUltima());
        assertTrue(r.ultimaDifiere());
        assertEquals(0, r.cuotaRegular().multiply(BigDecimal.valueOf(2)).add(r.cuotaUltima())
                .compareTo(new BigDecimal("1000.00")));
    }

    @Test
    void unMesEsElTotal() {
        CuotasPlan.Resultado r = CuotasPlan.deTotal(new BigDecimal("2000.00"), 1);
        assertEquals(new BigDecimal("2000.00"), r.cuotaRegular());
        assertEquals(new BigDecimal("2000.00"), r.cuotaUltima());
    }

    @Test
    void cuotaActualUsaUltimaCuandoRestaUno() {
        CuotasPlan.Resultado r = CuotasPlan.deTotal(new BigDecimal("1000.00"), 3);
        assertEquals(r.cuotaRegular(), CuotasPlan.cuotaActual(r, 3));
        assertEquals(r.cuotaRegular(), CuotasPlan.cuotaActual(r, 2));
        assertEquals(r.cuotaUltima(), CuotasPlan.cuotaActual(r, 1));
    }

    @Test
    void montoRestanteSumaCorrecta() {
        BigDecimal total = new BigDecimal("1000.00");
        BigDecimal regular = new BigDecimal("333.33");
        assertEquals(0, CuotasPlan.montoRestante(regular, total, 3, 3).compareTo(total));
        assertEquals(0, CuotasPlan.montoRestante(regular, total, 3, 2)
                .compareTo(new BigDecimal("666.67")));
        assertEquals(0, CuotasPlan.montoRestante(regular, total, 3, 1)
                .compareTo(new BigDecimal("333.34")));
        assertEquals(0, CuotasPlan.montoRestante(regular, total, 3, 0)
                .compareTo(BigDecimal.ZERO.setScale(2)));
    }

    @Test
    void disponibleVsCargoDisposicion() {
        BigDecimal recibido = new BigDecimal("2000.00");
        BigDecimal totalBanco = new BigDecimal("2287.47");
        assertTrue(totalBanco.compareTo(recibido) > 0);
        CuotasPlan.Resultado plan = CuotasPlan.deTotal(totalBanco, 3);
        assertEquals(0, plan.total().compareTo(totalBanco));
        BigDecimal interes = totalBanco.subtract(recibido);
        assertEquals(0, interes.compareTo(new BigDecimal("287.47")));
    }
}
