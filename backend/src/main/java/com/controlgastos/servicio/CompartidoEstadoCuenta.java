package com.controlgastos.servicio;

import com.controlgastos.dto.CompartidoDtos.CuentaPendiente;
import com.controlgastos.dto.CompartidoDtos.PeriodoPendiente;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Abonos generales (FIFO) + abonos dirigidos a una cuenta (Spotify, CFE…).
 * <p>
 * El sobrante («a favor» / anticipo) <strong>no</strong> se aplica solo a deudas posteriores:
 * queda congelado hasta que confirmes con «aplicar anticipo» ({@code desdeAnticipo}).
 * Cada abono solo cubre cargos con fecha de cobro ≤ fecha del abono.
 */
public final class CompartidoEstadoCuenta {

    private CompartidoEstadoCuenta() {}

    public record Cargo(
            String periodo,
            String concepto,
            LocalDate fechaCobro,
            Long gastoCompartidoId,
            BigDecimal monto
    ) {}

    public record Abono(
            BigDecimal monto,
            /** Null/blank = general. */
            String conceptoDestino,
            /** True = sacado del a favor general; confirmación explícita (sí aplica a deudas). */
            boolean desdeAnticipo,
            /** Fecha del movimiento; null = solo cargos ya existentes se tratan con fecha mínima. */
            LocalDate fecha
    ) {
        public Abono(BigDecimal monto, String conceptoDestino, boolean desdeAnticipo) {
            this(monto, conceptoDestino, desdeAnticipo, null);
        }
    }

    public record Resultado(
            List<PeriodoPendiente> periodosPendientes,
            List<CuentaPendiente> porCuenta,
            BigDecimal totalPendiente,
            BigDecimal anticipo,
            String detalle
    ) {}

    private record EstadoInterno(
            List<Cargo> ordenados,
            BigDecimal[] resto,
            BigDecimal[] pagado,
            BigDecimal anticipoGeneral,
            Map<String, BigDecimal> anticipoDestino
    ) {}

    /** Compat: todos los abonos son generales. */
    public static Resultado calcular(List<Cargo> cargos, BigDecimal totalAbonos) {
        List<Abono> abs = new ArrayList<>();
        if (totalAbonos != null && totalAbonos.compareTo(BigDecimal.ZERO) > 0) {
            abs.add(new Abono(totalAbonos, null, false, null));
        }
        return calcular(cargos, abs);
    }

    public static Resultado calcular(List<Cargo> cargos, List<Abono> abonos) {
        EstadoInterno e = aplicar(cargos, abonos);
        List<PeriodoPendiente> pendientes = new ArrayList<>();
        for (int i = 0; i < e.ordenados.size(); i++) {
            if (e.resto[i].compareTo(BigDecimal.ZERO) <= 0) continue;
            Cargo c = e.ordenados.get(i);
            BigDecimal cargo = c.monto() == null ? BigDecimal.ZERO : c.monto();
            pendientes.add(new PeriodoPendiente(
                    c.periodo(),
                    conceptoCorto(c.concepto()),
                    c.fechaCobro(),
                    c.gastoCompartidoId(),
                    cargo.setScale(2, RoundingMode.UNNECESSARY),
                    e.pagado[i].setScale(2, RoundingMode.UNNECESSARY),
                    e.resto[i].setScale(2, RoundingMode.UNNECESSARY)
            ));
        }

        BigDecimal anticipoGeneral = e.anticipoGeneral.max(BigDecimal.ZERO);
        List<CuentaPendiente> porCuenta = agruparPorCuenta(pendientes, e.anticipoDestino);
        BigDecimal totalPendiente = pendientes.stream()
                .map(PeriodoPendiente::pendiente)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal anticipoDirigido = e.anticipoDestino.values().stream()
                .filter(v -> v.compareTo(BigDecimal.ZERO) > 0)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal anticipo = anticipoGeneral.add(anticipoDirigido)
                .setScale(2, RoundingMode.HALF_UP).setScale(2, RoundingMode.UNNECESSARY);

        return new Resultado(
                pendientes,
                porCuenta,
                totalPendiente,
                anticipo,
                armarDetalle(porCuenta, anticipoGeneral, e.anticipoDestino));
    }

