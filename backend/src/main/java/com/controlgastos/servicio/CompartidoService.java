package com.controlgastos.servicio;

import com.controlgastos.dto.CompartidoDtos.*;
import com.controlgastos.modelo.*;
import com.controlgastos.repositorio.GastoCompartidoRepository;
import com.controlgastos.repositorio.MovimientoPersonaCompartidaRepository;
import com.controlgastos.repositorio.PersonaCompartidaRepository;
import com.controlgastos.repositorio.ServicioFijoCompartidoRepository;
import com.controlgastos.seguridad.Sesion;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class CompartidoService {

    private final PersonaCompartidaRepository personaRepository;
    private final GastoCompartidoRepository gastoCompartidoRepository;
    private final MovimientoPersonaCompartidaRepository movimientoRepository;
    private final ServicioFijoCompartidoRepository servicioFijoRepository;
    private final FinanzasService finanzasService;

    public CompartidoService(
            PersonaCompartidaRepository personaRepository,
            GastoCompartidoRepository gastoCompartidoRepository,
            MovimientoPersonaCompartidaRepository movimientoRepository,
            ServicioFijoCompartidoRepository servicioFijoRepository,
            FinanzasService finanzasService) {
        this.personaRepository = personaRepository;
        this.gastoCompartidoRepository = gastoCompartidoRepository;
        this.movimientoRepository = movimientoRepository;
        this.servicioFijoRepository = servicioFijoRepository;
        this.finanzasService = finanzasService;
    }

    public List<PersonaCompartida> listarPersonas(boolean incluirInactivas) {
        String u = Sesion.usuario();
        return incluirInactivas
                ? personaRepository.findAllByPropietario(u)
                : personaRepository.findActivasByPropietario(u);
    }

    public PersonaCompartida obtenerPersona(Long id) {
        String u = Sesion.usuario();
        return personaRepository.findByIdAndPropietario(id, u)
                .orElseThrow(() -> new IllegalArgumentException("Persona no encontrada"));
    }

    @Transactional
    public PersonaCompartida guardarPersona(PersonaCompartida datos) {
        String u = Sesion.usuario();
        String nombre = normalizarNombre(datos.getNombre());
        if (nombre.isEmpty()) {
            throw new IllegalArgumentException("El nombre es obligatorio");
        }

        PersonaCompartida persona;
        if (datos.getId() == null) {
            persona = new PersonaCompartida();
            persona.setPropietario(u);
            persona.setActiva(true);
            persona.setEfectivoGuardado(BigDecimal.ZERO);
        } else {
            persona = obtenerPersona(datos.getId());
        }
        persona.setNombre(nombre);
        return personaRepository.save(persona);
    }

    /** Destino unificado de deudas por préstamo (abono PRESTADO y entregar favor/préstamo). */
    public static final String DESTINO_PRESTAMO = "Préstamo";

    @Transactional
    public void desactivarPersona(Long id) {
        String u = Sesion.usuario();
        PersonaCompartida persona = obtenerPersona(id);
        persona.setActiva(false);
        personaRepository.save(persona);

        // Sacar de plantillas de fijos activos
        for (ServicioFijoCompartido s : servicioFijoRepository.findActivosByPropietario(u)) {
            List<Long> ids = new ArrayList<>(s.getPersonaIds());
            if (!ids.remove(id)) {
                continue;
            }
            if (s.isYoPago() && ids.isEmpty()) {
                s.setActivo(false);
                servicioFijoRepository.save(s);
                finanzasService.sincronizarMensualDesdeCompartido(
                        s.getId(), s.getConcepto(), BigDecimal.ZERO, null, false);
            } else {
                s.setPersonaIds(ids);
                servicioFijoRepository.save(s);
                sincronizarMensualSiAplica(s);
            }
        }
    }

    @Transactional
    public PersonaCompartida reactivarPersona(Long id) {
        PersonaCompartida persona = obtenerPersona(id);
        persona.setActiva(true);
        return personaRepository.save(persona);
    }

    public List<GastoCompartido> listarGastos() {
        return gastoCompartidoRepository.findActivosByPropietario(Sesion.usuario());
    }

    public GastoCompartido obtenerGasto(Long id) {
        return gastoCompartidoRepository.findByIdAndPropietario(id, Sesion.usuario())
                .orElseThrow(() -> new IllegalArgumentException("Gasto compartido no encontrado"));
    }

    /**
     * Tú pagas el total; se registra el gasto real y se reparte deuda a los demás.
     * Si incluyePrincipal: tu parte no genera deuda. Si no: solo prestas el pago (ellos 100%).
     */
    @Transactional
    public GastoCompartido registrarGasto(RegistrarGastoRequest req) {
        String u = Sesion.usuario();
        if (req == null) {
            throw new IllegalArgumentException("Datos obligatorios");
        }
        String tipo = normalizarTipo(req.tipo());
        String concepto = normalizarNombre(req.concepto());
        if (concepto.isEmpty()) {
            throw new IllegalArgumentException("El concepto es obligatorio");
        }
        if (req.monto() == null || req.monto().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a cero");
        }
        LocalDate fecha = req.fecha() == null ? LocalDate.now() : req.fecha();
        if (fecha.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("La fecha no puede ser mayor a hoy");
        }

        List<Long> personaIds = dedupeIds(req.personaIds());
        if (personaIds.isEmpty()) {
            throw new IllegalArgumentException("Elige al menos una persona");
        }
        boolean incluyePrincipal = req.incluyePrincipal() == null || Boolean.TRUE.equals(req.incluyePrincipal());
        int n = incluyePrincipal ? personaIds.size() + 1 : personaIds.size();
        if (n < 1) {
            throw new IllegalArgumentException("Se necesita al menos una persona en el reparto");
        }

        List<PersonaCompartida> otras = new ArrayList<>();
        for (Long id : personaIds) {
            PersonaCompartida p = obtenerPersona(id);
            if (!p.isActiva()) {
                throw new IllegalArgumentException("La persona " + p.getNombre() + " está inactiva");
            }
            otras.add(p);
        }

        int perfilesYo = normalizarPerfiles(req.perfilesPrincipal());
        List<Integer> perfilesOtros = alinearPerfiles(personaIds.size(), req.perfiles());
        List<Integer> pesos = pesosReparto(incluyePrincipal, perfilesYo, perfilesOtros);
        List<BigDecimal> partes = RepartoEnteros.repartirPesosPonderado(req.monto(), pesos);
        BigDecimal partePrincipal = incluyePrincipal
                ? partes.get(0)
                : BigDecimal.ZERO.setScale(2, RoundingMode.UNNECESSARY);
        BigDecimal montoRedondeado = partes.stream().reduce(BigDecimal.ZERO, BigDecimal::add);

        String forma = req.formaPago() == null ? "EFECTIVO" : req.formaPago().trim().toUpperCase(Locale.ROOT);
        if (!forma.equals("EFECTIVO") && !forma.equals("TARJETA")) {
            throw new IllegalArgumentException("Forma de pago inválida (EFECTIVO o TARJETA)");
        }

        Gasto gastoReal = new Gasto();
        gastoReal.setFecha(fecha);
        gastoReal.setCategoria("Compartido");
        gastoReal.setMonto(montoRedondeado);
        gastoReal.setMotivo(tipo.substring(0, 1) + tipo.substring(1).toLowerCase(Locale.ROOT) + ": " + concepto);
        gastoReal.setFormaPago(forma);
        if ("TARJETA".equals(forma)) {
            if (req.cuentaId() == null) {
                throw new IllegalArgumentException("Elige la TDC con la que pagaste");
            }
            gastoReal.setCuentaId(req.cuentaId());
            if (req.meses() != null && req.meses() >= 2) {
                gastoReal.setMeses(req.meses());
            }
        }
        Gasto guardado = finanzasService.guardarGasto(gastoReal);

        GastoCompartido gc = new GastoCompartido();
        gc.setTipo(tipo);
        gc.setConcepto(concepto);
        gc.setMontoTotal(montoRedondeado);
        gc.setFecha(fecha);
        gc.setPropietario(u);
        gc.setFormaPago(forma);
        gc.setCuentaId(req.cuentaId());
        gc.setMeses(req.meses());
        gc.setGastoId(guardado.getId());
        gc.setServicioFijoId(req.servicioFijoId());
        gc.setPeriodo(normalizarPeriodo(req.periodo(), fecha));
        gc.setAnulado(false);

        ParteGastoCompartido yo = new ParteGastoCompartido();
        yo.setEsPrincipal(true);
        yo.setPersona(null);
        yo.setMonto(partePrincipal);
        yo.setPerfiles(incluyePrincipal ? perfilesYo : 1);
        gc.addParte(yo);

        List<ParteGastoCompartidaPair> deudasPendientes = new ArrayList<>();
        for (int i = 0; i < otras.size(); i++) {
            PersonaCompartida persona = otras.get(i);
            BigDecimal montoParte = partes.get(incluyePrincipal ? i + 1 : i);
            ParteGastoCompartido parte = new ParteGastoCompartido();
            parte.setEsPrincipal(false);
            parte.setPersona(persona);
            parte.setMonto(montoParte);
            parte.setPerfiles(perfilesOtros.get(i));
            gc.addParte(parte);
            if (montoParte.compareTo(BigDecimal.ZERO) > 0) {
                deudasPendientes.add(new ParteGastoCompartidaPair(persona, montoParte));
            }
        }

        gc = gastoCompartidoRepository.save(gc);

        for (ParteGastoCompartidaPair d : deudasPendientes) {
            MovimientoPersonaCompartida deuda = new MovimientoPersonaCompartida();
            deuda.setPersona(d.persona());
            deuda.setPropietario(u);
            deuda.setFecha(fecha);
            deuda.setTipo(MovimientoPersonaCompartida.DEUDA);
            deuda.setMonto(d.monto());
            deuda.setConcepto(conceptoConPeriodo(concepto, gc.getPeriodo()));
            deuda.setGastoCompartidoId(gc.getId());
            deuda.setDesdeGuardado(false);
            deuda.setAnulado(false);
            movimientoRepository.save(deuda);
        }

        return obtenerGasto(gc.getId());
    }

    private record ParteGastoCompartidaPair(PersonaCompartida persona, BigDecimal monto) {}

    /**
     * Si alguien se sale o se integra: se reparte de nuevo el mismo total.
     * El gasto real (efectivo/TDC) no se toca.
     * Con proporcionalDias=true:
     * - quien entra pesa desde fechaIngreso;
     * - quien sale pesa hasta fechaSalida (sigue con deuda parcial).
     */
    @Transactional
    public GastoCompartido recalcularParticipantes(Long gastoId, RecalcularRequest req) {
        String u = Sesion.usuario();
        GastoCompartido gc = obtenerGasto(gastoId);
        if (gc.isAnulado()) {
            throw new IllegalArgumentException("Ese gasto ya está anulado");
        }
        List<Long> personaIds = dedupeIds(req == null ? null : req.personaIds());
        if (personaIds.isEmpty()) {
            throw new IllegalArgumentException("Debe quedar al menos una persona además de ti");
        }

        Set<Long> antes = new LinkedHashSet<>();
        for (ParteGastoCompartido p : gc.getPartes()) {
            if (!p.isEsPrincipal() && p.getPersona() != null && p.getPersona().getId() != null) {
                antes.add(p.getPersona().getId());
            }
        }

        List<PersonaCompartida> otras = new ArrayList<>();
        for (Long id : personaIds) {
            PersonaCompartida p = obtenerPersona(id);
            if (!p.isActiva()) {
                throw new IllegalArgumentException("La persona " + p.getNombre() + " está inactiva");
            }
            otras.add(p);
        }

        boolean incluyePrincipal = req == null || req.incluyePrincipal() == null
                || Boolean.TRUE.equals(req.incluyePrincipal());
        if (req == null || req.incluyePrincipal() == null) {
            BigDecimal yoActual = BigDecimal.ZERO;
            for (ParteGastoCompartido p : gc.getPartes()) {
                if (p.isEsPrincipal() && p.getMonto() != null) {
                    yoActual = yoActual.add(p.getMonto());
                }
            }
            incluyePrincipal = yoActual.compareTo(BigDecimal.ZERO) > 0;
        }

        boolean proporcional = req != null && Boolean.TRUE.equals(req.proporcionalDias());
        LocalDate fechaGasto = gc.getFecha() != null ? gc.getFecha() : LocalDate.now();
        LocalDate ingreso = req != null && req.fechaIngreso() != null ? req.fechaIngreso() : LocalDate.now();
        LocalDate salida = req != null && req.fechaSalida() != null ? req.fechaSalida() : LocalDate.now();
        if (ingreso.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("La fecha de ingreso no puede ser mayor a hoy");
        }
        if (salida.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("La fecha de salida no puede ser mayor a hoy");
        }

        Set<Long> nuevas = new LinkedHashSet<>();
        for (PersonaCompartida p : otras) {
            nuevas.add(p.getId());
        }
        List<PersonaCompartida> salientes = new ArrayList<>();
        if (proporcional) {
            for (Long id : antes) {
                if (!nuevas.contains(id)) {
                    salientes.add(obtenerPersona(id));
                }
            }
        }

        int nBase = incluyePrincipal ? otras.size() + 1 : otras.size();
        int n = nBase + salientes.size();
        if (n < 1) {
            throw new IllegalArgumentException("Debe quedar al menos una persona en el reparto");
        }

        int perfilesYo = normalizarPerfiles(req == null ? null : req.perfilesPrincipal());
        List<Integer> perfilesOtros = alinearPerfiles(otras.size(), req == null ? null : req.perfiles());
        // Salientes sin perfiles en request → 1 c/u
        List<Integer> perfilesSalientes = alinearPerfiles(salientes.size(), null);

        List<BigDecimal> partes;
        String sufijoConcepto;
        // Orden de partes: [principal?] + otras (vigentes) + salientes
        if (proporcional) {
            if (!incluyePrincipal) {
                throw new IllegalArgumentException(
                        "El reparto por días requiere que tú también estés en la lista");
            }
            int diasMes = fechaGasto.lengthOfMonth();
            LocalDate inicioMes = fechaGasto.withDayOfMonth(1);
            LocalDate finMes = fechaGasto.withDayOfMonth(diasMes);
            List<Integer> pesos = new ArrayList<>(n);
            pesos.add(diasMes * perfilesYo); // tú: mes completo × perfiles
            for (int i = 0; i < otras.size(); i++) {
                PersonaCompartida p = otras.get(i);
                int perf = perfilesOtros.get(i);
                if (antes.contains(p.getId())) {
                    pesos.add(diasMes * perf);
                } else {
                    LocalDate desde = ingreso;
                    if (desde.isBefore(inicioMes)) {
                        desde = inicioMes;
                    }
                    if (desde.isAfter(finMes)) {
                        throw new IllegalArgumentException(
                                p.getNombre() + " entra fuera del mes del gasto");
                    }
                    int dias = (int) (java.time.temporal.ChronoUnit.DAYS.between(desde, finMes) + 1);
                    pesos.add(Math.max(1, dias) * perf);
                }
            }
            for (int i = 0; i < salientes.size(); i++) {
                PersonaCompartida p = salientes.get(i);
                LocalDate hasta = salida;
                if (hasta.isAfter(finMes)) {
                    hasta = finMes;
                }
                if (hasta.isBefore(inicioMes)) {
                    throw new IllegalArgumentException(
                            p.getNombre() + " sale fuera del mes del gasto");
                }
                int dias = (int) (java.time.temporal.ChronoUnit.DAYS.between(inicioMes, hasta) + 1);
                pesos.add(Math.max(1, dias) * perfilesSalientes.get(i));
            }
            partes = RepartoEnteros.repartirPesosPonderado(gc.getMontoTotal(), pesos);
            sufijoConcepto = " (reparto por días)";
        } else {
            List<Integer> pesos = pesosReparto(incluyePrincipal, perfilesYo, perfilesOtros);
            partes = RepartoEnteros.repartirPesosPonderado(gc.getMontoTotal(), pesos);
            // sin salientes en partes iguales / perfiles
            n = nBase;
            salientes = List.of();
            perfilesSalientes = List.of();
            sufijoConcepto = " (reparto actualizado)";
        }

        for (MovimientoPersonaCompartida m : movimientoRepository.findByGastoCompartidoIdAndPropietario(gastoId, u)) {
            if (!m.isAnulado() && MovimientoPersonaCompartida.DEUDA.equals(m.getTipo())) {
                m.setAnulado(true);
                movimientoRepository.save(m);
            }
        }

        gc.getPartes().clear();
        ParteGastoCompartido yo = new ParteGastoCompartido();
        yo.setEsPrincipal(true);
        yo.setPersona(null);
        yo.setMonto(incluyePrincipal
                ? partes.get(0)
                : BigDecimal.ZERO.setScale(2, RoundingMode.UNNECESSARY));
        yo.setPerfiles(incluyePrincipal ? perfilesYo : 1);
        gc.addParte(yo);

        List<PersonaCompartida> todos = new ArrayList<>(otras);
        todos.addAll(salientes);
        List<Integer> todosPerfiles = new ArrayList<>(perfilesOtros);
        todosPerfiles.addAll(perfilesSalientes);
        for (int i = 0; i < todos.size(); i++) {
            PersonaCompartida persona = todos.get(i);
            BigDecimal montoParte = partes.get(incluyePrincipal ? i + 1 : i);
            ParteGastoCompartido parte = new ParteGastoCompartido();
            parte.setEsPrincipal(false);
            parte.setPersona(persona);
            parte.setMonto(montoParte);
            parte.setPerfiles(todosPerfiles.get(i));
            gc.addParte(parte);

            if (montoParte.compareTo(BigDecimal.ZERO) > 0) {
                MovimientoPersonaCompartida deuda = new MovimientoPersonaCompartida();
                deuda.setPersona(persona);
                deuda.setPropietario(u);
                deuda.setFecha(gc.getFecha());
                deuda.setTipo(MovimientoPersonaCompartida.DEUDA);
                deuda.setMonto(montoParte);
                String marcaSalida = salientes.stream().anyMatch(s -> s.getId().equals(persona.getId()))
                        ? " · salió"
                        : "";
                deuda.setConcepto(conceptoConPeriodo(gc.getConcepto(), gc.getPeriodo())
                        + sufijoConcepto + marcaSalida);
                deuda.setGastoCompartidoId(gc.getId());
                deuda.setDesdeGuardado(false);
                deuda.setAnulado(false);
                movimientoRepository.save(deuda);
            }
        }

        return gastoCompartidoRepository.save(gc);
    }

    public List<ServicioFijoCompartido> listarServiciosFijos() {
        return servicioFijoRepository.findActivosByPropietario(Sesion.usuario());
    }

    @Transactional
    public ServicioFijoCompartido guardarServicioFijo(Long id, ServicioFijoRequest req) {
        String u = Sesion.usuario();
        if (req == null) {
            throw new IllegalArgumentException("Datos obligatorios");
        }
        String concepto = normalizarNombre(req.concepto());
        if (concepto.isEmpty()) {
            throw new IllegalArgumentException("El concepto es obligatorio");
        }
        if (req.monto() == null || req.monto().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a cero");
        }
        List<Long> personaIds = dedupeIds(req.personaIds());
        boolean yoPago = req.yoPago() == null || Boolean.TRUE.equals(req.yoPago());
        boolean incluyePrincipal = req.incluyePrincipal() == null || Boolean.TRUE.equals(req.incluyePrincipal());
        if (!yoPago) {
            // Otro paga: tú debes estar en el reparto para tener cuota en Mensuales
            incluyePrincipal = true;
        }
        if (yoPago && personaIds.isEmpty()) {
            throw new IllegalArgumentException("Elige al menos una persona además de ti");
        }
        if (!yoPago && !incluyePrincipal) {
            throw new IllegalArgumentException("Si otro paga, activa «Yo también» para calcular tu parte");
        }
        for (Long pid : personaIds) {
            PersonaCompartida p = obtenerPersona(pid);
            if (!p.isActiva()) {
                throw new IllegalArgumentException("La persona " + p.getNombre() + " está inactiva");
            }
        }

        ServicioFijoCompartido s;
        if (id == null) {
            s = new ServicioFijoCompartido();
            s.setPropietario(u);
            s.setActivo(true);
        } else {
            s = servicioFijoRepository.findByIdAndPropietario(id, u)
                    .orElseThrow(() -> new IllegalArgumentException("Servicio fijo no encontrado"));
        }
        s.setConcepto(concepto);
        s.setMonto(req.monto().setScale(0, RoundingMode.HALF_UP).setScale(2, RoundingMode.UNNECESSARY));
        s.setPersonaIds(personaIds);
        s.setPersonaPerfiles(alinearPerfiles(personaIds.size(), req.perfiles()));
        s.setPerfilesPrincipal(normalizarPerfiles(req.perfilesPrincipal()));
        s.setDiaCobro(DiaCobroMes.normalizarDia(req.diaCobro()));
        s.setIncluyePrincipal(incluyePrincipal);
        s.setYoPago(yoPago);
        s = servicioFijoRepository.save(s);

        sincronizarMensualSiAplica(s);
        return s;
    }

    @Transactional
    public void desactivarServicioFijo(Long id) {
        String u = Sesion.usuario();
        ServicioFijoCompartido s = servicioFijoRepository.findByIdAndPropietario(id, u)
                .orElseThrow(() -> new IllegalArgumentException("Servicio fijo no encontrado"));
        s.setActivo(false);
        servicioFijoRepository.save(s);
        finanzasService.sincronizarMensualDesdeCompartido(
                s.getId(), s.getConcepto(), BigDecimal.ZERO, null, false);
    }

    private void sincronizarMensualSiAplica(ServicioFijoCompartido s) {
        if (s == null || s.getId() == null) return;
        boolean espejo = s.isActivo() && !s.isYoPago() && s.isIncluyePrincipal();
        BigDecimal cuota = espejo ? cuotaPrincipalEnFijo(s) : BigDecimal.ZERO;
        finanzasService.sincronizarMensualDesdeCompartido(
                s.getId(),
                s.getConcepto(),
                cuota,
                s.getDiaCobro(),
                espejo && cuota.compareTo(BigDecimal.ZERO) > 0);
    }

    /** Tu cuota en el fijo (índice 0). 0 si no te incluye el reparto. */
    static BigDecimal cuotaPrincipalEnFijo(ServicioFijoCompartido s) {
        if (s == null || !s.isIncluyePrincipal()) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.UNNECESSARY);
        }
        List<Integer> pesos = pesosReparto(true, s.getPerfilesPrincipal(), s.getPersonaPerfiles());
        List<BigDecimal> partes = RepartoEnteros.repartirPesosPonderado(s.getMonto(), pesos);
        return partes.get(0);
    }

    /**
     * Cobra el mes: crea gasto real + deudas.
     * Solo incluye personas de la plantilla que sigan activas (si alguien se salió, se reparte entre los que quedan).
     */
    @Transactional
    public GastoCompartido cobrarServicioFijo(Long id, CobrarServicioRequest req) {
        String u = Sesion.usuario();
        ServicioFijoCompartido s = servicioFijoRepository.findByIdAndPropietario(id, u)
                .orElseThrow(() -> new IllegalArgumentException("Servicio fijo no encontrado"));
        if (!s.isActivo()) {
            throw new IllegalArgumentException("Ese servicio fijo está inactivo");
        }
        if (!s.isYoPago()) {
            throw new IllegalArgumentException(
                    "En este fijo otro paga: tu parte está en Mensuales. No se cobra aquí.");
        }

        List<Long> plantillaIds = s.getPersonaIds();
        List<Integer> plantillaPerfiles = s.getPersonaPerfiles();
        List<Long> vigentes = new ArrayList<>();
        List<Integer> perfilesVigentes = new ArrayList<>();
        for (int i = 0; i < plantillaIds.size(); i++) {
            Long pid = plantillaIds.get(i);
            try {
                PersonaCompartida p = obtenerPersona(pid);
                if (p.isActiva()) {
                    vigentes.add(pid);
                    perfilesVigentes.add(i < plantillaPerfiles.size() ? plantillaPerfiles.get(i) : 1);
                }
            } catch (IllegalArgumentException ignored) {
                // persona borrada
            }
        }
        if (vigentes.isEmpty()) {
            throw new IllegalArgumentException(
                    "No quedan personas activas en este servicio. Actualiza la plantilla.");
        }

        String periodo = normalizarPeriodo(
                req == null ? null : req.periodo(),
                req != null && req.fecha() != null ? req.fecha() : LocalDate.now());
        LocalDate fecha;
        if (req != null && req.fecha() != null) {
            fecha = req.fecha();
        } else {
            fecha = DiaCobroMes.fechaEnPeriodo(periodo, s.getDiaCobro());
            if (fecha.isAfter(LocalDate.now())) {
                fecha = LocalDate.now();
            }
        }
        String forma = req == null || req.formaPago() == null ? "EFECTIVO" : req.formaPago();
        Long cuentaId = req == null ? null : req.cuentaId();
        Integer meses = req == null ? null : req.meses();

        gastoCompartidoRepository.findActivoByServicioYPeriodo(u, s.getId(), periodo)
                .ifPresent(existente -> {
                    throw new IllegalArgumentException(
                            "Ya cobraste " + s.getConcepto() + " de " + periodo
                                    + " (fecha " + existente.getFecha() + ")");
                });

        return registrarGasto(new RegistrarGastoRequest(
                "SERVICIO",
                s.getConcepto(),
                s.getMonto(),
                fecha,
                vigentes,
                forma,
                cuentaId,
                meses,
                s.getId(),
                periodo,
                s.isIncluyePrincipal(),
                perfilesVigentes,
                s.getPerfilesPrincipal()
        ));
    }

    @Transactional
    public AnularGastoResponse anularGasto(Long id) {
        String u = Sesion.usuario();
        GastoCompartido gc = obtenerGasto(id);
        if (gc.isAnulado()) {
            return new AnularGastoResponse(BigDecimal.ZERO.setScale(2, RoundingMode.UNNECESSARY), "Ya estaba anulado");
        }

        List<MovimientoPersonaCompartida> todosMovs = movimientoRepository.findActivosByPropietario(u);
        List<GastoCompartido> gastos = gastoCompartidoRepository.findActivosByPropietario(u);
        BigDecimal abonosCubrían = estimarAbonosAplicadosAlGasto(gc, todosMovs, gastos);

        gc.setAnulado(true);
        gastoCompartidoRepository.save(gc);

        for (MovimientoPersonaCompartida m : movimientoRepository.findByGastoCompartidoIdAndPropietario(id, u)) {
            if (!m.isAnulado() && MovimientoPersonaCompartida.DEUDA.equals(m.getTipo())) {
                m.setAnulado(true);
                movimientoRepository.save(m);
            }
        }

        if (gc.getGastoId() != null) {
            try {
                finanzasService.eliminarGasto(gc.getGastoId());
            } catch (IllegalArgumentException ignored) {
                // ya borrado manualmente
            }
        }

        String msg;
        if (abonosCubrían.compareTo(BigDecimal.ZERO) > 0) {
            msg = "Anulado. $" + abonosCubrían.toPlainString().replace(".00", "")
                    + " que ya habían abonado quedan a favor (puedes devolverlos con Dar).";
        } else {
            msg = "Gasto anulado";
        }
        return new AnularGastoResponse(abonosCubrían, msg);
    }

    /**
     * Cuánto de los abonos existentes ya cubría las deudas de este gasto
     * (antes de anularlas). Ese monto pasa a «a favor» al anular.
     */
    static BigDecimal estimarAbonosAplicadosAlGasto(
            GastoCompartido gc,
            List<MovimientoPersonaCompartida> movs,
            List<GastoCompartido> gastos) {
        if (gc == null || gc.getId() == null) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.UNNECESSARY);
        }
        Set<Long> personas = new LinkedHashSet<>();
        for (MovimientoPersonaCompartida m : movs) {
            if (m.isAnulado() || m.getPersona() == null) continue;
            if (MovimientoPersonaCompartida.DEUDA.equals(m.getTipo())
                    && gc.getId().equals(m.getGastoCompartidoId())) {
                personas.add(m.getPersona().getId());
            }
        }
        BigDecimal total = BigDecimal.ZERO;
        for (Long pid : personas) {
            List<CompartidoEstadoCuenta.Cargo> cargos = new ArrayList<>();
            List<CompartidoEstadoCuenta.Abono> abonos = new ArrayList<>();
            for (MovimientoPersonaCompartida m : movs) {
                if (m.isAnulado() || m.getPersona() == null || !pid.equals(m.getPersona().getId())) {
                    continue;
                }
                if (MovimientoPersonaCompartida.ABONO.equals(m.getTipo())) {
                    abonos.add(new CompartidoEstadoCuenta.Abono(
                            m.getMonto(), m.getConceptoDestino(), m.isDesdeAnticipo(), m.getFecha()));
                } else if (MovimientoPersonaCompartida.ANTICIPO_OUT.equals(m.getTipo())) {
                    abonos.add(new CompartidoEstadoCuenta.Abono(
                            m.getMonto() == null ? BigDecimal.ZERO : m.getMonto().negate(),
                            null, false, m.getFecha()));
                } else if (MovimientoPersonaCompartida.DEUDA.equals(m.getTipo())) {
                    GastoCompartido g = buscarGasto(gastos, m.getGastoCompartidoId());
                    String periodo = g != null && g.getPeriodo() != null && !g.getPeriodo().isBlank()
                            ? g.getPeriodo() : "otros";
                    String concepto = g != null ? g.getConcepto() : (m.getConcepto() == null ? "" : m.getConcepto());
                    LocalDate fecha = g != null ? g.getFecha() : m.getFecha();
                    cargos.add(new CompartidoEstadoCuenta.Cargo(
                            periodo, concepto, fecha, m.getGastoCompartidoId(), m.getMonto()));
                }
            }
            total = total.add(CompartidoEstadoCuenta.pagadoDeGasto(cargos, abonos, gc.getId()));
        }
        return total.setScale(2, RoundingMode.HALF_UP).setScale(2, RoundingMode.UNNECESSARY);
    }

    @Transactional
    public MovimientoPersonaCompartida registrarAbono(Long personaId, AbonoRequest req) {
        String u = Sesion.usuario();
        PersonaCompartida persona = obtenerPersona(personaId);
        if (req == null || req.monto() == null || req.monto().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a cero");
        }
        BigDecimal monto = req.monto().setScale(0, RoundingMode.HALF_UP).setScale(2, RoundingMode.UNNECESSARY);
        if (monto.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto debe ser al menos $1");
        }
        LocalDate fecha = req.fecha() == null ? LocalDate.now() : req.fecha();
        if (fecha.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("La fecha no puede ser mayor a hoy");
        }
        String medio = req.medio() == null ? "EFECTIVO" : req.medio().trim().toUpperCase(Locale.ROOT);
        if (!medio.equals("EFECTIVO") && !medio.equals("GUARDADO") && !medio.equals("PRESTADO")) {
            throw new IllegalArgumentException("Medio inválido (EFECTIVO, GUARDADO o PRESTADO)");
        }

        String formaPrestamo = "EFECTIVO";
        if ("PRESTADO".equals(medio)) {
            formaPrestamo = req.formaPagoPrestamo() == null
                    ? "EFECTIVO"
                    : req.formaPagoPrestamo().trim().toUpperCase(Locale.ROOT);
            if (!formaPrestamo.equals("EFECTIVO") && !formaPrestamo.equals("TARJETA")) {
                throw new IllegalArgumentException("El préstamo debe ser EFECTIVO o TARJETA");
            }
            if (formaPrestamo.equals("TARJETA") && req.cuentaId() == null) {
                throw new IllegalArgumentException("Elige la TDC con la que prestas");
            }
        }

        String concepto = normalizarNombre(req.concepto());
        String destino = CompartidoEstadoCuenta.normalizarDestino(req.conceptoDestino());
        if (concepto.isEmpty()) {
            if ("PRESTADO".equals(medio)) {
                concepto = destino != null
                        ? "Abono prestado a " + destino + " · " + persona.getNombre()
                        : "Abono prestado · " + persona.getNombre();
            } else {
                concepto = destino != null
                        ? "Abono a " + destino + " · " + persona.getNombre()
                        : "Abono de " + persona.getNombre();
            }
        }

        MovimientoPersonaCompartida mov = new MovimientoPersonaCompartida();
        mov.setPersona(persona);
        mov.setPropietario(u);
        mov.setFecha(fecha);
        mov.setTipo(MovimientoPersonaCompartida.ABONO);
        mov.setMonto(monto);
        mov.setConcepto(concepto);
        mov.setConceptoDestino(destino);
        mov.setDesdeAnticipo(false);
        mov.setAnulado(false);

        if ("GUARDADO".equals(medio)) {
            BigDecimal guardado = persona.getEfectivoGuardado();
            if (guardado.compareTo(monto) < 0) {
                throw new IllegalArgumentException(
                        "Guardado insuficiente ($" + guardado.toPlainString() + ")");
            }
            persona.setEfectivoGuardado(guardado.subtract(monto));
            personaRepository.save(persona);
            mov.setDesdeGuardado(true);
        } else if ("PRESTADO".equals(medio)) {
            // Tú cubres el abono prestándole: sale de tu efectivo o de TDC.
            mov.setDesdeGuardado(false);
            Gasto gPrest = new Gasto();
            gPrest.setFecha(fecha);
            gPrest.setCategoria("Compartido");
            gPrest.setMonto(monto);
            gPrest.setMotivo("Compartido · " + persona.getNombre() + ": abono prestado");
            gPrest.setFormaPago(formaPrestamo);
            if ("TARJETA".equals(formaPrestamo)) {
                gPrest.setCuentaId(req.cuentaId());
            }
            finanzasService.guardarGasto(gPrest);
            // El gasto queda en finanzas; el ledger registra abono + deuda préstamo.

            MovimientoPersonaCompartida deuda = new MovimientoPersonaCompartida();
            deuda.setPersona(persona);
            deuda.setPropietario(u);
            deuda.setFecha(fecha);
            deuda.setTipo(MovimientoPersonaCompartida.DEUDA);
            deuda.setMonto(monto);
            deuda.setConcepto("TARJETA".equals(formaPrestamo) ? "Préstamo (TDC)" : "Préstamo (efectivo)");
            deuda.setConceptoDestino(DESTINO_PRESTAMO);
            deuda.setDesdeGuardado(false);
            deuda.setDesdeAnticipo(false);
            deuda.setAnulado(false);
            movimientoRepository.save(deuda);
        } else {
            mov.setDesdeGuardado(false);
            Ingreso ingreso = new Ingreso();
            ingreso.setFecha(fecha);
            ingreso.setMonto(monto);
            ingreso.setConcepto("Compartido · " + persona.getNombre() + ": " + concepto);
            Ingreso saved = finanzasService.guardarIngreso(ingreso);
            mov.setIngresoId(saved.getId());
        }

        return movimientoRepository.save(mov);
    }

    /**
     * «Dame lo de mi favor y préstame X, luego te lo pago».
     * A favor: siempre se entrega en efectivo (baja disponible).
     * Préstamo: EFECTIVO (baja disponible) o TARJETA (cargo TDC hasta el corte).
     */
    @Transactional
    public EntregarFavorPrestamoResponse entregarFavorYPrestamo(
            Long personaId, EntregarFavorPrestamoRequest req) {
        String u = Sesion.usuario();
        PersonaCompartida persona = obtenerPersona(personaId);
        BigDecimal favor = req == null || req.montoFavor() == null
                ? BigDecimal.ZERO
                : req.montoFavor().setScale(0, RoundingMode.HALF_UP).setScale(2, RoundingMode.UNNECESSARY);
        BigDecimal prestamo = req == null || req.montoPrestamo() == null
                ? BigDecimal.ZERO
                : req.montoPrestamo().setScale(0, RoundingMode.HALF_UP).setScale(2, RoundingMode.UNNECESSARY);
        if (favor.compareTo(BigDecimal.ZERO) < 0 || prestamo.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("Los montos no pueden ser negativos");
        }
        if (favor.compareTo(BigDecimal.ZERO) == 0 && prestamo.compareTo(BigDecimal.ZERO) == 0) {
            throw new IllegalArgumentException("Indica cuánto del a favor entregas y/o cuánto prestas");
        }
        LocalDate fecha = req == null || req.fecha() == null ? LocalDate.now() : req.fecha();
        if (fecha.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("La fecha no puede ser mayor a hoy");
        }

        String formaPrestamo = "EFECTIVO";
        if (prestamo.compareTo(BigDecimal.ZERO) > 0) {
            formaPrestamo = req == null || req.formaPagoPrestamo() == null
                    ? "EFECTIVO"
                    : req.formaPagoPrestamo().trim().toUpperCase(Locale.ROOT);
            if (!formaPrestamo.equals("EFECTIVO") && !formaPrestamo.equals("TARJETA")) {
                throw new IllegalArgumentException("El préstamo debe ser EFECTIVO o TARJETA");
            }
            if (formaPrestamo.equals("TARJETA") && (req == null || req.cuentaId() == null)) {
                throw new IllegalArgumentException("Elige la TDC con la que prestas");
            }
        }

        List<MovimientoPersonaCompartida> movs = movimientoRepository.findActivosByPropietario(u);
        List<GastoCompartido> gastos = gastoCompartidoRepository.findActivosByPropietario(u);
        PersonaResumen actual = armarResumenPersona(persona, movs, gastos);
        if (favor.compareTo(actual.aFavor()) > 0) {
            throw new IllegalArgumentException(
                    "Solo tiene a favor $" + actual.aFavor().toPlainString().replace(".00", "")
                            + "; no puedes entregar $" + favor.toPlainString().replace(".00", ""));
        }

        BigDecimal entregado = favor.add(prestamo);

        // A favor: siempre efectivo (les devuelves dinero que ya había entrado)
        if (favor.compareTo(BigDecimal.ZERO) > 0) {
            Gasto gFavor = new Gasto();
            gFavor.setFecha(fecha);
            gFavor.setCategoria("Compartido");
            gFavor.setMonto(favor);
            gFavor.setMotivo("Compartido · " + persona.getNombre() + ": entrega a favor");
            gFavor.setFormaPago("EFECTIVO");
            finanzasService.guardarGasto(gFavor);

            MovimientoPersonaCompartida out = new MovimientoPersonaCompartida();
            out.setPersona(persona);
            out.setPropietario(u);
            out.setFecha(fecha);
            out.setTipo(MovimientoPersonaCompartida.ANTICIPO_OUT);
            out.setMonto(favor);
            out.setConcepto("Entrega de a favor en efectivo");
            out.setDesdeGuardado(false);
            out.setDesdeAnticipo(false);
            out.setAnulado(false);
            movimientoRepository.save(out);
        }

        BigDecimal quedaDebiendo = actual.debe();
        if (prestamo.compareTo(BigDecimal.ZERO) > 0) {
            Gasto gPrest = new Gasto();
            gPrest.setFecha(fecha);
            gPrest.setCategoria("Compartido");
            gPrest.setMonto(prestamo);
            gPrest.setMotivo("Compartido · " + persona.getNombre() + ": préstamo");
            gPrest.setFormaPago(formaPrestamo);
            if ("TARJETA".equals(formaPrestamo)) {
                gPrest.setCuentaId(req.cuentaId());
            }
            finanzasService.guardarGasto(gPrest);

            String conceptoDeuda = "TARJETA".equals(formaPrestamo)
                    ? "Préstamo (TDC)"
                    : "Préstamo (efectivo)";
            MovimientoPersonaCompartida deuda = new MovimientoPersonaCompartida();
            deuda.setPersona(persona);
            deuda.setPropietario(u);
            deuda.setFecha(fecha);
            deuda.setTipo(MovimientoPersonaCompartida.DEUDA);
            deuda.setMonto(prestamo);
            deuda.setConcepto(conceptoDeuda);
            deuda.setConceptoDestino(DESTINO_PRESTAMO);
            deuda.setDesdeGuardado(false);
            deuda.setDesdeAnticipo(false);
            deuda.setAnulado(false);
            movimientoRepository.save(deuda);
            quedaDebiendo = quedaDebiendo.add(prestamo);
        }

        StringBuilder msg = new StringBuilder("Entregaste $")
                .append(entregado.toPlainString().replace(".00", ""));
        if (favor.compareTo(BigDecimal.ZERO) > 0) {
            msg.append(" ($").append(favor.toPlainString().replace(".00", "")).append(" de su a favor");
            if (prestamo.compareTo(BigDecimal.ZERO) > 0) {
                msg.append(" + $").append(prestamo.toPlainString().replace(".00", "")).append(" préstamo");
            }
            msg.append(")");
        } else {
            msg.append(" de préstamo");
        }
        if (favor.compareTo(BigDecimal.ZERO) > 0
                || (prestamo.compareTo(BigDecimal.ZERO) > 0 && "EFECTIVO".equals(formaPrestamo))) {
            msg.append(". Bajó tu disponible");
            if (prestamo.compareTo(BigDecimal.ZERO) > 0 && "TARJETA".equals(formaPrestamo)) {
                msg.append(" (solo la parte a favor)");
            }
            msg.append(".");
        }
        if (prestamo.compareTo(BigDecimal.ZERO) > 0 && "TARJETA".equals(formaPrestamo)) {
            msg.append(" El préstamo fue a TDC: sube deuda de la tarjeta hasta el corte; disponible no baja.");
        }
        if (prestamo.compareTo(BigDecimal.ZERO) > 0) {
            msg.append(" Te debe $")
                    .append(prestamo.toPlainString().replace(".00", ""))
                    .append(" del préstamo.");
        }

        return new EntregarFavorPrestamoResponse(
                entregado, favor, prestamo, quedaDebiendo, msg.toString());
    }

    /**
     * Manda parte del a favor general a una cuenta (Spotify, CFE…).
     * No es dinero nuevo: reasigna anticipo. Si esa cuenta aún debe, lo cubre; si sobra, queda anticipo de esa cuenta.
     */
    @Transactional
    public MovimientoPersonaCompartida aplicarAnticipo(Long personaId, AplicarAnticipoRequest req) {
        String u = Sesion.usuario();
        PersonaCompartida persona = obtenerPersona(personaId);
        if (req == null || req.monto() == null || req.monto().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a cero");
        }
        String destino = CompartidoEstadoCuenta.normalizarDestino(req.conceptoDestino());
        if (destino == null) {
            throw new IllegalArgumentException("Elige a qué cuenta mandar el a favor (ej. Spotify)");
        }
        BigDecimal monto = req.monto().setScale(0, RoundingMode.HALF_UP).setScale(2, RoundingMode.UNNECESSARY);

        List<MovimientoPersonaCompartida> movs = movimientoRepository.findActivosByPropietario(u);
        List<GastoCompartido> gastos = gastoCompartidoRepository.findActivosByPropietario(u);
        PersonaResumen actual = armarResumenPersona(persona, movs, gastos);
        if (actual.aFavor().compareTo(monto) < 0) {
            throw new IllegalArgumentException(
                    "Solo tiene a favor $" + actual.aFavor().toPlainString().replace(".00", "")
                            + "; no alcanza para mandar $" + monto.toPlainString().replace(".00", "")
                            + " a " + destino);
        }

        MovimientoPersonaCompartida mov = new MovimientoPersonaCompartida();
        mov.setPersona(persona);
        mov.setPropietario(u);
        mov.setFecha(LocalDate.now());
        mov.setTipo(MovimientoPersonaCompartida.ABONO);
        mov.setMonto(monto);
        mov.setConcepto("A favor → " + destino);
        mov.setConceptoDestino(destino);
        mov.setDesdeAnticipo(true);
        mov.setDesdeGuardado(false);
        mov.setAnulado(false);
        return movimientoRepository.save(mov);
    }

    /**
     * La persona adelanta N meses de un fijo: se registra un abono = cuota × meses.
     * Cubre deudas viejas primero (FIFO); el resto queda de anticipo para cobros futuros.
     */
    @Transactional
    public MovimientoPersonaCompartida registrarAdelantoFijo(Long personaId, AdelantoFijoRequest req) {
        String u = Sesion.usuario();
        obtenerPersona(personaId);
        if (req == null || req.servicioFijoId() == null) {
            throw new IllegalArgumentException("Elige el servicio fijo");
        }
        int meses = req.meses() == null ? 0 : req.meses();
        if (meses < 1 || meses > 24) {
            throw new IllegalArgumentException("Los meses a adelantar deben ser entre 1 y 24");
        }
        ServicioFijoCompartido s = servicioFijoRepository.findByIdAndPropietario(req.servicioFijoId(), u)
                .orElseThrow(() -> new IllegalArgumentException("Servicio fijo no encontrado"));
        if (!s.isActivo()) {
            throw new IllegalArgumentException("Ese servicio fijo está inactivo");
        }

        BigDecimal cuota = cuotaPersonaEnFijo(s, personaId);
        BigDecimal total = cuota.multiply(BigDecimal.valueOf(meses))
                .setScale(0, RoundingMode.HALF_UP)
                .setScale(2, RoundingMode.UNNECESSARY);
        if (total.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("La cuota calculada es cero");
        }

        String labelMes = meses == 1 ? "1 mes" : meses + " meses";
        return registrarAbono(personaId, new AbonoRequest(
                total,
                req.fecha(),
                req.medio(),
                "Adelanto " + s.getConcepto() + " × " + labelMes
                        + " ($" + cuota.toPlainString().replace(".00", "") + "/mes)",
                s.getConcepto(),
                null,
                null
        ));
    }

    /**
     * Cuota de esa persona en el fijo (mismo reparto entero que al cobrar).
     * Índice 0 = tú; la persona está en personaIds de la plantilla.
     */
    static BigDecimal cuotaPersonaEnFijo(ServicioFijoCompartido s, Long personaId) {
        List<Long> ids = s.getPersonaIds();
        int idxEnLista = -1;
        for (int i = 0; i < ids.size(); i++) {
            if (personaId.equals(ids.get(i))) {
                idxEnLista = i;
                break;
            }
        }
        if (idxEnLista < 0) {
            throw new IllegalArgumentException(
                    "Esa persona no está en la plantilla de «" + s.getConcepto() + "»");
        }
        List<Integer> pesos = pesosReparto(
                s.isIncluyePrincipal(), s.getPerfilesPrincipal(), s.getPersonaPerfiles());
        List<BigDecimal> partes = RepartoEnteros.repartirPesosPonderado(s.getMonto(), pesos);
        return partes.get(s.isIncluyePrincipal() ? idxEnLista + 1 : idxEnLista);
    }

    static int normalizarPerfiles(Integer v) {
        return v == null || v < 1 ? 1 : v;
    }

    /** Lista de perfiles (mín. 1) alineada a {@code size}; null/faltantes → 1. */
    static List<Integer> alinearPerfiles(int size, List<Integer> perfiles) {
        List<Integer> out = new ArrayList<>(size);
        for (int i = 0; i < size; i++) {
            int v = 1;
            if (perfiles != null && i < perfiles.size() && perfiles.get(i) != null && perfiles.get(i) > 0) {
                v = perfiles.get(i);
            }
            out.add(v);
        }
        return out;
    }

    static List<Integer> pesosReparto(boolean incluyePrincipal, int perfilesPrincipal, List<Integer> perfilesOtros) {
        List<Integer> pesos = new ArrayList<>();
        if (incluyePrincipal) {
            pesos.add(normalizarPerfiles(perfilesPrincipal));
        }
        if (perfilesOtros != null) {
            for (Integer p : perfilesOtros) {
                pesos.add(normalizarPerfiles(p));
            }
        }
        if (pesos.isEmpty()) {
            throw new IllegalArgumentException("Se necesita al menos una persona en el reparto");
        }
        return pesos;
    }

    @Transactional
    public MovimientoPersonaCompartida registrarGuardado(Long personaId, GuardadoRequest req) {
        String u = Sesion.usuario();
        PersonaCompartida persona = obtenerPersona(personaId);
        if (req == null || req.monto() == null || req.monto().compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto debe ser mayor a cero");
        }
        BigDecimal monto = req.monto().setScale(0, RoundingMode.HALF_UP).setScale(2, RoundingMode.UNNECESSARY);
        if (monto.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("El monto debe ser al menos $1");
        }
        LocalDate fecha = req.fecha() == null ? LocalDate.now() : req.fecha();
        if (fecha.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("La fecha no puede ser mayor a hoy");
        }
        String tipoReq = req.tipo() == null ? "" : req.tipo().trim().toUpperCase(Locale.ROOT);
        boolean dejar = tipoReq.equals("DEJAR") || tipoReq.equals("GUARDADO_IN") || tipoReq.equals("IN");
        boolean devolver = tipoReq.equals("DEVOLVER") || tipoReq.equals("GUARDADO_OUT") || tipoReq.equals("OUT");
        if (!dejar && !devolver) {
            throw new IllegalArgumentException("Tipo inválido (DEJAR o DEVOLVER)");
        }

        String concepto = normalizarNombre(req.concepto());
        MovimientoPersonaCompartida mov = new MovimientoPersonaCompartida();
        mov.setPersona(persona);
        mov.setPropietario(u);
        mov.setFecha(fecha);
        mov.setMonto(monto);
        mov.setAnulado(false);
        mov.setDesdeGuardado(false);

        if (dejar) {
            mov.setTipo(MovimientoPersonaCompartida.GUARDADO_IN);
            mov.setConcepto(concepto.isEmpty() ? "Efectivo a guardar" : concepto);
            persona.setEfectivoGuardado(persona.getEfectivoGuardado().add(monto));
        } else {
            BigDecimal guardado = persona.getEfectivoGuardado();
            if (guardado.compareTo(monto) < 0) {
                throw new IllegalArgumentException(
                        "Guardado insuficiente ($" + guardado.toPlainString() + ")");
            }
            mov.setTipo(MovimientoPersonaCompartida.GUARDADO_OUT);
            mov.setConcepto(concepto.isEmpty() ? "Devolución de guardado" : concepto);
            persona.setEfectivoGuardado(guardado.subtract(monto));
        }
        personaRepository.save(persona);
        return movimientoRepository.save(mov);
    }

    public List<MovimientoPersonaCompartida> movimientosPersona(Long personaId) {
        obtenerPersona(personaId);
        return movimientoRepository.findActivosByPersonaAndPropietario(personaId, Sesion.usuario());
    }

    public List<MovimientoPersonaCompartida> movimientosTodos() {
        return movimientoRepository.findActivosByPropietario(Sesion.usuario());
    }

    public ResumenCompartido resumen() {
        String u = Sesion.usuario();
        List<PersonaCompartida> personas = personaRepository.findActivasByPropietario(u);
        List<MovimientoPersonaCompartida> movs = movimientoRepository.findActivosByPropietario(u);
        List<GastoCompartido> gastos = gastoCompartidoRepository.findActivosByPropietario(u);

        List<PersonaResumen> filas = new ArrayList<>();
        BigDecimal totalDebe = BigDecimal.ZERO;
        BigDecimal totalFavor = BigDecimal.ZERO;
        BigDecimal totalGuardado = BigDecimal.ZERO;

        for (PersonaCompartida p : personas) {
            PersonaResumen fila = armarResumenPersona(p, movs, gastos);
            filas.add(fila);
            totalDebe = totalDebe.add(fila.debe());
            totalFavor = totalFavor.add(fila.aFavor());
            totalGuardado = totalGuardado.add(fila.efectivoGuardado());
        }

        List<CuentaGlobalResumen> porCuenta = agruparCuentasGlobales(filas, gastos);
        List<TdcCargaResumen> porTdc = agruparCargasTdc(gastos);
        List<FijoPendienteCobro> fijosPendientes = listarFijosPendientesCobro(u, gastos);
        return new ResumenCompartido(
                filas, totalDebe, totalFavor, totalGuardado, porCuenta, porTdc, fijosPendientes);
    }

    /** Fijos «Yo pago» con día de cobro ya vencido este mes y aún sin cobro. */
    List<FijoPendienteCobro> listarFijosPendientesCobro(String u, List<GastoCompartido> gastos) {
        LocalDate hoy = LocalDate.now();
        String periodo = hoy.format(DateTimeFormatter.ofPattern("yyyy-MM"));
        List<FijoPendienteCobro> out = new ArrayList<>();
        for (ServicioFijoCompartido s : servicioFijoRepository.findActivosByPropietario(u)) {
            if (!s.isYoPago()) continue;
            LocalDate fechaCobro = DiaCobroMes.fechaEnPeriodo(periodo, s.getDiaCobro());
            if (fechaCobro.isAfter(hoy)) continue;
            boolean yaCobrado = gastos != null && gastos.stream().anyMatch(g ->
                    !g.isAnulado()
                            && s.getId().equals(g.getServicioFijoId())
                            && periodo.equals(g.getPeriodo()));
            if (yaCobrado) continue;
            out.add(new FijoPendienteCobro(
                    s.getId(),
                    s.getConcepto(),
                    s.getMonto(),
                    s.getDiaCobro(),
                    periodo,
                    fechaCobro));
        }
        out.sort(Comparator.comparing(FijoPendienteCobro::fechaCobro)
                .thenComparing(FijoPendienteCobro::concepto, String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    /**
     * Une porCuenta de todas las personas + tu parte (si entraste al reparto).
     * Incluye total original de deudas abiertas y lo que falta (pendiente de otros).
     */
    static List<CuentaGlobalResumen> agruparCuentasGlobales(
            List<PersonaResumen> filas, List<GastoCompartido> gastos) {
        Map<String, BigDecimal> pendiente = new LinkedHashMap<>();
        Map<String, BigDecimal> anticipo = new LinkedHashMap<>();
        Map<String, List<String>> deudores = new LinkedHashMap<>();
        Map<String, Integer> personas = new LinkedHashMap<>();
        Map<String, BigDecimal> tuParte = new LinkedHashMap<>();
        // Por gasto con alguien debiendo: total = montoTotal del gasto
        Set<Long> gastosAbiertos = new LinkedHashSet<>();
        Map<Long, String> conceptoPorGasto = new LinkedHashMap<>();

        if (gastos != null) {
            List<GastoCompartido> ordenados = new ArrayList<>(gastos);
            ordenados.sort(Comparator
                    .comparing((GastoCompartido g) -> g.getFecha() == null ? LocalDate.MIN : g.getFecha())
                    .thenComparing(g -> g.getId() == null ? 0L : g.getId())
                    .reversed());
            for (GastoCompartido g : ordenados) {
                if (g.isAnulado()) continue;
                String key = g.getConcepto() == null || g.getConcepto().isBlank()
                        ? "Otros"
                        : g.getConcepto().trim();
                if (tuParte.containsKey(key)) continue;
                BigDecimal yo = BigDecimal.ZERO;
                if (g.getPartes() != null) {
                    for (ParteGastoCompartido p : g.getPartes()) {
                        if (p.isEsPrincipal() && p.getMonto() != null) {
                            yo = yo.add(p.getMonto());
                        }
                    }
                }
                if (yo.compareTo(BigDecimal.ZERO) > 0) {
                    tuParte.put(key, yo);
                }
            }
        }

        for (PersonaResumen p : filas) {
            if (p.periodos() != null) {
                for (PeriodoPendiente per : p.periodos()) {
                    if (per.gastoCompartidoId() == null) continue;
                    if (per.pendiente() == null || per.pendiente().compareTo(BigDecimal.ZERO) <= 0) {
                        continue;
                    }
                    Long gid = per.gastoCompartidoId();
                    gastosAbiertos.add(gid);
                    String key = per.concepto() == null || per.concepto().isBlank()
                            ? "Otros"
                            : per.concepto().trim();
                    conceptoPorGasto.putIfAbsent(gid, key);
                }
            }
            if (p.porCuenta() == null) continue;
            for (CuentaPendiente c : p.porCuenta()) {
                String key = c.concepto() == null || c.concepto().isBlank() ? "Otros" : c.concepto().trim();
                BigDecimal pend = c.pendiente() == null ? BigDecimal.ZERO : c.pendiente();
                BigDecimal ant = c.anticipo() == null ? BigDecimal.ZERO : c.anticipo();
                if (pend.compareTo(BigDecimal.ZERO) <= 0 && ant.compareTo(BigDecimal.ZERO) <= 0) {
                    continue;
                }
                pendiente.merge(key, pend, BigDecimal::add);
                anticipo.merge(key, ant, BigDecimal::add);
                if (pend.compareTo(BigDecimal.ZERO) > 0) {
                    personas.merge(key, 1, Integer::sum);
                    deudores.computeIfAbsent(key, k -> new ArrayList<>())
                            .add(p.nombre() + " $" + pend.toPlainString().replace(".00", ""));
                } else {
                    personas.putIfAbsent(key, 0);
                    deudores.computeIfAbsent(key, k -> new ArrayList<>());
                }
            }
        }

        Map<String, BigDecimal> totalPorConcepto = new LinkedHashMap<>();
        for (Long gid : gastosAbiertos) {
            GastoCompartido g = buscarGasto(gastos, gid);
            String key = conceptoPorGasto.getOrDefault(gid, "Otros");
            if (g != null && g.getConcepto() != null && !g.getConcepto().isBlank()) {
                key = g.getConcepto().trim();
            }
            BigDecimal monto = g != null && g.getMontoTotal() != null ? g.getMontoTotal() : BigDecimal.ZERO;
            totalPorConcepto.merge(key, monto, BigDecimal::add);
        }

        Set<String> keys = new LinkedHashSet<>(pendiente.keySet());

        List<CuentaGlobalResumen> out = new ArrayList<>();
        for (String key : keys) {
            List<String> lista = new ArrayList<>(deudores.getOrDefault(key, List.of()));
            int nPers = personas.getOrDefault(key, 0);
            BigDecimal yo = tuParte.get(key);
            if (yo != null && yo.compareTo(BigDecimal.ZERO) > 0) {
                lista.add(0, "Tú $" + yo.toPlainString().replace(".00", ""));
                nPers += 1;
            }
            BigDecimal total = totalPorConcepto.getOrDefault(key, BigDecimal.ZERO);
            if (total.compareTo(BigDecimal.ZERO) <= 0) {
                // Fallback: pendiente de otros + tu parte del último cobro
                total = pendiente.getOrDefault(key, BigDecimal.ZERO)
                        .add(yo == null ? BigDecimal.ZERO : yo);
            }
            out.add(new CuentaGlobalResumen(
                    key,
                    pendiente.getOrDefault(key, BigDecimal.ZERO)
                            .setScale(2, RoundingMode.HALF_UP).setScale(2, RoundingMode.UNNECESSARY),
                    anticipo.getOrDefault(key, BigDecimal.ZERO)
                            .setScale(2, RoundingMode.HALF_UP).setScale(2, RoundingMode.UNNECESSARY),
                    total.setScale(2, RoundingMode.HALF_UP).setScale(2, RoundingMode.UNNECESSARY),
                    nPers,
                    List.copyOf(lista)
            ));
        }
        out.sort(Comparator
                .comparing((CuentaGlobalResumen c) -> c.pendiente(), Comparator.reverseOrder())
                .thenComparing(CuentaGlobalResumen::concepto, String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    /** Gastos compartidos pagados con TDC, agrupados por tarjeta. */
    private List<TdcCargaResumen> agruparCargasTdc(List<GastoCompartido> gastos) {
        Map<Long, BigDecimal> montos = new LinkedHashMap<>();
        Map<Long, Integer> counts = new LinkedHashMap<>();
        Map<Long, LinkedHashSet<String>> conceptos = new LinkedHashMap<>();

        for (GastoCompartido g : gastos) {
            if (g.isAnulado()) continue;
            if (g.getFormaPago() == null || !"TARJETA".equalsIgnoreCase(g.getFormaPago().trim())) continue;
            if (g.getCuentaId() == null) continue;
            Long id = g.getCuentaId();
            BigDecimal m = g.getMontoTotal() == null ? BigDecimal.ZERO : g.getMontoTotal();
            montos.merge(id, m, BigDecimal::add);
            counts.merge(id, 1, Integer::sum);
            String concepto = g.getConcepto() == null || g.getConcepto().isBlank() ? "Gasto" : g.getConcepto().trim();
            conceptos.computeIfAbsent(id, k -> new LinkedHashSet<>()).add(concepto);
        }
        if (montos.isEmpty()) return List.of();

        Map<Long, String> nombres = new LinkedHashMap<>();
        for (Cuenta c : finanzasService.listarCuentas()) {
            if (c.getId() != null) {
                nombres.put(c.getId(), c.getNombre() == null ? ("TDC #" + c.getId()) : c.getNombre());
            }
        }

        List<TdcCargaResumen> out = new ArrayList<>();
        for (Long id : montos.keySet()) {
            out.add(new TdcCargaResumen(
                    id,
                    nombres.getOrDefault(id, "TDC #" + id),
                    montos.get(id),
                    counts.getOrDefault(id, 0),
                    List.copyOf(conceptos.getOrDefault(id, new LinkedHashSet<>()))
            ));
        }
        out.sort(Comparator
                .comparing((TdcCargaResumen t) -> t.monto(), Comparator.reverseOrder())
                .thenComparing(TdcCargaResumen::nombre, String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    static PersonaResumen armarResumenPersona(
            PersonaCompartida p,
            List<MovimientoPersonaCompartida> movs,
            List<GastoCompartido> gastos) {
        List<CompartidoEstadoCuenta.Cargo> cargos = new ArrayList<>();
        List<CompartidoEstadoCuenta.Abono> abonos = new ArrayList<>();
        for (MovimientoPersonaCompartida m : movs) {
            if (m.isAnulado() || m.getPersona() == null || !p.getId().equals(m.getPersona().getId())) {
                continue;
            }
            if (MovimientoPersonaCompartida.ABONO.equals(m.getTipo())) {
                abonos.add(new CompartidoEstadoCuenta.Abono(
                        m.getMonto(),
                        m.getConceptoDestino(),
                        m.isDesdeAnticipo(),
                        m.getFecha()));
            } else if (MovimientoPersonaCompartida.ANTICIPO_OUT.equals(m.getTipo())) {
                // Entrega del a favor en efectivo: resta del pool general
                abonos.add(new CompartidoEstadoCuenta.Abono(
                        m.getMonto() == null ? BigDecimal.ZERO : m.getMonto().negate(),
                        null,
                        false,
                        m.getFecha()));
            } else if (MovimientoPersonaCompartida.DEUDA.equals(m.getTipo())) {
                GastoCompartido g = buscarGasto(gastos, m.getGastoCompartidoId());
                String periodo = g != null && g.getPeriodo() != null && !g.getPeriodo().isBlank()
                        ? g.getPeriodo()
                        : "otros";
                String concepto = g != null ? g.getConcepto() : (m.getConcepto() == null ? "" : m.getConcepto());
                LocalDate fecha = g != null ? g.getFecha() : m.getFecha();
                cargos.add(new CompartidoEstadoCuenta.Cargo(
                        periodo, concepto, fecha, m.getGastoCompartidoId(), m.getMonto()));
            }
        }

        CompartidoEstadoCuenta.Resultado estado = CompartidoEstadoCuenta.calcular(cargos, abonos);
        BigDecimal debe = estado.totalPendiente();
        BigDecimal favor = estado.anticipo();
        return new PersonaResumen(
                p.getId(),
                p.getNombre(),
                p.isActiva(),
                debe,
                favor,
                p.getEfectivoGuardado(),
                estado.periodosPendientes(),
                estado.porCuenta(),
                estado.detalle()
        );
    }

    private static GastoCompartido buscarGasto(List<GastoCompartido> gastos, Long id) {
        if (id == null || gastos == null) return null;
        for (GastoCompartido g : gastos) {
            if (id.equals(g.getId())) return g;
        }
        return null;
    }

    static BigDecimal saldoNeto(Long personaId, List<MovimientoPersonaCompartida> movs) {
        BigDecimal deuda = BigDecimal.ZERO;
        BigDecimal abono = BigDecimal.ZERO;
        for (MovimientoPersonaCompartida m : movs) {
            if (m.isAnulado() || m.getPersona() == null || !personaId.equals(m.getPersona().getId())) {
                continue;
            }
            if (MovimientoPersonaCompartida.DEUDA.equals(m.getTipo())) {
                deuda = deuda.add(m.getMonto());
            } else if (MovimientoPersonaCompartida.ABONO.equals(m.getTipo())) {
                abono = abono.add(m.getMonto());
            }
        }
        return deuda.subtract(abono);
    }

    private static String conceptoConPeriodo(String concepto, String periodo) {
        if (periodo == null || periodo.isBlank()) {
            return concepto;
        }
        return concepto + " · " + periodo;
    }

    private static String normalizarTipo(String raw) {
        String t = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        if (t.equals("SERVICIO") || t.equals("COMPRA")) {
            return t;
        }
        throw new IllegalArgumentException("Tipo inválido (SERVICIO o COMPRA)");
    }

    private static String normalizarNombre(String raw) {
        if (raw == null) return "";
        return raw.trim().replaceAll("\\s+", " ");
    }

    private static String normalizarPeriodo(String raw, LocalDate fecha) {
        if (raw != null && raw.trim().matches("\\d{4}-\\d{2}")) {
            return raw.trim();
        }
        return fecha.format(DateTimeFormatter.ofPattern("yyyy-MM"));
    }

    private static List<Long> dedupeIds(List<Long> ids) {
        if (ids == null) return List.of();
        Set<Long> set = new LinkedHashSet<>();
        for (Long id : ids) {
            if (id != null) set.add(id);
        }
        return new ArrayList<>(set);
    }
}
