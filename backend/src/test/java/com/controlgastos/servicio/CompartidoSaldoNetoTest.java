package com.controlgastos.servicio;

import com.controlgastos.modelo.MovimientoPersonaCompartida;
import com.controlgastos.modelo.PersonaCompartida;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class CompartidoSaldoNetoTest {

    @Test
    void debeMenosAbonos() {
        PersonaCompartida p = persona(1L);
        List<MovimientoPersonaCompartida> movs = List.of(
                mov(p, MovimientoPersonaCompartida.DEUDA, "80"),
                mov(p, MovimientoPersonaCompartida.DEUDA, "50"),
                mov(p, MovimientoPersonaCompartida.ABONO, "30")
        );
        assertEquals(0, CompartidoService.saldoNeto(1L, movs).compareTo(new BigDecimal("100")));
    }

    @Test
    void aFavorSiAbonaDeMas() {
        PersonaCompartida p = persona(2L);
        List<MovimientoPersonaCompartida> movs = List.of(
                mov(p, MovimientoPersonaCompartida.DEUDA, "40"),
                mov(p, MovimientoPersonaCompartida.ABONO, "60")
        );
        assertEquals(0, CompartidoService.saldoNeto(2L, movs).compareTo(new BigDecimal("-20")));
    }

    @Test
    void ignoraOtrasPersonasYAnulados() {
        PersonaCompartida a = persona(1L);
        PersonaCompartida b = persona(2L);
        MovimientoPersonaCompartida anulado = mov(a, MovimientoPersonaCompartida.DEUDA, "99");
        anulado.setAnulado(true);
        List<MovimientoPersonaCompartida> movs = List.of(
                mov(a, MovimientoPersonaCompartida.DEUDA, "10"),
                mov(b, MovimientoPersonaCompartida.DEUDA, "500"),
                anulado
        );
        assertEquals(0, CompartidoService.saldoNeto(1L, movs).compareTo(new BigDecimal("10")));
    }

    private static PersonaCompartida persona(Long id) {
        PersonaCompartida p = new PersonaCompartida();
        p.setId(id);
        p.setNombre("P" + id);
        return p;
    }

    private static MovimientoPersonaCompartida mov(PersonaCompartida p, String tipo, String monto) {
        MovimientoPersonaCompartida m = new MovimientoPersonaCompartida();
        m.setPersona(p);
        m.setTipo(tipo);
        m.setMonto(new BigDecimal(monto));
        m.setAnulado(false);
        return m;
    }
}
