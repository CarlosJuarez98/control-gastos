package com.controlgastos.servicio;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Lazy;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.controlgastos.modelo.HistorialAnual;
import com.controlgastos.repositorio.HistorialAnualRepository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

/**
 * Al iniciar cada año (1 ene) archiva totales de años anteriores en
 * {@code CG_HISTORIAL_ANUAL} y borra ese detalle operativo.
 * Conserva solo el detalle del año en curso (o de los N años configurados).
 * No toca: usuarios, cuentas, mensuales fijos ni denominaciones.
 * Conserva el último corte de saldo de cada propietario.
 */
@Service
public class RetencionHistoricoService {

    private static final Logger log = LoggerFactory.getLogger(RetencionHistoricoService.class);

    @PersistenceContext
    private EntityManager entityManager;

    private final HistorialAnualRepository historialAnualRepository;
    private final RetencionHistoricoService self;

    @Value("${app.retencion.enabled:true}")
    private boolean enabled;

    /** Años de detalle a conservar (1 = solo el año calendario actual). */
    @Value("${app.retencion.anos:1}")
    private int anos;

    /** Si true, al arrancar recupera años viejos si se perdió el 1 de enero. */
    @Value("${app.retencion.alcance-al-arrancar:true}")
    private boolean alcanceAlArrancar;

    public RetencionHistoricoService(
            HistorialAnualRepository historialAnualRepository,
            @Lazy RetencionHistoricoService self) {
        this.historialAnualRepository = historialAnualRepository;
        this.self = self;
    }

    /** 1 de enero 03:30 — configurable con app.retencion.cron */
    @Scheduled(cron = "${app.retencion.cron:0 30 3 1 1 *}")
    public void ejecutarProgramado() {
        if (!enabled) {
            log.debug("Retención histórica desactivada (app.retencion.enabled=false)");
            return;
        }
        Resultado r = self.ejecutar();
        log.info(
                "Retención de año nuevo: corte={}, añosArchivados={}, ingresos={}, gastos={}, movimientos={}, saldos={}",
                r.corte(), r.aniosArchivados(), r.ingresos(), r.gastos(), r.movimientos(), r.saldos());
    }

    /** Si la app no corrió el 1 ene, limpia años anteriores en el primer arranque. */
    @EventListener(ApplicationReadyEvent.class)
    public void alcanceSiHaceFalta() {
        if (!enabled || !alcanceAlArrancar) {
            return;
        }
        LocalDate corte = calcularCorte();
        if (!hayDetalleAntesDe(corte)) {
            return;
        }
        log.info("Retención: hay detalle anterior a {}; archivando y limpiando (alcance al arrancar)", corte);
        Resultado r = self.ejecutar();
        log.info(
                "Retención (arranque): corte={}, añosArchivados={}, ingresos={}, gastos={}, movimientos={}, saldos={}",
                r.corte(), r.aniosArchivados(), r.ingresos(), r.gastos(), r.movimientos(), r.saldos());
    }

    @Transactional
    public Resultado ejecutar() {
        LocalDate corte = calcularCorte();

        int aniosArchivados = archivarAniosAntesDe(corte);

        // Desligar gastos → movimiento antes de borrar movimientos viejos
        entityManager.createQuery(
                        "update Gasto g set g.movimientoId = null "
                                + "where g.movimientoId is not null and exists ("
                                + "  select 1 from MovimientoCuenta m "
                                + "  where m.id = g.movimientoId and m.fecha < :corte)")
                .setParameter("corte", corte)
                .executeUpdate();

        entityManager.createQuery(
                        "update Gasto g set g.movimientoId = null where g.fecha < :corte and g.movimientoId is not null")
                .setParameter("corte", corte)
                .executeUpdate();

        int movimientos = entityManager.createQuery(
                        "delete from MovimientoCuenta m where m.fecha < :corte")
                .setParameter("corte", corte)
                .executeUpdate();

        int gastos = entityManager.createQuery(
                        "delete from Gasto g where g.fecha < :corte")
                .setParameter("corte", corte)
                .executeUpdate();

        int ingresos = entityManager.createQuery(
                        "delete from Ingreso i where i.fecha < :corte")
                .setParameter("corte", corte)
                .executeUpdate();

        @SuppressWarnings("unchecked")
        List<Long> conservar = entityManager.createQuery(
                        "select s.id from SaldoSnapshot s "
                                + "where s.id in ("
                                + "  select max(s2.id) from SaldoSnapshot s2 "
                                + "  group by s2.propietario"
                                + ")")
                .getResultList();

        int saldos;
        if (conservar == null || conservar.isEmpty()) {
            saldos = entityManager.createQuery(
                            "delete from SaldoSnapshot s where s.fecha < :corte")
                    .setParameter("corte", corte)
                    .executeUpdate();
        } else {
            saldos = entityManager.createQuery(
                            "delete from SaldoSnapshot s where s.fecha < :corte and s.id not in :ids")
                    .setParameter("corte", corte)
                    .setParameter("ids", conservar)
                    .executeUpdate();
        }

        return new Resultado(corte, aniosArchivados, ingresos, gastos, movimientos, saldos);
    }

