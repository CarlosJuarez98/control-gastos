package com.controlgastos.servicio;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Reparte un monto en N partes en pesos enteros (suma exacta al total redondeado).
 * <p>
 * Índice 0 = persona principal (tú): siempre el piso (paga menos o igual).
 * Los demás reciben el sobrante de $1 en $1.
 * Ej. 399 / 5 → [79, 80, 80, 80, 80].
 */
public final class RepartoEnteros {

    private RepartoEnteros() {}

    public static List<BigDecimal> repartirPesos(BigDecimal total, int personas) {
        if (personas < 1) {
            throw new IllegalArgumentException("Se necesita al menos 1 persona");
        }
        List<Integer> pesos = new ArrayList<>(personas);
        for (int i = 0; i < personas; i++) {
            pesos.add(1);
        }
        return repartirPesosPonderado(total, pesos);
    }

    /**
     * Reparto ponderado (p. ej. días del mes). Índice 0 = principal (si hay varios).
     * Los pesos deben ser &gt; 0. Suma exacta; extras de $1 van primero a los no-principal.
     */
    public static List<BigDecimal> repartirPesosPonderado(BigDecimal total, List<Integer> pesos) {
        return repartirUnidades(total, pesos, false);
    }

    /** Igual que {@link #repartirPesosPonderado} pero en centavos (Monse / a favor con decimales). */
    public static List<BigDecimal> repartirPesosPonderadoCentavos(BigDecimal total, List<Integer> pesos) {
        return repartirUnidades(total, pesos, true);
    }

    private static List<BigDecimal> repartirUnidades(BigDecimal total, List<Integer> pesos, boolean centavos) {
        if (pesos == null || pesos.isEmpty()) {
            throw new IllegalArgumentException("Se necesita al menos 1 persona");
        }
        if (total == null || total.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("El monto debe ser cero o mayor");
        }
        long monto = centavos
                ? total.setScale(2, RoundingMode.HALF_UP).movePointRight(2).longValue()
                : total.setScale(0, RoundingMode.HALF_UP).longValue();
        if (monto < 0) {
            throw new IllegalArgumentException("El monto no puede ser negativo");
        }
        int n = pesos.size();
        long sumW = 0;
        for (Integer w : pesos) {
            if (w == null || w <= 0) {
                throw new IllegalArgumentException("Cada peso (días) debe ser mayor a cero");
            }
            sumW += w;
        }

        // floor(monto * w_i / sumW); residual a no-principal (índices 1..n-1), luego al principal si hace falta
        long[] parts = new long[n];
        long assigned = 0;
        for (int i = 0; i < n; i++) {
            parts[i] = (monto * pesos.get(i)) / sumW;
            assigned += parts[i];
        }
        long rem = monto - assigned;
        for (int i = 1; rem > 0 && i < n; i++) {
            parts[i]++;
            rem--;
        }
        if (rem > 0) {
            parts[0] += rem;
        }

        List<BigDecimal> out = new ArrayList<>(n);
        for (long p : parts) {
            BigDecimal v = centavos
                    ? BigDecimal.valueOf(p).movePointLeft(2)
                    : BigDecimal.valueOf(p);
            out.add(v.setScale(2, RoundingMode.UNNECESSARY));
        }
        return out;
    }
}
