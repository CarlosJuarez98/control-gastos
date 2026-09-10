package com.controlgastos.modelo;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.math.RoundingMode;

import com.fasterxml.jackson.annotation.JsonProperty;

@Entity
@Table(name = "CG_GASTO_MENSUAL")
public class GastoMensual {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String motivo;

    /** Cuota mensual (fijo o MSI). */
    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal monto = BigDecimal.ZERO;

    private boolean activo = true;

    @Column(name = "PROPIETARIO", length = 80)
    private String propietario;

    /** Null/0 = fijo permanente. &gt;0 = compra a meses (MSI). */
    @Column(name = "MESES_TOTALES")
    private Integer mesesTotales;

    @Column(name = "MESES_RESTANTES")
    private Integer mesesRestantes;

    /** Total de la compra original (solo MSI). */
    @Column(name = "MONTO_TOTAL", precision = 14, scale = 2)
    private BigDecimal montoTotal;

    /** Gasto TDC que originó este plan MSI. */
    @Column(name = "GASTO_ORIGEN_ID")
    private Long gastoOrigenId;

    /** Día del mes de pago (1–31), opcional. Null = repartir en ambas quincenas. */
    @Column(name = "DIA_PAGO")
    private Integer diaPago;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getMotivo() { return motivo; }
    public void setMotivo(String motivo) { this.motivo = motivo; }
    public BigDecimal getMonto() { return monto; }
    public void setMonto(BigDecimal monto) { this.monto = monto; }
    public boolean isActivo() { return activo; }
    public void setActivo(boolean activo) { this.activo = activo; }
    public String getPropietario() { return propietario; }
    public void setPropietario(String propietario) { this.propietario = propietario; }
    public Integer getMesesTotales() { return mesesTotales; }
    public void setMesesTotales(Integer mesesTotales) { this.mesesTotales = mesesTotales; }
    public Integer getMesesRestantes() { return mesesRestantes; }
    public void setMesesRestantes(Integer mesesRestantes) { this.mesesRestantes = mesesRestantes; }
    public BigDecimal getMontoTotal() { return montoTotal; }
    public void setMontoTotal(BigDecimal montoTotal) { this.montoTotal = montoTotal; }
    public Long getGastoOrigenId() { return gastoOrigenId; }
    public void setGastoOrigenId(Long gastoOrigenId) { this.gastoOrigenId = gastoOrigenId; }
    public Integer getDiaPago() { return diaPago; }
    public void setDiaPago(Integer diaPago) { this.diaPago = diaPago; }

    @Transient
    @JsonProperty("aMeses")
    public boolean isAMeses() {
        return mesesTotales != null && mesesTotales > 1;
    }

    /** Lo que falta por pagar del plan MSI. */
    @Transient
    @JsonProperty("montoRestante")
    public BigDecimal getMontoRestante() {
        if (!isAMeses() || mesesRestantes == null || mesesRestantes <= 0 || monto == null) {
            return BigDecimal.ZERO;
        }
        if (montoTotal != null && montoTotal.compareTo(BigDecimal.ZERO) > 0) {
            return montoTotal.setScale(2, RoundingMode.HALF_UP);
        }
        return monto.multiply(BigDecimal.valueOf(mesesRestantes)).setScale(2, RoundingMode.HALF_UP);
    }
}
