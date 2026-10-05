/**
 * Mantiene el campo activo a la vista al registrar (teclado + dock móvil).
 * Prefiere scrollear el ancestro con overflow; scrollIntoView solo como respaldo.
 */

function leerTecladoInset(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--teclado-inset').trim();
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function bandaVisible(): { top: number; bottom: number } {
  const vv = window.visualViewport;
  const inset = leerTecladoInset();
  const dock = document.querySelector('.nav-dock') as HTMLElement | null;
  const dockH = dock && getComputedStyle(dock).visibility !== 'hidden' ? 84 : 16;
  // Cobertura inferior: teclado (inset) + barra de menús
  const coverBottom = Math.max(inset, 0) + dockH + 10;
  const top = (vv?.offsetTop ?? 0) + 10;
  const bottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - coverBottom;
  // Si overlays-content: vv.height ≈ layout; usar inset como tapa inferior
  const bottomLayout = window.innerHeight - coverBottom;
  return {
    top,
    bottom: Math.min(bottom, bottomLayout),
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
 * Desplaza el scroll para que `el` quede en la zona visible (centro de la banda útil).
 */
export function scrollCampoEnVista(
  el: HTMLElement | null | undefined,
  opts?: { behavior?: ScrollBehavior; forzar?: boolean },
): void {
  if (!el || typeof window === 'undefined') return;
  const behavior = opts?.behavior ?? 'smooth';
  const forzar = opts?.forzar ?? false;

  const aplicar = () => {
    const { top, bottom } = bandaVisible();
    if (bottom - top < 80) return;

    const rect = el.getBoundingClientRect();
    const dentro = rect.top >= top && rect.bottom <= bottom;
    if (dentro && !forzar) {
      // Un poco bajo o alto pero aún visible: centrar solo si queda muy al borde
      const margen = 28;
      if (rect.top >= top + margen && rect.bottom <= bottom - margen) return;
    }

    const centroBanda = (top + bottom) / 2;
    const centroCampo = (rect.top + rect.bottom) / 2;
    const delta = centroCampo - centroBanda;

    const cont = contenedorScroll(el);
    if (cont) {
      const dest = Math.max(0, Math.min(cont.scrollHeight - cont.clientHeight, cont.scrollTop + delta));
      cont.scrollTo({ top: dest, behavior });
    } else {
      const root = (document.scrollingElement || document.documentElement) as HTMLElement;
      root.scrollBy({ top: delta, behavior });
    }

    // Respaldo: si sigue fuera, scrollIntoView (auto = más fiable con teclado)
    requestAnimationFrame(() => {
      const r2 = el.getBoundingClientRect();
      const b = bandaVisible();
      if (r2.bottom > b.bottom || r2.top < b.top) {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }
    });
  };

  requestAnimationFrame(aplicar);
}
