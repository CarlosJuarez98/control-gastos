package com.controlgastos.servicio;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RepartoEnterosTest {

    @Test
    void principalPagaMenosEn399Entre5() {
        List<BigDecimal> partes = RepartoEnteros.repartirPesos(new BigDecimal("399"), 5);
        assertEquals(5, partes.size());
        assertEquals(new BigDecimal("79.00"), partes.get(0), "principal");
        assertEquals(new BigDecimal("80.00"), partes.get(1));
        assertEquals(new BigDecimal("80.00"), partes.get(2));
        assertEquals(new BigDecimal("80.00"), partes.get(3));
        assertEquals(new BigDecimal("80.00"), partes.get(4));
        assertEquals(0, partes.stream().reduce(BigDecimal.ZERO, BigDecimal::add)
                .compareTo(new BigDecimal("399.00")));
    }

    @Test
    void redondeaYPrincipalConPiso() {
        // 100.40 → 100; base 33, rem 1 → principal 33, otros 34 y 33
        List<BigDecimal> partes = RepartoEnteros.repartirPesos(new BigDecimal("100.40"), 3);
        assertEquals(List.of(
                new BigDecimal("33.00"),
                new BigDecimal("34.00"),
                new BigDecimal("33.00")
        ), partes);
    }

    @Test
    void dosPersonasSobranteAlOtro() {
        List<BigDecimal> partes = RepartoEnteros.repartirPesos(new BigDecimal("11"), 2);
        assertEquals(List.of(new BigDecimal("5.00"), new BigDecimal("6.00")), partes);
    }

    @Test
    void ponderadoPorDiasNuevoAMitadDeMes() {
        // Tú + 2 veteranos (30d) + 1 nuevo (15d); total 400
        List<BigDecimal> partes = RepartoEnteros.repartirPesosPonderado(
                new BigDecimal("400"), List.of(30, 30, 30, 15));
        assertEquals(4, partes.size());
        long suma = partes.stream().mapToLong(b -> b.longValue()).sum();
        assertEquals(400L, suma);
        // El nuevo (último) debe pagar menos que un veterano
        assertTrue(partes.get(3).compareTo(partes.get(1)) < 0);
        // Principal no recibe extras antes que los demás
        assertTrue(partes.get(0).compareTo(partes.get(1)) <= 0);
    }

    @Test
    void unaPersonaRecibeTodo() {
        List<BigDecimal> partes = RepartoEnteros.repartirPesos(new BigDecimal("150"), 1);
        assertEquals(List.of(new BigDecimal("150.00")), partes);
    }

    @Test
    void ponderadoPorPerfilesStreaming() {
        // Netflix $399: tú 1 + alguien 3 + alguien 1
        List<BigDecimal> partes = RepartoEnteros.repartirPesosPonderado(
                new BigDecimal("399"), List.of(1, 3, 1));
        assertEquals(List.of(
                new BigDecimal("79.00"),
                new BigDecimal("240.00"),
                new BigDecimal("80.00")
        ), partes);
    }

    @Test
    void rechazaCeroPersonas() {
        assertThrows(IllegalArgumentException.class,
                () -> RepartoEnteros.repartirPesos(BigDecimal.TEN, 0));
    }
}
