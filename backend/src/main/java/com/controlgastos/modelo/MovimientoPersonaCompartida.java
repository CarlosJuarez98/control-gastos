package com.controlgastos.modelo;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Movimiento del ledger por persona: deuda, abono o caja de efectivo guardado.
 */
@Entity
@Table(name = "CG_MOV_PERSONA_COMPARTIDA")
public class MovimientoPersonaCompartida {

    public static final String DEUDA = "DEUDA";
    public static final String ABONO = "ABONO";
    public static final String GUARDADO_IN = "GUARDADO_IN";
    public static final String GUARDADO_OUT = "GUARDADO_OUT";
    /** Entrega en efectivo del a favor (anticipo); baja el pool de abonos. */
    public static final String ANTICIPO_OUT = "ANTICIPO_OUT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.EAGER)
    @JoinColumn(name = "PERSONA_ID", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private PersonaCompartida persona;

    @Column(name = "PROPIETARIO", nullable = false, length = 80)
    private String propietario;

    @Column(nullable = false)
    private LocalDate fecha;

    /** DEUDA | ABONO | GUARDADO_IN | GUARDADO_OUT | ANTICIPO_OUT */
    @Column(nullable = false, length = 20)
    private String tipo;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal monto;

    @Column(length = 200)
    private String concepto;

    @Column(name = "GASTO_COMPARTIDO_ID")
    private Long gastoCompartidoId;

    /** Ingreso creado si el abono fue en efectivo (entra a tu disponible). */
    @Column(name = "INGRESO_ID")
    private Long ingresoId;

    /** Abono cobrado del efectivo guardado (caja aparte; no mueve disponible). */
    @Column(name = "DESDE_GUARDADO")
    private Boolean desdeGuardado = Boolean.FALSE;

    /**
     * Si el abono va a una cuenta/servicio concreto (Spotify, CFE…).
     * Null = abono general (FIFO a cualquier deuda).
     */
    @Column(name = "CONCEPTO_DESTINO", length = 160)
    private String conceptoDestino;

    /**
     * True = se tomó del anticipo general (a favor) y se mandó a una cuenta;
     * no es dinero nuevo (no crea ingreso).
     */
    @Column(name = "DESDE_ANTICIPO")
    private Boolean desdeAnticipo = Boolean.FALSE;

    @Column(nullable = false)
    private Boolean anulado = Boolean.FALSE;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public PersonaCompartida getPersona() { return persona; }
    public void setPersona(PersonaCompartida persona) { this.persona = persona; }
    public String getPropietario() { return propietario; }
    public void setPropietario(String propietario) { this.propietario = propietario; }
    public LocalDate getFecha() { return fecha; }
    public void setFecha(LocalDate fecha) { this.fecha = fecha; }
    public String getTipo() { return tipo; }
    public void setTipo(String tipo) { this.tipo = tipo; }
    public BigDecimal getMonto() { return monto; }
    public void setMonto(BigDecimal monto) { this.monto = monto; }
    public String getConcepto() { return concepto; }
    public void setConcepto(String concepto) { this.concepto = concepto; }
    public Long getGastoCompartidoId() { return gastoCompartidoId; }
    public void setGastoCompartidoId(Long gastoCompartidoId) { this.gastoCompartidoId = gastoCompartidoId; }
    public Long getIngresoId() { return ingresoId; }
    public void setIngresoId(Long ingresoId) { this.ingresoId = ingresoId; }

    public boolean isDesdeGuardado() {
        return Boolean.TRUE.equals(desdeGuardado);
    }

    public void setDesdeGuardado(boolean desdeGuardado) {
        this.desdeGuardado = desdeGuardado;
    }

    public String getConceptoDestino() { return conceptoDestino; }
    public void setConceptoDestino(String conceptoDestino) { this.conceptoDestino = conceptoDestino; }

    public boolean isDesdeAnticipo() {
        return Boolean.TRUE.equals(desdeAnticipo);
    }

    public void setDesdeAnticipo(boolean desdeAnticipo) {
        this.desdeAnticipo = desdeAnticipo;
    }

    public boolean isAnulado() {
        return Boolean.TRUE.equals(anulado);
    }

    public void setAnulado(boolean anulado) {
        this.anulado = anulado;
    }
}
