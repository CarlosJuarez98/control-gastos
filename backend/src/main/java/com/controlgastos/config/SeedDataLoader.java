package com.controlgastos.config;

import com.controlgastos.modelo.*;
import com.controlgastos.repositorio.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

@Component
public class SeedDataLoader implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SeedDataLoader.class);

    private final IngresoRepository ingresoRepository;
    private final GastoRepository gastoRepository;
    private final GastoMensualRepository gastoMensualRepository;
    private final CuentaRepository cuentaRepository;
    private final MovimientoCuentaRepository movimientoRepository;
    private final SaldoSnapshotRepository saldoRepository;
    private final DenominacionEfectivoRepository denominacionRepository;
    private final ObjectMapper objectMapper;

    @Value("${controlgastos.seed.enabled:true}")
    private boolean seedEnabled;

    public SeedDataLoader(
            IngresoRepository ingresoRepository,
            GastoRepository gastoRepository,
            GastoMensualRepository gastoMensualRepository,
            CuentaRepository cuentaRepository,
            MovimientoCuentaRepository movimientoRepository,
            SaldoSnapshotRepository saldoRepository,
            DenominacionEfectivoRepository denominacionRepository,
            ObjectMapper objectMapper) {
        this.ingresoRepository = ingresoRepository;
        this.gastoRepository = gastoRepository;
        this.gastoMensualRepository = gastoMensualRepository;
        this.cuentaRepository = cuentaRepository;
        this.movimientoRepository = movimientoRepository;
        this.saldoRepository = saldoRepository;
        this.denominacionRepository = denominacionRepository;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) throws Exception {
        if (!seedEnabled) {
            log.info("Importación de Excel desactivada (controlgastos.seed.enabled=false)");
            return;
        }
        if (ingresoRepository.count() > 0 || gastoRepository.count() > 0) {
            log.info("Ya hay datos en Oracle; se omite la importación del Excel");
            return;
        }

        ClassPathResource resource = new ClassPathResource("seed-data.json");
        if (!resource.exists()) {
            log.warn("No se encontró seed-data.json en el classpath");
            return;
        }

        JsonNode root = objectMapper.readTree(resource.getInputStream());
        int gm = 0, ing = 0, gas = 0, cue = 0, mov = 0;

        for (JsonNode n : root.path("gastosMensuales")) {
            GastoMensual g = new GastoMensual();
            g.setMotivo(text(n, "motivo"));
            g.setMonto(money(n, "monto"));
            g.setActivo(true);
            gastoMensualRepository.save(g);
            gm++;
        }

        for (JsonNode n : root.path("ingresos")) {
            Ingreso i = new Ingreso();
            i.setFecha(date(n, "fecha"));
            i.setConcepto(text(n, "concepto"));
            i.setMonto(money(n, "monto"));
            if (i.getFecha() != null && i.getConcepto() != null) {
                ingresoRepository.save(i);
                ing++;
            }
        }

        for (JsonNode n : root.path("gastos")) {
            Gasto g = new Gasto();
            g.setFecha(date(n, "fecha"));
            g.setCategoria(text(n, "categoria"));
            g.setMonto(money(n, "monto"));
            g.setMotivo(text(n, "motivo"));
            if (g.getFecha() != null && g.getCategoria() != null) {
                gastoRepository.save(g);
                gas++;
            }
        }

        Map<String, Cuenta> cuentas = new HashMap<>();
        for (JsonNode n : root.path("cuentas")) {
            Cuenta c = new Cuenta();
            c.setNombre(text(n, "nombre"));
            c.setTipo(text(n, "tipo"));
            c.setSaldoActual(money(n, "saldoActual"));
            if (n.hasNonNull("lineaCredito")) {
                c.setLineaCredito(money(n, "lineaCredito"));
            }
            cuentaRepository.save(c);
            cuentas.put(c.getNombre(), c);
            cue++;
        }

        for (JsonNode n : root.path("movimientos")) {
            String nombre = text(n, "cuenta");
            Cuenta c = cuentas.get(nombre);
            if (c == null) {
                c = cuentaRepository.findByNombreIgnoreCase(nombre).orElse(null);
            }
            if (c == null) continue;
            MovimientoCuenta m = new MovimientoCuenta();
            m.setCuenta(c);
            m.setFecha(date(n, "fecha"));
            m.setTipo(text(n, "tipo"));
            m.setMonto(money(n, "monto"));
            m.setConcepto(text(n, "concepto"));
            if (m.getFecha() != null) {
                movimientoRepository.save(m);
                mov++;
            }
        }

        JsonNode saldoNode = root.path("saldo");
        if (!saldoNode.isMissingNode() && !saldoNode.isNull()) {
            SaldoSnapshot s = new SaldoSnapshot();
            s.setFecha(date(saldoNode, "fecha"));
            s.setSaldoTotal(money(saldoNode, "saldoTotal"));
            s.setTotalFisico(nullableMoney(saldoNode, "totalFisico"));
            s.setDineroTarjeta(nullableMoney(saldoNode, "dineroTarjeta"));
            s.setDineroBbva(nullableMoney(saldoNode, "dineroBbva"));
            s.setDineroMercadoLibre(nullableMoney(saldoNode, "dineroMercadoLibre"));
            s.setDineroNu(nullableMoney(saldoNode, "dineroNu"));
            s.setDineroDidi(nullableMoney(saldoNode, "dineroDidi"));
            JsonNode deuda = root.path("deudaTotal");
            if (!deuda.isMissingNode() && deuda.has("monto")) {
                s.setDeudaTotal(money(deuda, "monto"));
            }
            if (s.getFecha() == null) s.setFecha(LocalDate.now());
            saldoRepository.save(s);
        }

        for (JsonNode n : root.path("denominaciones")) {
            DenominacionEfectivo d = new DenominacionEfectivo();
            d.setValor(money(n, "valor"));
            d.setCantidad(n.path("cantidad").asInt(0));
            denominacionRepository.save(d);
        }

        log.info("Excel importado: {} gastos mensuales, {} ingresos, {} gastos, {} cuentas, {} movimientos",
                gm, ing, gas, cue, mov);
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.path(field);
        if (v.isMissingNode() || v.isNull()) return null;
        String s = v.asText();
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static LocalDate date(JsonNode n, String field) {
        String s = text(n, field);
        return s == null ? null : LocalDate.parse(s);
    }

    private static BigDecimal money(JsonNode n, String field) {
        JsonNode v = n.path(field);
        if (v.isMissingNode() || v.isNull()) return BigDecimal.ZERO;
        return BigDecimal.valueOf(v.asDouble());
    }

    private static BigDecimal nullableMoney(JsonNode n, String field) {
        JsonNode v = n.path(field);
        if (v.isMissingNode() || v.isNull()) return null;
        return BigDecimal.valueOf(v.asDouble());
    }
}
