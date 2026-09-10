package com.controlgastos.modelo;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "CG_CUENTA")
public class Cuenta {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String nombre;

    @Column(nullable = false, length = 40)
    private String tipo;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal saldoActual = BigDecimal.ZERO;

    @Column(name = "PROPIETARIO", length = 80)
    private String propietario;

    /**
     * Cuenta quitada de la lista (saldada). Los movimientos se conservan
     * para no alterar el saldo disponible histórico.
     */
    @Column
    private Boolean archivada = Boolean.FALSE;

    /** Día del mes de corte (1–31). Solo útil en TDC; no altera el saldo. */
    @Column(name = "DIA_CORTE")
    private Integer diaCorte;

    /** Día del mes límite de pago (1–31). Solo útil en TDC. */
    @Column(name = "DIA_LIMITE_PAGO")
    private Integer diaLimitePago;

    /** Límite de crédito de la TDC. Null = sin capturar. */
    @Column(name = "LIMITE_CREDITO", precision = 14, scale = 2)
    private BigDecimal limiteCredito;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getNombre() { return nombre; }
    public void setNombre(String nombre) { this.nombre = nombre; }
    public String getTipo() { return tipo; }
    public void setTipo(String tipo) { this.tipo = tipo; }
    public BigDecimal getSaldoActual() { return saldoActual; }
    public void setSaldoActual(BigDecimal saldoActual) { this.saldoActual = saldoActual; }
    public String getPropietario() { return propietario; }
    public void setPropietario(String propietario) { this.propietario = propietario; }

    public boolean isArchivada() {
        return Boolean.TRUE.equals(archivada);
    }

    public void setArchivada(boolean archivada) {
        this.archivada = archivada;
    }

    public Integer getDiaCorte() { return diaCorte; }
    public void setDiaCorte(Integer diaCorte) { this.diaCorte = diaCorte; }
    public Integer getDiaLimitePago() { return diaLimitePago; }
    public void setDiaLimitePago(Integer diaLimitePago) { this.diaLimitePago = diaLimitePago; }
    public BigDecimal getLimiteCredito() { return limiteCredito; }
    public void setLimiteCredito(BigDecimal limiteCredito) { this.limiteCredito = limiteCredito; }

    /** Crédito disponible = límite − deuda (saldo). Null si no hay límite. */
    @Transient
    public BigDecimal getCreditoDisponible() {
        if (limiteCredito == null || saldoActual == null) {
            return null;
        }
        return limiteCredito.subtract(saldoActual);
    }
}
