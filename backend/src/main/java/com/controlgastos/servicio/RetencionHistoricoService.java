package com.controlgastos.servicio;

import java.time.LocalDate;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

/**
 * Borra historial operativo con más de N años.
 * No toca: usuarios, cuentas (ni su saldo actual), gastos mensuales fijos ni denominaciones.
 * Conserva el último corte de saldo de cada propietario como ancla del “debería tener”.
 */
@Service
public class RetencionHistoricoService {

    private static final Logger log = LoggerFactory.getLogger(RetencionHistoricoService.class);

    @PersistenceContext
    private EntityManager entityManager;

    @Value("${app.retencion.enabled:true}")
    private boolean enabled;

    @Value("${app.retencion.anos:1}")
    private int anos;

    /** Diario 03:30 — configurable con app.retencion.cron */
    @Scheduled(cron = "${app.retencion.cron:0 30 3 * * *}")
    public void ejecutarProgramado() {
        if (!enabled) {
            log.debug("Retención histórica desactivada (app.retencion.enabled=false)");
            return;
        }
        Resultado r = ejecutar();
        log.info(
                "Retención histórica: corte={}, ingresos={}, gastos={}, movimientos={}, saldos={}",
                r.corte(), r.ingresos(), r.gastos(), r.movimientos(), r.saldos());
    }

    @Transactional
    public Resultado ejecutar() {
        int years = Math.max(1, anos);
        LocalDate corte = LocalDate.now().minusYears(years);

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

        // IDs del último corte por propietario (se conservan aunque sean viejos)
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

        return new Resultado(corte, ingresos, gastos, movimientos, saldos);
    }

    public record Resultado(LocalDate corte, int ingresos, int gastos, int movimientos, int saldos) {}
}
