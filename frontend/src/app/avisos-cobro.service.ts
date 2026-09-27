import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { FijoPendienteCobro } from './modelos';
import { fechaHoyLocal } from './fecha.util';

/**
 * Avisos de fijos compartidos por cobrar (vencidos / próximos).
 * Badge en nav + notificación del navegador (si el usuario la autorizó).
 */
@Injectable({ providedIn: 'root' })
export class AvisosCobroService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly avisos = signal<FijoPendienteCobro[]>([]);
  readonly cargando = signal(false);

  get cantidad(): number {
    return this.avisos().length;
  }

  async refrescar(silencioso = true): Promise<void> {
    if (!this.auth.autenticado) {
      this.avisos.set([]);
      return;
    }
    if (!silencioso) this.cargando.set(true);
    try {
      const lista = await firstValueFrom(this.api.avisosCobroCompartido());
      this.avisos.set(lista || []);
      this.notificarSiHay();
    } catch {
      /* sin ruido en nav */
    } finally {
      this.cargando.set(false);
    }
  }

  limpiar(): void {
    this.avisos.set([]);
  }

  private notificarSiHay(): void {
    const lista = this.avisos();
    if (!lista.length || typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return;
    }
    const key = `cg-aviso-cobro-${fechaHoyLocal()}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    const vencidos = lista.filter((f) => f.estado !== 'PROXIMO').length;
    const proximos = lista.filter((f) => f.estado === 'PROXIMO').length;
    const parts: string[] = [];
    if (vencidos) parts.push(`${vencidos} por cobrar`);
    if (proximos) parts.push(`${proximos} próximos`);
    try {
      new Notification('Control de gastos', {
        body: `Fijos compartidos: ${parts.join(' · ')}`,
        tag: 'cg-fijos-cobro',
      });
    } catch {
      /* ignore */
    }
  }
}
