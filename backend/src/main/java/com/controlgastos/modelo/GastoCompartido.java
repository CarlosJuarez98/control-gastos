package com.controlgastos.modelo;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Servicio o compra compartida que tú pagaste.
 * No es Prestamista: el ledger de “me deben” vive en movimientos por persona.
 */
@Entity
@Table(name = "CG_GASTO_COMPARTIDO")
public class GastoCompartido {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** SERVICIO | COMPRA */
    @Column(nullable = false, length = 20)
    private String tipo;

    @Column(nullable = false, length = 160)
    private String concepto;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal montoTotal;

    @Column(nullable = false)
    private LocalDate fecha;

    @Column(name = "PROPIETARIO", nullable = false, length = 80)
    private String propietario;

    /** EFECTIVO | TARJETA */
    @Column(name = "FORMA_PAGO", nullable = false, length = 20)
    private String formaPago;

    @Column(name = "CUENTA_ID")
    private Long cuentaId;

    @Column(name = "MESES")
    private Integer meses;

    /** Gasto real en CG_GASTO (tu bolsillo / TDC). */
    @Column(name = "GASTO_ID")
    private Long gastoId;

    /** Plantilla de servicio fijo, si nació de un cobro mensual. */
    @Column(name = "SERVICIO_FIJO_ID")
    private Long servicioFijoId;

    /** Periodo yyyy-MM del cobro mensual (opcional). */
    @Column(name = "PERIODO", length = 7)
    private String periodo;

    @Column(nullable = false)
    private Boolean anulado = Boolean.FALSE;

    @OneToMany(mappedBy = "gasto", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @OrderBy("id ASC")
    @JsonIgnoreProperties("gasto")
    private List<ParteGastoCompartido> partes = new ArrayList<>();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getTipo() { return tipo; }
    public void setTipo(String tipo) { this.tipo = tipo; }
    public String getConcepto() { return concepto; }
    public void setConcepto(String concepto) { this.concepto = concepto; }
    public BigDecimal getMontoTotal() { return montoTotal; }
    public void setMontoTotal(BigDecimal montoTotal) { this.montoTotal = montoTotal; }
    public LocalDate getFecha() { return fecha; }
    public void setFecha(LocalDate fecha) { this.fecha = fecha; }
    public String getPropietario() { return propietario; }
    public void setPropietario(String propietario) { this.propietario = propietario; }
    public String getFormaPago() { return formaPago; }
    public void setFormaPago(String formaPago) { this.formaPago = formaPago; }
    public Long getCuentaId() { return cuentaId; }
    public void setCuentaId(Long cuentaId) { this.cuentaId = cuentaId; }
    public Integer getMeses() { return meses; }
    public void setMeses(Integer meses) { this.meses = meses; }
    public Long getGastoId() { return gastoId; }
    public void setGastoId(Long gastoId) { this.gastoId = gastoId; }
    public Long getServicioFijoId() { return servicioFijoId; }
    public void setServicioFijoId(Long servicioFijoId) { this.servicioFijoId = servicioFijoId; }
    public String getPeriodo() { return periodo; }
    public void setPeriodo(String periodo) { this.periodo = periodo; }

    public boolean isAnulado() {
        return Boolean.TRUE.equals(anulado);
    }

    public void setAnulado(boolean anulado) {
        this.anulado = anulado;
    }

    public List<ParteGastoCompartido> getPartes() {
        return partes;
    }

    public void setPartes(List<ParteGastoCompartido> partes) {
        this.partes = partes == null ? new ArrayList<>() : partes;
    }

    public void addParte(ParteGastoCompartido parte) {
        parte.setGasto(this);
        this.partes.add(parte);
    }
}
