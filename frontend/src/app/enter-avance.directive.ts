import {
  DestroyRef,
  Directive,
  ElementRef,
  HostListener,
  inject,
  AfterViewInit,
  NgZone,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { fechaHoyLocal } from './fecha.util';

/**
 * En un form con atributo enterAvance:
 * - Enter / tecla Siguiente-Listo del móvil: pasa al siguiente campo; en el último, envía.
 * - En inputs de texto/monto, muestra un botón ✕ para vaciar (PC y móvil).
 * - En fechas: no se vacían; si quedan vacías, al enfocar vuelven a hoy.
 * - Pone enterkeyhint=next|done|go|search para que el teclado móvil muestre la acción correcta.
 */
@Directive({
  selector: 'form[enterAvance]',
  standalone: true,
})
export class EnterAvanceDirective implements AfterViewInit {
  private readonly host = inject(ElementRef) as ElementRef<HTMLFormElement>;
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  private readonly clearBtns = new WeakMap<HTMLInputElement, HTMLButtonElement>();
  private observer?: MutationObserver;
  private refreshing = false;
  private scheduled = false;

  private readonly observeOptions: MutationObserverInit = {
    childList: true,
    subtree: true,
    // No observar `hidden`: syncClearBtn lo cambia y reentraba el observer → freeze.
    attributes: true,
    attributeFilter: ['disabled', 'class'],
  };

  ngAfterViewInit(): void {
    this.refrescarAyudas();
    this.zone.runOutsideAngular(() => {
      this.observer = new MutationObserver((mutations) => {
        if (this.refreshing || this.scheduled) return;
        if (!this.mutationsRelevantes(mutations)) return;
        this.scheduled = true;
        queueMicrotask(() => {
          this.scheduled = false;
          this.refrescarAyudas();
        });
      });
      this.observer.observe(this.host.nativeElement, this.observeOptions);
    });
    this.destroyRef.onDestroy(() => this.observer?.disconnect());
  }

  private mutationsRelevantes(mutations: MutationRecord[]): boolean {
    for (const m of mutations) {
      const t = m.target;
      if (t instanceof Element) {
        if (t.classList.contains('btn-clear-campo') || t.closest('.btn-clear-campo')) {
          continue;
        }
        if (t.classList.contains('campo-clearable') && m.type === 'attributes' && m.attributeName === 'class') {
          continue;
        }
      }
      if (m.type === 'childList') {
        const nodes = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)];
        const soloAyudas = nodes.every(
          (n) =>
            n instanceof Element &&
            (n.classList.contains('btn-clear-campo') ||
              n.classList.contains('campo-clearable') ||
              n.querySelector?.('.btn-clear-campo')),
        );
        if (nodes.length && soloAyudas) continue;
      }
      return true;
    }
    return false;
  }

  private refrescarAyudas(): void {
    if (this.refreshing) return;
    this.refreshing = true;
    this.observer?.disconnect();
    try {
      this.asegurarClearEnForm();
      this.syncEnterHints();
    } finally {
      this.refreshing = false;
      this.observer?.observe(this.host.nativeElement, this.observeOptions);
    }
  }

  @HostListener('keydown', ['$event'])
  onKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      this.onEscapeClear(ev);
      return;
    }
    // Enter en PC; en móvil suele ser la tecla Siguiente / Listo / Ir del teclado
    if (ev.key !== 'Enter' || ev.defaultPrevented) return;
    if (ev.isComposing) return;

    const target = ev.target as HTMLElement | null;
    if (!target) return;

    const tag = target.tagName;
    if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;

    const input = target as HTMLInputElement;
    if (input.type === 'submit' || input.type === 'button' || input.type === 'reset') return;
    if (input.type === 'checkbox' || input.type === 'radio') {
      ev.preventDefault();
      ev.stopPropagation();
      this.avanzarOEnviar(target);
      return;
    }

    if (this.esMontoRequeridoInvalido(input)) {
      ev.preventDefault();
      ev.stopPropagation();
      input.focus();
      input.select();
      return;
    }

    const form = this.host.nativeElement;
    const campos = this.camposVisibles(form);
    const idx = campos.indexOf(target);
    if (idx < 0) return;

    ev.preventDefault();
    ev.stopPropagation();
    this.avanzarOEnviar(target);
  }

  private avanzarOEnviar(actual: HTMLElement): void {
    const form = this.host.nativeElement;
    const campos = this.camposVisibles(form);
    let idx = campos.indexOf(actual);

    // Checks u otros excluídos: ir al siguiente campo en el DOM
    if (idx < 0) {
      idx = campos.findIndex((el) => {
        const pos = actual.compareDocumentPosition(el);
        return (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      });
      if (idx < 0) {
        this.enviarForm(form);
        return;
      }
      this.enfocarCampo(campos[idx]);
      return;
    }

    if (idx < campos.length - 1) {
      this.enfocarCampo(campos[idx + 1]);
      return;
    }

    this.enviarForm(form);
  }

  private enfocarCampo(el: HTMLElement): void {
    // En iOS a veces hace falta un tick para que el teclado no se cierre
    requestAnimationFrame(() => {
      el.focus();
      if (el instanceof HTMLInputElement && this.esSeleccionable(el)) {
        try {
          el.select();
        } catch {
          /* ignore */
        }
      }
    });
  }

  private enviarForm(form: HTMLFormElement): void {
    const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (btn?.disabled) return;
    // Quitar foco para cerrar teclado móvil al guardar
    const activo = document.activeElement;
    if (activo instanceof HTMLElement) activo.blur();
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit(btn ?? undefined);
    } else {
      btn?.click();
    }
  }

  /** Escape vacía el campo actual (rápido en PC). */
  private onEscapeClear(ev: KeyboardEvent): void {
    const target = ev.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
    if (target instanceof HTMLInputElement && !this.esClearable(target)) return;
    if (!String(target.value ?? '').trim()) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.borrarCampo(target);
  }

  @HostListener('input', ['$event'])
  onInput(ev: Event): void {
    const t = ev.target;
    if (t instanceof HTMLInputElement) this.syncClearBtn(t);
  }

  @HostListener('change', ['$event'])
  onChange(ev: Event): void {
    const t = ev.target;
    if (t instanceof HTMLInputElement) this.syncClearBtn(t);
    // Campos condicionales (TDC, a meses…): refrescar hints
    queueMicrotask(() => this.syncEnterHints());
  }

  @HostListener('focusin', ['$event'])
  onFocusIn(ev: FocusEvent): void {
    this.syncEnterHints();
    const t = ev.target;
    if (!(t instanceof HTMLInputElement)) return;

    const tipo = (t.type || '').toLowerCase();
    if (tipo === 'date' || tipo === 'datetime-local') {
      if (!String(t.value ?? '').trim()) {
        const hoy = fechaHoyLocal();
        const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        proto?.set?.call(t, hoy);
        t.dispatchEvent(new Event('input', { bubbles: true }));
        t.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }

    if (this.esClearable(t)) this.syncClearBtn(t);
  }

  /**
   * Teclado móvil: "Siguiente" en campos intermedios, "Listo"/"Ir"/"Buscar" en el último.
   * data-enter-last en el form: done | go | search (default done).
   */
  private syncEnterHints(): void {
    const form = this.host.nativeElement;
    const campos = this.camposVisibles(form);
    const ultimoHint = (form.dataset['enterLast'] || 'done').toLowerCase();
    campos.forEach((el, i) => {
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) return;
      const tipo = (el instanceof HTMLInputElement ? el.type : 'text').toLowerCase();
      if (tipo === 'date' || tipo === 'datetime-local' || tipo === 'month' || tipo === 'time') {
        return;
      }
      const hint = i === campos.length - 1 ? ultimoHint : 'next';
      if (el.getAttribute('enterkeyhint') !== hint) {
        el.setAttribute('enterkeyhint', hint);
      }
    });
  }

  private asegurarClearEnForm(): void {
    const form = this.host.nativeElement;
    const inputs = form.querySelectorAll<HTMLInputElement>('input');
    inputs.forEach((input) => {
      if (!this.esClearable(input)) return;
      this.ensureClearBtn(input);
      this.syncClearBtn(input);
    });
  }

  private esClearable(input: HTMLInputElement): boolean {
    if (input.disabled || input.readOnly) return false;
    if (input.dataset['noClear'] === '1') return false;
    // Ya tiene control a la derecha (Ver/Ocultar); el ✕ chocaría.
    if (input.closest('.campo-clave')) return false;
    const t = (input.type || 'text').toLowerCase();
    if (
      t === 'checkbox' ||
      t === 'radio' ||
      t === 'hidden' ||
      t === 'submit' ||
      t === 'button' ||
      t === 'reset' ||
      t === 'file' ||
      t === 'image' ||
      t === 'range' ||
      t === 'color' ||
      t === 'date' ||
      t === 'datetime-local' ||
      t === 'month' ||
      t === 'week' ||
      t === 'time'
    ) {
      return false;
    }
    return true;
  }

  private ensureClearBtn(input: HTMLInputElement): void {
    if (this.clearBtns.has(input)) return;

    let wrap = input.parentElement;
    if (!wrap?.classList.contains('campo-clearable') && !wrap?.classList.contains('monto-wrap')) {
      wrap = document.createElement('div');
      wrap.className = 'campo-clearable';
      const parent = input.parentElement;
      parent?.insertBefore(wrap, input);
      wrap.appendChild(input);
    } else if (wrap && !wrap.classList.contains('campo-clearable')) {
      wrap.classList.add('campo-clearable');
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-clear-campo';
    btn.tabIndex = -1;
    btn.setAttribute('aria-label', 'Borrar texto');
    btn.title = 'Borrar';
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    btn.hidden = true;

    fromEvent(btn, 'click')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        e.preventDefault();
        e.stopPropagation();
        this.borrarCampo(input);
      });

    wrap!.appendChild(btn);
    this.clearBtns.set(input, btn);
  }

  private borrarCampo(input: HTMLInputElement | HTMLTextAreaElement): void {
    const proto =
      input instanceof HTMLTextAreaElement
        ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
        : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    proto?.set?.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (input instanceof HTMLInputElement) this.syncClearBtn(input);
    input.focus();
  }

  private syncClearBtn(input: HTMLInputElement): void {
    const btn = this.clearBtns.get(input);
    if (!btn) return;
    const has = String(input.value ?? '').trim().length > 0;
    btn.hidden = !has;
  }

  private camposVisibles(form: HTMLFormElement): HTMLElement[] {
    const nodos = form.querySelectorAll<HTMLElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    return Array.from(nodos).filter(
      (el) => this.visible(el) && !el.classList.contains('btn-clear-campo'),
    );
  }

  private visible(el: HTMLElement): boolean {
    if ((el as HTMLInputElement).disabled) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return el.getClientRects().length > 0;
  }

  private esSeleccionable(el: HTMLInputElement): boolean {
    const t = (el.type || 'text').toLowerCase();
    return (
      t === 'text' ||
      t === 'search' ||
      t === 'tel' ||
      t === 'url' ||
      t === 'password' ||
      t === 'email' ||
      t === ''
    );
  }

  /** Solo bloquea avance si es monto obligatorio vacío o ≤ 0. */
  private esMontoRequeridoInvalido(input: HTMLInputElement): boolean {
    if (!input.required) return false;
    const enMonto = !!input.closest('.monto-wrap');
    const name = (input.name || '').toLowerCase();
    if (!enMonto && name !== 'monto' && name !== 'mmonto') return false;

    const txt = String(input.value ?? '').trim();
    const n = Number(txt.replace(/,/g, '').replace(/[^\d.]/g, ''));
    return !txt || !Number.isFinite(n) || n <= 0;
  }
}
