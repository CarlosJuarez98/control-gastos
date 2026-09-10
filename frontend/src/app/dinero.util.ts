/**
 * Formato de montos al escribir: 1234.5 → 1,234.5
 * Parseo: quita comas de miles antes de Number().
 * Varios montos: 100+50+25 o 100;50;25 → suma 175.
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

/** True si el texto pide sumar varios montos (+ o ;). */
export function esSumaMontos(texto: string | null | undefined): boolean {
  return /[+]|;/.test(String(texto ?? ''));
}

/**
 * Un monto o varios separados por + o ;.
 * Ej.: "100+50+25", "1,200.50; 80" → total y partes > 0.
 */
export function parseDineroSuma(texto: string | number | null | undefined): {
  total: number;
  partes: number[];
} {
  if (typeof texto === 'number') {
    const n = Number.isFinite(texto) ? texto : 0;
    return { total: n, partes: n > 0 ? [n] : [] };
  }
  const raw = String(texto ?? '').trim();
  if (!raw) return { total: 0, partes: [] };

  const trozos = esSumaMontos(raw)
    ? raw.split(/[+;]/).map((p) => p.trim()).filter(Boolean)
    : [raw];

  const partes: number[] = [];
  for (const t of trozos) {
    const n = Math.round(parseDinero(t) * 100) / 100;
    if (Number.isFinite(n) && n > 0) partes.push(n);
  }
  const total = Math.round(partes.reduce((a, b) => a + b, 0) * 100) / 100;
  return { total, partes };
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

/**
 * Formato al teclear: si hay + o ;, formatea cada tramo y conserva el separador.
 * No formatea un tramo vacío al final (ej. "100+") para seguir escribiendo.
 */
export function formatDineroInputFlexible(texto: string | null | undefined): string {
  const raw = String(texto ?? '');
  if (!esSumaMontos(raw)) {
    return formatDineroInput(raw);
  }

  let out = '';
  let buf = '';
  const flush = (sep?: string) => {
    const fmt = formatDineroInput(buf);
    out += fmt;
    if (sep) out += sep;
    buf = '';
  };

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '+' || ch === ';') {
      flush(ch);
    } else {
      buf += ch;
    }
  }
  if (buf.length) {
    flush();
  }
  return out;
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
  const ok = [
    'Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
    'ArrowLeft', 'ArrowRight', 'Home', 'End', '.',
    '+', ';',
  ];
  if (ok.includes(ev.key) || ev.ctrlKey || ev.metaKey) return;
  if (!/^\d$/.test(ev.key)) ev.preventDefault();
}
