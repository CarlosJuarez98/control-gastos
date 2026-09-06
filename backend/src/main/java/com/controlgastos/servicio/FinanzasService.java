package com.controlgastos.servicio;

import com.controlgastos.dto.ResumenResponse;
import com.controlgastos.modelo.*;
import com.controlgastos.repositorio.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class FinanzasService {

    private final IngresoRepository ingresoRepository;
    private final GastoRepository gastoRepository;
    private final GastoMensualRepository gastoMensualRepository;
    private final CuentaRepository cuentaRepository;
    private final MovimientoCuentaRepository movimientoRepository;
    private final SaldoSnapshotRepository saldoRepository;
    private final DenominacionEfectivoRepository denominacionRepository;

    public FinanzasService(
            IngresoRepository ingresoRepository,
            GastoRepository gastoRepository,
            GastoMensualRepository gastoMensualRepository,
            CuentaRepository cuentaRepository,
            MovimientoCuentaRepository movimientoRepository,
            SaldoSnapshotRepository saldoRepository,
            DenominacionEfectivoRepository denominacionRepository) {
        this.ingresoRepository = ingresoRepository;
        this.gastoRepository = gastoRepository;
        this.gastoMensualRepository = gastoMensualRepository;
        this.cuentaRepository = cuentaRepository;
        this.movimientoRepository = movimientoRepository;
        this.saldoRepository = saldoRepository;
        this.denominacionRepository = denominacionRepository;
    }

    @Transactional(readOnly = true)
    public ResumenResponse resumen(LocalDate desde, LocalDate hasta) {
        BigDecimal ingresos = (desde != null && hasta != null)
                ? ingresoRepository.sumaEntre(desde, hasta)
                : ingresoRepository.sumaTotal();
        BigDecimal gastos = (desde != null && hasta != null)
                ? gastoRepository.sumaEntre(desde, hasta)
                : gastoRepository.sumaTotal();
        BigDecimal mensuales = gastoMensualRepository.findByActivoTrueOrderByMotivoAsc().stream()
                .map(GastoMensual::getMonto)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        SaldoSnapshot saldo = saldoRepository.findFirstByOrderByFechaDescIdDesc().orElse(null);
        BigDecimal deuda = saldo != null && saldo.getDeudaTotal() != null
                ? saldo.getDeudaTotal()
                : cuentaRepository.sumaDeudas();

        List<Map<String, Object>> porCat = gastoRepository.sumaPorCategoria().stream()
                .map(row -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("categoria", row[0]);
                    m.put("total", row[1]);
                    return m;
                })
                .collect(Collectors.toList());

        List<Map<String, Object>> topCuentas = cuentaRepository.findAll().stream()
                .sorted(Comparator.comparing(Cuenta::getSaldoActual).reversed())
                .limit(8)
                .map(c -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", c.getId());
                    m.put("nombre", c.getNombre());
                    m.put("tipo", c.getTipo());
                    m.put("saldoActual", c.getSaldoActual());
                    return m;
                })
                .collect(Collectors.toList());

        return new ResumenResponse(
                ingresos,
                gastos,
                ingresos.subtract(gastos),
                mensuales,
                deuda,
                saldo != null ? saldo.getSaldoTotal() : BigDecimal.ZERO,
                saldo != null ? saldo.getTotalFisico() : null,
                porCat,
                topCuentas
        );
    }

    public List<Ingreso> listarIngresos(LocalDate desde, LocalDate hasta) {
        if (desde != null && hasta != null) {
            return ingresoRepository.findByFechaBetweenOrderByFechaDescIdDesc(desde, hasta);
        }
        return ingresoRepository.findAllByOrderByFechaDescIdDesc();
    }

    public Ingreso guardarIngreso(Ingreso ingreso) {
        return ingresoRepository.save(ingreso);
    }

    public void eliminarIngreso(Long id) {
        ingresoRepository.deleteById(id);
    }

    public List<Gasto> listarGastos(LocalDate desde, LocalDate hasta) {
        if (desde != null && hasta != null) {
            return gastoRepository.findByFechaBetweenOrderByFechaDescIdDesc(desde, hasta);
        }
        return gastoRepository.findAllByOrderByFechaDescIdDesc();
    }

    public Gasto guardarGasto(Gasto gasto) {
        return gastoRepository.save(gasto);
    }

    public void eliminarGasto(Long id) {
        gastoRepository.deleteById(id);
    }

    public List<GastoMensual> listarMensuales() {
        return gastoMensualRepository.findByActivoTrueOrderByMotivoAsc();
    }

    public GastoMensual guardarMensual(GastoMensual g) {
        return gastoMensualRepository.save(g);
    }

    public void eliminarMensual(Long id) {
        gastoMensualRepository.findById(id).ifPresent(g -> {
            g.setActivo(false);
            gastoMensualRepository.save(g);
        });
    }

    public List<Cuenta> listarCuentas() {
        return cuentaRepository.findAll().stream()
                .sorted(Comparator.comparing(Cuenta::getNombre))
                .collect(Collectors.toList());
    }

    public Cuenta obtenerCuenta(Long id) {
        return cuentaRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Cuenta no encontrada"));
    }

    public Cuenta guardarCuenta(Cuenta cuenta) {
        return cuentaRepository.save(cuenta);
    }

    public List<MovimientoCuenta> movimientosDeCuenta(Long cuentaId) {
        return movimientoRepository.findByCuentaIdOrderByFechaDescIdDesc(cuentaId);
    }

    @Transactional
    public MovimientoCuenta agregarMovimiento(Long cuentaId, MovimientoCuenta mov) {
        Cuenta cuenta = obtenerCuenta(cuentaId);
        mov.setId(null);
        mov.setCuenta(cuenta);
        MovimientoCuenta saved = movimientoRepository.save(mov);
        aplicarSaldo(cuenta, mov.getTipo(), mov.getMonto());
        cuentaRepository.save(cuenta);
        return saved;
    }

    private void aplicarSaldo(Cuenta cuenta, String tipo, BigDecimal monto) {
        if (tipo == null) return;
        switch (tipo.toUpperCase(Locale.ROOT)) {
            case "ABONO", "REEMBOLSO" -> cuenta.setSaldoActual(cuenta.getSaldoActual().subtract(monto));
            case "CARGO", "INTERES" -> cuenta.setSaldoActual(cuenta.getSaldoActual().add(monto));
            default -> { }
        }
    }

    public SaldoSnapshot saldoActual() {
        return saldoRepository.findFirstByOrderByFechaDescIdDesc().orElse(null);
    }

    public SaldoSnapshot guardarSaldo(SaldoSnapshot saldo) {
        return saldoRepository.save(saldo);
    }

    public List<DenominacionEfectivo> listarDenominaciones() {
        return denominacionRepository.findAllByOrderByValorDesc();
    }

    @Transactional
    public List<DenominacionEfectivo> guardarDenominaciones(List<DenominacionEfectivo> items) {
        denominacionRepository.deleteAll();
        return denominacionRepository.saveAll(items);
    }
}
