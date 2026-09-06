package com.controlgastos.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record ResumenResponse(
        BigDecimal totalIngresos,
        BigDecimal totalGastos,
        BigDecimal balance,
        BigDecimal gastosMensuales,
        BigDecimal deudaTotal,
        BigDecimal saldoDisponible,
        BigDecimal totalFisico,
        List<Map<String, Object>> gastosPorCategoria,
        List<Map<String, Object>> topCuentas
) {}