    /**
     * Con anos=1 conserva solo el año calendario actual (corte = 1 ene de este año).
     * Con anos=2 conserva año actual + anterior, etc.
     */
    LocalDate calcularCorte() {
        int keep = Math.max(1, anos);
        int anioInicio = LocalDate.now().getYear() - (keep - 1);
        return LocalDate.of(anioInicio, 1, 1);
    }

    private boolean hayDetalleAntesDe(LocalDate corte) {
        Number nIng = (Number) entityManager.createQuery(
                        "select count(i) from Ingreso i where i.fecha < :corte")
                .setParameter("corte", corte)
                .getSingleResult();
        if (nIng != null && nIng.longValue() > 0) {
            return true;
        }
        Number nGas = (Number) entityManager.createQuery(
                        "select count(g) from Gasto g where g.fecha < :corte")
                .setParameter("corte", corte)
                .getSingleResult();
        return nGas != null && nGas.longValue() > 0;
    }

    /**
     * Suma ingresos/gastos con fecha &lt; corte y los acumula en historial anual
     * (por propietario + año). Así un año partido en dos corridas no se pierde.
     */
    private int archivarAniosAntesDe(LocalDate corte) {
        Map<String, BigDecimal> ingresos = sumarPorPropAnio(
                "SELECT PROPIETARIO, EXTRACT(YEAR FROM FECHA), NVL(SUM(MONTO),0) "
                        + "FROM CG_INGRESO WHERE FECHA < :corte "
                        + "GROUP BY PROPIETARIO, EXTRACT(YEAR FROM FECHA)",
                corte);
        Map<String, BigDecimal> gastos = sumarPorPropAnio(
                "SELECT PROPIETARIO, EXTRACT(YEAR FROM FECHA), NVL(SUM(MONTO),0) "
                        + "FROM CG_GASTO WHERE FECHA < :corte "
                        + "GROUP BY PROPIETARIO, EXTRACT(YEAR FROM FECHA)",
                corte);

        java.util.Set<String> claves = new java.util.HashSet<>();
        claves.addAll(ingresos.keySet());
        claves.addAll(gastos.keySet());
        int touch = 0;
        for (String clave : claves) {
            String[] p = clave.split("\\|", 2);
            String prop = p[0];
            int anio = Integer.parseInt(p[1]);
            BigDecimal ing = ingresos.getOrDefault(clave, BigDecimal.ZERO);
            BigDecimal gas = gastos.getOrDefault(clave, BigDecimal.ZERO);
            if (ing.signum() == 0 && gas.signum() == 0) {
                continue;
            }
            HistorialAnual h = historialAnualRepository.findByPropietarioAndAnio(prop, anio)
                    .orElseGet(() -> {
                        HistorialAnual n = new HistorialAnual();
                        n.setPropietario(prop);
                        n.setAnio(anio);
                        n.setTotalIngresos(BigDecimal.ZERO);
                        n.setTotalGastos(BigDecimal.ZERO);
                        return n;
                    });
            h.setTotalIngresos(nz(h.getTotalIngresos()).add(ing));
            h.setTotalGastos(nz(h.getTotalGastos()).add(gas));
            historialAnualRepository.save(h);
            touch++;
        }
        return touch;
    }

    @SuppressWarnings("unchecked")
    private Map<String, BigDecimal> sumarPorPropAnio(String sql, LocalDate corte) {
        List<Object[]> rows = entityManager.createNativeQuery(sql)
                .setParameter("corte", corte)
                .getResultList();
        Map<String, BigDecimal> out = new HashMap<>();
        for (Object[] r : rows) {
            if (r[0] == null || r[1] == null) {
                continue;
            }
            String prop = String.valueOf(r[0]);
            int anio = ((Number) r[1]).intValue();
            BigDecimal monto = r[2] == null ? BigDecimal.ZERO : new BigDecimal(r[2].toString());
            out.put(prop + "|" + anio, monto);
        }
        return out;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    public record Resultado(
            LocalDate corte,
            int aniosArchivados,
            int ingresos,
            int gastos,
            int movimientos,
            int saldos) {}
}
