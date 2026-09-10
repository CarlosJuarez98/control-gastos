import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CurrencyPipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../api.service';
import { ConfirmDialogService } from '../../confirm-dialog.service';
import { Cuenta, Movimiento } from '../../modelos';
import { formatDineroInput, formatDineroNumero, parseDinero, soloMontoKey } from '../../dinero.util';
import { FechaCortaPipe, fechaHoyLocal } from '../../fecha.util';
import { EnterAvanceDirective } from '../../enter-avance.directive';

@Component({
  selector: 'app-cuentas',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, FechaCortaPipe, RouterLink, NgTemplateOutlet, EnterAvanceDirective],
  templateUrl: './cuentas.component.html',
  styleUrl: './cuentas.component.css',
})
export class CuentasComponent implements OnInit, OnDestroy {
  @ViewChild('panelDetalle') panelDetalle?: ElementRef<HTMLElement>;

  cuentas: Cuenta[] = [];
  seleccionada?: Cuenta;
  movimientos: Movimiento[] = [];
  nueva: Cuenta = { nombre: '', tipo: 'TDC', saldoActual: 0 };
  saldoNueva = '';
  /** Metadatos de corte / pago al crear (TDC o tienda). */
  nuevaDiaCorte = '';
  nuevaDiaLimite = '';
  nuevaLimite = '';
  /** Edición de corte / límite en el detalle. */
  tdcEdit = {
    diaCorte: '',
    diaLimitePago: '',
    limiteCredito: '',
  };
  guardandoTdc = false;
  /** Nombre editable en el detalle. */
  nombreEdit = '';
  guardandoNombre = false;
  /** Flags de formularios listos. */
  formNuevaOk = false;
  formMovOk = false;
  mov: { fecha: string; tipo: string } = {
    fecha: fechaHoyLocal(),
    tipo: 'ABONO',
  };
  montoMov = '';
  editMovId: number | null = null;
  tipos = ['TDC', 'PRESTAMO', 'TIENDA', 'TERRENO', 'PRESTAMO_OTORGADO', 'OTRO'];
  /** Tipos base; en TDC el CARGO nuevo se registra desde Gastos. */
  private readonly tiposMovBase = ['ABONO', 'CARGO', 'INTERES', 'REEMBOLSO'];
  private readonly tiposMovTdc = ['ABONO', 'INTERES', 'REEMBOLSO'];
  error = '';
  hoy = fechaHoyLocal();
  guardandoTipo = false;
  saldoDisponible: number | null = null;
  /** En móvil el detalle va debajo de la deuda elegida. */
  esMovil = false;

  private media?: MediaQueryList;
  private onMedia?: () => void;

  constructor(
    private api: ApiService,
    private route: ActivatedRoute,
    private router: Router,
    private confirmDlg: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.hoy = fechaHoyLocal();
    this.mov.fecha = this.hoy;
    this.refrescarFormNuevaOk();
    this.refrescarFormMovOk();
    this.media = window.matchMedia('(max-width: 860px)');
    this.onMedia = () => {
      this.esMovil = !!this.media?.matches;
      this.cdr.detectChanges();
    };
    this.onMedia();
    this.media.addEventListener('change', this.onMedia);
    this.cargarCuentas();
    this.cargarSaldoDisponible();
    this.route.paramMap.subscribe((p) => {
      const id = p.get('id');
      if (id) this.abrir(+id);
      else {
        this.seleccionada = undefined;
        this.movimientos = [];
        this.nombreEdit = '';
      }
    });
  }

  ngOnDestroy(): void {
    if (this.media && this.onMedia) {
      this.media.removeEventListener('change', this.onMedia);
    }
  }

  /**
   * Segundo clic en la deuda abierta la cierra (PC y móvil).
   */
  linkCuenta(c: Cuenta): string | any[] {
    if (c.id && this.seleccionada?.id === c.id) {
      return '/cuentas';
    }
    return ['/cuentas', c.id];
  }

