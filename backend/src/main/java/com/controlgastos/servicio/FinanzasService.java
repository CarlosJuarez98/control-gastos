package com.controlgastos.servicio;

import com.controlgastos.dto.ResumenResponse;
import com.controlgastos.modelo.*;
import com.controlgastos.repositorio.*;
import com.controlgastos.seguridad.Sesion;
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
        String u = Sesion.usuario();
        BigDecimal ingresos = (desde != null && hasta != null)
                ? ingresoRepository.sumaEntre(u, desde, hasta)
                : ingresoRepository.sumaTotal(u);

        BigDecimal gastosAdicionales = (desde != null && hasta != null)
                ? gastoRepository.sumaLiquidaEntre(u, desde, hasta)
                : gastoRepository.sumaLiquidaTotal(u);
        BigDecimal pagosDeuda = (desde != null && hasta != null)
                ? movimientoRepository.sumaAbonosEntre(u, desde, hasta)
                : movimientoRepository.sumaAbonosTotal(u);
        // Balance = ingresos − (gastos en efectivo + abonos a deudas).
        // Compras con tarjeta no restan liquidez aquí: suben la deuda vía CARGO.
        BigDecimal gastos = nullSafe(gastosAdicionales).add(nullSafe(pagosDeuda));

        BigDecimal mensuales = gastoMensualRepository.findByPropietarioAndActivoTrueOrderByMotivoAsc(u).stream()
                .map(GastoMensual::getMonto)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        SaldoSnapshot saldo = saldoRepository.findFirstByPropietarioOrderByFechaDescIdDesc(u).orElse(null);
        // Deuda al cierre del mes: saldo actual de cuentas, deshaciendo movimientos posteriores
        BigDecimal deuda = deudaAlCierre(u, hasta);

        List<Object[]> filasCat = (desde != null && hasta != null)
                ? gastoRepository.sumaPorCategoriaEntre(u, desde, hasta)
                : gastoRepository.sumaPorCategoria(u);
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

        List<Map<String, Object>> topCuentas = cuentaRepository.findByPropietarioOrderByNombreAsc(u).stream()
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
                calcularEsperadoActual(u),
                saldo != null ? saldo.getTotalFisico() : null,
                porCat,
                topCuentas
        );
    }

    /**
     * Deuda al final de {@code hasta}: parte del saldo actual de cuentas y revierte
     * abonos/cargos posteriores, para que al cambiar de mes se vea el decremento.
     */
    private BigDecimal deudaAlCierre(String u, LocalDate hasta) {
        BigDecimal actual = nullSafe(cuentaRepository.sumaDeudas(u));
        if (hasta == null) {
            return actual;
        }
        BigDecimal pagosPosteriores = nullSafe(movimientoRepository.sumaPagosDespues(u, hasta));
        BigDecimal cargosPosteriores = nullSafe(movimientoRepository.sumaCargosDespues(u, hasta));
        return actual.add(pagosPosteriores).subtract(cargosPosteriores);
    }

    private static BigDecimal nullSafe(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    private static void exigirPropietario(String esperado, String actual) {
        if (actual == null || !actual.equals(esperado)) {
            throw new IllegalArgumentException("Recurso no encontrado");
        }
    }

    public List<Ingreso> listarIngresos(LocalDate desde, LocalDate hasta) {
        String u = Sesion.usuario();
        if (desde != null && hasta != null) {
            return ingresoRepository.findByPropietarioAndFechaBetweenOrderByFechaDescIdDesc(u, desde, hasta);
        }
        return ingresoRepository.findByPropietarioOrderByFechaDescIdDesc(u);
    }

    public Ingreso guardarIngreso(Ingreso ingreso) {
        String u = Sesion.usuario();
        if (ingreso.getFecha() != null && ingreso.getFecha().isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("La fecha no puede ser mayor a hoy");
        }
        if (ingreso.getId() != null) {
            Ingreso existing = ingresoRepository.findById(ingreso.getId())
                    .orElseThrow(() -> new IllegalArgumentException("Ingreso no encontrado"));
            exigirPropietario(u, existing.getPropietario());
        }
        ingreso.setPropietario(u);
        return ingresoRepository.save(ingreso);
    }

    public void eliminarIngreso(Long id) {
        String u = Sesion.usuario();
        Ingreso existing = ingresoRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Ingreso no encontrado"));
        exigirPropietario(u, existing.getPropietario());
        ingresoRepository.delete(existing);
    }

    public List<Gasto> listarGastos(LocalDate desde, LocalDate hasta) {
        String u = Sesion.usuario();
        if (desde != null && hasta != null) {
            return gastoRepository.findByPropietarioAndFechaBetweenOrderByFechaDescIdDesc(u, desde, hasta);
        }
        return gastoRepository.findByPropietarioOrderByFechaDescIdDesc(u);
    }

    @Transactional
    public Gasto guardarGasto(Gasto gasto) {
        String u = Sesion.usuario();
        if (gasto.getFecha() != null && gasto.getFecha().isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("La fecha no puede ser mayor a hoy");
        }
        if (gasto.getMonto() == null || gasto.getMonto().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a cero");
        }
        if (gasto.getId() != null) {
            Gasto existing = gastoRepository.findById(gasto.getId())
                    .orElseThrow(() -> new IllegalArgumentException("Gasto no encontrado"));
            exigirPropietario(u, existing.getPropietario());
        }

        gasto.setCategoria(CategoriaGastoNormalizer.normalizar(gasto.getCategoria()));
        String forma = gasto.getFormaPago() == null || gasto.getFormaPago().isBlank()
                ? "EFECTIVO"
                : gasto.getFormaPago().trim().toUpperCase(Locale.ROOT);
        if (!forma.equals("EFECTIVO") && !forma.equals("TARJETA")) {
            throw new IllegalArgumentException("Forma de pago inválida");
        }
        gasto.setFormaPago(forma);
        gasto.setPropietario(u);

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
                mov.setPropietario(u);
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
        String u = Sesion.usuario();
        Gasto gasto = gastoRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Gasto no encontrado"));
        exigirPropietario(u, gasto.getPropietario());
        if (gasto.getMovimientoId() != null) {
            movimientoRepository.findById(gasto.getMovimientoId()).ifPresent(mov -> {
                exigirPropietario(u, mov.getPropietario());
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
        String u = Sesion.usuario();
        return gastoMensualRepository.findByPropietarioAndActivoTrueOrderByMotivoAsc(u);
    }

    public GastoMensual guardarMensual(GastoMensual g) {
        String u = Sesion.usuario();
        if (g.getId() != null) {
            GastoMensual existing = gastoMensualRepository.findById(g.getId())
                    .orElseThrow(() -> new IllegalArgumentException("Gasto mensual no encontrado"));
            exigirPropietario(u, existing.getPropietario());
        }
        g.setPropietario(u);
        return gastoMensualRepository.save(g);
    }

    public void eliminarMensual(Long id) {
        String u = Sesion.usuario();
        gastoMensualRepository.findById(id).ifPresent(g -> {
            exigirPropietario(u, g.getPropietario());
            g.setActivo(false);
            gastoMensualRepository.save(g);
        });
    }

    public List<Cuenta> listarCuentas() {
        String u = Sesion.usuario();
        return cuentaRepository.findByPropietarioOrderByNombreAsc(u).stream()
                .sorted(Comparator
                        .comparing((Cuenta c) -> c.getSaldoActual() == null
                                || c.getSaldoActual().compareTo(BigDecimal.ZERO) == 0)
                        .thenComparing(c -> c.getNombre() == null ? "" : c.getNombre(),
                                String.CASE_INSENSITIVE_ORDER))
                .collect(Collectors.toList());
    }

    public Cuenta obtenerCuenta(Long id) {
        String u = Sesion.usuario();
        Cuenta cuenta = cuentaRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Cuenta no encontrada"));
        exigirPropietario(u, cuenta.getPropietario());
        return cuenta;
    }

    public Cuenta guardarCuenta(Cuenta cuenta) {
        String u = Sesion.usuario();
        if (cuenta.getId() != null) {
            Cuenta existing = cuentaRepository.findById(cuenta.getId())
                    .orElseThrow(() -> new IllegalArgumentException("Cuenta no encontrada"));
            exigirPropietario(u, existing.getPropietario());
        }
        cuenta.setPropietario(u);
        return cuentaRepository.save(cuenta);
    }

    public List<MovimientoCuenta> movimientosDeCuenta(Long cuentaId) {
        String u = Sesion.usuario();
        obtenerCuenta(cuentaId);
        return movimientoRepository.findByPropietarioAndCuentaIdOrderByFechaDescIdDesc(u, cuentaId);
    }

    @Transactional
    public MovimientoCuenta agregarMovimiento(Long cuentaId, MovimientoCuenta mov) {
        String u = Sesion.usuario();
        if (mov.getFecha() != null && mov.getFecha().isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("La fecha no puede ser mayor a hoy");
        }
        if (mov.getMonto() == null || mov.getMonto().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a cero");
        }
        Cuenta cuenta = obtenerCuenta(cuentaId);
        mov.setId(null);
        mov.setCuenta(cuenta);
        mov.setPropietario(u);
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
        String u = Sesion.usuario();
        return saldoRepository.findFirstByPropietarioOrderByFechaDescIdDesc(u).orElse(null);
    }

    public List<SaldoSnapshot> listarSaldos() {
        String u = Sesion.usuario();
        return saldoRepository.findByPropietarioOrderByFechaDescIdDesc(u);
    }

    /**
     * Debería tener = saldo teórico del último corte
     * + ingresos − gastos líquidos − abonos registrados después de ese corte.
     */
    @Transactional
    public BigDecimal calcularEsperadoActual() {
        return calcularEsperadoActual(Sesion.usuario());
    }

    private BigDecimal calcularEsperadoActual(String u) {
        SaldoSnapshot corte = saldoRepository.findFirstByPropietarioOrderByFechaDescIdDesc(u).orElse(null);
        if (corte == null) {
            return nullSafe(ingresoRepository.sumaTotal(u))
                    .subtract(nullSafe(gastoRepository.sumaLiquidaTotal(u)))
                    .subtract(nullSafe(movimientoRepository.sumaAbonosTotal(u)));
        }
        asegurarMarcasCorte(u, corte);
        long ingId = corte.getUltimoIngresoId() == null ? 0L : corte.getUltimoIngresoId();
        long gasId = corte.getUltimoGastoId() == null ? 0L : corte.getUltimoGastoId();
        long movId = corte.getUltimoMovimientoId() == null ? 0L : corte.getUltimoMovimientoId();

        BigDecimal ingresos = nullSafe(ingresoRepository.sumaDespuesDeId(u, ingId));
        BigDecimal gastos = nullSafe(gastoRepository.sumaLiquidaDespuesDeId(u, gasId));
        BigDecimal abonos = nullSafe(movimientoRepository.sumaAbonosDespuesDeId(u, movId));
        return nullSafe(corte.getSaldoTotal()).add(ingresos).subtract(gastos).subtract(abonos);
    }

    /** Cada guardado es un corte nuevo (historial); no sobrescribe el anterior. */
    @Transactional
    public SaldoSnapshot guardarSaldo(SaldoSnapshot saldo) {
        String u = Sesion.usuario();
        validarCorteNoVacio(saldo);
        saldo.setId(null);
        saldo.setPropietario(u);
        marcarPuntoDeCorte(u, saldo);
        return saldoRepository.save(saldo);
    }

    public SaldoSnapshot actualizarSaldo(Long id, SaldoSnapshot datos) {
        String u = Sesion.usuario();
        SaldoSnapshot existing = saldoRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Corte no encontrado"));
        exigirPropietario(u, existing.getPropietario());
        validarCorteNoVacio(datos);
        existing.setFecha(datos.getFecha());
        existing.setSaldoTotal(datos.getSaldoTotal() != null ? datos.getSaldoTotal() : BigDecimal.ZERO);
        existing.setTotalFisico(datos.getTotalFisico());
        existing.setDineroBbva(datos.getDineroBbva());
        existing.setDineroMercadoLibre(datos.getDineroMercadoLibre());
        existing.setDineroNu(datos.getDineroNu());
        existing.setDineroDidi(datos.getDineroDidi());
        return saldoRepository.save(existing);
    }

    /**
     * Cortes sin marcas (o con el backfill ingenuo de "inicio del día"):
     * se infiere qué movimientos del mismo día ya venían en el saldoTotal
     * comparando con el corte anterior.
     */
    private void asegurarMarcasCorte(String u, SaldoSnapshot corte) {
        LocalDate fecha = corte.getFecha() != null ? corte.getFecha() : LocalDate.now();
        Long inicioDiaGasto = gastoRepository.maxIdAntesDe(u, fecha);
        boolean incompleto = corte.getUltimoGastoId() == null
                || corte.getUltimoIngresoId() == null
                || corte.getUltimoMovimientoId() == null;
        boolean backfillIngenuo = corte.getUltimoGastoId() != null
                && corte.getUltimoGastoId().equals(inicioDiaGasto);
        if (!incompleto && !backfillIngenuo) {
            return;
        }

        Long[] marcas = inferirMarcasDesdeCorteAnterior(u, corte, fecha, inicioDiaGasto);
        corte.setUltimoIngresoId(marcas[0]);
        corte.setUltimoGastoId(marcas[1]);
        corte.setUltimoMovimientoId(marcas[2]);
        saldoRepository.save(corte);
    }

    /**
     * @return [ultimoIngresoId, ultimoGastoId, ultimoMovimientoId]
     */
    private Long[] inferirMarcasDesdeCorteAnterior(
            String u, SaldoSnapshot corte, LocalDate fecha, Long inicioDiaGasto) {
        Long markIng = ingresoRepository.maxIdAntesDe(u, fecha);
        Long markGas = inicioDiaGasto;
        Long markMov = movimientoRepository.maxIdAntesDe(u, fecha);

        SaldoSnapshot prev = corteAnterior(u, corte);
        if (prev == null) {
            return new Long[]{markIng, markGas, markMov};
        }

        // Reducción neta ya reflejada en este corte respecto al anterior.
        BigDecimal netoEnCorte = nullSafe(prev.getSaldoTotal()).subtract(nullSafe(corte.getSaldoTotal()));
        if (netoEnCorte.compareTo(BigDecimal.ZERO) == 0) {
            return new Long[]{markIng, markGas, markMov};
        }

        List<Gasto> liquidosDia = gastoRepository
                .findByPropietarioAndFechaBetweenOrderByFechaDescIdDesc(u, fecha, fecha)
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

    private SaldoSnapshot corteAnterior(String u, SaldoSnapshot corte) {
        if (corte.getId() == null) {
            return null;
        }
        for (SaldoSnapshot s : saldoRepository.findByPropietarioOrderByFechaDescIdDesc(u)) {
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

    private void marcarPuntoDeCorte(String u, SaldoSnapshot saldo) {
        saldo.setUltimoIngresoId(ingresoRepository.maxId(u));
        saldo.setUltimoGastoId(gastoRepository.maxId(u));
        saldo.setUltimoMovimientoId(movimientoRepository.maxId(u));
    }

    public void eliminarSaldo(Long id) {
        String u = Sesion.usuario();
        SaldoSnapshot existing = saldoRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Corte no encontrado"));
        exigirPropietario(u, existing.getPropietario());
        saldoRepository.delete(existing);
    }

    private static void validarCorteNoVacio(SaldoSnapshot s) {
        BigDecimal real = nz(s.getTotalFisico())
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
        String u = Sesion.usuario();
        return denominacionRepository.findByPropietarioOrderByValorDesc(u);
    }

    @Transactional
    public List<DenominacionEfectivo> guardarDenominaciones(List<DenominacionEfectivo> items) {
        String u = Sesion.usuario();
        denominacionRepository.deleteByPropietario(u);
        for (DenominacionEfectivo d : items) {
            d.setId(null);
            d.setPropietario(u);
        }
        return denominacionRepository.saveAll(items);
    }

    /** Unifica categorías duplicadas ya guardadas (Yo/yo, etc.) del usuario actual. */
    @Transactional
    public int normalizarCategoriasExistentes() {
        String u = Sesion.usuario();
        int cambios = 0;
        for (Gasto g : gastoRepository.findByPropietarioOrderByFechaDescIdDesc(u)) {
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
