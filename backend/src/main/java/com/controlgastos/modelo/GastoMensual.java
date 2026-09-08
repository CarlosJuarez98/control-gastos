package com.controlgastos.modelo;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "CG_GASTO_MENSUAL")
public class GastoMensual {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String motivo;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal monto = BigDecimal.ZERO;

    private boolean activo = true;

    @Column(name = "PROPIETARIO", length = 80)
    private String propietario;

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
}
