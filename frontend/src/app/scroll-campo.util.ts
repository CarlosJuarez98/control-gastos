/**
 * Mantiene el campo activo a la vista al registrar (teclado + dock móvil).
 * Con interactive-widget=overlays-content el layout no se encoge: hay que
 * reservar la tapa del teclado y scrollear para centrar el campo en la zona útil.
 */

function leerTecladoInset(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--teclado-inset').trim();
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Estimación cuando el teclado aún no reportó inset (overlays-content). */
function tecladoEstimado(): number {
  const h = window.visualViewport?.height ?? window.innerHeight;
  return Math.min(360, Math.max(240, Math.round(h * 0.4)));
}

function tecladoAbiertoMarcado(): boolean {
  return document.body.classList.contains('teclado-abierto');
}

function bandaVisible(opts?: { anticiparTeclado?: boolean }): { top: number; bottom: number } {
  const vv = window.visualViewport;
  let inset = leerTecladoInset();
  // Antes de que VV reporte el teclado, ya reservar tapa inferior en móvil.
  if (
    inset < 80 &&
    (opts?.anticiparTeclado || tecladoAbiertoMarcado()) &&
    window.matchMedia('(max-width: 720px), (pointer: coarse)').matches
  ) {
    inset = Math.max(inset, tecladoEstimado());
  }
  const dock = document.querySelector('.nav-dock') as HTMLElement | null;
  const dockVisible = !!(dock && getComputedStyle(dock).visibility !== 'hidden');
  // Con teclado el dock se oculta; no restar su alto dos veces.
  const dockH = dockVisible && inset < 80 ? 84 : 8;
  const coverBottom = Math.max(inset, 0) + dockH + 8;
  const top = (vv?.offsetTop ?? 0) + 10;
  const bottomVv = (vv ? vv.offsetTop + vv.height : window.innerHeight) - coverBottom;
  const bottomLayout = window.innerHeight - coverBottom;
  return {
    top,
    bottom: Math.min(bottomVv, bottomLayout),
  };
}

function contenedorScroll(el: HTMLElement): HTMLElement | null {
  let padre: HTMLElement | null = el.parentElement;
  while (padre && padre !== document.documentElement) {
    const style = getComputedStyle(padre);
    const oy = style.overflowY;
    if (
      (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
      padre.scrollHeight > padre.clientHeight + 2
    ) {
      return padre;
    }
    padre = padre.parentElement;
  }
  return null;
}

/**
 * Desplaza el scroll para que `el` quede centrado en la banda útil
 * (entre header y teclado), no pegado arriba.
 */
export function scrollCampoEnVista(
  el: HTMLElement | null | undefined,
  opts?: { behavior?: ScrollBehavior; forzar?: boolean; anticiparTeclado?: boolean },
): void {
  if (!el || typeof window === 'undefined') return;
  const behavior = opts?.behavior ?? 'smooth';
  const forzar = opts?.forzar ?? false;
  const anticipar = opts?.anticiparTeclado ?? forzar;

  const aplicar = () => {
    const { top, bottom } = bandaVisible({ anticiparTeclado: anticipar });
    const altoBanda = bottom - top;
    if (altoBanda < 80) return;

    const rect = el.getBoundingClientRect();
    // Centro exacto de la zona libre (entre header y teclado).
    const destinoY = top + altoBanda * 0.5;
    const centroCampo = (rect.top + rect.bottom) / 2;
    const fuera = rect.bottom > bottom - 10 || rect.top < top + 6;
    const lejosDelObjetivo = Math.abs(centroCampo - destinoY) > 28;

    if (!forzar && !fuera) return;
    if (!forzar && !lejosDelObjetivo) return;
    // Con forzar: solo mover si está fuera o lejos del centro.
    if (forzar && !fuera && !lejosDelObjetivo) return;

    const delta = centroCampo - destinoY;
    if (Math.abs(delta) < 6) return;

    const cont = contenedorScroll(el);
    if (cont) {
      const max = Math.max(0, cont.scrollHeight - cont.clientHeight);
      const dest = Math.max(0, Math.min(max, cont.scrollTop + delta));
      cont.scrollTo({ top: dest, behavior });
    } else {
      const root = (document.scrollingElement || document.documentElement) as HTMLElement;
      root.scrollBy({ top: delta, behavior });
    }

    // Respaldo: recentrar si sigue tapado (center = misma idea que el destino).
    requestAnimationFrame(() => {
      const r2 = el.getBoundingClientRect();
      const b = bandaVisible({ anticiparTeclado: anticipar });
      if (r2.bottom > b.bottom - 6 || r2.top < b.top + 4) {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }
    });
  };

  requestAnimationFrame(() => requestAnimationFrame(aplicar));
}
