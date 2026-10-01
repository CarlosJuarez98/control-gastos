import { Cuenta, Movimiento } from './modelos';

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

/** Un corte del plan a meses (cuota i de N). */
export interface CortePlanMeses {
  indice: number;
  fechaCorte: Date;
  fechaPago: Date;
  etiquetaCorte: string;
}

/**
 * Cortes del estado de cuenta que cubre una compra a N meses:
 * el 1.er corte es el del ciclo de la compra; luego +1 mes cada cuota.
 */
export function cortesPlanMeses(
  cuenta: Pick<Cuenta, 'diaCorte' | 'diaLimitePago' | 'tipo'>,
  fechaCompra: Date | string,
  meses: number,
): CortePlanMeses[] | null {
  const n = Math.floor(Number(meses) || 0);
  if (n <= 1) return null;
  const primero = calendarioCompraTdc(cuenta as Cuenta, fechaCompra);
  if (!primero) return null;

  const out: CortePlanMeses[] = [];
  let anio = primero.fechaCorte.getFullYear();
  let mes = primero.fechaCorte.getMonth();
  for (let i = 0; i < n; i++) {
    const fechaCorte = fechaConDia(anio, mes, primero.diaCorte);
    const fechaPago = fechaDiaDespuesDe(primero.diaLimitePago, fechaCorte);
    out.push({
      indice: i + 1,
      fechaCorte,
      fechaPago,
      etiquetaCorte: formatoFechaCortaEs(fechaCorte),
    });
    mes += 1;
    if (mes > 11) {
      mes = 0;
      anio += 1;
    }
  }
  return out;
}

function mesCortoEs(d: Date): string {
  return d
    .toLocaleDateString('es-MX', { month: 'short' })
    .replace(/\./g, '')
    .trim()
    .toLowerCase();
}