  etiquetaTipo(t: string): string {
    switch ((t || '').toUpperCase()) {
      case 'TDC': return 'TDC';
      case 'PRESTAMO': return 'Préstamo';
      case 'TIENDA': return 'Tienda';
      case 'TERRENO': return 'Terreno';
      case 'PRESTAMO_OTORGADO': return 'Prestamista';
      case 'OTRO': return 'Otro';
      default: return t;
    }
  }

  esTdc(c?: Cuenta | null): boolean {
    return !!c && (c.tipo || '').toUpperCase() === 'TDC';
  }

  /** TDC, tienda, préstamo o terreno: pueden tener corte / límite de pago. */
  esConCalendario(c?: Cuenta | null): boolean {
    const t = (c?.tipo || '').toUpperCase();
    return t === 'TDC' || t === 'TIENDA' || t === 'PRESTAMO' || t === 'TERRENO';
  }

  get nuevaConCalendario(): boolean {
    return this.esConCalendario(this.nueva);
  }

  /** En TDC no se crean cargos manuales (van por Gastos); al editar un CARGO existente sí se muestra. */
  get tiposMov(): string[] {
    if (!this.esTdc(this.seleccionada)) return this.tiposMovBase;
    if (this.editMovId != null && (this.mov.tipo || '').toUpperCase() === 'CARGO') {
      return ['CARGO', ...this.tiposMovTdc];
    }
    return this.tiposMovTdc;
  }

  creditoDisponibleDe(c: Cuenta): number | null {
    if (c.creditoDisponible != null) return Number(c.creditoDisponible);
    if (c.limiteCredito == null) return null;
    return Math.round((Number(c.limiteCredito) - Number(c.saldoActual || 0)) * 100) / 100;
  }

  /** Texto corto en lista: "Corte 9 · Pago 22" (solo el día, sin fecha repetida). */
  textoCalendario(
    diaCorte: number | string | null | undefined,
    diaLimite: number | string | null | undefined,
  ): string {
    const partes: string[] = [];
    const corte = typeof diaCorte === 'number' ? diaCorte : this.parseDiaMes(diaCorte);
    const pago = typeof diaLimite === 'number' ? diaLimite : this.parseDiaMes(diaLimite);
    if (corte != null) partes.push(`Corte ${corte}`);
    if (pago != null) partes.push(`Pago ${pago}`);
    return partes.join(' · ');
  }

  /** @deprecated alias */
  textoCalendarioTdc(
    diaCorte: number | string | null | undefined,
    diaLimite: number | string | null | undefined,
  ): string {
    return this.textoCalendario(diaCorte, diaLimite);
  }

  private sincronizarTdcEdit(c: Cuenta): void {
    this.nombreEdit = c.nombre || '';
    this.tdcEdit = {
      diaCorte: c.diaCorte != null ? String(c.diaCorte) : '',
      diaLimitePago: c.diaLimitePago != null ? String(c.diaLimitePago) : '',
      limiteCredito:
        c.limiteCredito != null && c.limiteCredito !== undefined
          ? formatDineroInput(String(c.limiteCredito))
          : '',
    };
  }

  guardarNombre(): void {
    if (!this.seleccionada?.id || this.guardandoNombre) return;
    const nombre = (this.nombreEdit || '').trim();
    if (!nombre) {
      this.nombreEdit = this.seleccionada.nombre || '';
      this.error = 'El nombre no puede quedar vacío';
      return;
    }
    if (nombre === (this.seleccionada.nombre || '').trim()) {
      this.nombreEdit = this.seleccionada.nombre || '';
      return;
    }
    this.error = '';
    this.guardandoNombre = true;
    const body: Cuenta = {
      ...this.seleccionada,
      nombre,
    };
    this.api.actualizarCuenta(this.seleccionada.id, body).subscribe({
      next: (c) => {
        this.seleccionada = c;
        this.nombreEdit = c.nombre || '';
        this.guardandoNombre = false;
        this.cargarCuentas();
      },
      error: (e) => {
        this.guardandoNombre = false;
        this.nombreEdit = this.seleccionada?.nombre || '';
        this.error = e?.error?.error || 'No se pudo renombrar la deuda';
      },
    });
  }

