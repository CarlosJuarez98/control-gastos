import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { AvisosCompartido, CobroTdcPendienteAviso, FijoPendienteCobro } from './modelos';
import { fechaHoyLocal } from './fecha.util';

/**
 * Avisos de compartido: fijos por cobrar + cobros TDC con gente que aún te debe.
 * Badge en nav + notificación del navegador (si el usuario la autorizó).
 */
@Injectable({ providedIn: 'root' })
export class AvisosCobroService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly avisos = signal<FijoPendienteCobro[]>([]);
  readonly avisosTdc = signal<CobroTdcPendienteAviso[]>([]);
  readonly cargando = signal(false);

  get cantidad(): number {
    return this.avisos().length + this.avisosTdc().length;
  }

  aplicarResumen(data: {
    fijosPendientesCobro?: FijoPendienteCobro[] | null;
    cobrosTdcPendientes?: CobroTdcPendienteAviso[] | null;
  } | null | undefined): void {
    this.avisos.set(data?.fijosPendientesCobro || []);
    this.avisosTdc.set(data?.cobrosTdcPendientes || []);
  }

  async refrescar(silencioso = true): Promise<void> {
    if (!this.auth.autenticado) {
      this.limpiar();
      return;
    }
    if (!silencioso) this.cargando.set(true);
    try {
      const raw = await firstValueFrom(this.api.avisosCobroCompartido());
      const lista = this.normalizar(raw);
      this.avisos.set(lista.fijos);
      this.avisosTdc.set(lista.cobrosTdc);
      this.notificarSiHay();
    } catch {
      /* sin ruido en nav */
    } finally {
      this.cargando.set(false);
    }
  }

  limpiar(): void {
    this.avisos.set([]);
    this.avisosTdc.set([]);
  }

  private normalizar(raw: AvisosCompartido | FijoPendienteCobro[] | null | undefined): {
    fijos: FijoPendienteCobro[];
    cobrosTdc: CobroTdcPendienteAviso[];
  } {
    if (!raw) return { fijos: [], cobrosTdc: [] };
    if (Array.isArray(raw)) {
      return { fijos: raw, cobrosTdc: [] };
    }
    return {
      fijos: raw.fijos || [],
      cobrosTdc: raw.cobrosTdc || [],
    };
  }

  private notificarSiHay(): void {
    const fijos = this.avisos();
    const tdc = this.avisosTdc();
    if ((!fijos.length && !tdc.length)
      || typeof Notification === 'undefined'
      || Notification.permission !== 'granted') {
      return;
    }
    const key = `cg-aviso-cobro-${fechaHoyLocal()}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    const parts: string[] = [];
    const vencidos = fijos.filter((f) => f.estado !== 'PROXIMO').length;
    const proximos = fijos.filter((f) => f.estado === 'PROXIMO').length;
    if (vencidos) parts.push(`${vencidos} fijos por cobrar`);
    if (proximos) parts.push(`${proximos} fijos próximos`);
    if (tdc.length) parts.push(`${tdc.length} por cobrar antes del límite TDC`);
    try {
      new Notification('Control de gastos', {
        body: `Compartido: ${parts.join(' · ')}`,
        tag: 'cg-fijos-cobro',
      });
    } catch {
      /* ignore */
    }
  }
}
