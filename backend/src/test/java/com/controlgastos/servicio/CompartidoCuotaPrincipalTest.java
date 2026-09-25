package com.controlgastos.servicio;

import com.controlgastos.modelo.ServicioFijoCompartido;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class CompartidoCuotaPrincipalTest {

    @Test
    void cuotaPrincipalConOtros() {
        ServicioFijoCompartido s = new ServicioFijoCompartido();
        s.setMonto(new BigDecimal("400"));
        s.setPersonaIds(List.of(1L, 2L, 3L));
        s.setIncluyePrincipal(true);
        // 400 / 4 → principal 100
        assertEquals(new BigDecimal("100.00"), CompartidoService.cuotaPrincipalEnFijo(s));
    }

    @Test
    void cuotaPrincipalSoloYo() {
        ServicioFijoCompartido s = new ServicioFijoCompartido();
        s.setMonto(new BigDecimal("199"));
        s.setPersonaIds(List.of());
        s.setIncluyePrincipal(true);
        assertEquals(new BigDecimal("199.00"), CompartidoService.cuotaPrincipalEnFijo(s));
    }

    @Test
    void sinIncluirPrincipalEsCero() {
        ServicioFijoCompartido s = new ServicioFijoCompartido();
        s.setMonto(new BigDecimal("300"));
        s.setPersonaIds(List.of(1L, 2L));
        s.setIncluyePrincipal(false);
        assertEquals(0, CompartidoService.cuotaPrincipalEnFijo(s).compareTo(BigDecimal.ZERO));
    }

    @Test
    void streamingTresPerfilesPagaMas() {
        // Netflix $399: tú 1, Ana 3, Luis 1 → pesos 1+3+1=5 → [79, 240, 80]
        ServicioFijoCompartido s = new ServicioFijoCompartido();
        s.setMonto(new BigDecimal("399"));
        s.setPersonaIds(List.of(10L, 20L));
        s.setPersonaPerfiles(List.of(3, 1));
        s.setPerfilesPrincipal(1);
        s.setIncluyePrincipal(true);
        assertEquals(new BigDecimal("79.00"), CompartidoService.cuotaPrincipalEnFijo(s));
        assertEquals(new BigDecimal("240.00"), CompartidoService.cuotaPersonaEnFijo(s, 10L));
        assertEquals(new BigDecimal("80.00"), CompartidoService.cuotaPersonaEnFijo(s, 20L));
    }
}