  private parseDiaMes(v: string | number | null | undefined): number | null {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(/\D/g, ''));
    if (!Number.isFinite(n) || n < 1 || n > 31) return null;
    return n;
  }

  etiquetaMov(t: string): string {
    switch ((t || '').toUpperCase()) {
      case 'ABONO': return 'Abono';
      case 'CARGO': return 'Cargo';
      case 'INTERES': return 'Interés';
      case 'REEMBOLSO': return 'Reembolso';
      default: return t;
    }
  }

  onTipoMovChange(tipo: string): void {
    this.mov.tipo = tipo;
    this.error = '';
    if (this.editMovId != null) {
      this.refrescarFormMovOk();
      return;
    }
    if (tipo === 'INTERES' && this.seleccionada) {
      const actual = Number(this.seleccionada.saldoActual) || 0;
      this.montoMov = actual > 0 ? formatDineroNumero(actual) : '';
    } else {
      this.montoMov = '';
    }
    this.refrescarFormMovOk();
  }

  /** Si tipo=INTERES y alta nueva, montoMov es la deuda nueva → interés = nueva − actual. */
  get interesCalculado(): number {
    if (this.editMovId != null || this.mov.tipo !== 'INTERES' || !this.seleccionada) return 0;
    const nueva = parseDinero(this.montoMov);
    const actual = Number(this.seleccionada.saldoActual) || 0;
    return Math.round((nueva - actual) * 100) / 100;
  }

  get usandoDeudaHoy(): boolean {
    return this.mov.tipo === 'INTERES' && this.editMovId == null;
  }

  get puedeEliminarCuenta(): boolean {
    return !!this.seleccionada?.id && Number(this.seleccionada.saldoActual) === 0;
  }

  private fechaLocal(d = new Date()): string {
    return fechaHoyLocal(d);
  }

  soloMonto(ev: KeyboardEvent): void {
    soloMontoKey(ev);
  }

  alEscribirMonto(v: string): void {
    this.montoMov = formatDineroInput(v);
    this.error = '';
    this.refrescarFormMovOk();
  }

  alEscribirSaldoNueva(v: string): void {
    this.saldoNueva = formatDineroInput(v);
    this.error = '';
  }

  get deudaVisible(): number {
    return this.misDeudasPendientes
      .reduce((a, c) => a + Number(c.saldoActual), 0);
  }

  get meDebenTotal(): number {
    return this.meDebenPendientes
      .reduce((a, c) => a + Number(c.saldoActual), 0);
  }

  private porNombre(a: Cuenta, b: Cuenta): number {
    return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
  }

  private esPrestamista(c: Cuenta): boolean {
    return (c.tipo || '').toUpperCase() === 'PRESTAMO_OTORGADO';
  }

  get seleccionPrestamista(): boolean {
    return !!this.seleccionada && this.esPrestamista(this.seleccionada);
  }

  get misDeudasPendientes(): Cuenta[] {
    return this.cuentas
      .filter((c) => !this.esPrestamista(c) && Number(c.saldoActual) !== 0)
      .sort((a, b) => this.porNombre(a, b));
  }

  /** Mis deudas agrupadas por tipo; cada bloque ordenado A→Z. */
  get gruposMisDeudas(): { tipo: string; etiqueta: string; cuentas: Cuenta[] }[] {
    const orden = ['TDC', 'PRESTAMO', 'TIENDA', 'TERRENO', 'OTRO'];
    const mapa = new Map<string, Cuenta[]>();
    for (const c of this.misDeudasPendientes) {
      let t = (c.tipo || 'OTRO').toUpperCase();
      if (!orden.includes(t)) t = 'OTRO';
      const list = mapa.get(t) || [];
      list.push(c);
      mapa.set(t, list);
    }
    return orden
      .filter((t) => (mapa.get(t) || []).length > 0)
      .map((t) => ({
        tipo: t,
        etiqueta: this.etiquetaTipo(t),
        cuentas: (mapa.get(t) || []).slice().sort((a, b) => this.porNombre(a, b)),
      }));
  }

  get meDebenPendientes(): Cuenta[] {
    return this.cuentas
      .filter((c) => this.esPrestamista(c) && Number(c.saldoActual) !== 0)
      .sort((a, b) => this.porNombre(a, b));
  }

  get cuentasSaldadas(): Cuenta[] {
    return this.cuentas
      .filter((c) => Number(c.saldoActual) === 0)
      .sort((a, b) => this.porNombre(a, b));
  }

  cargarSaldoDisponible(): void {
    this.api.saldo().subscribe({
      next: (r) => {
        const v = r?.esperado;
        this.saldoDisponible = v == null || v === undefined ? null : Number(v);
      },
      error: () => (this.saldoDisponible = null),
    });
  }

  /** Disponible efectivo para un CARGO, deshaciendo el movimiento en edición si aplica. */
  private disponibleParaCargo(monto: number, movAnterior?: Movimiento | null): boolean {
    if (this.saldoDisponible == null) return true;
    let disp = this.saldoDisponible;
    if (movAnterior && this.seleccionPrestamista) {
      const t = (movAnterior.tipo || '').toUpperCase();
      const m = Number(movAnterior.monto) || 0;
      if (t === 'CARGO') disp += m;
      else if (t === 'ABONO' || t === 'REEMBOLSO') disp -= m;
    }
    return disp + 1e-9 >= monto;
  }

  private tieneSaldoDisponible(monto: number): boolean {
    return this.disponibleParaCargo(monto);
  }

  cargarCuentas(): void {
    this.api.cuentas().subscribe({
      next: (r) => (this.cuentas = r),
      error: (e) => (this.error = e?.error?.error || 'Error al cargar cuentas'),
    });
  }

  abrir(id: number): void {
    this.cancelarEdicionMov();
    this.api.cuenta(id).subscribe({
      next: (c) => {
        this.seleccionada = c;
        this.sincronizarTdcEdit(c);
        this.error = '';
        this.api.movimientos(id).subscribe({ next: (m) => (this.movimientos = m) });
        // En móvil: el panel queda bajo la deuda; asegurar que se vea
        setTimeout(() => {
          this.panelDetalle?.nativeElement?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          });
        }, 120);
      },
      error: (e) => {
        this.seleccionada = undefined;
        this.movimientos = [];
        this.error = e?.error?.error || 'Cuenta no encontrada';
      },
    });
  }

  get puedeCrearCuenta(): boolean {
    return this.formNuevaOk;
  }

  get puedeRegistrarMovimiento(): boolean {
    return this.formMovOk;
  }

  refrescarFormNuevaOk(): void {
    this.formNuevaOk = !!(this.nueva.nombre || '').trim();
  }

  refrescarFormMovOk(): void {
    if (this.usandoDeudaHoy) {
      const deudaHoy = parseDinero(this.montoMov);
      const actual = Number(this.seleccionada?.saldoActual) || 0;
      this.formMovOk = !!deudaHoy && deudaHoy > actual;
      return;
    }
    const monto = parseDinero(this.montoMov);
    this.formMovOk = !!monto && monto > 0;
  }

  crearCuenta(): void {
    this.refrescarFormNuevaOk();
    if (!this.formNuevaOk) return;
    this.error = '';
    const saldo = parseDinero(this.saldoNueva);
    if ((this.nueva.tipo || '').toUpperCase() === 'PRESTAMO_OTORGADO' && saldo > 0) {
      if (!this.tieneSaldoDisponible(saldo)) {
        this.error = 'Saldo insuficiente';
        return;
      }
    }
    const conCal = this.esConCalendario(this.nueva);
    const body: Cuenta = {
      ...this.nueva,
      saldoActual: saldo,
      diaCorte: conCal ? this.parseDiaMes(this.nuevaDiaCorte) : null,
      diaLimitePago: conCal ? this.parseDiaMes(this.nuevaDiaLimite) : null,
      limiteCredito: conCal && this.nuevaLimite.trim()
        ? parseDinero(this.nuevaLimite)
        : null,
    };
    this.api.crearCuenta(body).subscribe({
      next: () => {
        this.nueva = { nombre: '', tipo: 'TDC', saldoActual: 0 };
        this.saldoNueva = '';
        this.nuevaDiaCorte = '';
        this.nuevaDiaLimite = '';
        this.nuevaLimite = '';
        this.refrescarFormNuevaOk();
        this.cargarCuentas();
        this.cargarSaldoDisponible();
      },
      error: (e) => (this.error = e?.error?.error || 'No se pudo crear la cuenta'),
    });
  }

  alEscribirLimiteNuevo(v: string): void {
    this.nuevaLimite = formatDineroInput(v);
  }

  alEscribirLimiteEdit(v: string): void {
    this.tdcEdit.limiteCredito = formatDineroInput(v);
  }

  guardarDatosCalendario(): void {
    if (!this.seleccionada?.id || !this.esConCalendario(this.seleccionada) || this.guardandoTdc) return;
    this.error = '';
    this.guardandoTdc = true;
    const limiteTxt = this.tdcEdit.limiteCredito.trim();
    const body: Cuenta = {
      ...this.seleccionada,
      diaCorte: this.parseDiaMes(this.tdcEdit.diaCorte),
      diaLimitePago: this.parseDiaMes(this.tdcEdit.diaLimitePago),
      limiteCredito: limiteTxt ? parseDinero(limiteTxt) : null,
    };
    this.api.actualizarCuenta(this.seleccionada.id, body).subscribe({
      next: (c) => {
        this.seleccionada = c;
        this.sincronizarTdcEdit(c);
        this.guardandoTdc = false;
        this.cargarCuentas();
      },
      error: (e) => {
        this.guardandoTdc = false;
        this.error = e?.error?.error || 'No se pudieron guardar corte / pago';
      },
    });
  }

  /** @deprecated */
  guardarDatosTdc(): void {
    this.guardarDatosCalendario();
  }

  cambiarTipo(tipo: string): void {
    if (!this.seleccionada?.id || this.guardandoTipo) return;
    if ((this.seleccionada.tipo || '') === tipo) return;
    this.error = '';
    this.guardandoTipo = true;
    const body: Cuenta = {
      ...this.seleccionada,
      tipo,
    };
    this.api.actualizarCuenta(this.seleccionada.id, body).subscribe({
      next: (c) => {
        this.seleccionada = c;
        this.sincronizarTdcEdit(c);
        this.guardandoTipo = false;
        this.cargarCuentas();
      },
      error: (e) => {
        this.guardandoTipo = false;
        this.error = e?.error?.error || 'No se pudo cambiar la categoría';
      },
    });
  }

  async eliminarCuenta(c?: Cuenta): Promise<void> {
    const cuenta = c || this.seleccionada;
    if (!cuenta?.id) return;
    if (Number(cuenta.saldoActual) !== 0) {
      this.error = 'Solo puedes eliminar cuentas con saldo en $0';
      return;
    }
    const ok = await this.confirmDlg.ask(
      `¿Eliminar “${cuenta.nombre}”? Se quita de la lista; el historial de abonos se conserva y no cambia tu disponible.`,
      { titulo: 'Eliminar cuenta', confirmarTexto: 'Eliminar' },
    );
    if (!ok) return;
    this.error = '';
    const id = cuenta.id;
    this.api.eliminarCuenta(id).subscribe({
      next: () => {
        if (this.seleccionada?.id === id) {
          this.seleccionada = undefined;
          this.movimientos = [];
          void this.router.navigateByUrl('/cuentas');
        }
        this.cargarCuentas();
        this.cargarSaldoDisponible();
      },
      error: (e) => (this.error = e?.error?.error || 'No se pudo eliminar'),
    });
  }

  editarMovimiento(m: Movimiento): void {
    if (!m.id) return;
    this.error = '';
    this.editMovId = m.id;
    this.mov = {
      fecha: (m.fecha || '').slice(0, 10) || fechaHoyLocal(),
      tipo: (m.tipo || 'ABONO').toUpperCase(),
    };
    this.montoMov = formatDineroNumero(Number(m.monto) || 0);
    this.refrescarFormMovOk();
  }

  cancelarEdicionMov(): void {
    this.editMovId = null;
    this.hoy = fechaHoyLocal();
    this.mov = { fecha: this.hoy, tipo: 'ABONO' };
    this.montoMov = '';
    this.error = '';
    this.refrescarFormMovOk();
  }

  private resolverMonto(): number | null {
    if (this.usandoDeudaHoy) {
      const deudaHoy = parseDinero(this.montoMov);
      const actual = Number(this.seleccionada?.saldoActual) || 0;
      if (!deudaHoy || deudaHoy <= 0) {
        this.error = 'Captura la deuda que marca hoy';
        return null;
      }
      const monto = Math.round((deudaHoy - actual) * 100) / 100;
      if (monto <= 0) {
        this.error = 'La deuda de hoy debe ser mayor al saldo registrado para calcular el interés';
        return null;
      }
      return monto;
    }
    const monto = parseDinero(this.montoMov);
    if (!monto || monto <= 0) {
      this.error = 'El monto debe ser mayor a cero';
      return null;
    }
    return monto;
  }

  agregarMovimiento(): void {
    this.refrescarFormMovOk();
    if (!this.seleccionada?.id || !this.formMovOk) return;
    this.error = '';
    this.hoy = fechaHoyLocal();
    if (!this.mov.fecha) {
      this.mov.fecha = this.hoy;
    }
    if (this.mov.fecha > this.hoy) {
      this.error = 'La fecha no puede ser mayor a hoy';
      return;
    }

    if (
      this.esTdc(this.seleccionada) &&
      (this.mov.tipo || '').toUpperCase() === 'CARGO' &&
      this.editMovId == null
    ) {
      this.error = 'En TDC las compras se registran en Gastos (pago con tarjeta)';
      return;
    }

    const monto = this.resolverMonto();
    if (monto == null) return;

    const anterior = this.editMovId != null
      ? this.movimientos.find((x) => x.id === this.editMovId)
      : null;

    if (this.seleccionPrestamista && this.mov.tipo === 'CARGO') {
      if (!this.disponibleParaCargo(monto, anterior)) {
        this.error = 'Saldo insuficiente';
        return;
      }
    }

    const body: Movimiento = {
      fecha: this.mov.fecha,
      tipo: this.mov.tipo,
      monto,
    };

    const cuentaId = this.seleccionada.id;
    const req = this.editMovId != null
      ? this.api.actualizarMovimiento(cuentaId, this.editMovId, body)
      : this.api.agregarMovimiento(cuentaId, body);

    req.subscribe({
      next: () => {
        this.cancelarEdicionMov();
        this.abrir(cuentaId);
        this.cargarCuentas();
        this.cargarSaldoDisponible();
      },
      error: (e) => (this.error = e?.error?.error || 'No se pudo guardar'),
    });
  }

  async eliminarMovimiento(m: Movimiento): Promise<void> {
    if (!this.seleccionada?.id || !m.id) return;
    const ok = await this.confirmDlg.ask(
      `¿Eliminar ${this.etiquetaMov(m.tipo)} de ${formatDineroNumero(Number(m.monto) || 0)}?`,
      { titulo: 'Eliminar movimiento', confirmarTexto: 'Borrar' },
    );
    if (!ok) return;
    this.error = '';
    const cuentaId = this.seleccionada.id;
    this.api.eliminarMovimiento(cuentaId, m.id).subscribe({
      next: () => {
        if (this.editMovId === m.id) this.cancelarEdicionMov();
        this.abrir(cuentaId);
        this.cargarCuentas();
        this.cargarSaldoDisponible();
      },
      error: (e) => (this.error = e?.error?.error || 'No se pudo eliminar'),
    });
  }
}