/** Etiqueta corta + detalle de cortes (para pill / title). */
export function etiquetaCortesPlanMeses(
  cuenta: Pick<Cuenta, 'diaCorte' | 'diaLimitePago' | 'tipo'>,
  fechaCompra: Date | string,
  meses: number,
): { corta: string; detalle: string } | null {
  const cortes = cortesPlanMeses(cuenta, fechaCompra, meses);
  if (!cortes?.length) {
    const n = Math.floor(Number(meses) || 0);
    return n > 1 ? { corta: `${n} meses`, detalle: `Plan a ${n} meses` } : null;
  }
  const n = cortes.length;
  const primero = mesCortoEs(cortes[0].fechaCorte);
  const ultimo = mesCortoEs(cortes[n - 1].fechaCorte);
  const rango = primero === ultimo ? primero : `${primero}–${ultimo}`;
  return {
    corta: `${n} cortes · ${rango}`,
    detalle: `Cae en ${n} cortes: ${cortes.map((c) => c.etiquetaCorte).join(' · ')}`,
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

/** Último día de corte ya cerrado (≤ hoy). Null si no hay día de corte. */
export function ultimoCorteCerrado(cuenta: Pick<Cuenta, 'diaCorte'>, hoy = new Date()): Date | null {
  const corte = Number(cuenta.diaCorte);
  if (!Number.isFinite(corte) || corte < 1 || corte > 31) return null;
  const h = aMedianoche(hoy);
  let anio = h.getFullYear();
  let mes = h.getMonth();
  let fecha = fechaConDia(anio, mes, corte);
  if (fecha.getTime() > h.getTime()) {
    mes -= 1;
    if (mes < 0) {
      mes = 11;
      anio -= 1;
    }
    fecha = fechaConDia(anio, mes, corte);
  }
  return fecha;
}

/** Compara solo día calendario (YYYYMMDD), igual que LocalDate en el backend. */
function yyyymmdd(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function yyyymmddDeFechaMov(fecha: string | Date): number | null {
  if (typeof fecha === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha.trim());
    if (m) {
      return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
    }
  }
  const d = typeof fecha === 'string'
    ? aMedianoche(new Date(fecha.length === 10 ? fecha + 'T12:00:00' : fecha))
    : aMedianoche(new Date(fecha));
  if (Number.isNaN(d.getTime())) return null;
  return yyyymmdd(d);
}

/**
 * Próximo corte del ciclo abierto.
 * Compras del día de corte (p. ej. 13) aún entran en ese corte;
 * desde el día siguiente (14) ya es el siguiente ciclo.
 */
export function proximoCorte(cuenta: Pick<Cuenta, 'diaCorte'>, hoy = new Date()): Date | null {
  const corte = Number(cuenta.diaCorte);
  if (!Number.isFinite(corte) || corte < 1 || corte > 31) return null;
  const h = aMedianoche(hoy);
  let anio = h.getFullYear();
  let mes = h.getMonth();
  let fecha = fechaConDia(anio, mes, corte);
  if (h.getDate() > corte) {
    mes += 1;
    if (mes > 11) {
      mes = 0;
      anio += 1;
    }
    fecha = fechaConDia(anio, mes, corte);
  }
  return fecha;
}

/** Nombre de mes en español (octubre, noviembre, …). */
export function mesLargoEs(d: Date): string {
  return d
    .toLocaleDateString('es-MX', { month: 'long' })
    .replace(/\./g, '')
    .trim()
    .toLowerCase();
}

/** Reparte total en N cuotas (misma regla que CuotasPlan del backend). */
export function cuotasDeTotal(total: number, meses: number): number[] {
  const t = Math.round((Number(total) || 0) * 100) / 100;
  const n = Math.floor(Number(meses) || 0);
  if (n <= 1) return [t];
  if (t <= 0) return Array.from({ length: n }, () => 0);
  let regular = Math.round((t / n) * 100) / 100;
  let ultima = Math.round((t - regular * (n - 1)) * 100) / 100;
  if (ultima <= 0) {
    regular = Math.floor((t / n) * 100) / 100;
    ultima = Math.round((t - regular * (n - 1)) * 100) / 100;
  }
  return [...Array.from({ length: n - 1 }, () => regular), ultima];
}

export interface MesCicloTdc {
  etiqueta: string;
  etiquetaCorte: string;
  fechaCorte: Date;
  monto: number;
}

/**
 * Como Mercado Pago / el banco a meses:
 * - Monto del ciclo abierto = deuda de hoy sin cuotas MSI de cortes posteriores
 *   (si no pagaste el corte pasado, ya va incluido ahí).
 * - MSI: cada corte futuro solo su cuota (~total/N).
 * - Día de corte inclusive; el día siguiente ya es otro ciclo.
 */
export function desgloseSaldoTdc(
  cuenta: Cuenta,
  movimientos?: Pick<Movimiento, 'fecha' | 'tipo' | 'monto' | 'meses'>[] | null,
  hoy = new Date(),
): {
  total: number;
  /** Deuda del mes / a pagar ahora (total − MSI futuros). */
  alCorte: number;
  despuesDelCorte: number;
  fechaCorte: Date | null;
  etiquetaCiclo: string;
  futuros: MesCicloTdc[];
} {
  const total = Math.round((Number(cuenta.saldoActual) || 0) * 100) / 100;
  const ciclo = proximoCorte(cuenta, hoy);
  if (!ciclo) {
    return {
      total,
      alCorte: total,
      despuesDelCorte: 0,
      fechaCorte: null,
      etiquetaCiclo: '',
      futuros: [],
    };
  }

  const cicloN = yyyymmdd(ciclo);
  const porFuturo = new Map<number, MesCicloTdc>();

  const acumFuturo = (fecha: Date, monto: number) => {
    if (!(monto > 0)) return;
    const key = yyyymmdd(fecha);
    if (key <= cicloN) return;
    const prev = porFuturo.get(key);
    if (prev) {
      prev.monto = Math.round((prev.monto + monto) * 100) / 100;
      return;
    }
    porFuturo.set(key, {
      etiqueta: mesLargoEs(fecha),
      etiquetaCorte: formatoFechaCortaEs(fecha),
      fechaCorte: fecha,
      monto: Math.round(monto * 100) / 100,
    });
  };

  const desdeMovs = Array.isArray(movimientos) && movimientos.length > 0;
  if (desdeMovs) {
    for (const m of movimientos) {
      const tipo = (m.tipo || '').toUpperCase();
      if (tipo !== 'CARGO' && tipo !== 'INTERES') continue;
      const monto = Number(m.monto) || 0;
      if (!(monto > 0)) continue;
      const meses = Math.floor(Number(m.meses) || 0);
      if (meses > 1) {
        const cortes = cortesPlanMeses(cuenta, m.fecha, meses);
        const cuotas = cuotasDeTotal(monto, meses);
        if (!cortes?.length) continue;
        for (let i = 0; i < cortes.length; i++) {
          acumFuturo(cortes[i].fechaCorte, cuotas[i] || 0);
        }
      } else {
        const cal = calendarioCompraTdc(cuenta, m.fecha);
        if (cal) acumFuturo(cal.fechaCorte, monto);
      }
    }
  } else if (cuenta.saldoAlCorte != null && Number.isFinite(Number(cuenta.saldoAlCorte))) {
    const alCorte = Math.round(Number(cuenta.saldoAlCorte) * 100) / 100;
    const despues = Math.max(
      0,
      Math.round((Number(cuenta.saldoDespuesCorte ?? total - alCorte) || 0) * 100) / 100,
    );
    return {
      total,
      alCorte: Math.min(total, Math.max(0, alCorte)),
      despuesDelCorte: despues,
      fechaCorte: ciclo,
      etiquetaCiclo: mesLargoEs(ciclo),
      futuros: despues > 0.005
        ? [{
            etiqueta: 'Cortes siguientes',
            etiquetaCorte: '',
            fechaCorte: ciclo,
            monto: despues,
          }]
        : [],
    };
  }

  const futuros = [...porFuturo.values()].sort(
    (a, b) => a.fechaCorte.getTime() - b.fechaCorte.getTime(),
  );
  let msiFuturo = 0;
  for (const f of futuros) msiFuturo += f.monto;
  msiFuturo = Math.round(msiFuturo * 100) / 100;
  // Deuda de hoy = todo lo pendiente menos cuotas que caen en cortes posteriores.
  const alCorte = Math.max(0, Math.min(total, Math.round((total - msiFuturo) * 100) / 100));
  return {
    total,
    alCorte,
    despuesDelCorte: Math.round((total - alCorte) * 100) / 100,
    fechaCorte: ciclo,
    etiquetaCiclo: mesLargoEs(ciclo),
    futuros,
  };
}

/** Monto a considerar para “pagar esta quincena”: al corte si hay, si no el saldo. */
export function montoAPagarTdc(cuenta: Cuenta): number {
  if ((cuenta.tipo || '').toUpperCase() === 'TDC' && cuenta.saldoAlCorte != null) {
    return Math.max(0, Number(cuenta.saldoAlCorte) || 0);
  }
  return Math.max(0, Number(cuenta.saldoActual) || 0);
}

/** Crédito libre = límite − deuda. Null si no hay límite capturado. */
export function creditoDisponibleDe(cuenta: Cuenta): number | null {
  if (cuenta.creditoDisponible != null && Number.isFinite(Number(cuenta.creditoDisponible))) {
    return Math.round(Number(cuenta.creditoDisponible) * 100) / 100;
  }
  if (cuenta.limiteCredito == null || cuenta.limiteCredito === undefined) return null;
  return Math.round((Number(cuenta.limiteCredito) - Number(cuenta.saldoActual || 0)) * 100) / 100;
}

export interface RecomendacionTdc extends CalendarioTdc {
  creditoDisponible: number | null;
  cubreMonto: boolean;
}

/**
 * Todas las TDC activas (no bloqueadas), ordenadas por conveniencia:
 * - Con monto > 0 (y sin sobregiro): primero las que cubren con crédito libre.
 * - Dentro de cada grupo: más días hasta el pago, luego más crédito libre.
 * - `permitirSobregiro`: no filtra ni prioriza por límite (disposiciones).
 * - Sin calendario de corte/pago van al final.
 */
export function recomendarTdcs(
  cuentas: Cuenta[],
  fechaCompra: Date | string,
  monto = 0,
  max = Number.POSITIVE_INFINITY,
  opts?: { permitirSobregiro?: boolean },
): RecomendacionTdc[] {
  const permitirSobregiro = !!opts?.permitirSobregiro;
  const montoOk = !permitirSobregiro && Number.isFinite(monto) && monto > 0;
  const conCal: RecomendacionTdc[] = [];
  const sinCal: RecomendacionTdc[] = [];
  for (const c of cuentas) {
    if ((c.tipo || '').toUpperCase() !== 'TDC' || c.bloqueada) continue;
    const disponible = creditoDisponibleDe(c);
    // Sin límite capturado o sobregiro permitido: no descartar.
    const cubre =
      permitirSobregiro ||
      !montoOk ||
      disponible == null ||
      disponible + 1e-9 >= monto;
    const cal = calendarioCompraTdc(c, fechaCompra);
    if (!cal) {
      sinCal.push({
        cuenta: c,
        diaCorte: Number(c.diaCorte) || 0,
        diaLimitePago: Number(c.diaLimitePago) || 0,
        fechaCorte: aMedianoche(new Date()),
        fechaPago: aMedianoche(new Date()),
        diasHastaPago: -1,
        quincenaPago: 'despues',
        etiquetaQuincenaPago: 'Sin corte / pago capturado',
        etiquetaPagoCorta: '—',
        creditoDisponible: disponible,
        cubreMonto: cubre,
      });
      continue;
    }
    conCal.push({ ...cal, creditoDisponible: disponible, cubreMonto: cubre });
  }
  const porConveniencia = (a: RecomendacionTdc, b: RecomendacionTdc) => {
    if (montoOk) {
      const ca = a.cubreMonto ? 1 : 0;
      const cb = b.cubreMonto ? 1 : 0;
      if (cb !== ca) return cb - ca;
    }
    return (
      b.diasHastaPago - a.diasHastaPago ||
      (b.creditoDisponible ?? -Infinity) - (a.creditoDisponible ?? -Infinity) ||
      (a.cuenta.nombre || '').localeCompare(b.cuenta.nombre || '', 'es')
    );
  };
  conCal.sort(porConveniencia);
  sinCal.sort(porConveniencia);
  const cals = conCal.concat(sinCal);
  if (!Number.isFinite(max)) return cals;
  return cals.slice(0, Math.max(0, max));
}

/** Mejor TDC para comprar en `fecha`: más días hasta el pago del ciclo. */
export function recomendarTdc(cuentas: Cuenta[], fechaCompra: Date | string): CalendarioTdc | null {
  return recomendarTdcs(cuentas, fechaCompra, 0, 1)[0] ?? null;
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
