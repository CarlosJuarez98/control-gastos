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
    private final HistorialAnualRepository historialAnualRepository;

    public FinanzasService(
            IngresoRepository ingresoRepository,
            GastoRepository gastoRepository,
            GastoMensualRepository gastoMensualRepository,
            CuentaRepository cuentaRepository,
            MovimientoCuentaRepository movimientoRepository,
            SaldoSnapshotRepository saldoRepository,
            DenominacionEfectivoRepository denominacionRepository,
            HistorialAnualRepository historialAnualRepository) {
        this.ingresoRepository = ingresoRepository;
        this.gastoRepository = gastoRepository;
        this.gastoMensualRepository = gastoMensualRepository;
        this.cuentaRepository = cuentaRepository;
        this.movimientoRepository = movimientoRepository;
        this.saldoRepository = saldoRepository;
        this.denominacionRepository = denominacionRepository;
        this.historialAnualRepository = historialAnualRepository;
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

        List<Map<String, Object>> topCuentas = cuentaRepository.findActivasByPropietario(u).stream()
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

        List<Map<String, Object>> prestamistas = cuentaRepository.findActivasByPropietario(u).stream()
                .filter(c -> c.getTipo() != null && "PRESTAMO_OTORGADO".equalsIgnoreCase(c.getTipo()))
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

        BigDecimal meDeben = nullSafe(cuentaRepository.sumaPrestamista(u));

        List<Map<String, Object>> historialAnual = historialAnualRepository
                .findByPropietarioOrderByAnioDesc(u).stream()
                .map(h -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("anio", h.getAnio());
                    m.put("totalIngresos", nullSafe(h.getTotalIngresos()));
                    m.put("totalGastos", nullSafe(h.getTotalGastos()));
                    m.put("balance", nullSafe(h.getTotalIngresos()).subtract(nullSafe(h.getTotalGastos())));
                    return m;
                })
                .collect(Collectors.toList());

        return new ResumenResponse(
                ingresos,
                gastos,
                ingresos.subtract(gastos),
                mensuales,
                deuda,
                meDeben,
                calcularEsperadoActual(u),
                saldo != null ? saldo.getTotalFisico() : null,
                porCat,
                topCuentas,
                prestamistas,
                historialAnual
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

        Gasto existing = null;
        if (gasto.getId() != null) {
            existing = gastoRepository.findById(gasto.getId())
                    .orElseThrow(() -> new IllegalArgumentException("Gasto no encontrado"));
            exigirPropietario(u, existing.getPropietario());
            // Conservar vínculo al cargo TDC si el cliente no lo manda
            if (gasto.getMovimientoId() == null) {
                gasto.setMovimientoId(existing.getMovimientoId());
            }
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

        String concepto = gasto.getMotivo() != null && !gasto.getMotivo().isBlank()
                ? gasto.getMotivo()
                : "Gasto " + gasto.getCategoria();

        if (forma.equals("TARJETA")) {
            Long cuentaId = gasto.getCuentaId();
            if (cuentaId == null) {
                throw new IllegalArgumentException("Elige la TDC con la que pagaste");
            }
            Cuenta cuenta = obtenerCuenta(cuentaId);
            if (!"TDC".equalsIgnoreCase(cuenta.getTipo())) {
                throw new IllegalArgumentException("Solo puedes pagar con una tarjeta de crédito (TDC)");
            }

            if (existing == null || existing.getMovimientoId() == null) {
                MovimientoCuenta mov = new MovimientoCuenta();
                mov.setCuenta(cuenta);
                mov.setFecha(gasto.getFecha());
                mov.setTipo("CARGO");
                mov.setMonto(gasto.getMonto());
                mov.setPropietario(u);
                mov.setConcepto(concepto);
                MovimientoCuenta savedMov = movimientoRepository.save(mov);
                aplicarSaldo(cuenta, "CARGO", gasto.getMonto());
                cuentaRepository.save(cuenta);
                gasto.setMovimientoId(savedMov.getId());
            } else {
                MovimientoCuenta mov = movimientoRepository.findById(existing.getMovimientoId())
                        .orElseThrow(() -> new IllegalArgumentException("Movimiento del gasto no encontrado"));
                exigirPropietario(u, mov.getPropietario());
                Cuenta cuentaAnterior = mov.getCuenta();
                revertirSaldo(cuentaAnterior, mov.getTipo(), mov.getMonto());
                Cuenta destino = cuentaAnterior.getId().equals(cuenta.getId()) ? cuentaAnterior : cuenta;
                if (!cuentaAnterior.getId().equals(cuenta.getId())) {
                    cuentaRepository.save(cuentaAnterior);
                }
                mov.setCuenta(destino);
                mov.setFecha(gasto.getFecha());
                mov.setMonto(gasto.getMonto());
                mov.setConcepto(concepto);
                movimientoRepository.save(mov);
                aplicarSaldo(destino, "CARGO", gasto.getMonto());
                cuentaRepository.save(destino);
                gasto.setMovimientoId(mov.getId());
                gasto.setCuenta(destino);
            }
            if (gasto.getCuenta() == null) {
                gasto.setCuenta(cuenta);
            }
            normalizarMesesTarjeta(gasto);
        } else {
            if (existing != null && existing.getMovimientoId() != null) {
                movimientoRepository.findById(existing.getMovimientoId()).ifPresent(mov -> {
                    exigirPropietario(u, mov.getPropietario());
                    Cuenta c = mov.getCuenta();
                    revertirSaldo(c, mov.getTipo(), mov.getMonto());
                    cuentaRepository.save(c);
                    movimientoRepository.delete(mov);
                });
            }
            gasto.setCuenta(null);
            gasto.setMovimientoId(null);
            gasto.setMeses(null);
        }

        Gasto guardado = gastoRepository.save(gasto);
        sincronizarPlanMeses(guardado, concepto);
        return guardado;
    }

    private void normalizarMesesTarjeta(Gasto gasto) {
        Integer m = gasto.getMeses();
        if (m == null || m <= 1) {
            gasto.setMeses(null);
            return;
        }
        if (m > 48) {
            throw new IllegalArgumentException("El plazo a meses debe ser entre 2 y 48");
        }
        gasto.setMeses(m);
    }

    /**
     * Si el gasto TDC es a N meses, crea/actualiza un mensual con la cuota
     * y el contador de meses restantes. Si deja de ser a meses, desactiva el plan.
     */
    private void sincronizarPlanMeses(Gasto guardado, String concepto) {
        String u = Sesion.usuario();
        boolean aMeses = "TARJETA".equalsIgnoreCase(guardado.getFormaPago())
                && guardado.getMeses() != null
                && guardado.getMeses() > 1;

        List<GastoMensual> planes = gastoMensualRepository.findByGastoOrigenId(guardado.getId());
        GastoMensual plan = planes.stream().filter(GastoMensual::isActivo).findFirst()
                .orElse(planes.isEmpty() ? null : planes.get(0));

        if (!aMeses) {
            for (GastoMensual p : planes) {
                if (p.isActivo()) {
                    p.setActivo(false);
                    gastoMensualRepository.save(p);
                }
            }
            return;
        }

        int meses = guardado.getMeses();
        BigDecimal cuota = guardado.getMonto()
                .divide(BigDecimal.valueOf(meses), 2, java.math.RoundingMode.HALF_UP);
        String tdc = "TDC";
        Long cid = guardado.getCuentaId();
        if (cid != null) {
            tdc = cuentaRepository.findById(cid).map(Cuenta::getNombre).orElse("TDC");
        }
        String motivo = truncar(
                concepto + " · " + meses + " meses (" + tdc + ")",
                120);

        if (plan == null) {
            plan = new GastoMensual();
            plan.setGastoOrigenId(guardado.getId());
            plan.setMesesRestantes(meses);
            plan.setActivo(true);
        } else {
            plan.setActivo(true);
            Integer prevTot = plan.getMesesTotales();
            Integer prevRest = plan.getMesesRestantes();
            if (prevTot == null || prevTot.intValue() != meses) {
                if (prevTot != null && prevRest != null && prevTot > 0) {
                    int pagadas = Math.max(0, prevTot - prevRest);
                    plan.setMesesRestantes(Math.max(0, meses - pagadas));
                } else {
                    plan.setMesesRestantes(meses);
                }
            }
            if (plan.getMesesRestantes() == null || plan.getMesesRestantes() < 0) {
                plan.setMesesRestantes(meses);
            }
        }
        plan.setMotivo(motivo);
        plan.setMonto(cuota);
        plan.setMesesTotales(meses);
        plan.setMontoTotal(guardado.getMonto());
        plan.setPropietario(u);
        if (plan.getMesesRestantes() != null && plan.getMesesRestantes() == 0) {
            plan.setActivo(false);
        }
        gastoMensualRepository.save(plan);
    }

    private static String truncar(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max);
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
        for (GastoMensual p : gastoMensualRepository.findByGastoOrigenId(gasto.getId())) {
            if (p.isActivo()) {
                p.setActivo(false);
                gastoMensualRepository.save(p);
            }
        }
        gastoRepository.delete(gasto);
    }

    public List<GastoMensual> listarMensuales() {
        String u = Sesion.usuario();
        return gastoMensualRepository.findByPropietarioAndActivoTrueOrderByMotivoAsc(u);
    }

    public GastoMensual guardarMensual(GastoMensual g) {
        String u = Sesion.usuario();
        Long gastoOrigenConservar = null;
        if (g.getId() != null) {
            GastoMensual existing = gastoMensualRepository.findById(g.getId())
                    .orElseThrow(() -> new IllegalArgumentException("Gasto mensual no encontrado"));
            exigirPropietario(u, existing.getPropietario());
            gastoOrigenConservar = existing.getGastoOrigenId();
        }

        if (g.getMotivo() == null || g.getMotivo().isBlank()) {
            throw new IllegalArgumentException("El motivo es obligatorio");
        }
        if (g.getMonto() == null || g.getMonto().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a cero");
        }

        Integer mesesTot = g.getMesesTotales();
        Integer mesesRest = g.getMesesRestantes();
        boolean aMeses = mesesTot != null && mesesTot > 1;
        if (aMeses) {
            if (mesesTot < 2 || mesesTot > 120) {
                throw new IllegalArgumentException("El plazo a meses debe ser entre 2 y 120");
            }
            if (mesesRest == null || mesesRest < 1) {
                mesesRest = mesesTot;
            }
            if (mesesRest > mesesTot) {
                mesesRest = mesesTot;
            }
            g.setMesesTotales(mesesTot);
            g.setMesesRestantes(mesesRest);
            if (g.getMontoTotal() == null || g.getMontoTotal().compareTo(BigDecimal.ZERO) <= 0) {
                g.setMontoTotal(g.getMonto().multiply(BigDecimal.valueOf(mesesRest))
                        .setScale(2, java.math.RoundingMode.HALF_UP));
            }
        } else {
            g.setMesesTotales(null);
            g.setMesesRestantes(null);
            g.setMontoTotal(null);
        }

        Integer diaPago = g.getDiaPago();
        if (diaPago != null) {
            if (diaPago < 1 || diaPago > 31) {
                throw new IllegalArgumentException("El día de pago debe ser entre 1 y 31");
            }
            g.setDiaPago(diaPago);
        } else {
            g.setDiaPago(null);
        }

        // Alta manual o corrección: conservar vínculo al gasto TDC si ya existía
        g.setGastoOrigenId(gastoOrigenConservar);
        g.setPropietario(u);
        g.setActivo(true);
        return gastoMensualRepository.save(g);
    }

    /** Marca una cuota MSI como pagada (resta 1 mes). Al llegar a 0 desactiva el plan. */
    @Transactional
    public GastoMensual marcarCuotaMensual(Long id) {
        String u = Sesion.usuario();
        GastoMensual g = gastoMensualRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Gasto mensual no encontrado"));
        exigirPropietario(u, g.getPropietario());
        if (!g.isActivo()) {
            throw new IllegalArgumentException("Ese plan ya no está activo");
        }
        if (!g.isAMeses()) {
            throw new IllegalArgumentException("Solo aplica a compras a meses");
        }
        int rest = g.getMesesRestantes() == null ? 0 : g.getMesesRestantes();
        if (rest <= 0) {
            g.setActivo(false);
            return gastoMensualRepository.save(g);
        }
        g.setMesesRestantes(rest - 1);
        if (g.getMontoTotal() != null && g.getMonto() != null) {
            BigDecimal nuevo = g.getMontoTotal().subtract(g.getMonto());
            g.setMontoTotal(nuevo.compareTo(BigDecimal.ZERO) < 0 ? BigDecimal.ZERO : nuevo);
        }
        if (g.getMesesRestantes() <= 0) {
            g.setActivo(false);
            g.setMontoTotal(BigDecimal.ZERO);
        }
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
        return cuentaRepository.findActivasByPropietario(u).stream()
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
        if (cuenta.isArchivada()) {
            throw new IllegalArgumentException("Cuenta no encontrada");
        }
        return cuenta;
    }

    @Transactional
    public Cuenta guardarCuenta(Cuenta cuenta) {
        String u = Sesion.usuario();
        boolean nueva = cuenta.getId() == null;
        if (!nueva) {
            Cuenta existing = cuentaRepository.findById(cuenta.getId())
                    .orElseThrow(() -> new IllegalArgumentException("Cuenta no encontrada"));
            exigirPropietario(u, existing.getPropietario());
            if (existing.isArchivada()) {
                throw new IllegalArgumentException("Cuenta no encontrada");
            }
            cuenta.setArchivada(false);
        } else {
            cuenta.setArchivada(false);
        }
        BigDecimal inicialPrestamo = BigDecimal.ZERO;
        if (nueva && esPrestamoOtorgado(cuenta.getTipo())) {
            inicialPrestamo = nullSafe(cuenta.getSaldoActual());
            if (inicialPrestamo.compareTo(BigDecimal.ZERO) > 0) {
                exigirSaldoDisponible(u, inicialPrestamo);
            }
        }
        cuenta.setPropietario(u);
        normalizarDatosTdc(cuenta);
        Cuenta saved = cuentaRepository.save(cuenta);
        if (nueva && inicialPrestamo.compareTo(BigDecimal.ZERO) > 0) {
            // Registra el desembolso para que reste del saldo disponible.
            MovimientoCuenta mov = new MovimientoCuenta();
            mov.setCuenta(saved);
            mov.setFecha(LocalDate.now());
            mov.setTipo("CARGO");
            mov.setMonto(inicialPrestamo);
            mov.setPropietario(u);
            movimientoRepository.save(mov);
        }
        return saved;
    }

    private void normalizarDatosTdc(Cuenta cuenta) {
        boolean tdc = cuenta.getTipo() != null && "TDC".equalsIgnoreCase(cuenta.getTipo().trim());
        if (!tdc) {
            // Otros tipos no usan estos campos; se dejan como estén (pueden quedar null).
            return;
        }
        cuenta.setDiaCorte(validarDiaMes(cuenta.getDiaCorte(), "Día de corte"));
        cuenta.setDiaLimitePago(validarDiaMes(cuenta.getDiaLimitePago(), "Día límite de pago"));
        if (cuenta.getLimiteCredito() != null && cuenta.getLimiteCredito().compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("El límite de crédito no puede ser negativo");
        }
    }

    private static Integer validarDiaMes(Integer dia, String etiqueta) {
        if (dia == null) {
            return null;
        }
        if (dia < 1 || dia > 31) {
            throw new IllegalArgumentException(etiqueta + " debe ser entre 1 y 31");
        }
        return dia;
    }

    /**
     * Quita de la lista una cuenta en $0. No borra movimientos:
     * los abonos/cargos siguen contando en el saldo disponible.
     */
    @Transactional
    public void archivarCuenta(Long id) {
        Cuenta cuenta = obtenerCuenta(id);
        BigDecimal saldo = nullSafe(cuenta.getSaldoActual());
        if (saldo.compareTo(BigDecimal.ZERO) != 0) {
            throw new IllegalArgumentException("Solo puedes eliminar cuentas con saldo en $0");
        }
        cuenta.setArchivada(true);
        cuentaRepository.save(cuenta);
    }

    public List<MovimientoCuenta> movimientosDeCuenta(Long cuentaId) {
        String u = Sesion.usuario();
        obtenerCuenta(cuentaId);
        return movimientoRepository.findByPropietarioAndCuentaIdOrderByFechaDescIdDesc(u, cuentaId);
    }

    @Transactional
    public MovimientoCuenta agregarMovimiento(Long cuentaId, MovimientoCuenta mov) {
        String u = Sesion.usuario();
        validarMovimientoEntrada(mov);
        Cuenta cuenta = obtenerCuenta(cuentaId);
        if (esCuentaTdc(cuenta) && "CARGO".equals(mov.getTipo())) {
            throw new IllegalArgumentException(
                    "En TDC las compras se registran en Gastos (pago con tarjeta)");
        }
        if (esPrestamoOtorgado(cuenta.getTipo()) && esCargoPrestamo(mov.getTipo())) {
            exigirSaldoDisponible(u, mov.getMonto());
        }
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

    @Transactional
    public MovimientoCuenta actualizarMovimiento(Long cuentaId, Long movimientoId, MovimientoCuenta cambios) {
        String u = Sesion.usuario();
        validarMovimientoEntrada(cambios);
        Cuenta cuenta = obtenerCuenta(cuentaId);
        MovimientoCuenta existing = movimientoRepository.findById(movimientoId)
                .orElseThrow(() -> new IllegalArgumentException("Movimiento no encontrado"));
        exigirPropietario(u, existing.getPropietario());
        if (existing.getCuenta() == null || !cuentaId.equals(existing.getCuenta().getId())) {
            throw new IllegalArgumentException("El movimiento no pertenece a esta cuenta");
        }

        String nuevoTipo = cambios.getTipo().trim().toUpperCase(Locale.ROOT);
        boolean ligadoAGasto = gastoRepository.findByMovimientoId(movimientoId).isPresent();
        if (ligadoAGasto && !"CARGO".equals(nuevoTipo)) {
            throw new IllegalArgumentException(
                    "Este cargo viene de un gasto con tarjeta; edita el monto en Gastos o aquí como CARGO.");
        }

        if (esPrestamoOtorgado(cuenta.getTipo()) && esCargoPrestamo(cambios.getTipo())) {
            BigDecimal disponible = nullSafe(calcularEsperadoActual(u))
                    .subtract(efectoLiquidezPrestamo(existing.getTipo(), existing.getMonto()));
            if (disponible.compareTo(cambios.getMonto()) < 0) {
                throw new IllegalArgumentException("Saldo insuficiente");
            }
        }

        revertirSaldo(cuenta, existing.getTipo(), existing.getMonto());
        existing.setFecha(cambios.getFecha());
        existing.setTipo(cambios.getTipo().trim().toUpperCase(Locale.ROOT));
        existing.setMonto(cambios.getMonto());
        if (cambios.getConcepto() == null || cambios.getConcepto().isBlank()) {
            existing.setConcepto(null);
        } else {
            existing.setConcepto(cambios.getConcepto());
        }
        MovimientoCuenta saved = movimientoRepository.save(existing);
        aplicarSaldo(cuenta, saved.getTipo(), saved.getMonto());
        cuentaRepository.save(cuenta);
        sincronizarGastoDesdeMovimiento(saved);
        return saved;
    }

    @Transactional
    public void eliminarMovimiento(Long cuentaId, Long movimientoId) {
        String u = Sesion.usuario();
        Cuenta cuenta = obtenerCuenta(cuentaId);
        MovimientoCuenta existing = movimientoRepository.findById(movimientoId)
                .orElseThrow(() -> new IllegalArgumentException("Movimiento no encontrado"));
        exigirPropietario(u, existing.getPropietario());
        if (existing.getCuenta() == null || !cuentaId.equals(existing.getCuenta().getId())) {
            throw new IllegalArgumentException("El movimiento no pertenece a esta cuenta");
        }
        // Si el cargo nació de un gasto TDC, borra también gasto + plan (sin tocar saldo 2 veces)
        gastoRepository.findByMovimientoId(movimientoId).ifPresent(g -> {
            for (GastoMensual p : gastoMensualRepository.findByGastoOrigenId(g.getId())) {
                if (p.isActivo()) {
                    p.setActivo(false);
                    gastoMensualRepository.save(p);
                }
            }
            g.setMovimientoId(null);
            gastoRepository.delete(g);
        });
        revertirSaldo(cuenta, existing.getTipo(), existing.getMonto());
        movimientoRepository.delete(existing);
        cuentaRepository.save(cuenta);
    }

    /**
     * Un cargo TDC ligado a un gasto: al editar la deuda se actualiza el gasto
     * y el plan a meses (misma compra, un solo monto en deuda).
     */
    private void sincronizarGastoDesdeMovimiento(MovimientoCuenta mov) {
        if (mov.getId() == null) {
            return;
        }
        gastoRepository.findByMovimientoId(mov.getId()).ifPresent(g -> {
            g.setMonto(mov.getMonto());
            g.setFecha(mov.getFecha());
            if (mov.getConcepto() != null && !mov.getConcepto().isBlank()) {
                g.setMotivo(mov.getConcepto());
            }
            if (mov.getCuenta() != null) {
                g.setCuenta(mov.getCuenta());
            }
            Gasto guardado = gastoRepository.save(g);
            String concepto = guardado.getMotivo() != null && !guardado.getMotivo().isBlank()
                    ? guardado.getMotivo()
                    : "Gasto " + guardado.getCategoria();
            sincronizarPlanMeses(guardado, concepto);
        });
    }

    private void validarMovimientoEntrada(MovimientoCuenta mov) {
        if (mov.getFecha() != null && mov.getFecha().isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("La fecha no puede ser mayor a hoy");
        }
        if (mov.getMonto() == null || mov.getMonto().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a cero");
        }
        if (mov.getTipo() == null || mov.getTipo().isBlank()) {
            throw new IllegalArgumentException("El tipo de movimiento es obligatorio");
        }
        String tipo = mov.getTipo().trim().toUpperCase(Locale.ROOT);
        if (!Set.of("ABONO", "CARGO", "INTERES", "REEMBOLSO").contains(tipo)) {
            throw new IllegalArgumentException("Tipo de movimiento inválido");
        }
        mov.setTipo(tipo);
    }

    private void exigirSaldoDisponible(String u, BigDecimal monto) {
        BigDecimal disponible = nullSafe(calcularEsperadoActual(u));
        if (disponible.compareTo(monto) < 0) {
            throw new IllegalArgumentException("Saldo insuficiente");
        }
    }

    /** Efecto en liquidez de un movimiento prestamista: CARGO negativo, cobro positivo. */
    private static BigDecimal efectoLiquidezPrestamo(String tipo, BigDecimal monto) {
        if (tipo == null || monto == null) {
            return BigDecimal.ZERO;
        }
        return switch (tipo.toUpperCase(Locale.ROOT)) {
            case "CARGO" -> monto.negate();
            case "ABONO", "REEMBOLSO" -> monto;
            default -> BigDecimal.ZERO;
        };
    }

    private static boolean esPrestamoOtorgado(String tipo) {
        return tipo != null && "PRESTAMO_OTORGADO".equalsIgnoreCase(tipo.trim());
    }

    private static boolean esCuentaTdc(Cuenta cuenta) {
        return cuenta != null && cuenta.getTipo() != null
                && "TDC".equalsIgnoreCase(cuenta.getTipo().trim());
    }

    private static boolean esCargoPrestamo(String tipo) {
        return tipo != null && "CARGO".equalsIgnoreCase(tipo.trim());
    }

    private void aplicarSaldo(Cuenta cuenta, String tipo, BigDecimal monto) {
        if (tipo == null) return;
        switch (tipo.toUpperCase(Locale.ROOT)) {
            case "ABONO", "REEMBOLSO" -> cuenta.setSaldoActual(cuenta.getSaldoActual().subtract(monto));
            case "CARGO", "INTERES" -> cuenta.setSaldoActual(cuenta.getSaldoActual().add(monto));
            default -> { }
        }
    }

    private void revertirSaldo(Cuenta cuenta, String tipo, BigDecimal monto) {
        if (tipo == null) return;
        switch (tipo.toUpperCase(Locale.ROOT)) {
            case "ABONO", "REEMBOLSO" -> cuenta.setSaldoActual(cuenta.getSaldoActual().add(monto));
            case "CARGO", "INTERES" -> cuenta.setSaldoActual(cuenta.getSaldoActual().subtract(monto));
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
     * + ingresos − gastos líquidos − abonos a deudas propias
     * − préstamos otorgados (CARGO prestamista) + cobros (ABONO/REEMBOLSO prestamista).
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
                    .subtract(nullSafe(movimientoRepository.sumaAbonosTotal(u)))
                    .subtract(nullSafe(movimientoRepository.sumaPrestamosOtorgadosTotal(u)))
                    .add(nullSafe(movimientoRepository.sumaCobrosPrestamoOtorgadoTotal(u)));
        }
        asegurarMarcasCorte(u, corte);
        long ingId = corte.getUltimoIngresoId() == null ? 0L : corte.getUltimoIngresoId();
        long gasId = corte.getUltimoGastoId() == null ? 0L : corte.getUltimoGastoId();
        long movId = corte.getUltimoMovimientoId() == null ? 0L : corte.getUltimoMovimientoId();

        BigDecimal ingresos = nullSafe(ingresoRepository.sumaDespuesDeId(u, ingId));
        BigDecimal gastos = nullSafe(gastoRepository.sumaLiquidaDespuesDeId(u, gasId));
        BigDecimal abonos = nullSafe(movimientoRepository.sumaAbonosDespuesDeId(u, movId));
        BigDecimal prestamos = nullSafe(movimientoRepository.sumaPrestamosOtorgadosDespuesDeId(u, movId));
        BigDecimal cobros = nullSafe(movimientoRepository.sumaCobrosPrestamoOtorgadoDespuesDeId(u, movId));
        return nullSafe(corte.getSaldoTotal())
                .add(ingresos)
                .subtract(gastos)
                .subtract(abonos)
                .subtract(prestamos)
                .add(cobros);
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
