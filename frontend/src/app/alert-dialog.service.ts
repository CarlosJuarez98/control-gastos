import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type AlertTipo = 'error' | 'ok' | 'aviso';

export interface AlertRequest {
  tipo: AlertTipo;
  mensaje: string;
  titulo: string;
  ms: number;
}

@Injectable({ providedIn: 'root' })
export class AlertDialogService {
  private readonly stateSubject = new BehaviorSubject<AlertRequest | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastKey = '';
  private lastAt = 0;

  readonly state$ = this.stateSubject.asObservable();

  error(mensaje: string, opts?: { titulo?: string; ms?: number }): void {
    this.show({
      tipo: 'error',
      mensaje,
      titulo: opts?.titulo ?? 'Error',
      ms: opts?.ms ?? 4500,
    });
  }

  /** Confirmaciones importantes (guardado, alta, etc.). */
  ok(mensaje: string, opts?: { titulo?: string; ms?: number }): void {
    this.show({
      tipo: 'ok',
      mensaje,
      titulo: opts?.titulo ?? 'Listo',
      ms: opts?.ms ?? 3000,
    });
  }

  /** Avisos relevantes que no son error ni éxito rutinario. */
  aviso(mensaje: string, opts?: { titulo?: string; ms?: number }): void {
    this.show({
      tipo: 'aviso',
      mensaje,
      titulo: opts?.titulo ?? 'Aviso',
      ms: opts?.ms ?? 3800,
    });
  }

  show(req: Omit<AlertRequest, 'titulo' | 'ms'> & { titulo?: string; ms?: number }): void {
    const mensaje = String(req.mensaje ?? '').trim();
    if (!mensaje) return;

    const full: AlertRequest = {
      tipo: req.tipo,
      mensaje,
      titulo: req.titulo ?? (req.tipo === 'error' ? 'Error' : req.tipo === 'ok' ? 'Listo' : 'Aviso'),
      ms: req.ms ?? 3500,
    };

    // Evita dos modales idénticos seguidos (doble assign error/ok).
    const key = `${full.tipo}|${full.mensaje}`;
    const now = Date.now();
    if (key === this.lastKey && now - this.lastAt < 600) return;
    this.lastKey = key;
    this.lastAt = now;

    this.clearTimer();
    this.stateSubject.next(full);
    this.timer = setTimeout(() => this.dismiss(), full.ms);
  }

  dismiss(): void {
    this.clearTimer();
    this.stateSubject.next(null);
  }

  private clearTimer(): void {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
