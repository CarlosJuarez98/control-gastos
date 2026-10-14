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

    /**
     * Fecha límite de pago del ciclo de una compra en TDC (misma regla que el front):
     * si el día de compra &gt; corte → siguiente corte; el pago es el primer
     * {@code diaLimitePago} estrictamente después del corte.
     */
    public static LocalDate fechaLimitePagoCiclo(
            LocalDate fechaCompra, Integer diaCorte, Integer diaLimitePago) {
        if (fechaCompra == null || diaCorte == null || diaLimitePago == null) {
            return null;
        }
        int corte = normalizarDia(diaCorte);
        int pago = normalizarDia(diaLimitePago);
        YearMonth ym = YearMonth.from(fechaCompra);
        if (fechaCompra.getDayOfMonth() > corte) {
            ym = ym.plusMonths(1);
        }
        LocalDate fechaCorte = fechaEnMes(ym, corte);
        YearMonth pagoYm = YearMonth.from(fechaCorte);
        LocalDate fechaPago = fechaEnMes(pagoYm, pago);
        if (!fechaPago.isAfter(fechaCorte)) {
            fechaPago = fechaEnMes(pagoYm.plusMonths(1), pago);
        }
        return fechaPago;
    }
}
