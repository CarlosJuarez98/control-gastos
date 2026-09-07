package com.controlgastos.modelo;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "CG_SALDO")
public class SaldoSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private LocalDate fecha;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal saldoTotal = BigDecimal.ZERO;

    @Column(precision = 14, scale = 2)
    private BigDecimal totalFisico;

    @Column(precision = 14, scale = 2)
    private BigDecimal dineroTarjeta;

    @Column(precision = 14, scale = 2)
    private BigDecimal dineroBbva;

    @Column(precision = 14, scale = 2)
    private BigDecimal dineroMercadoLibre;

    @Column(precision = 14, scale = 2)
    private BigDecimal dineroNu;

    @Column(precision = 14, scale = 2)
    private BigDecimal dineroDidi;

    @Column(precision = 14, scale = 2)
    private BigDecimal deudaTotal;

    /** Marcas: movimientos con id mayor a estos ya no estaban en el corte. */
    private Long ultimoIngresoId;
    private Long ultimoGastoId;
    private Long ultimoMovimientoId;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public LocalDate getFecha() { return fecha; }
    public void setFecha(LocalDate fecha) { this.fecha = fecha; }
    public BigDecimal getSaldoTotal() { return saldoTotal; }
    public void setSaldoTotal(BigDecimal saldoTotal) { this.saldoTotal = saldoTotal; }
    public BigDecimal getTotalFisico() { return totalFisico; }
    public void setTotalFisico(BigDecimal totalFisico) { this.totalFisico = totalFisico; }
    public BigDecimal getDineroTarjeta() { return dineroTarjeta; }
    public void setDineroTarjeta(BigDecimal dineroTarjeta) { this.dineroTarjeta = dineroTarjeta; }
    public BigDecimal getDineroBbva() { return dineroBbva; }
    public void setDineroBbva(BigDecimal dineroBbva) { this.dineroBbva = dineroBbva; }
    public BigDecimal getDineroMercadoLibre() { return dineroMercadoLibre; }
    public void setDineroMercadoLibre(BigDecimal dineroMercadoLibre) { this.dineroMercadoLibre = dineroMercadoLibre; }
    public BigDecimal getDineroNu() { return dineroNu; }
    public void setDineroNu(BigDecimal dineroNu) { this.dineroNu = dineroNu; }
    public BigDecimal getDineroDidi() { return dineroDidi; }
    public void setDineroDidi(BigDecimal dineroDidi) { this.dineroDidi = dineroDidi; }
    public BigDecimal getDeudaTotal() { return deudaTotal; }
    public void setDeudaTotal(BigDecimal deudaTotal) { this.deudaTotal = deudaTotal; }
    public Long getUltimoIngresoId() { return ultimoIngresoId; }
    public void setUltimoIngresoId(Long ultimoIngresoId) { this.ultimoIngresoId = ultimoIngresoId; }
    public Long getUltimoGastoId() { return ultimoGastoId; }
    public void setUltimoGastoId(Long ultimoGastoId) { this.ultimoGastoId = ultimoGastoId; }
    public Long getUltimoMovimientoId() { return ultimoMovimientoId; }
    public void setUltimoMovimientoId(Long ultimoMovimientoId) { this.ultimoMovimientoId = ultimoMovimientoId; }
}
