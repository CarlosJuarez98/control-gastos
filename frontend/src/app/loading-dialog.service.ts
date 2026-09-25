import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoadingDialogService {
  private depth = 0;
  private readonly abiertoSubject = new BehaviorSubject(false);
  private readonly mensajeSubject = new BehaviorSubject('Cargando…');

  readonly abierto$ = this.abiertoSubject.asObservable();
  readonly mensaje$ = this.mensajeSubject.asObservable();

  show(mensaje = 'Cargando…'): void {
    this.depth += 1;
    this.mensajeSubject.next(mensaje || 'Cargando…');
    this.abiertoSubject.next(true);
  }

  hide(): void {
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth === 0) {
      this.abiertoSubject.next(false);
    }
  }

  /** Envuelve una promesa mostrando el modal hasta que termine. */
  async run<T>(trabajo: () => Promise<T>, mensaje = 'Cargando…'): Promise<T> {
    this.show(mensaje);
    try {
      return await trabajo();
    } finally {
      this.hide();
    }
  }
}
