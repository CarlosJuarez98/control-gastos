import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  TAM_PAGINA_DEFAULT,
  TAM_PAGINA_OPCIONES,
  clampPagina,
  totalPaginas,
  ventanasPaginas,
} from '../paginar.util';

@Component({
  selector: 'app-paginador',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total > 0) {
      <nav
        class="paginador"
        [class.compacto]="paginas <= 1"
        [class.pegajoso]="pegajoso"
        [attr.aria-label]="etiqueta || 'Paginación'"
        tabindex="0"
      >
        <span class="paginador-info">{{ rangoTxt }}</span>

        <label class="paginador-tam">
          <span class="sr-only">Por página</span>
          <select
            [ngModel]="tam"
            (ngModelChange)="cambiarTam($event)"
            [attr.aria-label]="'Elementos por página'"
          >
            @for (o of opciones; track o) {
              <option [ngValue]="o">{{ o }} / pág.</option>
            }
          </select>
        </label>

        @if (paginas > 1) {
          <div class="paginador-nav" role="group" aria-label="Páginas">
            <button
              type="button"
              class="paginador-btn"
              [disabled]="paginaActual <= 1"
              (click)="ir(1)"
              aria-label="Primera página"
              title="Primera"
            >«</button>
            <button
              type="button"
              class="paginador-btn"
              [disabled]="paginaActual <= 1"
              (click)="ir(paginaActual - 1)"
              aria-label="Página anterior"
              title="Anterior"
            >‹</button>

            <div class="paginador-chips" aria-hidden="false">
              @for (n of chips; track n) {
                <button
                  type="button"
                  class="paginador-chip"
                  [class.activo]="n === paginaActual"
                  [attr.aria-current]="n === paginaActual ? 'page' : null"
                  [attr.aria-label]="'Ir a página ' + n"
                  (click)="ir(n)"
                >{{ n }}</button>
              }
            </div>

            <span class="paginador-pagina mono-pag" aria-live="polite">
              {{ paginaActual }}/{{ paginas }}
            </span>

            <button
              type="button"
              class="paginador-btn"
              [disabled]="paginaActual >= paginas"
              (click)="ir(paginaActual + 1)"
              aria-label="Página siguiente"
              title="Siguiente"
            >›</button>
            <button
              type="button"
              class="paginador-btn"
              [disabled]="paginaActual >= paginas"
              (click)="ir(paginas)"
              aria-label="Última página"
              title="Última"
            >»</button>
          </div>
        }
      </nav>
    }
  `,
  styles: `
    :host { display: block; }

    .paginador {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.55rem 0.75rem;
      margin-top: 0.65rem;
      padding: 0.55rem 0.7rem;
      border-radius: 0.75rem;
      background: color-mix(in srgb, var(--superficie-2) 88%, transparent);
      border: 1px solid var(--linea);
      outline: none;
    }

    .paginador:focus-visible {
      border-color: color-mix(in srgb, var(--acento) 55%, var(--linea));
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--acento) 25%, transparent);
    }

    .paginador.pegajoso {
      position: sticky;
      bottom: 0.35rem;
      z-index: 4;
      backdrop-filter: blur(10px);
      background: color-mix(in srgb, var(--superficie) 92%, transparent);
      box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.22);
    }

    .paginador-info {
      font-size: 0.82rem;
      color: var(--texto-suave);
      font-variant-numeric: tabular-nums;
      min-width: 0;
      flex: 1 1 auto;
    }

    .paginador-tam select {
      min-height: 2.35rem;
      padding: 0.35rem 0.55rem;
      border-radius: 0.55rem;
      border: 1px solid var(--campo-borde);
      background: var(--campo-fondo);
      color: var(--campo-texto);
      font-size: 0.85rem;
    }

    .paginador-nav {
      display: inline-flex;
      align-items: center;
      gap: 0.28rem;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .paginador-btn,
    .paginador-chip {
      min-width: 2.35rem;
      min-height: 2.35rem;
      padding: 0 0.35rem;
      border-radius: 0.55rem;
      background: var(--superficie);
      color: var(--texto);
      border: 1px solid var(--linea);
      font-size: 1.15rem;
      font-weight: 700;
      line-height: 1;
    }

    .paginador-chip {
      font-size: 0.82rem;
      font-variant-numeric: tabular-nums;
      font-weight: 650;
    }

    .paginador-chip.activo {
      background: color-mix(in srgb, var(--acento) 22%, var(--superficie));
      border-color: var(--acento);
      color: var(--texto);
    }

    .paginador-btn:hover:not(:disabled),
    .paginador-chip:hover:not(.activo) {
      background: var(--campo-fondo);
      border-color: color-mix(in srgb, var(--acento) 45%, var(--linea));
    }

    .paginador-btn:disabled {
      opacity: 0.35;
      cursor: default;
    }

    .paginador-chips {
      display: none;
      align-items: center;
      gap: 0.22rem;
    }

    .paginador-pagina,
    .mono-pag {
      min-width: 3.1rem;
      text-align: center;
      font-size: 0.85rem;
      font-variant-numeric: tabular-nums;
      color: var(--texto);
      font-weight: 600;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    /* PC: chips de página; oculta el contador corto */
    @media (hover: hover) and (pointer: fine) and (min-width: 721px) {
      .paginador-chips { display: inline-flex; }
      .mono-pag { display: none; }
    }

    @media (max-width: 720px), (pointer: coarse) {
      .paginador {
        padding: 0.55rem 0.6rem;
        gap: 0.45rem;
      }

      .paginador.pegajoso {
        bottom: max(0.25rem, env(safe-area-inset-bottom));
        margin-bottom: 0.15rem;
      }

      .paginador-info {
        flex: 1 1 100%;
        font-size: 0.8rem;
      }

      .paginador-tam {
        flex: 1 1 auto;
        min-width: 7rem;
      }

      .paginador-tam select {
        width: 100%;
        min-height: 2.65rem;
        font-size: 16px;
      }

      .paginador-nav {
        margin-left: auto;
        gap: 0.22rem;
      }

      .paginador-btn {
        min-width: 2.65rem;
        min-height: 2.65rem;
        font-size: 1.25rem;
      }

      .paginador-chips { display: none; }
      .mono-pag { display: inline-block; }
    }
  `,
})
export class PaginadorComponent {
  readonly opciones = [...TAM_PAGINA_OPCIONES];

  @Input() total = 0;
  @Input() pagina = 1;
  @Input() tam: number = TAM_PAGINA_DEFAULT;
  @Input() etiqueta = '';
  /** Barra sticky al pie de la lista (off por defecto: evita pelear con el scroll). */
  @Input() pegajoso = false;

  @Output() paginaChange = new EventEmitter<number>();
  @Output() tamChange = new EventEmitter<number>();

  constructor(private host: ElementRef<HTMLElement>) {}

  get paginas(): number {
    return totalPaginas(this.total, this.tam);
  }

  get paginaActual(): number {
    return clampPagina(this.pagina, this.total, this.tam);
  }

  get chips(): number[] {
    return ventanasPaginas(this.paginaActual, this.paginas, 5);
  }

  get rangoTxt(): string {
    const total = Math.max(0, this.total | 0);
    if (!total) return '0 registros';
    const tam = Math.max(1, this.tam | 0);
    const p = this.paginaActual;
    const from = (p - 1) * tam + 1;
    const to = Math.min(total, p * tam);
    if (this.paginas <= 1) return `${total} registro${total === 1 ? '' : 's'}`;
    return `${from}–${to} de ${total}`;
  }

  @HostListener('keydown', ['$event'])
  onKey(ev: KeyboardEvent): void {
    const tag = (ev.target as HTMLElement)?.tagName;
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') {
      ev.preventDefault();
      this.ir(this.paginaActual - 1);
    } else if (ev.key === 'ArrowRight' || ev.key === 'PageDown') {
      ev.preventDefault();
      this.ir(this.paginaActual + 1);
    } else if (ev.key === 'Home') {
      ev.preventDefault();
      this.ir(1);
    } else if (ev.key === 'End') {
      ev.preventDefault();
      this.ir(this.paginas);
    }
  }

  ir(p: number): void {
    const next = clampPagina(p, this.total, this.tam);
    if (next === this.paginaActual) return;
    this.paginaChange.emit(next);
  }

  cambiarTam(t: number | string): void {
    const n = typeof t === 'string' ? Number(t) : t;
    const next = Math.max(1, Math.floor(n) || TAM_PAGINA_DEFAULT);
    if (next === this.tam) return;
    this.tamChange.emit(next);
  }
}
