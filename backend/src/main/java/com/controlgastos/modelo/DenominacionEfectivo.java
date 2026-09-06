package com.controlgastos.modelo;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "CG_DENOMINACION")
public class DenominacionEfectivo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal valor;

    @Column(nullable = false)
    private int cantidad;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public BigDecimal getValor() { return valor; }
    public void setValor(BigDecimal valor) { this.valor = valor; }
    public int getCantidad() { return cantidad; }
    public void setCantidad(int cantidad) { this.cantidad = cantidad; }

    public BigDecimal getSubtotal() {
        return valor.multiply(BigDecimal.valueOf(cantidad));
    }
}
