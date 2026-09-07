package com.controlgastos.servicio;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Unifica variantes de categoría. Categorías “de pago” viejas (TDC, Nu…) → Otro.
 */
public final class CategoriaGastoNormalizer {

    private static final Set<String> CATEGORIAS_PAGO = Set.of(
            "tdc", "nu credito", "nucredito", "nu", "didi card", "didicard", "didi", "liverpool"
    );

    private static final Map<String, String> CANONICAS = Map.ofEntries(
            Map.entry("yo", "Yo"),
            Map.entry("familia", "Familia"),
            Map.entry("vehiculo", "Vehiculos"),
            Map.entry("vehiculos", "Vehiculos"),
            Map.entry("casa", "Casa"),
            Map.entry("mama", "Mama"),
            Map.entry("otro", "Otro"),
            Map.entry("otros", "Otro"),
            Map.entry("amazon", "Amazon"),
            Map.entry("gasolina", "Gasolina"),
            Map.entry("comida", "Comida"),
            Map.entry("despensa", "Despensa"),
            Map.entry("salida", "Salida"),
            Map.entry("salidas", "Salida")
    );

    private CategoriaGastoNormalizer() {}

    public static String normalizar(String raw) {
        if (raw == null || raw.isBlank()) {
            return "Otro";
        }
        String limpio = raw.trim().replaceAll("\\s+", " ");
        String clave = sinAcentos(limpio).toLowerCase(Locale.ROOT);

        if (CATEGORIAS_PAGO.contains(clave)) {
            return "Otro";
        }

        String canonica = CANONICAS.get(clave);
        if (canonica != null) {
            return canonica;
        }

        if (limpio.length() <= 3 && limpio.equals(limpio.toUpperCase(Locale.ROOT))) {
            return limpio.toUpperCase(Locale.ROOT);
        }
        return limpio.substring(0, 1).toUpperCase(Locale.ROOT) + limpio.substring(1);
    }

    private static String sinAcentos(String s) {
        String n = Normalizer.normalize(s, Normalizer.Form.NFD);
        return n.replaceAll("\\p{M}+", "");
    }
}
