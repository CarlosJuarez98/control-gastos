import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { LoadingDialogService } from './loading-dialog.service';

@Component({
  selector: 'app-loading-dialog',
  standalone: true,
  template: `
    @if (abierto) {
      <div class="overlay" role="alertdialog" aria-modal="true" aria-busy="true" [attr.aria-label]="mensaje">
        <div class="panel">
          <div class="spinner" aria-hidden="true"></div>
          <p>{{ mensaje }}</p>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .overlay {
        position: fixed;
        inset: 0;
        z-index: 2500;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background: rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(2px);
      }
      .panel {
        display: grid;
        justify-items: center;
        gap: 0.85rem;
        min-width: 11rem;
        max-width: min(18rem, 100%);
        padding: 1.25rem 1.4rem;
        border-radius: 1rem;
        border: 1px solid var(--linea);
        background: var(--superficie);
        box-shadow: var(--sombra);
      }
      .panel p {
        margin: 0;
        text-align: center;
        color: var(--texto);
        font-weight: 600;
        font-size: 0.95rem;
      }
      .spinner {
        width: 2.1rem;
        height: 2.1rem;
        border-radius: 50%;
        border: 3px solid color-mix(in srgb, var(--acento) 25%, var(--linea));
        border-top-color: var(--acento);
        animation: spin 0.75s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class LoadingDialogComponent implements OnInit, OnDestroy {
  abierto = false;
  mensaje = 'Cargando…';
  private sub?: Subscription;

  constructor(private loading: LoadingDialogService) {}

  ngOnInit(): void {
    this.sub = new Subscription();
    this.sub.add(this.loading.abierto$.subscribe((v) => (this.abierto = v)));
    this.sub.add(this.loading.mensaje$.subscribe((m) => (this.mensaje = m)));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
