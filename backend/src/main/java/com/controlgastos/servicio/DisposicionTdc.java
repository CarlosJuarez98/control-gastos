package com.controlgastos.servicio;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Reglas de disposición TDC: el monto del gasto es lo recibido (disponible);
 * el cargo a la tarjeta es el total del banco (con interés), de contado o a meses.
 */
public final class DisposicionTdc {

    private DisposicionTdc() {}

    /** Normaliza y valida el total del banco. */
    public static BigDecimal normalizarTotalBanco(BigDecimal totalBanco, BigDecimal recibido) {
        if (totalBanco == null || totalBanco.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException(
                    "Indica el total que cobra el banco (incluye interés o comisión)");
        }
        if (recibido == null || recibido.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto recibido debe ser mayor a cero");
        }
        if (totalBanco.compareTo(recibido) < 0) {
            throw new IllegalArgumentException(
                    "El total del banco debe ser al menos el monto recibido (el resto es interés)");
        }
        return totalBanco.setScale(2, RoundingMode.HALF_UP);
    }

    /** Cargo TDC = total banco si hay disposición válida; si no, el monto del gasto. */
    public static BigDecimal cargoTdc(boolean disposicion, BigDecimal totalBanco, BigDecimal montoGasto) {
        if (disposicion
                && totalBanco != null
                && totalBanco.compareTo(BigDecimal.ZERO) > 0) {
            return totalBanco.setScale(2, RoundingMode.HALF_UP);
        }
        return montoGasto;
    }

    public static BigDecimal interes(BigDecimal totalBanco, BigDecimal recibido) {
        if (totalBanco == null || recibido == null) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        BigDecimal i = totalBanco.subtract(recibido).setScale(2, RoundingMode.HALF_UP);
        return i.compareTo(BigDecimal.ZERO) > 0 ? i : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
    }

    public static String conceptoConInteres(String concepto, BigDecimal cargo, BigDecimal recibido) {
        if (cargo == null || recibido == null || cargo.compareTo(recibido) <= 0) {
            return concepto;
        }
        BigDecimal i = interes(cargo, recibido);
        String base = concepto == null ? "" : concepto;
        String out = base + " (interés $" + i.toPlainString() + ")";
        return out.length() <= 200 ? out : out.substring(0, 200);
    }
}
