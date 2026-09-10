package com.controlgastos.modelo;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(
        name = "CG_HISTORIAL_ANUAL",
        uniqueConstraints = @UniqueConstraint(name = "UK_HIST_ANUAL_PROP_ANIO", columnNames = {"PROPIETARIO", "ANIO"})
)
public class HistorialAnual {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "PROPIETARIO", nullable = false, length = 80)
    private String propietario;

    @Column(name = "ANIO", nullable = false)
    private int anio;

    @Column(name = "TOTAL_INGRESOS", nullable = false, precision = 14, scale = 2)
    private BigDecimal totalIngresos = BigDecimal.ZERO;

    @Column(name = "TOTAL_GASTOS", nullable = false, precision = 14, scale = 2)
    private BigDecimal totalGastos = BigDecimal.ZERO;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getPropietario() { return propietario; }
    public void setPropietario(String propietario) { this.propietario = propietario; }
    public int getAnio() { return anio; }
    public void setAnio(int anio) { this.anio = anio; }
    public BigDecimal getTotalIngresos() { return totalIngresos; }
    public void setTotalIngresos(BigDecimal totalIngresos) { this.totalIngresos = totalIngresos; }
    public BigDecimal getTotalGastos() { return totalGastos; }
    public void setTotalGastos(BigDecimal totalGastos) { this.totalGastos = totalGastos; }
}
