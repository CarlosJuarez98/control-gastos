package com.controlgastos.modelo;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "CG_MOVIMIENTO")
public class MovimientoCuenta {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.EAGER)
    @JoinColumn(name = "cuenta_id", nullable = false)
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Cuenta cuenta;

    @Column(nullable = false)
    private LocalDate fecha;

    /** ABONO, CARGO, INTERES, REEMBOLSO */
    @Column(nullable = false, length = 20)
    private String tipo;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal monto;

    @Column(length = 200)
    private String concepto;

    @Column(name = "PROPIETARIO", length = 80)
    private String propietario;

    /** Si el cargo viene de un gasto TDC a N meses (solo JSON). */
    @Transient
    private Integer meses;

    /** Forma de pago del gasto ligado: TARJETA / DISPOSICION (solo JSON). */
    @Transient
    private String formaPagoGasto;

    /** Id del gasto origen (solo JSON); editar ahí, no en Deudas. */
    @Transient
    private Long gastoId;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Cuenta getCuenta() { return cuenta; }
    public void setCuenta(Cuenta cuenta) { this.cuenta = cuenta; }
    public LocalDate getFecha() { return fecha; }
    public void setFecha(LocalDate fecha) { this.fecha = fecha; }
    public String getTipo() { return tipo; }
    public void setTipo(String tipo) { this.tipo = tipo; }
    public BigDecimal getMonto() { return monto; }
    public void setMonto(BigDecimal monto) { this.monto = monto; }
    public String getConcepto() { return concepto; }
    public void setConcepto(String concepto) { this.concepto = concepto; }
    public String getPropietario() { return propietario; }
    public void setPropietario(String propietario) { this.propietario = propietario; }
    public Integer getMeses() { return meses; }
    public void setMeses(Integer meses) { this.meses = meses; }
    public String getFormaPagoGasto() { return formaPagoGasto; }
    public void setFormaPagoGasto(String formaPagoGasto) { this.formaPagoGasto = formaPagoGasto; }
    public Long getGastoId() { return gastoId; }
    public void setGastoId(Long gastoId) { this.gastoId = gastoId; }

    @Transient
    public boolean isAMeses() {
        return meses != null && meses > 1;
    }

    /** Cargo nacido de Gastos (tarjeta / disposición): la edición canónica es en Gastos. */
    @Transient
    public boolean isDesdeGasto() {
        return gastoId != null
                || (formaPagoGasto != null && !formaPagoGasto.isBlank());
    }
}
