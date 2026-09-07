import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Cuenta, Denominacion, Gasto, GastoMensual, Ingreso, Movimiento, Resumen, SaldoSnapshot
} from './modelos';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = '/api';

  constructor(private http: HttpClient) {}

  resumen(desde?: string, hasta?: string): Observable<Resumen> {
    let params = new HttpParams();
    if (desde) params = params.set('desde', desde);
    if (hasta) params = params.set('hasta', hasta);
    return this.http.get<Resumen>(`${this.base}/resumen`, { params });
  }

  ingresos(desde?: string, hasta?: string): Observable<Ingreso[]> {
    let params = new HttpParams();
    if (desde) params = params.set('desde', desde);
    if (hasta) params = params.set('hasta', hasta);
    return this.http.get<Ingreso[]>(`${this.base}/ingresos`, { params });
  }

  crearIngreso(body: Ingreso): Observable<Ingreso> {
    return this.http.post<Ingreso>(`${this.base}/ingresos`, body);
  }

  eliminarIngreso(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/ingresos/${id}`);
  }

  gastos(desde?: string, hasta?: string): Observable<Gasto[]> {
    let params = new HttpParams();
    if (desde) params = params.set('desde', desde);
    if (hasta) params = params.set('hasta', hasta);
    return this.http.get<Gasto[]>(`${this.base}/gastos`, { params });
  }

  crearGasto(body: Gasto): Observable<Gasto> {
    return this.http.post<Gasto>(`${this.base}/gastos`, body);
  }

  eliminarGasto(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/gastos/${id}`);
  }

  mensuales(): Observable<GastoMensual[]> {
    return this.http.get<GastoMensual[]>(`${this.base}/gastos-mensuales`);
  }

  crearMensual(body: GastoMensual): Observable<GastoMensual> {
    return this.http.post<GastoMensual>(`${this.base}/gastos-mensuales`, body);
  }

  eliminarMensual(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/gastos-mensuales/${id}`);
  }

  cuentas(): Observable<Cuenta[]> {
    return this.http.get<Cuenta[]>(`${this.base}/cuentas`);
  }

  cuenta(id: number): Observable<Cuenta> {
    return this.http.get<Cuenta>(`${this.base}/cuentas/${id}`);
  }

  crearCuenta(body: Cuenta): Observable<Cuenta> {
    return this.http.post<Cuenta>(`${this.base}/cuentas`, body);
  }

  actualizarCuenta(id: number, body: Cuenta): Observable<Cuenta> {
    return this.http.put<Cuenta>(`${this.base}/cuentas/${id}`, body);
  }

  movimientos(cuentaId: number): Observable<Movimiento[]> {
    return this.http.get<Movimiento[]>(`${this.base}/cuentas/${cuentaId}/movimientos`);
  }

  agregarMovimiento(cuentaId: number, body: Movimiento): Observable<Movimiento> {
    return this.http.post<Movimiento>(`${this.base}/cuentas/${cuentaId}/movimientos`, body);
  }

  saldo(): Observable<{
    saldo: SaldoSnapshot;
    denominaciones: Denominacion[];
    historial: SaldoSnapshot[];
    esperado?: number;
  }> {
    return this.http.get<{
      saldo: SaldoSnapshot;
      denominaciones: Denominacion[];
      historial: SaldoSnapshot[];
      esperado?: number;
    }>(`${this.base}/saldo`);
  }

  guardarSaldo(body: SaldoSnapshot): Observable<SaldoSnapshot> {
    return this.http.put<SaldoSnapshot>(`${this.base}/saldo`, body);
  }

  actualizarSaldo(id: number, body: SaldoSnapshot): Observable<SaldoSnapshot> {
    return this.http.put<SaldoSnapshot>(`${this.base}/saldo/${id}`, body);
  }

  eliminarSaldo(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/saldo/${id}`);
  }

  guardarDenominaciones(items: Denominacion[]): Observable<Denominacion[]> {
    return this.http.put<Denominacion[]>(`${this.base}/saldo/denominaciones`, items);
  }
}
