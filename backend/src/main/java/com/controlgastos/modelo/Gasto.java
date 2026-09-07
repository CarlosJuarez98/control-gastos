package com.controlgastos.modelo;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "CG_GASTO")
public class Gasto {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private LocalDate fecha;

    @Column(nullable = false, length = 80)
    private String categoria;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal monto;

    @Column(length = 200)
    private String motivo;

    /** EFECTIVO o TARJETA (null = EFECTIVO, datos viejos). */
    @Column(length = 20)
    private String formaPago;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "cuenta_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Cuenta cuenta;

    /** Movimiento CARGO ligado si se pagó con tarjeta. */
    @Column(name = "movimiento_id")
    private Long movimientoId;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public LocalDate getFecha() { return fecha; }
    public void setFecha(LocalDate fecha) { this.fecha = fecha; }
    public String getCategoria() { return categoria; }
    public void setCategoria(String categoria) { this.categoria = categoria; }
    public BigDecimal getMonto() { return monto; }
    public void setMonto(BigDecimal monto) { this.monto = monto; }
    public String getMotivo() { return motivo; }
    public void setMotivo(String motivo) { this.motivo = motivo; }
    public String getFormaPago() { return formaPago; }
    public void setFormaPago(String formaPago) { this.formaPago = formaPago; }
    public Cuenta getCuenta() { return cuenta; }
    public void setCuenta(Cuenta cuenta) { this.cuenta = cuenta; }
    public Long getMovimientoId() { return movimientoId; }
    public void setMovimientoId(Long movimientoId) { this.movimientoId = movimientoId; }

    /** Para JSON de entrada: { "cuentaId": 3 }. */
    @Transient
    public Long getCuentaId() {
        return cuenta != null ? cuenta.getId() : null;
    }

    public void setCuentaId(Long cuentaId) {
        if (cuentaId == null) {
            this.cuenta = null;
            return;
        }
        Cuenta ref = new Cuenta();
        ref.setId(cuentaId);
        this.cuenta = ref;
    }
}
