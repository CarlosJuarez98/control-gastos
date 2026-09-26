package com.controlgastos.servicio;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Reparte un total en N cuotas sin perder centavos:
 * las primeras N−1 usan la cuota regular; la última absorbe el residuo.
 */
public final class CuotasPlan {

    public record Resultado(BigDecimal cuotaRegular, BigDecimal cuotaUltima, BigDecimal total, int meses) {
        public boolean ultimaDifiere() {
            return cuotaUltima.compareTo(cuotaRegular) != 0;
        }
    }

    private CuotasPlan() {}

    public static Resultado deTotal(BigDecimal total, int meses) {
        if (total == null || total.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El total debe ser mayor a cero");
        }
        BigDecimal t = total.setScale(2, RoundingMode.HALF_UP);
        if (meses <= 1) {
            return new Resultado(t, t, t, 1);
        }
        BigDecimal regular = t.divide(BigDecimal.valueOf(meses), 2, RoundingMode.HALF_UP);
        BigDecimal ultima = t.subtract(regular.multiply(BigDecimal.valueOf(meses - 1)))
                .setScale(2, RoundingMode.HALF_UP);
        if (ultima.compareTo(BigDecimal.ZERO) <= 0) {
            regular = t.divide(BigDecimal.valueOf(meses), 2, RoundingMode.DOWN);
            ultima = t.subtract(regular.multiply(BigDecimal.valueOf(meses - 1)))
                    .setScale(2, RoundingMode.HALF_UP);
        }
        return new Resultado(regular, ultima, t, meses);
    }

    /** Cuota a pagar según meses restantes (1 = última). */
    public static BigDecimal cuotaActual(Resultado plan, int mesesRestantes) {
        if (plan == null || mesesRestantes <= 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        if (mesesRestantes == 1) {
            return plan.cuotaUltima();
        }
        return plan.cuotaRegular();
    }

    public static BigDecimal cuotaActual(
            BigDecimal cuotaRegular, BigDecimal montoTotal, Integer mesesTotales, Integer mesesRestantes) {
        if (cuotaRegular == null || mesesRestantes == null || mesesRestantes <= 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        if (montoTotal == null || mesesTotales == null || mesesTotales <= 1) {
            return cuotaRegular.setScale(2, RoundingMode.HALF_UP);
        }
        Resultado plan = deTotal(montoTotal, mesesTotales);
        // Prefer stored regular if close; use plan derived from total for última
        if (mesesRestantes == 1) {
            return plan.cuotaUltima();
        }
        return cuotaRegular.setScale(2, RoundingMode.HALF_UP);
    }

    /** Saldo pendiente del plan MSI. */
    public static BigDecimal montoRestante(
            BigDecimal cuotaRegular, BigDecimal montoTotal, Integer mesesTotales, Integer mesesRestantes) {
        if (mesesRestantes == null || mesesRestantes <= 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        if (montoTotal != null && mesesTotales != null && mesesTotales > 1) {
            Resultado plan = deTotal(montoTotal, mesesTotales);
            if (mesesRestantes == 1) {
                return plan.cuotaUltima();
            }
            return plan.cuotaRegular()
                    .multiply(BigDecimal.valueOf(mesesRestantes - 1L))
                    .add(plan.cuotaUltima())
                    .setScale(2, RoundingMode.HALF_UP);
        }
        if (cuotaRegular == null) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        return cuotaRegular.multiply(BigDecimal.valueOf(mesesRestantes))
                .setScale(2, RoundingMode.HALF_UP);
    }
}
