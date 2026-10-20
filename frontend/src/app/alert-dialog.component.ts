import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { AlertDialogService, AlertRequest } from './alert-dialog.service';

@Component({
  selector: 'app-alert-dialog',
  standalone: true,
  template: `
    @if (abierto && req) {
      <div class="overlay" (click)="cerrar()" role="presentation">
        <div
          class="dialog"
          [class.error]="req.tipo === 'error'"
          [class.ok]="req.tipo === 'ok'"
          [class.aviso]="req.tipo === 'aviso'"
          (click)="$event.stopPropagation()"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-label]="req.titulo"
        >
          <div class="cab">
            <span class="icono" aria-hidden="true">{{ icono }}</span>
            <h3>{{ req.titulo }}</h3>
            <button type="button" class="cerrar" (click)="cerrar()" aria-label="Cerrar">×</button>
          </div>
          <p>{{ req.mensaje }}</p>
          <div class="barra" aria-hidden="true">
            <div class="barra-fill" [style.animation-duration]="req.ms + 'ms'"></div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .overlay {
        position: fixed;
        inset: 0;
        z-index: 2100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(3px);
        animation: fade-in 0.18s ease-out;
      }
      .dialog {
        width: min(400px, 100%);
        background: var(--superficie);
        border: 1px solid var(--linea);
        border-radius: 1rem;
        padding: 1.1rem 1.25rem 0.85rem;
        box-shadow: var(--sombra);
        animation: pop-in 0.22s var(--ease-out, ease-out);
      }
      .dialog.error {
        border-color: color-mix(in srgb, var(--peligro) 55%, var(--linea));
      }
      .dialog.ok {
        border-color: color-mix(in srgb, var(--ok, var(--acento)) 55%, var(--linea));
      }
      .dialog.aviso {
        border-color: color-mix(in srgb, var(--acento-2) 55%, var(--linea));
      }
      .cab {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        margin: 0 0 0.45rem;
      }
      .icono {
        flex: 0 0 auto;
        width: 1.7rem;
        height: 1.7rem;
        display: grid;
        place-items: center;
        border-radius: 999px;
        font-size: 0.95rem;
        font-weight: 700;
        line-height: 1;
      }
      .dialog.error .icono {
        background: color-mix(in srgb, var(--peligro) 22%, transparent);
        color: var(--peligro);
      }
      .dialog.ok .icono {
        background: color-mix(in srgb, var(--ok, var(--acento)) 22%, transparent);
        color: var(--ok, var(--acento));
      }
      .dialog.aviso .icono {
        background: color-mix(in srgb, var(--acento-2) 22%, transparent);
        color: var(--acento-2);
      }
      .dialog h3 {
        margin: 0;
        flex: 1 1 auto;
        font-size: 1.1rem;
        font-family: var(--fuente-display);
      }
      .cerrar {
        flex: 0 0 auto;
        width: 2rem;
        height: 2rem;
        border: none;
        border-radius: 0.5rem;
        background: transparent;
        color: var(--texto-suave);
        font-size: 1.35rem;
        line-height: 1;
        cursor: pointer;
      }
      .cerrar:hover {
        background: color-mix(in srgb, var(--texto) 8%, transparent);
        color: var(--texto);
      }
      .dialog p {
        margin: 0 0 0.85rem;
        color: var(--texto-suave);
        line-height: 1.45;
      }
      .barra {
        height: 3px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--texto) 10%, transparent);
        overflow: hidden;
      }
      .barra-fill {
        height: 100%;
        width: 100%;
        transform-origin: left center;
        animation-name: shrink;
        animation-timing-function: linear;
        animation-fill-mode: forwards;
        background: var(--acento);
      }
      .dialog.error .barra-fill {
        background: var(--peligro);
      }
      .dialog.ok .barra-fill {
        background: var(--ok, var(--acento));
      }
      .dialog.aviso .barra-fill {
        background: var(--acento-2);
      }
      @keyframes shrink {
        from {
          transform: scaleX(1);
        }
        to {
          transform: scaleX(0);
        }
      }
      @keyframes fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes pop-in {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
    `,
  ],
})
export class AlertDialogComponent implements OnInit, OnDestroy {
  abierto = false;
  req: AlertRequest | null = null;
  private sub?: Subscription;

  constructor(private alerts: AlertDialogService) {}

  get icono(): string {
    if (this.req?.tipo === 'ok') return '✓';
    if (this.req?.tipo === 'aviso') return '!';
    return '✕';
  }

  ngOnInit(): void {
    this.sub = this.alerts.state$.subscribe((pending) => {
      this.abierto = !!pending;
      this.req = pending;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent): void {
    if (!this.abierto) return;
    if (ev.key === 'Escape' || ev.key === 'Enter') {
      ev.preventDefault();
      ev.stopPropagation();
      this.cerrar();
    }
  }

  cerrar(): void {
    this.alerts.dismiss();
  }
}
