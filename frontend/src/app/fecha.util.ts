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