    /** Cuánto de los abonos ya se aplicó a las deudas de un gasto concreto. */
    public static BigDecimal pagadoDeGasto(List<Cargo> cargos, List<Abono> abonos, Long gastoCompartidoId) {
        if (gastoCompartidoId == null) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.UNNECESSARY);
        }
        EstadoInterno e = aplicar(cargos, abonos);
        BigDecimal total = BigDecimal.ZERO;
        for (int i = 0; i < e.ordenados.size(); i++) {
            if (gastoCompartidoId.equals(e.ordenados.get(i).gastoCompartidoId())) {
                total = total.add(e.pagado[i]);
            }
        }
        return total.setScale(2, RoundingMode.HALF_UP).setScale(2, RoundingMode.UNNECESSARY);
    }

    private static EstadoInterno aplicar(List<Cargo> cargos, List<Abono> abonos) {
        List<Cargo> ordenados = new ArrayList<>(cargos == null ? List.of() : cargos);
        ordenados.sort(Comparator
                .comparing((Cargo c) -> c.periodo() == null ? "" : c.periodo())
                .thenComparing(c -> c.fechaCobro() == null ? LocalDate.MIN : c.fechaCobro())
                .thenComparing(c -> c.gastoCompartidoId() == null ? 0L : c.gastoCompartidoId()));

        BigDecimal[] resto = new BigDecimal[ordenados.size()];
        BigDecimal[] pagado = new BigDecimal[ordenados.size()];
        for (int i = 0; i < ordenados.size(); i++) {
            BigDecimal m = ordenados.get(i).monto() == null ? BigDecimal.ZERO : ordenados.get(i).monto();
            resto[i] = m.max(BigDecimal.ZERO);
            pagado[i] = BigDecimal.ZERO;
        }

        BigDecimal anticipoGeneral = BigDecimal.ZERO;
        Map<String, BigDecimal> anticipoDestino = new LinkedHashMap<>();

        List<Abono> ordenAbs = new ArrayList<>(abonos == null ? List.of() : abonos);
        ordenAbs.sort(Comparator.comparing(a -> a == null || a.fecha() == null ? LocalDate.MIN : a.fecha()));

        for (Abono a : ordenAbs) {
            if (a == null || a.monto() == null || a.monto().compareTo(BigDecimal.ZERO) == 0) {
                continue;
            }
            String dest = normalizarDestino(a.conceptoDestino());
            LocalDate limite = a.fecha() == null ? LocalDate.MAX : a.fecha();

            if (a.desdeAnticipo()) {
                // Confirmación: gasta a favor → aplica a deudas del destino (o solo resta si ANTICIPO_OUT)
                anticipoGeneral = anticipoGeneral.subtract(a.monto());
                if (dest != null) {
                    BigDecimal pool = a.monto();
                    pool = aplicarACargos(ordenados, resto, pagado, pool, dest, LocalDate.MAX);
                    if (pool.compareTo(BigDecimal.ZERO) > 0) {
                        anticipoDestino.merge(dest, pool, BigDecimal::add);
                    }
                }
                continue;
            }

            if (dest != null) {
                if (a.monto().compareTo(BigDecimal.ZERO) < 0) {
                    continue;
                }
                // Abono dirigido: cubre deudas de esa cuenta hasta la fecha; sobrante = anticipo congelado
                BigDecimal pool = a.monto();
                pool = aplicarACargos(ordenados, resto, pagado, pool, dest, limite);
                if (pool.compareTo(BigDecimal.ZERO) > 0) {
                    anticipoDestino.merge(dest, pool, BigDecimal::add);
                }
            } else {
                if (a.monto().compareTo(BigDecimal.ZERO) < 0) {
                    // ANTICIPO_OUT registrado como abono negativo raro — resta del a favor
                    anticipoGeneral = anticipoGeneral.add(a.monto());
                    continue;
                }
                // General: FIFO solo a cargos ya cobrados a esa fecha; sobrante → a favor congelado
                BigDecimal pool = a.monto();
                pool = aplicarACargos(ordenados, resto, pagado, pool, null, limite);
                anticipoGeneral = anticipoGeneral.add(pool);
            }
        }

        if (anticipoGeneral.compareTo(BigDecimal.ZERO) < 0) {
            anticipoGeneral = BigDecimal.ZERO;
        }

        return new EstadoInterno(ordenados, resto, pagado, anticipoGeneral, anticipoDestino);
    }

    /**
     * Aplica {@code pool} a cargos que coinciden (destino null = cualquiera) con fechaCobro ≤ limite.
     * @return sobrante no aplicado
     */
    private static BigDecimal aplicarACargos(
            List<Cargo> ordenados,
            BigDecimal[] resto,
            BigDecimal[] pagado,
            BigDecimal pool,
            String destinoONull,
            LocalDate limite) {
        BigDecimal disponible = pool;
        for (int i = 0; i < ordenados.size() && disponible.compareTo(BigDecimal.ZERO) > 0; i++) {
            if (resto[i].compareTo(BigDecimal.ZERO) <= 0) continue;
            LocalDate fc = ordenados.get(i).fechaCobro() == null ? LocalDate.MIN : ordenados.get(i).fechaCobro();
            if (fc.isAfter(limite)) continue;
            if (destinoONull != null) {
                String cpto = conceptoCorto(ordenados.get(i).concepto());
                if (!destinoONull.equalsIgnoreCase(cpto)) continue;
            }
            BigDecimal aplicar = disponible.min(resto[i]);
            resto[i] = resto[i].subtract(aplicar);
            pagado[i] = pagado[i].add(aplicar);
            disponible = disponible.subtract(aplicar);
        }
        return disponible;
    }

    static List<CuentaPendiente> agruparPorCuenta(
            List<PeriodoPendiente> pendientes,
            Map<String, BigDecimal> anticipoPorDestino) {
        Map<String, List<PeriodoPendiente>> mapa = new LinkedHashMap<>();
        for (PeriodoPendiente p : pendientes) {
            String key = p.concepto() == null || p.concepto().isBlank() ? "Otro" : p.concepto().trim();
            mapa.computeIfAbsent(key, k -> new ArrayList<>()).add(p);
        }
        if (anticipoPorDestino != null) {
            for (Map.Entry<String, BigDecimal> e : anticipoPorDestino.entrySet()) {
                if (e.getValue().compareTo(BigDecimal.ZERO) > 0) {
                    mapa.computeIfAbsent(e.getKey(), k -> new ArrayList<>());
                }
            }
        }

        List<CuentaPendiente> out = new ArrayList<>();
        for (Map.Entry<String, List<PeriodoPendiente>> e : mapa.entrySet()) {
            BigDecimal suma = e.getValue().stream()
                    .map(PeriodoPendiente::pendiente)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            StringBuilder det = new StringBuilder();
            for (int i = 0; i < e.getValue().size(); i++) {
                PeriodoPendiente p = e.getValue().get(i);
                if (i > 0) det.append(" + ");
                det.append(etiquetaPeriodo(p.periodo())).append(" $").append(entero(p.pendiente()));
            }
            BigDecimal ant = anticipoPorDestino == null
                    ? BigDecimal.ZERO
                    : anticipoPorDestino.getOrDefault(e.getKey(), BigDecimal.ZERO).max(BigDecimal.ZERO);
            if (det.length() == 0 && ant.compareTo(BigDecimal.ZERO) > 0) {
                det.append("anticipo $").append(entero(ant));
            } else if (ant.compareTo(BigDecimal.ZERO) > 0) {
                det.append(" · anticipo $").append(entero(ant));
            }
            if (suma.compareTo(BigDecimal.ZERO) <= 0 && ant.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            out.add(new CuentaPendiente(
                    e.getKey(),
                    suma.setScale(2, RoundingMode.UNNECESSARY),
                    ant.setScale(2, RoundingMode.UNNECESSARY),
                    det.toString()));
        }
        out.sort(Comparator.comparing(CuentaPendiente::concepto, String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    static String armarDetalle(
            List<CuentaPendiente> porCuenta,
            BigDecimal anticipoGeneral,
            Map<String, BigDecimal> poolDestino) {
        boolean hayAnticipoGen = anticipoGeneral != null && anticipoGeneral.compareTo(BigDecimal.ZERO) > 0;
        List<CuentaPendiente> conDeuda = porCuenta == null ? List.of() : porCuenta.stream()
                .filter(c -> c.pendiente().compareTo(BigDecimal.ZERO) > 0)
                .toList();

        if (conDeuda.isEmpty()) {
            StringBuilder sb = new StringBuilder("Al corriente");
            List<String> ants = new ArrayList<>();
            if (hayAnticipoGen) {
                ants.add("general $" + entero(anticipoGeneral));
            }
            if (poolDestino != null) {
                for (Map.Entry<String, BigDecimal> e : poolDestino.entrySet()) {
                    if (e.getValue().compareTo(BigDecimal.ZERO) > 0) {
                        ants.add(e.getKey() + " $" + entero(e.getValue()));
                    }
                }
            }
            if (!ants.isEmpty()) {
                sb.append("; anticipo ").append(String.join(" · ", ants));
            }
            return sb.toString();
        }

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < conDeuda.size(); i++) {
            CuentaPendiente c = conDeuda.get(i);
            if (i > 0) sb.append(" · ");
            sb.append(c.concepto()).append(" $").append(entero(c.pendiente()));
        }
        if (conDeuda.size() > 1) {
            BigDecimal total = conDeuda.stream()
                    .map(CuentaPendiente::pendiente)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            sb.append(" = $").append(entero(total));
        }
        if (hayAnticipoGen) {
            sb.append(" · a favor $").append(entero(anticipoGeneral));
        }
        if (poolDestino != null) {
            for (Map.Entry<String, BigDecimal> e : poolDestino.entrySet()) {
                if (e.getValue().compareTo(BigDecimal.ZERO) > 0) {
                    sb.append(" · anticipo ").append(e.getKey()).append(" $").append(entero(e.getValue()));
                }
            }
        }
        return sb.toString();
    }

    static String normalizarDestino(String raw) {
        if (raw == null || raw.isBlank()) return null;
        return conceptoCorto(raw);
    }

    static String conceptoCorto(String raw) {
        if (raw == null || raw.isBlank()) return "Otro";
        String t = raw.trim().replaceAll("\\s+", " ");
        t = t.replaceAll("\\s*·\\s*\\d{4}-\\d{2}\\s*$", "");
        t = t.replaceAll("\\s*\\(reparto[^)]*\\)\\s*$", "");
        if (t.matches("(?iu)pr[eé]stamo(\\s*\\([^)]*\\))?(\\s*[·\\-].*)?")) {
            return "Préstamo";
        }
        return t.isBlank() ? "Otro" : t;
    }

    public static String etiquetaPeriodo(String periodo) {
        if (periodo == null || periodo.isBlank() || "otros".equalsIgnoreCase(periodo)) {
            return "otro";
        }
        try {
            YearMonth ym = YearMonth.parse(periodo.trim());
            String mes = ym.getMonth().getDisplayName(TextStyle.SHORT, Locale.forLanguageTag("es-MX"));
            return mes.replace(".", "").toLowerCase(Locale.ROOT);
        } catch (Exception e) {
            return periodo;
        }
    }

    private static String entero(BigDecimal v) {
        return v.setScale(0, RoundingMode.HALF_UP).toPlainString();
    }
}
