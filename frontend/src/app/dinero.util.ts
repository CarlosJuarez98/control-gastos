/**
 * Formato de montos al escribir: 1234.5 → 1,234.5
 * Parseo: quita comas antes de Number().
 */

export function parseDinero(texto: string | number | null | undefined): number {
  if (typeof texto === 'number') {
    return Number.isFinite(texto) ? texto : 0;
  }
  const t = String(texto ?? '')
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '');
  if (!t || t === '.') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** Reformatea lo que escribe el usuario (mantiene punto decimal en curso). */
export function formatDineroInput(texto: string | null | undefined): string {
  let raw = String(texto ?? '')
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '');
  if (!raw) return '';

  const partes = raw.split('.');
  if (partes.length > 2) {
    raw = partes[0] + '.' + partes.slice(1).join('');
  }

  const tienePunto = raw.includes('.');
  let [entero, decimal] = raw.split('.');
  // Evitar ceros a la izquierda tipo 00012 → 12 (pero conservar "0" y "0.")
  if (entero.length > 1) {
    entero = entero.replace(/^0+(?=\d)/, '');
  }
  const enteroFmt = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (tienePunto) {
    return `${enteroFmt}.${(decimal ?? '').slice(0, 2)}`;
  }
  return enteroFmt;
}

/** Número → texto con comas (p. ej. para prefills). */
export function formatDineroNumero(n: number, decimales = 2): string {
  if (!Number.isFinite(n)) return '';
  const fijo = n.toFixed(decimales);
  const [entero, decimal] = fijo.split('.');
  const enteroFmt = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal != null ? `${enteroFmt}.${decimal}` : enteroFmt;
}

export function soloMontoKey(ev: KeyboardEvent): void {
  const ok = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End', '.'];
  if (ok.includes(ev.key) || ev.ctrlKey || ev.metaKey) return;
  if (!/^\d$/.test(ev.key)) ev.preventDefault();
}
