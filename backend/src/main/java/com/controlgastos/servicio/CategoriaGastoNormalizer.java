package com.controlgastos.servicio;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Map;

/**
 * Unifica variantes de categoría (Yo/yo, Vehiculo/Vehiculos, Nu credito/NU credito, etc.).
 */
public final class CategoriaGastoNormalizer {

    private static final Map<String, String> CANONICAS = Map.ofEntries(
            Map.entry("yo", "Yo"),
            Map.entry("familia", "Familia"),
            Map.entry("tdc", "TDC"),
            Map.entry("vehiculo", "Vehiculos"),
            Map.entry("vehiculos", "Vehiculos"),
            Map.entry("nu credito", "Nu credito"),
            Map.entry("nucredito", "Nu credito"),
            Map.entry("nu", "Nu credito"),
            Map.entry("didi card", "Didi Card"),
            Map.entry("didicard", "Didi Card"),
            Map.entry("didi", "Didi Card"),
            Map.entry("liverpool", "Liverpool"),
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

        String canonica = CANONICAS.get(clave);
        if (canonica != null) {
            return canonica;
        }

        // Primera letra mayúscula; el resto como vino (sin romper acrónimos cortos)
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
