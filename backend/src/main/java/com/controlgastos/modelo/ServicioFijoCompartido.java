package com.controlgastos.modelo;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Plantilla de servicio fijo (CFE, internet, etc.).
 * Cada mes se “cobra” generando un GastoCompartido con el mismo monto y personas.
 */
@Entity
@Table(name = "CG_SERVICIO_FIJO_COMPARTIDO")
public class ServicioFijoCompartido {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 160)
    private String concepto;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal monto;

    @Column(name = "PROPIETARIO", nullable = false, length = 80)
    private String propietario;

    /** IDs de personas (además de ti), separados por coma. */
    /**
     * CSV de ids. Vacío se guarda como "-" porque Oracle trata '' como NULL
     * y la columna es NOT NULL.
     */
    @Column(name = "PERSONA_IDS", nullable = false, length = 500)
    private String personaIdsCsv = "-";

    /** Día del mes en que suele cobrarse (1–31). Si el mes no tiene ese día, se usa el último. */
    @Column(name = "DIA_COBRO")
    private Integer diaCobro = 1;

    /**
     * Si true, tú también entras al reparto al cobrar.
     * Si false, solo prestas el pago (ellos pagan el 100%).
     */
    @Column(name = "INCLUYE_PRINCIPAL")
    private Boolean incluyePrincipal = Boolean.TRUE;

    /**
     * Si true, tú pagas el servicio (cobro → deudas a los demás).
     * Si false, otro paga y tu cuota se refleja en Mensuales como fijo.
     */
    @Column(name = "YO_PAGO")
    private Boolean yoPago = Boolean.TRUE;

    /** Perfiles tuyos en el reparto (streaming). Default 1. */
    @Column(name = "PERFILES_PRINCIPAL")
    private Integer perfilesPrincipal = 1;

    /**
     * CSV de perfiles por persona (mismo orden que PERSONA_IDS).
     * Null/"-" = todos 1. Nullable para poder migrar tablas con filas.
     */
    @Column(name = "PERSONA_PESOS", length = 500)
    private String personaPesosCsv;

    @Column(nullable = false)
    private Boolean activo = Boolean.TRUE;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getConcepto() { return concepto; }
    public void setConcepto(String concepto) { this.concepto = concepto; }
    public BigDecimal getMonto() { return monto; }
    public void setMonto(BigDecimal monto) { this.monto = monto; }
    public String getPropietario() { return propietario; }
    public void setPropietario(String propietario) { this.propietario = propietario; }

    public Integer getDiaCobro() {
        return diaCobro == null ? 1 : diaCobro;
    }

    public void setDiaCobro(Integer diaCobro) {
        this.diaCobro = diaCobro;
    }

    public boolean isIncluyePrincipal() {
        return incluyePrincipal == null || Boolean.TRUE.equals(incluyePrincipal);
    }

    public void setIncluyePrincipal(boolean incluyePrincipal) {
        this.incluyePrincipal = incluyePrincipal;
    }

    public boolean isYoPago() {
        return yoPago == null || Boolean.TRUE.equals(yoPago);
    }

    public void setYoPago(boolean yoPago) {
        this.yoPago = yoPago;
    }

    public int getPerfilesPrincipal() {
        return perfilesPrincipal == null || perfilesPrincipal < 1 ? 1 : perfilesPrincipal;
    }

    public void setPerfilesPrincipal(Integer perfilesPrincipal) {
        this.perfilesPrincipal = perfilesPrincipal == null || perfilesPrincipal < 1 ? 1 : perfilesPrincipal;
    }

    public String getPersonaPesosCsv() {
        return personaPesosCsv == null || personaPesosCsv.isBlank() ? "-" : personaPesosCsv;
    }

    public void setPersonaPesosCsv(String personaPesosCsv) {
        this.personaPesosCsv = (personaPesosCsv == null || personaPesosCsv.isBlank()) ? "-" : personaPesosCsv;
    }

    public boolean isActivo() {
        return Boolean.TRUE.equals(activo);
    }

    public void setActivo(boolean activo) {
        this.activo = activo;
    }

    public String getPersonaIdsCsv() {
        return personaIdsCsv == null || personaIdsCsv.isBlank() ? "-" : personaIdsCsv;
    }

    public void setPersonaIdsCsv(String personaIdsCsv) {
        this.personaIdsCsv = (personaIdsCsv == null || personaIdsCsv.isBlank()) ? "-" : personaIdsCsv;
    }

    @Transient
    public List<Long> getPersonaIds() {
        String raw = getPersonaIdsCsv().trim();
        if (raw.isEmpty() || "-".equals(raw)) return List.of();
        List<Long> out = new ArrayList<>();
        for (String p : raw.split(",")) {
            String t = p.trim();
            if (t.isEmpty() || "-".equals(t)) continue;
            try {
                out.add(Long.parseLong(t));
            } catch (NumberFormatException ignored) {
                // skip
            }
        }
        return out;
    }

    public void setPersonaIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            this.personaIdsCsv = "-";
            return;
        }
        String joined = ids.stream()
                .filter(x -> x != null)
                .distinct()
                .map(String::valueOf)
                .collect(Collectors.joining(","));
        this.personaIdsCsv = joined.isEmpty() ? "-" : joined;
    }

    /** Perfiles alineados con {@link #getPersonaIds()}; si faltan, rellena con 1. */
    @Transient
    public List<Integer> getPersonaPerfiles() {
        List<Long> ids = getPersonaIds();
        if (ids.isEmpty()) return List.of();
        String raw = getPersonaPesosCsv().trim();
        List<Integer> out = new ArrayList<>(ids.size());
        if (!raw.isEmpty() && !"-".equals(raw)) {
            for (String p : raw.split(",")) {
                String t = p.trim();
                if (t.isEmpty()) continue;
                try {
                    int v = Integer.parseInt(t);
                    out.add(Math.max(1, v));
                } catch (NumberFormatException ignored) {
                    out.add(1);
                }
            }
        }
        while (out.size() < ids.size()) out.add(1);
        if (out.size() > ids.size()) {
            out = new ArrayList<>(out.subList(0, ids.size()));
        }
        return out;
    }

    public void setPersonaPerfiles(List<Integer> pesos) {
        List<Long> ids = getPersonaIds();
        if (ids.isEmpty()) {
            this.personaPesosCsv = "-";
            return;
        }
        List<Integer> list = new ArrayList<>(ids.size());
        for (int i = 0; i < ids.size(); i++) {
            int v = 1;
            if (pesos != null && i < pesos.size() && pesos.get(i) != null && pesos.get(i) > 0) {
                v = pesos.get(i);
            }
            list.add(v);
        }
        this.personaPesosCsv = list.stream().map(String::valueOf).collect(Collectors.joining(","));
    }
}
