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

        BigDecimal gastosAdicionales = (desde != null && hasta != null)
                ? gastoRepository.sumaLiquidaEntre(desde, hasta)
                : gastoRepository.sumaLiquidaTotal();
        BigDecimal pagosDeuda = (desde != null && hasta != null)
                ? movimientoRepository.sumaAbonosEntre(desde, hasta)
                : movimientoRepository.sumaAbonosTotal();
        // Balance = ingresos − (gastos en efectivo + abonos a deudas).
        // Compras con tarjeta no restan liquidez aquí: suben la deuda vía CARGO.
        BigDecimal gastos = nullSafe(gastosAdicionales).add(nullSafe(pagosDeuda));

        BigDecimal mensuales = gastoMensualRepository.findByActivoTrueOrderByMotivoAsc().stream()
                .map(GastoMensual::getMonto)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        SaldoSnapshot saldo = saldoRepository.findFirstByOrderByFechaDescIdDesc().orElse(null);
        // Deuda al cierre del mes: saldo actual de cuentas, deshaciendo movimientos posteriores
        BigDecimal deuda = deudaAlCierre(hasta);

        List<Object[]> filasCat = (desde != null && hasta != null)
                ? gastoRepository.sumaPorCategoriaEntre(desde, hasta)
                : gastoRepository.sumaPorCategoria();
        Map<String, BigDecimal> mapaCat = filasCat.stream()
                .collect(Collectors.toMap(
                        row -> CategoriaGastoNormalizer.normalizar((String) row[0]),
                        row -> toBigDecimal(row[1]),
                        BigDecimal::add,
                        LinkedHashMap::new
                ));
        if (nullSafe(pagosDeuda).compareTo(BigDecimal.ZERO) > 0) {
            mapaCat.merge("Pagos de deuda", nullSafe(pagosDeuda), BigDecimal::add);
        }
        List<Map<String, Object>> porCat = mapaCat.entrySet().stream()
                .sorted(Map.Entry.<String, BigDecimal>comparingByValue().reversed())
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("categoria", e.getKey());
                    m.put("total", e.getValue());
                    return m;
                })
                .collect(Collectors.toList());

        List<Map<String, Object>> topCuentas = cuentaRepository.findAll().stream()
                .filter(c -> c.getTipo() == null || !"PRESTAMO_OTORGADO".equalsIgnoreCase(c.getTipo()))
                .filter(c -> c.getSaldoActual() != null
                        && c.getSaldoActual().compareTo(BigDecimal.ZERO) != 0)
                .sorted(Comparator.comparing(
                        c -> c.getNombre() == null ? "" : c.getNombre(),
                        String.CASE_INSENSITIVE_ORDER))
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
                calcularEsperadoActual(),
                saldo != null ? saldo.getTotalFisico() : null,
                porCat,
                topCuentas
        );
    }

    /**
     * Deuda al final de {@code hasta}: parte del saldo actual de cuentas y revierte
     * abonos/cargos posteriores, para que al cambiar de mes se vea el decremento.
     */
    private BigDecimal deudaAlCierre(LocalDate hasta) {
        BigDecimal actual = nullSafe(cuentaRepository.sumaDeudas());
        if (hasta == null) {
            return actual;
        }
        BigDecimal pagosPosteriores = nullSafe(movimientoRepository.sumaPagosDespues(hasta));
        BigDecimal cargosPosteriores = nullSafe(movimientoRepository.sumaCargosDespues(hasta));
        return actual.add(pagosPosteriores).subtract(cargosPosteriores);
    }

    private static BigDecimal nullSafe(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    public List<Ingreso> listarIngresos(LocalDate desde, LocalDate hasta) {
        if (desde != null && hasta != null) {
            return ingresoRepository.findByFechaBetweenOrderByFechaDescIdDesc(desde, hasta);
        }
        return ingresoRepository.findAllByOrderByFechaDescIdDesc();
    }

    public Ingreso guardarIngreso(Ingreso ingreso) {
        if (ingreso.getFecha() != null && ingreso.getFecha().isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("La fecha no puede ser mayor a hoy");
        }
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

    @Transactional
    public Gasto guardarGasto(Gasto gasto) {
        if (gasto.getFecha() != null && gasto.getFecha().isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("La fecha no puede ser mayor a hoy");
        }
        if (gasto.getMonto() == null || gasto.getMonto().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a cero");
        }

        gasto.setCategoria(CategoriaGastoNormalizer.normalizar(gasto.getCategoria()));
        String forma = gasto.getFormaPago() == null || gasto.getFormaPago().isBlank()
                ? "EFECTIVO"
                : gasto.getFormaPago().trim().toUpperCase(Locale.ROOT);
        if (!forma.equals("EFECTIVO") && !forma.equals("TARJETA")) {
            throw new IllegalArgumentException("Forma de pago inválida");
        }
        gasto.setFormaPago(forma);

        if (forma.equals("TARJETA")) {
            Long cuentaId = gasto.getCuentaId();
            if (cuentaId == null) {
                throw new IllegalArgumentException("Elige la TDC con la que pagaste");
            }
            Cuenta cuenta = obtenerCuenta(cuentaId);
            if (!"TDC".equalsIgnoreCase(cuenta.getTipo())) {
                throw new IllegalArgumentException("Solo puedes pagar con una tarjeta de crédito (TDC)");
            }
            // Solo en altas: un CARGO por gasto nuevo
            if (gasto.getId() == null) {
                MovimientoCuenta mov = new MovimientoCuenta();
                mov.setCuenta(cuenta);
                mov.setFecha(gasto.getFecha());
                mov.setTipo("CARGO");
                mov.setMonto(gasto.getMonto());
                String concepto = gasto.getMotivo() != null && !gasto.getMotivo().isBlank()
                        ? gasto.getMotivo()
                        : "Gasto " + gasto.getCategoria();
                mov.setConcepto(concepto);
                MovimientoCuenta savedMov = movimientoRepository.save(mov);
                aplicarSaldo(cuenta, "CARGO", gasto.getMonto());
                cuentaRepository.save(cuenta);
                gasto.setMovimientoId(savedMov.getId());
            }
            gasto.setCuenta(cuenta);
        } else {
            gasto.setCuenta(null);
            if (gasto.getId() == null) {
                gasto.setMovimientoId(null);
            }
        }

        return gastoRepository.save(gasto);
    }

    @Transactional
    public void eliminarGasto(Long id) {
        Gasto gasto = gastoRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Gasto no encontrado"));
        if (gasto.getMovimientoId() != null) {
            movimientoRepository.findById(gasto.getMovimientoId()).ifPresent(mov -> {
                Cuenta cuenta = mov.getCuenta();
                // Reversa del CARGO
                aplicarSaldo(cuenta, "ABONO", mov.getMonto());
                cuentaRepository.save(cuenta);
                movimientoRepository.delete(mov);
            });
        }
        gastoRepository.delete(gasto);
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
                .sorted(Comparator
                        .comparing((Cuenta c) -> c.getSaldoActual() == null
                                || c.getSaldoActual().compareTo(BigDecimal.ZERO) == 0)
                        .thenComparing(c -> c.getNombre() == null ? "" : c.getNombre(),
                                String.CASE_INSENSITIVE_ORDER))
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
        if (mov.getFecha() != null && mov.getFecha().isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("La fecha no puede ser mayor a hoy");
        }
        if (mov.getMonto() == null || mov.getMonto().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a cero");
        }
        Cuenta cuenta = obtenerCuenta(cuentaId);
        mov.setId(null);
        mov.setCuenta(cuenta);
        if (mov.getConcepto() == null || mov.getConcepto().isBlank()) {
            mov.setConcepto(null);
        }
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

    public List<SaldoSnapshot> listarSaldos() {
        return saldoRepository.findAllByOrderByFechaDescIdDesc();
    }

    /**
     * Debería tener = saldo teórico del último corte
     * + ingresos − gastos líquidos − abonos registrados después de ese corte.
     */
    @Transactional
    public BigDecimal calcularEsperadoActual() {
        SaldoSnapshot corte = saldoActual();
        if (corte == null) {
            return nullSafe(ingresoRepository.sumaTotal())
                    .subtract(nullSafe(gastoRepository.sumaLiquidaTotal()))
                    .subtract(nullSafe(movimientoRepository.sumaAbonosTotal()));
        }
        asegurarMarcasCorte(corte);
        long ingId = corte.getUltimoIngresoId() == null ? 0L : corte.getUltimoIngresoId();
        long gasId = corte.getUltimoGastoId() == null ? 0L : corte.getUltimoGastoId();
        long movId = corte.getUltimoMovimientoId() == null ? 0L : corte.getUltimoMovimientoId();

        BigDecimal ingresos = nullSafe(ingresoRepository.sumaDespuesDeId(ingId));
        BigDecimal gastos = nullSafe(gastoRepository.sumaLiquidaDespuesDeId(gasId));
        BigDecimal abonos = nullSafe(movimientoRepository.sumaAbonosDespuesDeId(movId));
        return nullSafe(corte.getSaldoTotal()).add(ingresos).subtract(gastos).subtract(abonos);
    }

    /** Cada guardado es un corte nuevo (historial); no sobrescribe el anterior. */
    @Transactional
    public SaldoSnapshot guardarSaldo(SaldoSnapshot saldo) {
        validarCorteNoVacio(saldo);
        saldo.setId(null);
        marcarPuntoDeCorte(saldo);
        return saldoRepository.save(saldo);
    }

    public SaldoSnapshot actualizarSaldo(Long id, SaldoSnapshot datos) {
        SaldoSnapshot existing = saldoRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Corte no encontrado"));
        validarCorteNoVacio(datos);
        existing.setFecha(datos.getFecha());
        existing.setSaldoTotal(datos.getSaldoTotal() != null ? datos.getSaldoTotal() : BigDecimal.ZERO);
        existing.setTotalFisico(datos.getTotalFisico());
        existing.setDineroTarjeta(datos.getDineroTarjeta());
        existing.setDineroBbva(datos.getDineroBbva());
        existing.setDineroMercadoLibre(datos.getDineroMercadoLibre());
        existing.setDineroNu(datos.getDineroNu());
        existing.setDineroDidi(datos.getDineroDidi());
        existing.setDeudaTotal(datos.getDeudaTotal());
        return saldoRepository.save(existing);
    }

    /**
     * Cortes sin marcas (o con el backfill ingenuo de "inicio del día"):
     * se infiere qué movimientos del mismo día ya venían en el saldoTotal
     * comparando con el corte anterior.
     */
    private void asegurarMarcasCorte(SaldoSnapshot corte) {
        LocalDate fecha = corte.getFecha() != null ? corte.getFecha() : LocalDate.now();
        Long inicioDiaGasto = gastoRepository.maxIdAntesDe(fecha);
        boolean incompleto = corte.getUltimoGastoId() == null
                || corte.getUltimoIngresoId() == null
                || corte.getUltimoMovimientoId() == null;
        boolean backfillIngenuo = corte.getUltimoGastoId() != null
                && corte.getUltimoGastoId().equals(inicioDiaGasto);
        if (!incompleto && !backfillIngenuo) {
            return;
        }

        Long[] marcas = inferirMarcasDesdeCorteAnterior(corte, fecha, inicioDiaGasto);
        corte.setUltimoIngresoId(marcas[0]);
        corte.setUltimoGastoId(marcas[1]);
        corte.setUltimoMovimientoId(marcas[2]);
        saldoRepository.save(corte);
    }

    /**
     * @return [ultimoIngresoId, ultimoGastoId, ultimoMovimientoId]
     */
    private Long[] inferirMarcasDesdeCorteAnterior(SaldoSnapshot corte, LocalDate fecha, Long inicioDiaGasto) {
        Long markIng = ingresoRepository.maxIdAntesDe(fecha);
        Long markGas = inicioDiaGasto;
        Long markMov = movimientoRepository.maxIdAntesDe(fecha);

        SaldoSnapshot prev = corteAnterior(corte);
        if (prev == null) {
            return new Long[]{markIng, markGas, markMov};
        }

        // Reducción neta ya reflejada en este corte respecto al anterior.
        BigDecimal netoEnCorte = nullSafe(prev.getSaldoTotal()).subtract(nullSafe(corte.getSaldoTotal()));
        if (netoEnCorte.compareTo(BigDecimal.ZERO) == 0) {
            return new Long[]{markIng, markGas, markMov};
        }

        List<Gasto> liquidosDia = gastoRepository
                .findByFechaBetweenOrderByFechaDescIdDesc(fecha, fecha)
                .stream()
                .filter(this::esGastoLiquido)
                .sorted((a, b) -> Long.compare(a.getId(), b.getId()))
                .toList();

        BigDecimal acc = BigDecimal.ZERO;
        for (Gasto g : liquidosDia) {
            acc = acc.add(nullSafe(g.getMonto()));
            markGas = g.getId();
            if (acc.compareTo(netoEnCorte) == 0) {
                break;
            }
            if (acc.compareTo(netoEnCorte) > 0) {
                // No cuadra solo con gastos: dejar marca de inicio de día.
                markGas = inicioDiaGasto;
                break;
            }
        }
        return new Long[]{markIng, markGas, markMov};
    }

    private SaldoSnapshot corteAnterior(SaldoSnapshot corte) {
        if (corte.getId() == null) {
            return null;
        }
        for (SaldoSnapshot s : saldoRepository.findAllByOrderByFechaDescIdDesc()) {
            if (s.getId() != null && s.getId() < corte.getId()) {
                return s;
            }
        }
        return null;
    }

    private boolean esGastoLiquido(Gasto g) {
        String fp = g.getFormaPago();
        return fp == null || !"TARJETA".equalsIgnoreCase(fp.trim());
    }

    private void marcarPuntoDeCorte(SaldoSnapshot saldo) {
        saldo.setUltimoIngresoId(ingresoRepository.maxId());
        saldo.setUltimoGastoId(gastoRepository.maxId());
        saldo.setUltimoMovimientoId(movimientoRepository.maxId());
    }

    public void eliminarSaldo(Long id) {
        if (!saldoRepository.existsById(id)) {
            throw new IllegalArgumentException("Corte no encontrado");
        }
        saldoRepository.deleteById(id);
    }

    private static void validarCorteNoVacio(SaldoSnapshot s) {
        BigDecimal real = nz(s.getTotalFisico())
                .add(nz(s.getDineroTarjeta()))
                .add(nz(s.getDineroBbva()))
                .add(nz(s.getDineroMercadoLibre()))
                .add(nz(s.getDineroNu()))
                .add(nz(s.getDineroDidi()));
        if (real.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("No se puede guardar un corte vacío: captura al menos un monto real");
        }
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }

    public List<DenominacionEfectivo> listarDenominaciones() {
        return denominacionRepository.findAllByOrderByValorDesc();
    }

    @Transactional
    public List<DenominacionEfectivo> guardarDenominaciones(List<DenominacionEfectivo> items) {
        denominacionRepository.deleteAll();
        return denominacionRepository.saveAll(items);
    }

    /** Unifica categorías duplicadas ya guardadas (Yo/yo, etc.). */
    @Transactional
    public int normalizarCategoriasExistentes() {
        int cambios = 0;
        for (Gasto g : gastoRepository.findAll()) {
            String canonica = CategoriaGastoNormalizer.normalizar(g.getCategoria());
            if (!canonica.equals(g.getCategoria())) {
                g.setCategoria(canonica);
                gastoRepository.save(g);
                cambios++;
            }
        }
        return cambios;
    }

    private static BigDecimal toBigDecimal(Object value) {
        if (value == null) return BigDecimal.ZERO;
        if (value instanceof BigDecimal bd) return bd;
        return new BigDecimal(value.toString());
    }
}
