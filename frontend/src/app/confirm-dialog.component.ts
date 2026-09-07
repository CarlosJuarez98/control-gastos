import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { ConfirmDialogService, ConfirmRequest } from './confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    @if (abierto && req) {
      <div class="overlay" (click)="cancelar()" role="presentation">
        <div
          class="dialog"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="req.titulo"
        >
          <h3>{{ req.titulo }}</h3>
          <p>{{ req.mensaje }}</p>
          <div class="actions">
            <button type="button" class="secundario" (click)="cancelar()">
              {{ req.cancelarTexto }}
            </button>
            <button type="button" class="peligro confirmar" (click)="aceptar()">
              {{ req.confirmarTexto }}
            </button>
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
        z-index: 2000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(3px);
      }
      .dialog {
        width: min(420px, 100%);
        background: var(--superficie);
        border: 1px solid var(--linea);
        border-radius: 1rem;
        padding: 1.25rem 1.35rem;
        box-shadow: var(--sombra);
      }
      .dialog h3 {
        margin: 0 0 0.55rem;
        font-size: 1.2rem;
        font-family: var(--fuente-display);
      }
      .dialog p {
        margin: 0 0 1.15rem;
        color: var(--texto-suave);
        line-height: 1.45;
      }
      .dialog .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }
      .dialog .confirmar {
        background: var(--peligro);
        color: #1a0a0a;
        border: none;
      }
      .dialog .confirmar:hover {
        filter: brightness(1.08);
      }
    `,
  ],
})
export class ConfirmDialogComponent implements OnInit, OnDestroy {
  abierto = false;
  req: ConfirmRequest | null = null;
  private sub?: Subscription;

  constructor(private confirm: ConfirmDialogService) {}

  ngOnInit(): void {
    this.sub = this.confirm.state$.subscribe((pending) => {
      this.abierto = !!pending;
      this.req = pending?.request ?? null;
      if (this.abierto) {
        setTimeout(() => {
          document.querySelector<HTMLButtonElement>('.dialog button.confirmar')?.focus();
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent): void {
    if (!this.abierto) return;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      this.aceptar();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      this.cancelar();
    }
  }

  aceptar(): void {
    this.confirm.accept();
  }

  cancelar(): void {
    this.confirm.cancel();
  }
}
