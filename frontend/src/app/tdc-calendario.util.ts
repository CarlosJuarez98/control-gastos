import { Cuenta } from './modelos';

export type QuincenaPago = 'esta' | 'siguiente' | 'despues';

export interface CalendarioTdc {
  cuenta: Cuenta;
  diaCorte: number;
  diaLimitePago: number;
  /** Corte del ciclo al que cae una compra en `fechaCompra`. */
  fechaCorte: Date;
  /** Fecha límite de pago de ese ciclo. */
  fechaPago: Date;
  /** Días desde la compra hasta el pago. */
  diasHastaPago: number;
  quincenaPago: QuincenaPago;
  etiquetaQuincenaPago: string;
  etiquetaPagoCorta: string;
}

function aMedianoche(d: Date): Date {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x;
}

function diasEnMes(anio: number, mes0: number): number {
  return new Date(anio, mes0 + 1, 0).getDate();
}

/** Fecha en anio/mes0 con día (ajusta 31→último día del mes). */
export function fechaConDia(anio: number, mes0: number, dia: number): Date {
  const d = Math.min(Math.max(1, dia), diasEnMes(anio, mes0));
  return aMedianoche(new Date(anio, mes0, d));
}

/** Primera ocurrencia de `dia` en o después de `desde` (inclusive). */
export function proximaFechaDia(dia: number, desde: Date): Date {
  const base = aMedianoche(desde);
  let anio = base.getFullYear();
  let mes = base.getMonth();
  let cand = fechaConDia(anio, mes, dia);
  if (cand.getTime() < base.getTime()) {
    mes += 1;
    if (mes > 11) {
      mes = 0;
      anio += 1;
    }
    cand = fechaConDia(anio, mes, dia);
  }
  return cand;
}

/** Primera ocurrencia de `dia` estrictamente después de `despuesDe`. */
export function fechaDiaDespuesDe(dia: number, despuesDe: Date): Date {
  const next = new Date(despuesDe);
  next.setDate(next.getDate() + 1);
  return proximaFechaDia(dia, next);
}

export function claveQuincenaDe(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = d.getDate();
  return `${y}-${m}-Q${day <= 15 ? 1 : 2}`;
}

export function etiquetaQuincenaClave(clave: string): string {
  const m = /^(\d{4})-(\d{2})-Q([12])$/.exec(clave);
  if (!m) return clave;
  const nombres = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];
  const anio = Number(m[1]);
  const mesNum = Number(m[2]);
  const q = m[3];
  const nombreMes = nombres[mesNum - 1] || m[2];
  return q === '1'
    ? `1ª quincena · ${nombreMes} ${anio}`
    : `2ª quincena · ${nombreMes} ${anio}`;
}

