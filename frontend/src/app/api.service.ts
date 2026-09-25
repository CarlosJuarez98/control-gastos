import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AnularGastoCompartidoResponse,
  Cuenta, Denominacion, Gasto, GastoCompartido, GastoMensual, Ingreso, Movimiento,
  MovimientoPersonaCompartida, PersonaCompartida, Resumen, ResumenCompartido,
  SaldoSnapshot, ServicioFijoCompartido, UsuarioAcceso
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

  actualizarIngreso(id: number, body: Ingreso): Observable<Ingreso> {
    return this.http.put<Ingreso>(`${this.base}/ingresos/${id}`, body);
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

  actualizarGasto(id: number, body: Gasto): Observable<Gasto> {
    return this.http.put<Gasto>(`${this.base}/gastos/${id}`, body);
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

  actualizarMensual(id: number, body: GastoMensual): Observable<GastoMensual> {
    return this.http.put<GastoMensual>(`${this.base}/gastos-mensuales/${id}`, body);
  }

  marcarCuotaMensual(id: number): Observable<GastoMensual> {
    return this.http.post<GastoMensual>(`${this.base}/gastos-mensuales/${id}/marcar-cuota`, {});
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

  eliminarCuenta(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/cuentas/${id}`);
  }

  movimientos(cuentaId: number): Observable<Movimiento[]> {
    return this.http.get<Movimiento[]>(`${this.base}/cuentas/${cuentaId}/movimientos`);
  }

  agregarMovimiento(cuentaId: number, body: Movimiento): Observable<Movimiento> {
    return this.http.post<Movimiento>(`${this.base}/cuentas/${cuentaId}/movimientos`, body);
  }

  actualizarMovimiento(cuentaId: number, movimientoId: number, body: Movimiento): Observable<Movimiento> {
    return this.http.put<Movimiento>(`${this.base}/cuentas/${cuentaId}/movimientos/${movimientoId}`, body);
  }

  eliminarMovimiento(cuentaId: number, movimientoId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/cuentas/${cuentaId}/movimientos/${movimientoId}`);
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

  usuarios(): Observable<UsuarioAcceso[]> {
    return this.http.get<UsuarioAcceso[]>(`${this.base}/usuarios`);
  }

  crearUsuario(body: { usuario: string; password: string; rol?: string }): Observable<UsuarioAcceso> {
    return this.http.post<UsuarioAcceso>(`${this.base}/usuarios`, body);
  }

  cambiarPasswordUsuario(id: number, password: string): Observable<UsuarioAcceso> {
    return this.http.put<UsuarioAcceso>(`${this.base}/usuarios/${id}/password`, { password });
  }

  cambiarNombreUsuario(id: number, usuario: string): Observable<UsuarioAcceso> {
    return this.http.put<UsuarioAcceso>(`${this.base}/usuarios/${id}/nombre`, { usuario });
  }

  cambiarActivoUsuario(id: number, activo: boolean): Observable<UsuarioAcceso> {
    return this.http.put<UsuarioAcceso>(`${this.base}/usuarios/${id}/activo`, { activo });
  }

  cambiarRolUsuario(id: number, rol: string): Observable<UsuarioAcceso> {
    return this.http.put<UsuarioAcceso>(`${this.base}/usuarios/${id}/rol`, { rol });
  }

  eliminarUsuario(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/usuarios/${id}`);
  }

  personasCompartidas(incluirInactivas = false): Observable<PersonaCompartida[]> {
    let params = new HttpParams();
    if (incluirInactivas) params = params.set('incluirInactivas', 'true');
    return this.http.get<PersonaCompartida[]>(`${this.base}/compartido/personas`, { params });
  }

  crearPersonaCompartida(body: { nombre: string }): Observable<PersonaCompartida> {
    return this.http.post<PersonaCompartida>(`${this.base}/compartido/personas`, body);
  }

  actualizarPersonaCompartida(id: number, body: { nombre: string }): Observable<PersonaCompartida> {
    return this.http.put<PersonaCompartida>(`${this.base}/compartido/personas/${id}`, body);
  }

  desactivarPersonaCompartida(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/compartido/personas/${id}`);
  }

  reactivarPersonaCompartida(id: number): Observable<PersonaCompartida> {
    return this.http.post<PersonaCompartida>(`${this.base}/compartido/personas/${id}/reactivar`, {});
  }

  resumenCompartido(): Observable<ResumenCompartido> {
    return this.http.get<ResumenCompartido>(`${this.base}/compartido/resumen`);
  }

  gastosCompartidos(): Observable<GastoCompartido[]> {
    return this.http.get<GastoCompartido[]>(`${this.base}/compartido/gastos`);
  }

  registrarGastoCompartido(body: {
    tipo: string;
    concepto: string;
    monto: number;
    fecha: string;
    personaIds: number[];
    formaPago: string;
    cuentaId?: number | null;
    meses?: number | null;
    servicioFijoId?: number | null;
    periodo?: string | null;
    incluyePrincipal?: boolean;
    perfiles?: number[];
    perfilesPrincipal?: number;
  }): Observable<GastoCompartido> {
    return this.http.post<GastoCompartido>(`${this.base}/compartido/gastos`, body);
  }

  recalcularGastoCompartido(
    id: number,
    body: {
      personaIds: number[];
      proporcionalDias?: boolean;
      fechaIngreso?: string;
      fechaSalida?: string;
      incluyePrincipal?: boolean;
      perfiles?: number[];
      perfilesPrincipal?: number;
    }
  ): Observable<GastoCompartido> {
    return this.http.post<GastoCompartido>(`${this.base}/compartido/gastos/${id}/recalcular`, body);
  }

  anularGastoCompartido(id: number): Observable<AnularGastoCompartidoResponse> {
    return this.http.delete<AnularGastoCompartidoResponse>(`${this.base}/compartido/gastos/${id}`);
  }

  serviciosFijosCompartidos(): Observable<ServicioFijoCompartido[]> {
    return this.http.get<ServicioFijoCompartido[]>(`${this.base}/compartido/servicios-fijos`);
  }

  crearServicioFijoCompartido(body: {
    concepto: string;
    monto: number;
    personaIds: number[];
    diaCobro?: number | null;
    incluyePrincipal?: boolean;
    yoPago?: boolean;
    perfiles?: number[];
    perfilesPrincipal?: number;
  }): Observable<ServicioFijoCompartido> {
    return this.http.post<ServicioFijoCompartido>(`${this.base}/compartido/servicios-fijos`, body);
  }

  actualizarServicioFijoCompartido(
    id: number,
    body: {
      concepto: string;
      monto: number;
      personaIds: number[];
      diaCobro?: number | null;
      incluyePrincipal?: boolean;
      yoPago?: boolean;
      perfiles?: number[];
      perfilesPrincipal?: number;
    }
  ): Observable<ServicioFijoCompartido> {
    return this.http.put<ServicioFijoCompartido>(`${this.base}/compartido/servicios-fijos/${id}`, body);
  }

  desactivarServicioFijoCompartido(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/compartido/servicios-fijos/${id}`);
  }

  cobrarServicioFijoCompartido(
    id: number,
    body: {
      fecha: string;
      formaPago: string;
      cuentaId?: number | null;
      meses?: number | null;
      periodo?: string | null;
    }
  ): Observable<GastoCompartido> {
    return this.http.post<GastoCompartido>(
      `${this.base}/compartido/servicios-fijos/${id}/cobrar`,
      body
    );
  }

  abonarPersonaCompartida(
    personaId: number,
    body: {
      monto: number;
      fecha: string;
      medio: string;
      concepto?: string;
      conceptoDestino?: string | null;
      formaPagoPrestamo?: string;
      cuentaId?: number | null;
    }
  ): Observable<MovimientoPersonaCompartida> {
    return this.http.post<MovimientoPersonaCompartida>(
      `${this.base}/compartido/personas/${personaId}/abonos`,
      body
    );
  }

  aplicarAnticipoCompartido(
    personaId: number,
    body: { conceptoDestino: string; monto: number }
  ): Observable<MovimientoPersonaCompartida> {
    return this.http.post<MovimientoPersonaCompartida>(
      `${this.base}/compartido/personas/${personaId}/aplicar-anticipo`,
      body
    );
  }

  entregarFavorPrestamoCompartido(
    personaId: number,
    body: {
      montoFavor: number;
      montoPrestamo: number;
      fecha: string;
      formaPagoPrestamo?: string;
      cuentaId?: number | null;
    }
  ): Observable<{
    entregado: number;
    deFavor: number;
    prestamo: number;
    quedaDebiendo: number;
    mensaje: string;
  }> {
    return this.http.post<{
      entregado: number;
      deFavor: number;
      prestamo: number;
      quedaDebiendo: number;
      mensaje: string;
    }>(`${this.base}/compartido/personas/${personaId}/entregar-favor-prestamo`, body);
  }

  adelantoFijoCompartido(
    personaId: number,
    body: { servicioFijoId: number; meses: number; fecha: string; medio: string }
  ): Observable<MovimientoPersonaCompartida> {
    return this.http.post<MovimientoPersonaCompartida>(
      `${this.base}/compartido/personas/${personaId}/adelanto-fijo`,
      body
    );
  }

  guardadoPersonaCompartida(
    personaId: number,
    body: { monto: number; fecha: string; tipo: string; concepto?: string }
  ): Observable<MovimientoPersonaCompartida> {
    return this.http.post<MovimientoPersonaCompartida>(
      `${this.base}/compartido/personas/${personaId}/guardado`,
      body
    );
  }

  movimientosPersonaCompartida(personaId: number): Observable<MovimientoPersonaCompartida[]> {
    return this.http.get<MovimientoPersonaCompartida[]>(
      `${this.base}/compartido/personas/${personaId}/movimientos`
    );
  }

  movimientosCompartidos(): Observable<MovimientoPersonaCompartida[]> {
    return this.http.get<MovimientoPersonaCompartida[]>(`${this.base}/compartido/movimientos`);
  }

  previewRepartoCompartido(monto: number, personas: number): Observable<{
    monto: number;
    personas: number;
    partePrincipal: number;
    partesOtros: number[];
    /** [principal, ...otros] */
    partes: number[];
  }> {
    const params = new HttpParams()
      .set('monto', String(monto))
      .set('personas', String(personas));
    return this.http.get<{
      monto: number;
      personas: number;
      partePrincipal: number;
      partesOtros: number[];
      partes: number[];
    }>(`${this.base}/compartido/reparto`, { params });
  }
}
