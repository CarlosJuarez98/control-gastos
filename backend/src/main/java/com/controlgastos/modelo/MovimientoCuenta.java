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
}
