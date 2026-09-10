/** Tamaños de página ofrecidos en el control compartido. */
export const TAM_PAGINA_OPCIONES = [10, 20, 50] as const;
export const TAM_PAGINA_DEFAULT = 10;
const STORAGE_KEY = 'cg.pagina.tam';

export function totalPaginas(total: number, tam: number): number {
  const t = Math.max(1, Math.floor(tam) || TAM_PAGINA_DEFAULT);
  const n = Math.max(0, Math.floor(total) || 0);
  return Math.max(1, Math.ceil(n / t));
}

export function clampPagina(pagina: number, total: number, tam: number): number {
  const max = totalPaginas(total, tam);
  const p = Math.floor(pagina) || 1;
  return Math.min(max, Math.max(1, p));
}

export function slicePagina<T>(items: T[], pagina: number, tam: number): T[] {
  const t = Math.max(1, Math.floor(tam) || TAM_PAGINA_DEFAULT);
  const p = clampPagina(pagina, items.length, t);
  const from = (p - 1) * t;
  return items.slice(from, from + t);
}

/** Lee tamaño guardado; si no hay, 10 en móvil / 20 en PC. */
export function tamPaginaInicial(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    if (TAM_PAGINA_OPCIONES.includes(n as (typeof TAM_PAGINA_OPCIONES)[number])) {
      return n;
    }
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches) {
    return 10;
  }
  return 20;
}

export function guardarTamPagina(tam: number): void {
  const n = Math.max(1, Math.floor(tam) || TAM_PAGINA_DEFAULT);
  try {
    localStorage.setItem(STORAGE_KEY, String(n));
  } catch {
    /* ignore */
  }
}

/** Estado de paginación reutilizable (una lista). */
export class EstadoPaginacion {
  pagina = 1;
  tam: number = tamPaginaInicial();

  reset(): void {
    this.pagina = 1;
  }

  alCambiarPagina(p: number, total: number): void {
    this.pagina = clampPagina(p, total, this.tam);
  }

  alCambiarTam(t: number, total: number): void {
    this.tam = Math.max(1, Math.floor(t) || TAM_PAGINA_DEFAULT);
    guardarTamPagina(this.tam);
    this.pagina = 1;
    this.alCambiarPagina(1, total);
  }

  slice<T>(items: T[]): T[] {
    this.pagina = clampPagina(this.pagina, items.length, this.tam);
    return slicePagina(items, this.pagina, this.tam);
  }
}

/** Páginas por clave (p. ej. quincena). */
export class PaginasPorClave {
  tam: number = tamPaginaInicial();
  private paginas = new Map<string, number>();

  paginaDe(clave: string): number {
    return this.paginas.get(clave) || 1;
  }

  setPagina(clave: string, pagina: number, total: number): void {
    this.paginas.set(clave, clampPagina(pagina, total, this.tam));
  }

  setTam(tam: number): void {
    this.tam = Math.max(1, Math.floor(tam) || TAM_PAGINA_DEFAULT);
    guardarTamPagina(this.tam);
    this.paginas.clear();
  }

  slice<T>(clave: string, items: T[]): T[] {
    const p = clampPagina(this.paginaDe(clave), items.length, this.tam);
    this.paginas.set(clave, p);
    return slicePagina(items, p, this.tam);
  }

  /** Quita claves que ya no existen. */
  limpiar(clavesValidas: Iterable<string>): void {
    const ok = new Set(clavesValidas);
    for (const k of [...this.paginas.keys()]) {
      if (!ok.has(k)) this.paginas.delete(k);
    }
  }
}

/** Números de página visibles (ventana centrada en la actual). */
export function ventanasPaginas(actual: number, total: number, maxVisible = 5): number[] {
  const t = Math.max(1, total);
  const a = Math.min(t, Math.max(1, actual));
  if (t <= maxVisible) {
    return Array.from({ length: t }, (_, i) => i + 1);
  }
  const half = Math.floor(maxVisible / 2);
  let from = Math.max(1, a - half);
  let to = from + maxVisible - 1;
  if (to > t) {
    to = t;
    from = Math.max(1, to - maxVisible + 1);
  }
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
