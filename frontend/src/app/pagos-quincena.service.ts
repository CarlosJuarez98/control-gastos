import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { Cuenta, Gasto, GastoMensual } from './modelos';
import { calendarioCompraTdc, pagosPorQuincena } from './tdc-calendario.util';

/** Perfiles que solo contemplan compras TDC nuevas (no deuda histórica). */
const CALENDARIO_SOLO_COMPRAS_NUEVAS = new Set(['carlos']);
const CALENDARIO_COMPRAS_DESDE = '2026-09-10';

export interface TotalesQuincena {
  esta: number;
  siguiente: number;
}

@Injectable({ providedIn: 'root' })
export class PagosQuincenaService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  usaSoloComprasNuevas(): boolean {
    const u = (this.auth.usuario || '').trim().toLowerCase();
    return !!u && CALENDARIO_SOLO_COMPRAS_NUEVAS.has(u);
  }

  /** Totales a pagar esta quincena / la otra (misma lógica que Mensuales). */
  cargarTotales(): Observable<TotalesQuincena> {
    const soloNuevas = this.usaSoloComprasNuevas();
    return forkJoin({
      mensuales: this.api.mensuales(),
      cuentas: this.api.cuentas(),
      gastos: soloNuevas ? this.api.gastos(CALENDARIO_COMPRAS_DESDE) : of([] as Gasto[]),
    }).pipe(
      map(({ mensuales, cuentas, gastos }) =>
        this.calcular(mensuales, cuentas, gastos, soloNuevas),
      ),
    );
  }

  private calcular(
    mensuales: GastoMensual[],
    cuentas: Cuenta[],
    gastos: Gasto[],
    soloComprasNuevas: boolean,
  ): TotalesQuincena {
    let esta = 0;
    let siguiente = 0;

    for (const g of mensuales) {
      if (g.activo === false) continue;
      esta += this.montoCompromisoEnQuincena(g, 'esta');
      siguiente += this.montoCompromisoEnQuincena(g, 'siguiente');
    }

    if (soloComprasNuevas) {
      const porId = new Map(cuentas.filter((c) => c.id != null).map((c) => [c.id!, c]));
      for (const g of gastos) {
        if ((g.formaPago || '').toUpperCase() !== 'TARJETA') continue;
        if (g.meses != null && Number(g.meses) > 1) continue;
        const id = g.cuentaId ?? g.cuenta?.id;
        if (id == null) continue;
        const cuenta = porId.get(id) || g.cuenta;
        if (!cuenta) continue;
        const cal = calendarioCompraTdc(cuenta, g.fecha);
        if (!cal) continue;
        const monto = Number(g.monto) || 0;
        if (cal.quincenaPago === 'esta') esta += monto;
        else if (cal.quincenaPago === 'siguiente') siguiente += monto;
      }
    } else {
      const pagos = pagosPorQuincena(cuentas);
      for (const p of pagos.esta) esta += Number(p.cuenta.saldoActual) || 0;
      for (const p of pagos.siguiente) siguiente += Number(p.cuenta.saldoActual) || 0;
    }

    return {
      esta: Math.round(esta * 100) / 100,
      siguiente: Math.round(siguiente * 100) / 100,
    };
  }

  private quincenaActual(): 1 | 2 {
    return new Date().getDate() <= 15 ? 1 : 2;
  }

  private montoCompromisoEnQuincena(g: GastoMensual, cual: 'esta' | 'siguiente'): number {
    const monto = Number(g.monto) || 0;
    if (monto <= 0) return 0;
    const dia = g.diaPago != null ? Number(g.diaPago) : null;
    if (dia == null || !Number.isFinite(dia) || dia < 1 || dia > 31) {
      return Math.round((monto / 2) * 100) / 100;
    }
    const qItem: 1 | 2 = dia <= 15 ? 1 : 2;
    const esEsta = qItem === this.quincenaActual();
    if (cual === 'esta') return esEsta ? monto : 0;
    return esEsta ? 0 : monto;
  }
}
