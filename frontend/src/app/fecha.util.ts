import { Pipe, PipeTransform } from '@angular/core';

const MESES_CORTO = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const;

/** Fecha local de hoy en formato input date: 2026-09-09 */
export function fechaHoyLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Periodo actual yyyy-MM para input type=month */
export function periodoActual(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Fecha de cobro en un periodo: si el mes no tiene ese día (31, feb 29/30),
 * usa el último día del mes (un día antes / el máximo válido).
 */
export function fechaCobroEnPeriodo(
  periodoYyyyMm: string,
  diaCobro: number | null | undefined,
  noFuturo = true
): string {
  const dia = Math.max(1, Math.min(31, Math.round(Number(diaCobro) || 1)));
  const m = /^(\d{4})-(\d{2})$/.exec((periodoYyyyMm || '').trim());
  const y = m ? Number(m[1]) : new Date().getFullYear();
  const mo = m ? Number(m[2]) : new Date().getMonth() + 1;
  const max = new Date(y, mo, 0).getDate(); // último día del mes
  const d = Math.min(dia, max);
  let out = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (noFuturo) {
    const hoy = fechaHoyLocal();
    if (out > hoy) out = hoy;
  }
  return out;
}

/** Siguiente mes tras un periodo yyyy-MM; si no hay, periodo actual. */
export function siguientePeriodo(periodo: string | null | undefined): string {
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
    return periodoActual();
  }
  const [ys, ms] = periodo.split('-').map(Number);
  const d = new Date(ys, ms - 1 + 1, 1);
  return periodoActual(d);
}

/** Formato fijo: 08-sep-2026 */
export function formatFechaCorta(valor: string | Date | null | undefined): string {
  if (valor == null || valor === '') return '';

  let y: number;
  let m: number;
  let d: number;

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return '';
    y = valor.getFullYear();
    m = valor.getMonth() + 1;
    d = valor.getDate();
  } else {
    const f = String(valor).slice(0, 10);
    const parts = f.split('-').map(Number);
    if (parts.length < 3 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
      return String(valor);
    }
    [y, m, d] = parts;
  }

  const mes = MESES_CORTO[m - 1];
  if (!mes) return String(valor);
  return `${String(d).padStart(2, '0')}-${mes}-${y}`;
}

@Pipe({ name: 'fechaCorta', standalone: true })
export class FechaCortaPipe implements PipeTransform {
  transform(valor: string | Date | null | undefined): string {
    return formatFechaCorta(valor);
  }
}
