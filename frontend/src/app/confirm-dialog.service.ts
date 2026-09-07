import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface ConfirmRequest {
  mensaje: string;
  titulo?: string;
  confirmarTexto?: string;
  cancelarTexto?: string;
}

interface Pending {
  request: ConfirmRequest;
  resolve: (ok: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly pending$ = new Subject<Pending | null>();
  private current: Pending | null = null;

  readonly state$ = this.pending$.asObservable();

  ask(
    mensaje: string,
    opts?: { titulo?: string; confirmarTexto?: string; cancelarTexto?: string }
  ): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.current) {
        this.current.resolve(false);
      }
      this.current = {
        request: {
          mensaje,
          titulo: opts?.titulo ?? 'Confirmar',
          confirmarTexto: opts?.confirmarTexto ?? 'Eliminar',
          cancelarTexto: opts?.cancelarTexto ?? 'Cancelar',
        },
        resolve,
      };
      this.pending$.next(this.current);
    });
  }

  accept(): void {
    this.finish(true);
  }

  cancel(): void {
    this.finish(false);
  }

  private finish(ok: boolean): void {
    if (!this.current) return;
    this.current.resolve(ok);
    this.current = null;
    this.pending$.next(null);
  }
}