export function formatoFechaCortaEs(d: Date): string {
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

/** TDC, tiendas, préstamos y terrenos con fecha de pago. */
export function esCuentaConCalendario(cuenta: Pick<Cuenta, 'tipo'> | null | undefined): boolean {
  const t = (cuenta?.tipo || '').toUpperCase();
  return t === 'TDC' || t === 'TIENDA' || t === 'PRESTAMO' || t === 'TERRENO';
}

function clasificarQuincenaPago(fechaPago: Date, hoy: Date): {
  quincenaPago: QuincenaPago;
  etiquetaQuincenaPago: string;
} {
  const h = aMedianoche(hoy);
  const claveHoy = claveQuincenaDe(h);
  const clavePago = claveQuincenaDe(fechaPago);
  if (clavePago === claveHoy) {
    return {
      quincenaPago: 'esta',
      etiquetaQuincenaPago: `Esta quincena te toca (${formatoFechaCortaEs(fechaPago)})`,
    };
  }
  const finQ =
    h.getDate() <= 15
      ? fechaConDia(h.getFullYear(), h.getMonth(), 15)
      : fechaConDia(h.getFullYear(), h.getMonth(), diasEnMes(h.getFullYear(), h.getMonth()));
  const inicioSig = new Date(finQ);
  inicioSig.setDate(finQ.getDate() + 1);
  inicioSig.setHours(12, 0, 0, 0);
  if (clavePago === claveQuincenaDe(inicioSig)) {
    return {
      quincenaPago: 'siguiente',
      etiquetaQuincenaPago: `En la otra quincena (${formatoFechaCortaEs(fechaPago)})`,
    };
  }
  return {
    quincenaPago: 'despues',
    etiquetaQuincenaPago: `Después · ${formatoFechaCortaEs(fechaPago)}`,
  };
}

/**
 * Ciclo de una compra en `fechaCompra`:
 * - Si el día &gt; corte → cae en el siguiente corte.
 * - El pago es el primer día límite estrictamente después del corte.
 */
export function calendarioCompraTdc(
  cuenta: Cuenta,
  fechaCompra: Date | string,
): CalendarioTdc | null {
  const corte = Number(cuenta.diaCorte);
  const pago = Number(cuenta.diaLimitePago);
  if (!Number.isFinite(corte) || corte < 1 || corte > 31) return null;
  if (!Number.isFinite(pago) || pago < 1 || pago > 31) return null;

  const compra = typeof fechaCompra === 'string'
    ? aMedianoche(new Date(fechaCompra + (fechaCompra.length === 10 ? 'T12:00:00' : '')))
    : aMedianoche(fechaCompra);
  if (Number.isNaN(compra.getTime())) return null;

  let anio = compra.getFullYear();
  let mes = compra.getMonth();
  let fechaCorte = fechaConDia(anio, mes, corte);
  if (compra.getDate() > corte) {
    mes += 1;
    if (mes > 11) {
      mes = 0;
      anio += 1;
    }
    fechaCorte = fechaConDia(anio, mes, corte);
  }

  const fechaPago = fechaDiaDespuesDe(pago, fechaCorte);
  const msDia = 24 * 60 * 60 * 1000;
  const diasHastaPago = Math.max(0, Math.round((fechaPago.getTime() - compra.getTime()) / msDia));
  const { quincenaPago, etiquetaQuincenaPago } = (() => {
    const claveHoy = claveQuincenaDe(new Date());
    const clavePago = claveQuincenaDe(fechaPago);
    if (clavePago === claveHoy) {
      return {
        quincenaPago: 'esta' as QuincenaPago,
        etiquetaQuincenaPago: `Esta quincena te toca pagar (${formatoFechaCortaEs(fechaPago)})`,
      };
    }
    const hoy = aMedianoche(new Date());
    let finQ: Date;
    if (hoy.getDate() <= 15) {
      finQ = fechaConDia(hoy.getFullYear(), hoy.getMonth(), 15);
    } else {
      finQ = fechaConDia(hoy.getFullYear(), hoy.getMonth(), diasEnMes(hoy.getFullYear(), hoy.getMonth()));
    }
    const inicioSiguiente = new Date(finQ);
    inicioSiguiente.setDate(finQ.getDate() + 1);
    inicioSiguiente.setHours(12, 0, 0, 0);
    if (clavePago === claveQuincenaDe(inicioSiguiente)) {
      return {
        quincenaPago: 'siguiente' as QuincenaPago,
        etiquetaQuincenaPago: `En la otra quincena (${formatoFechaCortaEs(fechaPago)})`,
      };
    }
    return {
      quincenaPago: 'despues' as QuincenaPago,
      etiquetaQuincenaPago: `Después · ${etiquetaQuincenaClave(clavePago)} (${formatoFechaCortaEs(fechaPago)})`,
    };
  })();

  return {
    cuenta,
    diaCorte: corte,
    diaLimitePago: pago,
    fechaCorte,
    fechaPago,
    diasHastaPago,
    quincenaPago,
    etiquetaQuincenaPago,
    etiquetaPagoCorta: formatoFechaCortaEs(fechaPago),
  };
}

/**
 * Próximo pago pendiente.
 * - Con corte + pago: ciclo de tarjeta/tienda.
 * - Solo pago o solo corte: siguiente ocurrencia de ese día.
 */
export function proximoPagoPendiente(cuenta: Cuenta, hoy = new Date()): CalendarioTdc | null {
  const corteRaw = Number(cuenta.diaCorte);
  const pagoRaw = Number(cuenta.diaLimitePago);
  const tieneCorte = Number.isFinite(corteRaw) && corteRaw >= 1 && corteRaw <= 31;
  const tienePago = Number.isFinite(pagoRaw) && pagoRaw >= 1 && pagoRaw <= 31;
  if (!tieneCorte && !tienePago) return null;

  const h = aMedianoche(hoy);
  const msDia = 24 * 60 * 60 * 1000;

  // Solo un día (pago o corte): próxima fecha de ese día.
  if (!tieneCorte || !tienePago) {
    const dia = tienePago ? pagoRaw : corteRaw;
    const fechaPago = proximaFechaDia(dia, h);
    const diasHastaPago = Math.max(0, Math.round((fechaPago.getTime() - h.getTime()) / msDia));
    const q = clasificarQuincenaPago(fechaPago, h);
    return {
      cuenta,
      diaCorte: tieneCorte ? corteRaw : dia,
      diaLimitePago: tienePago ? pagoRaw : dia,
      fechaCorte: fechaPago,
      fechaPago,
      diasHastaPago,
      ...q,
      etiquetaPagoCorta: formatoFechaCortaEs(fechaPago),
    };
  }

  const corte = corteRaw;
  const pago = pagoRaw;
  let anio = h.getFullYear();
  let mes = h.getMonth();
  let ultimoCorte = fechaConDia(anio, mes, corte);
  if (ultimoCorte.getTime() > h.getTime()) {
    mes -= 1;
    if (mes < 0) {
      mes = 11;
      anio -= 1;
    }
    ultimoCorte = fechaConDia(anio, mes, corte);
  }
  let fechaPago = fechaDiaDespuesDe(pago, ultimoCorte);
  let fechaCorte = ultimoCorte;
  if (fechaPago.getTime() < h.getTime()) {
    let nAnio = ultimoCorte.getFullYear();
    let nMes = ultimoCorte.getMonth() + 1;
    if (nMes > 11) {
      nMes = 0;
      nAnio += 1;
    }
    fechaCorte = fechaConDia(nAnio, nMes, corte);
    fechaPago = fechaDiaDespuesDe(pago, fechaCorte);
  }

  const diasHastaPago = Math.max(0, Math.round((fechaPago.getTime() - h.getTime()) / msDia));
  const q = clasificarQuincenaPago(fechaPago, h);

  return {
    cuenta,
    diaCorte: corte,
    diaLimitePago: pago,
    fechaCorte,
    fechaPago,
    diasHastaPago,
    ...q,
    etiquetaPagoCorta: formatoFechaCortaEs(fechaPago),
  };
}

/** Mejor TDC para comprar en `fecha`: más días hasta el pago del ciclo. */
export function recomendarTdc(cuentas: Cuenta[], fechaCompra: Date | string): CalendarioTdc | null {
  const cals = cuentas
    .filter((c) => (c.tipo || '').toUpperCase() === 'TDC')
    .map((c) => calendarioCompraTdc(c, fechaCompra))
    .filter((c): c is CalendarioTdc => !!c);
  if (!cals.length) return null;
  cals.sort(
    (a, b) =>
      b.diasHastaPago - a.diasHastaPago ||
      (a.cuenta.nombre || '').localeCompare(b.cuenta.nombre || '', 'es'),
  );
  return cals[0];
}

export function pagosPorQuincena(cuentas: Cuenta[], hoy = new Date()): {
  esta: CalendarioTdc[];
  siguiente: CalendarioTdc[];
  despues: CalendarioTdc[];
} {
  const esta: CalendarioTdc[] = [];
  const siguiente: CalendarioTdc[] = [];
  const despues: CalendarioTdc[] = [];
  for (const c of cuentas) {
    if (!esCuentaConCalendario(c)) continue;
    if (!(Number(c.saldoActual) > 0)) continue;
    const vigente = proximoPagoPendiente(c, hoy);
    if (!vigente) continue;
    if (vigente.quincenaPago === 'esta') esta.push(vigente);
    else if (vigente.quincenaPago === 'siguiente') siguiente.push(vigente);
    else despues.push(vigente);
  }
  const byPago = (a: CalendarioTdc, b: CalendarioTdc) => a.fechaPago.getTime() - b.fechaPago.getTime();
  esta.sort(byPago);
  siguiente.sort(byPago);
  despues.sort(byPago);
  return { esta, siguiente, despues };
}
