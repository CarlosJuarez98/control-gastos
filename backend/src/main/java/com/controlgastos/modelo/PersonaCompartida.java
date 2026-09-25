package com.controlgastos.modelo;

import jakarta.persistence.*;
import java.math.BigDecimal;

/**
 * Persona del módulo Compartido (no es usuario de login).
 * efectivoGuardado = caja aparte mental; no afecta Saldo/disponible.
 */
@Entity
@Table(name = "CG_PERSONA_COMPARTIDA")
public class PersonaCompartida {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String nombre;

    @Column(name = "PROPIETARIO", nullable = false, length = 80)
    private String propietario;

    @Column(nullable = false)
    private Boolean activa = Boolean.TRUE;

    /**
     * Efectivo que te dejaron a guardar (caja aparte).
     * No entra en el cálculo de Debería / disponible.
     */
    @Column(name = "EFECTIVO_GUARDADO", nullable = false, precision = 14, scale = 2)
    private BigDecimal efectivoGuardado = BigDecimal.ZERO;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getNombre() { return nombre; }
    public void setNombre(String nombre) { this.nombre = nombre; }
    public String getPropietario() { return propietario; }
    public void setPropietario(String propietario) { this.propietario = propietario; }

    public boolean isActiva() {
        return Boolean.TRUE.equals(activa);
    }

    public void setActiva(boolean activa) {
        this.activa = activa;
    }

    public BigDecimal getEfectivoGuardado() {
        return efectivoGuardado == null ? BigDecimal.ZERO : efectivoGuardado;
    }

    public void setEfectivoGuardado(BigDecimal efectivoGuardado) {
        this.efectivoGuardado = efectivoGuardado == null ? BigDecimal.ZERO : efectivoGuardado;
    }
}
