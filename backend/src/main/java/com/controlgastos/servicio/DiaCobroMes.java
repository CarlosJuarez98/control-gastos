package com.controlgastos.servicio;

import java.time.LocalDate;
import java.time.YearMonth;

/**
 * Día de cobro mensual: si el mes no tiene ese día (31, o 29/30 en feb),
 * se cobra el día anterior = último día del mes.
 * En feb no bisiesto, día 29 → 28; en bisiesto, día 29 queda en 29.
 */
public final class DiaCobroMes {

    private DiaCobroMes() {}

    public static int normalizarDia(Integer dia) {
        if (dia == null || dia < 1) return 1;
        return Math.min(31, dia);
    }

    public static LocalDate fechaEnPeriodo(String periodoYyyyMm, Integer diaCobro) {
        YearMonth ym;
        try {
            ym = YearMonth.parse(periodoYyyyMm == null ? "" : periodoYyyyMm.trim());
        } catch (Exception e) {
            ym = YearMonth.from(LocalDate.now());
        }
        return fechaEnMes(ym, diaCobro);
    }

    public static LocalDate fechaEnMes(YearMonth mes, Integer diaCobro) {
        int dia = normalizarDia(diaCobro);
        int max = mes.lengthOfMonth();
        int efectivo = Math.min(dia, max);
        return mes.atDay(efectivo);
    }
}
