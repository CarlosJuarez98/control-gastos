package com.controlgastos.servicio;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.YearMonth;

import static org.junit.jupiter.api.Assertions.*;

class DiaCobroMesTest {

    @Test
    void diaNormal() {
        assertEquals(LocalDate.of(2026, 9, 15),
                DiaCobroMes.fechaEnMes(YearMonth.of(2026, 9), 15));
    }

    @Test
    void dia31EnAbrilPasaA30() {
        assertEquals(LocalDate.of(2026, 4, 30),
                DiaCobroMes.fechaEnMes(YearMonth.of(2026, 4), 31));
    }

    @Test
    void febNoBisiestoDia29PasaA28() {
        assertEquals(LocalDate.of(2025, 2, 28),
                DiaCobroMes.fechaEnMes(YearMonth.of(2025, 2), 29));
    }

    @Test
    void febBisiestoDia29Queda() {
        assertEquals(LocalDate.of(2024, 2, 29),
                DiaCobroMes.fechaEnMes(YearMonth.of(2024, 2), 29));
    }

    @Test
    void febBisiestoDia30PasaA29() {
        // Un día antes / último del mes
        assertEquals(LocalDate.of(2024, 2, 29),
                DiaCobroMes.fechaEnMes(YearMonth.of(2024, 2), 30));
    }

    @Test
    void periodoString() {
        assertEquals(LocalDate.of(2026, 9, 10),
                DiaCobroMes.fechaEnPeriodo("2026-09", 10));
    }
}
