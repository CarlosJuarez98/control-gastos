package com.controlgastos.modelo;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "CG_PARTE_GASTO_COMPARTIDO")
public class ParteGastoCompartido {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "GASTO_COMPARTIDO_ID", nullable = false)
    @JsonIgnore
    private GastoCompartido gasto;

    /** Null = persona principal (tú). */
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "PERSONA_ID")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private PersonaCompartida persona;

    @Column(name = "ES_PRINCIPAL", nullable = false)
    private Boolean esPrincipal = Boolean.FALSE;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal monto;

    /** Perfiles/cuotas en el reparto (streaming: 1, 2, 3…). Default 1. */
    @Column(name = "PERFILES")
    private Integer perfiles = 1;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public GastoCompartido getGasto() { return gasto; }
    public void setGasto(GastoCompartido gasto) { this.gasto = gasto; }
    public PersonaCompartida getPersona() { return persona; }
    public void setPersona(PersonaCompartida persona) { this.persona = persona; }

    public boolean isEsPrincipal() {
        return Boolean.TRUE.equals(esPrincipal);
    }

    public void setEsPrincipal(boolean esPrincipal) {
        this.esPrincipal = esPrincipal;
    }

    public BigDecimal getMonto() { return monto; }
    public void setMonto(BigDecimal monto) { this.monto = monto; }

    public int getPerfiles() {
        return perfiles == null || perfiles < 1 ? 1 : perfiles;
    }

    public void setPerfiles(Integer perfiles) {
        this.perfiles = perfiles == null || perfiles < 1 ? 1 : perfiles;
    }

    @Transient
    public Long getPersonaId() {
        return persona == null ? null : persona.getId();
    }

    @Transient
    public String getNombre() {
        if (isEsPrincipal()) return "Yo";
        return persona == null ? "?" : persona.getNombre();
    }
}
