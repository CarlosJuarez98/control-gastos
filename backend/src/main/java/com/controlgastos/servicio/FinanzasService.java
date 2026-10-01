package com.controlgastos.servicio;

import com.controlgastos.dto.ResumenResponse;
import com.controlgastos.modelo.*;
import com.controlgastos.repositorio.*;
import com.controlgastos.seguridad.Sesion;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
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
    private final PersonaCompartidaRepository personaCompartidaRepository;

    public FinanzasService(
            IngresoRepository ingresoRepository,
            GastoRepository gastoRepository,
            GastoMensualRepository gastoMensualRepository,
            CuentaRepository cuentaRepository,
            MovimientoCuentaRepository movimientoRepository,
            SaldoSnapshotRepository saldoRepository,
            DenominacionEfectivoRepository denominacionRepository,
            HistorialAnualRepository historialAnualRepository,
            PersonaCompartidaRepository personaCompartidaRepository) {
        this.ingresoRepository = ingresoRepository;
        this.gastoRepository = gastoRepository;
        this.gastoMensualRepository = gastoMensualRepository;
        this.cuentaRepository = cuentaRepository;
        this.movimientoRepository = movimientoRepository;
        this.saldoRepository = saldoRepository;
        this.denominacionRepository = denominacionRepository;
        this.historialAnualRepository = historialAnualRepository;
        this.personaCompartidaRepository = personaCompartidaRepository;
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

        List<Map<String, Object>> guardaditoPorPersona = new ArrayList<>();
        BigDecimal guardaditoTotal = BigDecimal.ZERO.setScale(2);
        for (PersonaCompartida p : personaCompartidaRepository.findAllByPropietario(u)) {
            BigDecimal g = nullSafe(p.getEfectivoGuardado());
            if (g.compareTo(BigDecimal.ZERO) <= 0) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", p.getId());
            m.put("nombre", p.getNombre());
            m.put("monto", g);
            guardaditoPorPersona.add(m);
            guardaditoTotal = guardaditoTotal.add(g);
        }

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
                historialAnual,
                guardaditoTotal,
                guardaditoPorPersona
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
        if (!forma.equals("EFECTIVO") && !forma.equals("TARJETA") && !forma.equals("DISPOSICION")) {
            throw new IllegalArgumentException("Forma de pago inválida");
        }
        gasto.setFormaPago(forma);
        gasto.setPropietario(u);

        boolean conTdc = forma.equals("TARJETA") || forma.equals("DISPOSICION");
        if (forma.equals("DISPOSICION")) {
            gasto.setCategoria("Disposición");
        }

        String concepto = gasto.getMotivo() != null && !gasto.getMotivo().isBlank()
                ? gasto.getMotivo()
                : (forma.equals("DISPOSICION")
                        ? "Disposición de efectivo"
                        : "Gasto " + gasto.getCategoria());

        if (conTdc) {
            Long cuentaId = gasto.getCuentaId();
            if (cuentaId == null) {
                throw new IllegalArgumentException(
                        forma.equals("DISPOSICION")
                                ? "Elige la TDC de la disposición"
                                : "Elige la TDC con la que pagaste");
            }
            Cuenta cuenta = obtenerCuenta(cuentaId);
            if (!"TDC".equalsIgnoreCase(cuenta.getTipo())) {
                throw new IllegalArgumentException("Solo puedes usar una tarjeta de crédito (TDC)");
            }
            boolean mismaTdc =
                    existing != null
                            && existing.getCuentaId() != null
                            && existing.getCuentaId().equals(cuentaId);
            if (cuenta.isBloqueada() && !mismaTdc) {
                throw new IllegalArgumentException(
                        "La tarjeta «" + cuenta.getNombre() + "» está bloqueada; no admite movimientos nuevos");
            }

            normalizarMesesTarjeta(gasto);
            normalizarTotalDeudaDisposicion(gasto);
            BigDecimal cargo = montoCargoTdc(gasto);
            String conceptoCargo = conceptoCargoTdc(gasto, concepto, cargo);

            if (existing == null || existing.getMovimientoId() == null) {
                MovimientoCuenta mov = new MovimientoCuenta();
                mov.setCuenta(cuenta);
                mov.setFecha(gasto.getFecha());
                mov.setTipo("CARGO");
                mov.setMonto(cargo);
                mov.setPropietario(u);
                mov.setConcepto(conceptoCargo);
                MovimientoCuenta savedMov = movimientoRepository.save(mov);
                aplicarSaldo(cuenta, "CARGO", cargo);
                cuentaRepository.save(cuenta);
                gasto.setMovimientoId(savedMov.getId());
            } else {
                MovimientoCuenta mov = movimientoRepository.findById(existing.getMovimientoId()).orElse(null);
                if (mov == null) {
                    // Gasto apunta a un movimiento borrado: recrear el cargo (evita huérfanos).
                    MovimientoCuenta nuevo = new MovimientoCuenta();
                    nuevo.setCuenta(cuenta);
                    nuevo.setFecha(gasto.getFecha());
                    nuevo.setTipo("CARGO");
                    nuevo.setMonto(cargo);
                    nuevo.setPropietario(u);
                    nuevo.setConcepto(conceptoCargo);
                    MovimientoCuenta savedMov = movimientoRepository.save(nuevo);
                    aplicarSaldo(cuenta, "CARGO", cargo);
                    cuentaRepository.save(cuenta);
                    gasto.setMovimientoId(savedMov.getId());
                } else {
                    exigirPropietario(u, mov.getPropietario());
                    Cuenta cuentaAnterior = mov.getCuenta();
                    revertirSaldo(cuentaAnterior, mov.getTipo(), mov.getMonto());
                    Cuenta destino = cuentaAnterior.getId().equals(cuenta.getId()) ? cuentaAnterior : cuenta;
                    if (!cuentaAnterior.getId().equals(cuenta.getId())) {
                        cuentaRepository.save(cuentaAnterior);
                    }
                    mov.setCuenta(destino);
                    mov.setFecha(gasto.getFecha());
                    mov.setMonto(cargo);
                    mov.setConcepto(conceptoCargo);
                    movimientoRepository.save(mov);
                    aplicarSaldo(destino, "CARGO", cargo);
                    cuentaRepository.save(destino);
                    gasto.setMovimientoId(mov.getId());
                    gasto.setCuenta(destino);
                }
            }
            if (gasto.getCuenta() == null) {
                gasto.setCuenta(cuenta);
            }
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
            gasto.setTotalDeuda(null);
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
     * Disposición: total que cobra el banco (con interés), a meses o de contado.
     * El monto del gasto sigue siendo lo recibido (disponible).
     */
    private void normalizarTotalDeudaDisposicion(Gasto gasto) {
        if (!esFormaDisposicion(gasto.getFormaPago())) {
            gasto.setTotalDeuda(null);
            return;
        }
        gasto.setTotalDeuda(DisposicionTdc.normalizarTotalBanco(gasto.getTotalDeuda(), gasto.getMonto()));
    }

    /**
     * Disponible usa {@code gasto.monto} (efectivo recibido).
     * El cargo TDC en disposición es el total del banco (con o sin meses).
     */
    private static BigDecimal montoCargoTdc(Gasto gasto) {
        return DisposicionTdc.cargoTdc(
                esFormaDisposicion(gasto.getFormaPago()), gasto.getTotalDeuda(), gasto.getMonto());
    }

    private static String conceptoCargoTdc(Gasto gasto, String concepto, BigDecimal cargo) {
        if (!esFormaDisposicion(gasto.getFormaPago())) {
            return concepto;
        }
        return DisposicionTdc.conceptoConInteres(concepto, cargo, gasto.getMonto());
    }

    /**
     * Si el gasto TDC es a N meses, crea/actualiza un mensual con la cuota
     * y el contador de meses restantes. Si deja de ser a meses, desactiva el plan.
     */
    private void sincronizarPlanMeses(Gasto guardado, String concepto) {
        String u = Sesion.usuario();
        boolean aMeses = esFormaConTdc(guardado.getFormaPago())
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
        BigDecimal totalDeuda = montoCargoTdc(guardado);
        CuotasPlan.Resultado cuotas = CuotasPlan.deTotal(totalDeuda, meses);
        BigDecimal cuota = cuotas.cuotaRegular();
        String tdc = "TDC";
        Long cid = guardado.getCuentaId();
        if (cid != null) {
            tdc = cuentaRepository.findById(cid).map(Cuenta::getNombre).orElse("TDC");
        }
        String motivo = truncar(
                (esFormaDisposicion(guardado.getFormaPago()) ? "Disposición" : concepto)
                        + " - " + meses + " meses (" + tdc + ")",
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
        plan.setMontoTotal(totalDeuda);
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
        Long servicioFijoConservar = null;
        if (g.getId() != null) {
            GastoMensual existing = gastoMensualRepository.findById(g.getId())
                    .orElseThrow(() -> new IllegalArgumentException("Gasto mensual no encontrado"));
            exigirPropietario(u, existing.getPropietario());
            gastoOrigenConservar = existing.getGastoOrigenId();
            servicioFijoConservar = existing.getServicioFijoCompartidoId();
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

        // Alta manual o corrección: conservar vínculos
        g.setGastoOrigenId(gastoOrigenConservar);
        if (g.getServicioFijoCompartidoId() == null) {
            g.setServicioFijoCompartidoId(servicioFijoConservar);
        }
        g.setPropietario(u);
        g.setActivo(true);
        return gastoMensualRepository.save(g);
    }

    /**
     * Espeja en Mensuales la cuota del principal cuando en Compartido «otro paga».
     * Si ya no aplica, desactiva el fijo vinculado.
     */
    @Transactional
    public void sincronizarMensualDesdeCompartido(
            Long servicioFijoId,
            String concepto,
            BigDecimal cuotaPrincipal,
            Integer diaPago,
            boolean activo) {
        String u = Sesion.usuario();
        if (servicioFijoId == null) return;

        GastoMensual g = gastoMensualRepository
                .findByServicioFijoCompartidoIdAndPropietario(servicioFijoId, u)
                .orElse(null);

        boolean debeExistir = activo
                && cuotaPrincipal != null
                && cuotaPrincipal.compareTo(BigDecimal.ZERO) > 0;

        if (!debeExistir) {
            if (g != null && g.isActivo()) {
                g.setActivo(false);
                gastoMensualRepository.save(g);
            }
            return;
        }

        if (g == null) {
            g = new GastoMensual();
            g.setPropietario(u);
            g.setServicioFijoCompartidoId(servicioFijoId);
        }
        g.setMotivo("Compartido - " + (concepto == null || concepto.isBlank() ? "servicio" : concepto.trim())
                + " (mi parte)");
        if (g.getMotivo().length() > 120) {
            g.setMotivo(g.getMotivo().substring(0, 120));
        }
        g.setMonto(cuotaPrincipal.setScale(0, java.math.RoundingMode.HALF_UP)
                .setScale(2, java.math.RoundingMode.UNNECESSARY));
        g.setMesesTotales(null);
        g.setMesesRestantes(null);
        g.setMontoTotal(null);
        g.setGastoOrigenId(null);
        g.setDiaPago(diaPago);
        g.setActivo(true);
        g.setServicioFijoCompartidoId(servicioFijoId);
        g.setPropietario(u);
        gastoMensualRepository.save(g);
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
        // Resta la cuota que correspondía a este mes (última si restaba 1)
        BigDecimal cuotaPagada = CuotasPlan.cuotaActual(
                g.getMonto(), g.getMontoTotal(), g.getMesesTotales(), rest);
        if (g.getMontoTotal() != null) {
            BigDecimal nuevo = g.getMontoTotal().subtract(cuotaPagada);
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
                .peek(this::enriquecerSaldoAlCorte)
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
        enriquecerSaldoAlCorte(cuenta);
        return cuenta;
    }

    /**
     * Desglose TDC: saldoAlCorte = deuda de hoy (total − MSI de cortes posteriores).
     * Si no se pagó el corte pasado, ya va incluido. saldoDespuesCorte = cuotas futuras.
     */
    private void enriquecerSaldoAlCorte(Cuenta c) {
        if (c == null || c.getId() == null || !esCuentaTdc(c) || c.getDiaCorte() == null) {
            c.setSaldoAlCorte(null);
            c.setSaldoDespuesCorte(null);
            return;
        }
        LocalDate ciclo = proximoCorte(c.getDiaCorte(), LocalDate.now());
        if (ciclo == null) {
            c.setSaldoAlCorte(null);
            c.setSaldoDespuesCorte(null);
            return;
        }
        String u = c.getPropietario() != null ? c.getPropietario() : Sesion.usuario();
        List<MovimientoCuenta> movs =
                movimientoRepository.findByPropietarioAndCuentaIdOrderByFechaDescIdDesc(u, c.getId());
        enriquecerMovimientosConGasto(movs);

        BigDecimal futuros = BigDecimal.ZERO;
        for (MovimientoCuenta m : movs) {
            if (m.getTipo() == null) continue;
            String tipo = m.getTipo().trim().toUpperCase(Locale.ROOT);
            if (!"CARGO".equals(tipo) && !"INTERES".equals(tipo)) continue;
            BigDecimal monto = nullSafe(m.getMonto());
            if (monto.compareTo(BigDecimal.ZERO) <= 0) continue;

            Integer meses = m.getMeses();
            if (meses != null && meses > 1) {
                List<LocalDate> cortes = cortesPlanMeses(c.getDiaCorte(), m.getFecha(), meses);
                List<BigDecimal> cuotas = cuotasDeTotal(monto, meses);
                for (int i = 0; i < cortes.size(); i++) {
                    if (cortes.get(i).isAfter(ciclo)) {
                        futuros = futuros.add(cuotas.get(i));
                    }
                }
            } else {
                LocalDate corteCompra = corteDeCompra(c.getDiaCorte(), m.getFecha());
                if (corteCompra != null && corteCompra.isAfter(ciclo)) {
                    futuros = futuros.add(monto);
                }
            }
        }
        if (futuros.compareTo(BigDecimal.ZERO) < 0) {
            futuros = BigDecimal.ZERO;
        }
        BigDecimal total = nullSafe(c.getSaldoActual());
        BigDecimal alCorte = total.subtract(futuros);
        if (alCorte.compareTo(BigDecimal.ZERO) < 0) {
            alCorte = BigDecimal.ZERO;
        }
        if (alCorte.compareTo(total) > 0) {
            alCorte = total;
        }
        BigDecimal despues = total.subtract(alCorte);
        if (despues.compareTo(BigDecimal.ZERO) < 0) {
            despues = BigDecimal.ZERO;
        }
        c.setSaldoAlCorte(alCorte.setScale(2, RoundingMode.HALF_UP));
        c.setSaldoDespuesCorte(despues.setScale(2, RoundingMode.HALF_UP));
    }

    /** Próximo corte del ciclo abierto (día de corte inclusive). */
    private static LocalDate proximoCorte(Integer diaCorte, LocalDate hoy) {
        if (diaCorte == null || diaCorte < 1 || diaCorte > 31) {
            return null;
        }
        YearMonth ym = YearMonth.from(hoy);
        LocalDate corte = DiaCobroMes.fechaEnMes(ym, diaCorte);
        if (hoy.getDayOfMonth() > diaCorte) {
            ym = ym.plusMonths(1);
            corte = DiaCobroMes.fechaEnMes(ym, diaCorte);
        }
        return corte;
    }

    /** Corte del ciclo al que cae una compra (día de corte inclusive). */
    private static LocalDate corteDeCompra(Integer diaCorte, LocalDate fechaCompra) {
        if (diaCorte == null || fechaCompra == null || diaCorte < 1 || diaCorte > 31) {
            return null;
        }
        YearMonth ym = YearMonth.from(fechaCompra);
        if (fechaCompra.getDayOfMonth() > diaCorte) {
            ym = ym.plusMonths(1);
        }
        return DiaCobroMes.fechaEnMes(ym, diaCorte);
    }

    private static List<LocalDate> cortesPlanMeses(Integer diaCorte, LocalDate fechaCompra, int meses) {
        if (meses <= 1 || fechaCompra == null) {
            return List.of();
        }
        LocalDate primero = corteDeCompra(diaCorte, fechaCompra);
        if (primero == null) {
            return List.of();
        }
        List<LocalDate> out = new ArrayList<>(meses);
        YearMonth ym = YearMonth.from(primero);
        for (int i = 0; i < meses; i++) {
            out.add(DiaCobroMes.fechaEnMes(ym, diaCorte));
            ym = ym.plusMonths(1);
        }
        return out;
    }

    private static List<BigDecimal> cuotasDeTotal(BigDecimal total, int meses) {
        CuotasPlan.Resultado plan = CuotasPlan.deTotal(total, meses);
        List<BigDecimal> out = new ArrayList<>(meses);
        for (int i = 0; i < meses - 1; i++) {
            out.add(plan.cuotaRegular());
        }
        out.add(plan.cuotaUltima());
        return out;
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
        normalizarDatosTdc(cuenta, nueva);
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
        enriquecerSaldoAlCorte(saved);
        return saved;
    }

    /**
     * Toda TDC nueva exige corte + límite de pago (desglose por ciclo / MSI).
     * Las ya existentes sin calendario pueden seguir hasta que se capturen.
     */
    private void normalizarDatosTdc(Cuenta cuenta, boolean nueva) {
        boolean tdc = cuenta.getTipo() != null && "TDC".equalsIgnoreCase(cuenta.getTipo().trim());
        if (!tdc) {
            // Otros tipos no usan estos campos; se dejan como estén (pueden quedar null).
            return;
        }
        if (nueva && (cuenta.getDiaCorte() == null || cuenta.getDiaLimitePago() == null)) {
            throw new IllegalArgumentException(
                    "Toda TDC necesita día de corte y día límite de pago (ej. 13 y 23)");
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
     * TDC / Tienda no se archivan: se dejan de usar (bloqueo de compras).
     */
    @Transactional
    public void archivarCuenta(Long id) {
        Cuenta cuenta = obtenerCuenta(id);
        if (esCreditoCompras(cuenta)) {
            throw new IllegalArgumentException(
                    "Las TDC y tiendas no se eliminan; usa «Dejar de usar» para quitarlas de compras");
        }
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
        List<MovimientoCuenta> movs =
                movimientoRepository.findByPropietarioAndCuentaIdOrderByFechaDescIdDesc(u, cuentaId);
        enriquecerMovimientosConGasto(movs);
        return movs;
    }

    /** Marca cargos ligados a gasto TDC (meses / disposición) para la UI de Deudas. */
    private void enriquecerMovimientosConGasto(List<MovimientoCuenta> movs) {
        if (movs == null || movs.isEmpty()) {
            return;
        }
        List<Long> ids = movs.stream()
                .map(MovimientoCuenta::getId)
                .filter(Objects::nonNull)
                .toList();
        if (ids.isEmpty()) {
            return;
        }
        Map<Long, Long> cuentaPorMov = new HashMap<>();
        for (MovimientoCuenta m : movs) {
            if (m.getId() != null && m.getCuenta() != null) {
                cuentaPorMov.put(m.getId(), m.getCuenta().getId());
            }
        }
        Map<Long, Gasto> porMov = new HashMap<>();
        for (Gasto g : gastoRepository.findByMovimientoIdIn(ids)) {
            Long mid = g.getMovimientoId();
            if (mid == null) {
                continue;
            }
            Gasto prev = porMov.get(mid);
            if (prev == null) {
                porMov.put(mid, g);
                continue;
            }
            Long cuentaMov = cuentaPorMov.get(mid);
            boolean prevOk = cuentaMov != null && cuentaMov.equals(prev.getCuentaId());
            boolean curOk = cuentaMov != null && cuentaMov.equals(g.getCuentaId());
            if (curOk && !prevOk) {
                porMov.put(mid, g);
            } else if (curOk == prevOk && g.getId() < prev.getId()) {
                porMov.put(mid, g);
            }
        }
        for (MovimientoCuenta m : movs) {
            Gasto g = porMov.get(m.getId());
            if (g == null) {
                continue;
            }
            m.setGastoId(g.getId());
            m.setFormaPagoGasto(g.getFormaPago());
            if (g.getMeses() != null && g.getMeses() > 1) {
                m.setMeses(g.getMeses());
            }
        }
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
        if (esCuentaTienda(cuenta) && cuenta.isBloqueada() && "CARGO".equals(mov.getTipo())) {
            throw new IllegalArgumentException(
                    "La tienda «" + cuenta.getNombre() + "» está bloqueada; no admite compras nuevas");
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

        if (gastoDeMovimiento(movimientoId).isPresent()) {
            throw new IllegalArgumentException(
                    "Este cargo viene de Gastos; edítalo ahí para que se actualicen Deudas y Mensuales.");
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
        gastoDeMovimiento(movimientoId).ifPresent(g -> {
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
        gastoDeMovimiento(mov.getId()).ifPresent(g -> {
            if (esFormaDisposicion(g.getFormaPago())) {
                // Cargo = total del banco (con interés). El efectivo recibido no cambia aquí.
                g.setTotalDeuda(mov.getMonto());
                String base = g.getMotivo() != null && !g.getMotivo().isBlank()
                        ? g.getMotivo()
                        : "Disposición de efectivo";
                mov.setConcepto(conceptoCargoTdc(g, base, mov.getMonto()));
                movimientoRepository.save(mov);
            } else {
                g.setMonto(mov.getMonto());
                if (mov.getConcepto() != null && !mov.getConcepto().isBlank()) {
                    g.setMotivo(mov.getConcepto());
                }
            }
            g.setFecha(mov.getFecha());
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

    /**
     * Resuelve el gasto ligado a un cargo. Si por datos viejos hay más de uno,
     * conserva el de la misma TDC (o el más viejo) y suelta el resto.
     */
    private java.util.Optional<Gasto> gastoDeMovimiento(Long movimientoId) {
        if (movimientoId == null) {
            return java.util.Optional.empty();
        }
        List<Gasto> ligados = gastoRepository.findByMovimientoIdOrderByIdAsc(movimientoId);
        if (ligados.isEmpty()) {
            return java.util.Optional.empty();
        }
        if (ligados.size() == 1) {
            return java.util.Optional.of(ligados.get(0));
        }
        Long cuentaId = movimientoRepository.findById(movimientoId)
                .map(MovimientoCuenta::getCuenta)
                .map(Cuenta::getId)
                .orElse(null);
        Gasto keep = ligados.stream()
                .filter(g -> cuentaId != null && cuentaId.equals(g.getCuentaId()))
                .findFirst()
                .orElse(ligados.get(0));
        for (Gasto g : ligados) {
            if (!g.getId().equals(keep.getId())) {
                g.setMovimientoId(null);
                gastoRepository.save(g);
            }
        }
        return java.util.Optional.of(keep);
    }

    private void validarMovimientoEntrada(MovimientoCuenta mov) {
        if (mov.getFecha() != null && mov.getFecha().isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("La fecha no puede ser mayor a hoy");
        }
        if (mov.getMonto() == null || mov.getMonto().compareTo(BigDecimal.ZERO) == 0) {
            throw new IllegalArgumentException("El monto no puede ser cero");
        }
        if (mov.getTipo() == null || mov.getTipo().isBlank()) {
            throw new IllegalArgumentException("El tipo de movimiento es obligatorio");
        }
        String tipo = mov.getTipo().trim().toUpperCase(Locale.ROOT);
        if (!Set.of("ABONO", "CARGO", "INTERES", "REEMBOLSO").contains(tipo)) {
            throw new IllegalArgumentException("Tipo de movimiento inválido");
        }
        // INTERES puede ser negativo (ajuste/condonación de rédito); el resto debe ser > 0.
        if (!"INTERES".equals(tipo) && mov.getMonto().compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a cero");
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

    private static boolean esCuentaTienda(Cuenta cuenta) {
        return cuenta != null && cuenta.getTipo() != null
                && "TIENDA".equalsIgnoreCase(cuenta.getTipo().trim());
    }

    /** TDC / Tienda: crédito para compras; no se archivan. */
    private static boolean esCreditoCompras(Cuenta cuenta) {
        return esCuentaTdc(cuenta) || esCuentaTienda(cuenta);
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
     * Disponible / “Debería tener” =
     *   dinero contado en el último corte (efectivo + apps)
     *   + ingresos + disposiciones TDC − gastos líquidos − abonos − préstamos + cobros
     *     posteriores a ese corte.
     * <p>
     * Así, al guardar un corte no se pone en 0: partes del efectivo que
     * acabas de contar y luego sumas/restas lo nuevo. Los gastos TDC no entran;
     * las disposiciones sí suman (recibiste efectivo / liquidez).
     */
    @Transactional
    public BigDecimal calcularEsperadoActual() {
        return calcularEsperadoActual(Sesion.usuario());
    }

    private BigDecimal calcularEsperadoActual(String u) {
        SaldoSnapshot corte = saldoRepository.findFirstByPropietarioOrderByFechaDescIdDesc(u).orElse(null);
        if (corte == null) {
            return flujoDisponible(u, 0L, 0L, 0L);
        }
        asegurarMarcasCorte(u, corte);
        long ingId = corte.getUltimoIngresoId() == null ? 0L : corte.getUltimoIngresoId();
        long gasId = corte.getUltimoGastoId() == null ? 0L : corte.getUltimoGastoId();
        long movId = corte.getUltimoMovimientoId() == null ? 0L : corte.getUltimoMovimientoId();
        return dineroContadoDelCorte(corte).add(flujoDisponible(u, ingId, gasId, movId));
    }

    /** Efectivo + apps del corte (Tuve). Si no hay montos, usa saldoTotal. */
    private BigDecimal dineroContadoDelCorte(SaldoSnapshot corte) {
        BigDecimal contado = nullSafe(corte.getTotalFisico())
                .add(nullSafe(corte.getDineroBbva()))
                .add(nullSafe(corte.getDineroMercadoLibre()))
                .add(nullSafe(corte.getDineroNu()))
                .add(nullSafe(corte.getDineroDidi()));
        if (contado.compareTo(BigDecimal.ZERO) == 0) {
            return nullSafe(corte.getSaldoTotal());
        }
        return contado;
    }

    /** Flujo después de los ids (0 = desde el inicio). Sin base del corte. */
    private BigDecimal flujoDisponible(String u, long despuesIngresoId, long despuesGastoId, long despuesMovId) {
        BigDecimal ingresos = despuesIngresoId <= 0
                ? nullSafe(ingresoRepository.sumaTotal(u))
                : nullSafe(ingresoRepository.sumaDespuesDeId(u, despuesIngresoId));
        BigDecimal gastos = despuesGastoId <= 0
                ? nullSafe(gastoRepository.sumaLiquidaTotal(u))
                : nullSafe(gastoRepository.sumaLiquidaDespuesDeId(u, despuesGastoId));
        BigDecimal disposiciones = despuesGastoId <= 0
                ? nullSafe(gastoRepository.sumaDisposicionesTotal(u))
                : nullSafe(gastoRepository.sumaDisposicionesDespuesDeId(u, despuesGastoId));
        BigDecimal abonos = despuesMovId <= 0
                ? nullSafe(movimientoRepository.sumaAbonosTotal(u))
                : nullSafe(movimientoRepository.sumaAbonosDespuesDeId(u, despuesMovId));
        BigDecimal prestamos = despuesMovId <= 0
                ? nullSafe(movimientoRepository.sumaPrestamosOtorgadosTotal(u))
                : nullSafe(movimientoRepository.sumaPrestamosOtorgadosDespuesDeId(u, despuesMovId));
        BigDecimal cobros = despuesMovId <= 0
                ? nullSafe(movimientoRepository.sumaCobrosPrestamoOtorgadoTotal(u))
                : nullSafe(movimientoRepository.sumaCobrosPrestamoOtorgadoDespuesDeId(u, despuesMovId));
        return ingresos.add(disposiciones).subtract(gastos).subtract(abonos).subtract(prestamos).add(cobros);
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
        return !esFormaConTdc(g.getFormaPago());
    }

    private static boolean esFormaConTdc(String formaPago) {
        if (formaPago == null || formaPago.isBlank()) return false;
        String fp = formaPago.trim().toUpperCase(Locale.ROOT);
        return "TARJETA".equals(fp) || "DISPOSICION".equals(fp);
    }

    private static boolean esFormaDisposicion(String formaPago) {
        return formaPago != null && "DISPOSICION".equalsIgnoreCase(formaPago.trim());
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
