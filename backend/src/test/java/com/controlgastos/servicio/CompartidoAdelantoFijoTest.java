package com.controlgastos.servicio;

import com.controlgastos.modelo.ServicioFijoCompartido;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class CompartidoAdelantoFijoTest {

    @Test
    void cuotaIgualEntreParticipantes() {
        // $400 entre tú + 3 → [100,100,100,100]; persona índice 0 de la plantilla = $100
        ServicioFijoCompartido s = fijo(400, List.of(10L, 20L, 30L));
        assertEquals(0, CompartidoService.cuotaPersonaEnFijo(s, 10L).compareTo(new BigDecimal("100.00")));
        assertEquals(0, CompartidoService.cuotaPersonaEnFijo(s, 20L).compareTo(new BigDecimal("100.00")));
    }

    @Test
    void cuotaConSobranteAlNoPrincipal() {
        // $399 / 5 → principal 79, resto 80
        ServicioFijoCompartido s = fijo(399, List.of(1L, 2L, 3L, 4L));
        assertEquals(0, CompartidoService.cuotaPersonaEnFijo(s, 1L).compareTo(new BigDecimal("80.00")));
        assertEquals(0, CompartidoService.cuotaPersonaEnFijo(s, 4L).compareTo(new BigDecimal("80.00")));
    }

    @Test
    void rechazaSiNoEstaEnPlantilla() {
        ServicioFijoCompartido s = fijo(200, List.of(1L, 2L));
        assertThrows(IllegalArgumentException.class,
                () -> CompartidoService.cuotaPersonaEnFijo(s, 99L));
    }

    @Test
    void tresMesesAdelantoMonto() {
        ServicioFijoCompartido s = fijo(300, List.of(5L)); // tú + 1 → 150 c/u
        BigDecimal cuota = CompartidoService.cuotaPersonaEnFijo(s, 5L);
        assertEquals(0, cuota.multiply(BigDecimal.valueOf(3)).compareTo(new BigDecimal("450.00")));
    }

    private static ServicioFijoCompartido fijo(int monto, List<Long> personaIds) {
        ServicioFijoCompartido s = new ServicioFijoCompartido();
        s.setConcepto("CFE");
        s.setMonto(new BigDecimal(monto));
        s.setPersonaIds(personaIds);
        return s;
    }
}
