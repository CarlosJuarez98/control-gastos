import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit } from '@angular/core';
import { CurrencyPipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../api.service';
import { ConfirmDialogService } from '../../confirm-dialog.service';
import { Cuenta, Movimiento } from '../../modelos';
import { formatDineroInput, formatDineroNumero, parseDinero, soloMontoKey } from '../../dinero.util';
import { FechaCortaPipe, fechaHoyLocal } from '../../fecha.util';
import { EnterAvanceDirective } from '../../enter-avance.directive';
import { PaginadorComponent } from '../../compartido/paginador/paginador.component';
import { EstadoPaginacion } from '../../compartido/paginar.util';

@Component({
  selector: 'app-cuentas',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, FechaCortaPipe, RouterLink, NgTemplateOutlet, EnterAvanceDirective, PaginadorComponent],
  templateUrl: './cuentas.component.html',
  styleUrl: './cuentas.component.css',
})
export class CuentasComponent implements OnInit, OnDestroy {
  cuentas: Cuenta[] = [];
  seleccionada?: Cuenta;
  movimientos: Movimiento[] = [];
  readonly pagMovs = new EstadoPaginacion();
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
  guardandoBloqueo = false;
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
  private readonly tiposMovPrestamista = ['CARGO', 'INTERES', 'ABONO', 'REEMBOLSO'];
  private readonly tiposMovTdc = ['ABONO', 'INTERES', 'REEMBOLSO'];
  error = '';
  hoy = fechaHoyLocal();
  guardandoTipo = false;
  saldoDisponible: number | null = null;
  /** En móvil el detalle va debajo de la deuda elegida. */
  esMovil = false;
  /** En móvil el alta de cuenta va contraída (poco uso frente a abonos). */
  altaNuevaAbierta = false;
  /** Secciones secundarias del detalle en móvil. */
  movilOpcionesAbiertas = false;
  movilCalendarioAbierto = false;
  movilHistorialAbierto = false;

  private media?: MediaQueryList;
  private onMedia?: () => void;
  /** Al cerrar, re-centrar esta deuda sin saltar al inicio. */
  private anclarTrasCerrarId: number | null = null;
  /** Scroll del host capturado en el clic (antes de que el DOM crezca/encoja). */
  private scrollTopAlClic: number | null = null;

  constructor(
    private api: ApiService,
    private route: ActivatedRoute,
    private router: Router,
    private confirmDlg: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
    private host: ElementRef<HTMLElement>,
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
        const anclarId = this.anclarTrasCerrarId;
        this.anclarTrasCerrarId = null;
        const hostEl = this.host.nativeElement;
        const topGuardado = this.scrollTopAlClic ?? hostEl.scrollTop;
        this.scrollTopAlClic = null;
        this.seleccionada = undefined;
        this.movimientos = [];
        this.nombreEdit = '';
        this.movilOpcionesAbiertas = false;
        this.movilCalendarioAbierto = false;
        this.movilHistorialAbierto = false;
        if (this.esMovil && anclarId != null) {
          this.cdr.detectChanges();
          this.restaurarScroll(topGuardado, anclarId);
        }
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
   * El link siempre apunta a la deuda; el cierre se hace en alClicCuenta.
   */
  linkCuenta(c: Cuenta): any[] {
    return ['/cuentas', c.id];
  }

  /** Guarda scroll antes de navegar; segundo clic cierra sin saltar arriba. */
  alClicCuenta(ev: Event, c: Cuenta): void {
    if (!c.id) return;
    if (this.esMovil) {
      this.scrollTopAlClic = this.host.nativeElement.scrollTop;
    }
    if (this.seleccionada?.id === c.id) {
      ev.preventDefault();
      ev.stopPropagation();
      this.anclarTrasCerrarId = c.id;
      void this.router.navigateByUrl('/cuentas');
    }
  }

  toggleAltaNueva(): void {
    this.altaNuevaAbierta = !this.altaNuevaAbierta;
  }

  private restaurarScroll(top: number, anclarId?: number | null): void {
    const hostEl = this.host.nativeElement;
    const aplicar = () => {
      const max = Math.max(0, hostEl.scrollHeight - hostEl.clientHeight);
      hostEl.scrollTop = Math.min(Math.max(0, top), max);
      if (anclarId != null) {
        const fila = hostEl.querySelector(`#cuenta-${anclarId}`) as HTMLElement | null;
        if (fila) {
          fila.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
        }
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(aplicar));
  }

  private anclarCuentaEnVista(id: number, modo: ScrollLogicalPosition = 'start'): void {
    const aplicar = () => {
      const hostEl = this.host.nativeElement;
      const fila = hostEl.querySelector(`#cuenta-${id}`) as HTMLElement | null;
      if (!fila) return;
      // Preferir scroll del host (móvil); scrollIntoView a veces mueve el viewport mal.
      const hostTop = hostEl.getBoundingClientRect().top;
      const filaTop = fila.getBoundingClientRect().top;
      const delta = filaTop - hostTop - 8;
      if (modo === 'start' || Math.abs(delta) > 4) {
        hostEl.scrollTop = Math.max(0, hostEl.scrollTop + delta);
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(aplicar));
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

  enCero(c: Cuenta): boolean {
    return Number(c.saldoActual) === 0;
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
    if (this.seleccionPrestamista) return this.tiposMovPrestamista;
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
      case 'ABONO': return this.seleccionPrestamista ? 'Cobro' : 'Abono';
      case 'CARGO': return this.seleccionPrestamista ? 'Préstamo' : 'Cargo';
      case 'INTERES': return this.seleccionPrestamista ? 'Rédito' : 'Interés';
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
    // TDC: capturas la deuda que marca hoy → se calcula el interés.
    // Prestamista: capturas el rédito a cobrar (monto directo).
    if (tipo === 'INTERES' && this.seleccionada && !this.seleccionPrestamista) {
      const actual = Number(this.seleccionada.saldoActual) || 0;
      this.montoMov = actual > 0 ? formatDineroNumero(actual) : '';
    } else {
      this.montoMov = '';
    }
    this.refrescarFormMovOk();
  }

  /** Si tipo=INTERES y alta nueva en TDC, montoMov es la deuda nueva → interés = nueva − actual. */
  get interesCalculado(): number {
    if (this.editMovId != null || this.mov.tipo !== 'INTERES' || !this.seleccionada) return 0;
    if (this.seleccionPrestamista) return 0;
    const nueva = parseDinero(this.montoMov);
    const actual = Number(this.seleccionada.saldoActual) || 0;
    return Math.round((nueva - actual) * 100) / 100;
  }

  get usandoDeudaHoy(): boolean {
    return this.mov.tipo === 'INTERES' && this.editMovId == null && !this.seleccionPrestamista;
  }

  get cobrandoRedito(): boolean {
    return this.seleccionPrestamista && this.mov.tipo === 'INTERES' && this.editMovId == null;
  }

  /**
   * Desglose prestamista: cobros primero liquidan rédito, luego capital.
   * Total ≈ saldoActual.
   */
  get resumenPrestamo(): { capital: number; redito: number; total: number } | null {
    if (!this.seleccionPrestamista || !this.seleccionada) return null;
    let prestado = 0;
    let reditoCargado = 0;
    let cobros = 0;
    for (const m of this.movimientos) {
      const monto = Number(m.monto) || 0;
      switch ((m.tipo || '').toUpperCase()) {
        case 'CARGO':
          prestado += monto;
          break;
        case 'INTERES':
          reditoCargado += monto;
          break;
        case 'ABONO':
        case 'REEMBOLSO':
          cobros += monto;
          break;
        default:
          break;
      }
    }
    const aRedito = Math.min(cobros, reditoCargado);
    const redito = Math.round((reditoCargado - aRedito) * 100) / 100;
    const aCapital = cobros - aRedito;
    const capital = Math.round(Math.max(0, prestado - aCapital) * 100) / 100;
    const total = Math.round((capital + redito) * 100) / 100;
    return { capital, redito, total };
  }

  /** Atajo: deja listo el formulario para cobrar rédito. */
  prepararCobrarRedito(): void {
    if (!this.seleccionPrestamista) return;
    this.editMovId = null;
    this.hoy = fechaHoyLocal();
    this.mov = { fecha: this.hoy, tipo: 'INTERES' };
    this.montoMov = '';
    this.error = '';
    this.refrescarFormMovOk();
    this.cdr.detectChanges();
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(
        'form.alta-mov input[name="mmonto"]',
      );
      el?.focus();
    }, 50);
  }

  get puedeEliminarCuenta(): boolean {
    if (!this.seleccionada?.id || Number(this.seleccionada.saldoActual) !== 0) return false;
    // Las TDC se dejan de usar (bloqueo), no se eliminan.
    return !this.esTdc(this.seleccionada);
  }

  /** TDC saldada u otra: texto del botón de bloqueo. */
  etiquetaBloqueoTdc(c?: Cuenta | null): string {
    const cuenta = c || this.seleccionada;
    if (!cuenta) return 'Dejar de usar';
    const saldada = Number(cuenta.saldoActual) === 0;
    if (cuenta.bloqueada) {
      return saldada ? 'Volver a usar' : 'Desbloquear compras';
    }
    return saldada ? 'Dejar de usar' : 'Bloquear compras';
  }

  puedeQuitarDeLista(c: Cuenta): boolean {
    return Number(c.saldoActual) === 0 && !this.esTdc(c);
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

  /** Abono/reembolso a deuda propia: sí resta de tu disponible (efectivo teórico). */
  get esPagoConDisponible(): boolean {
    if (!this.seleccionada || this.seleccionPrestamista) return false;
    const t = (this.mov.tipo || '').toUpperCase();
    return t === 'ABONO' || t === 'REEMBOLSO';
  }

  get abonoSuperaDisponible(): boolean {
    if (!this.esPagoConDisponible || this.saldoDisponible == null) return false;
    const monto = parseDinero(this.montoMov);
    return monto != null && monto > 0 && monto > this.saldoDisponible + 1e-9;
  }

  get misDeudasPendientes(): Cuenta[] {
    return this.cuentas
      .filter((c) => !this.esPrestamista(c) && Number(c.saldoActual) !== 0)
      .sort((a, b) => this.porNombre(a, b));
  }

  /** TDC en $0: se quedan en el bloque TDC (abajo), no en Saldadas. */
  private tdcEnCero(): Cuenta[] {
    return this.cuentas
      .filter((c) => this.esTdc(c) && Number(c.saldoActual) === 0)
      .sort((a, b) => this.porNombre(a, b));
  }

  /** Mis deudas agrupadas por tipo; cada bloque ordenado A→Z. TDC en $0 al final del grupo TDC. */
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
    const cero = this.tdcEnCero();
    if (cero.length) {
      const list = mapa.get('TDC') || [];
      list.push(...cero);
      mapa.set('TDC', list);
    }
    return orden
      .filter((t) => (mapa.get(t) || []).length > 0)
      .map((t) => {
        const raw = mapa.get(t) || [];
        const cuentas =
          t === 'TDC'
            ? [
                ...raw
                  .filter((c) => Number(c.saldoActual) !== 0)
                  .sort((a, b) => this.porNombre(a, b)),
                ...raw
                  .filter((c) => Number(c.saldoActual) === 0)
                  .sort((a, b) => this.porNombre(a, b)),
              ]
            : raw.slice().sort((a, b) => this.porNombre(a, b));
        return { tipo: t, etiqueta: this.etiquetaTipo(t), cuentas };
      });
  }

  get meDebenPendientes(): Cuenta[] {
    return this.cuentas
      .filter((c) => this.esPrestamista(c) && Number(c.saldoActual) !== 0)
      .sort((a, b) => this.porNombre(a, b));
  }

  get cuentasSaldadas(): Cuenta[] {
    return this.cuentas
      .filter((c) => Number(c.saldoActual) === 0 && !this.esTdc(c))
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
    this.movilOpcionesAbiertas = true;
    this.movilCalendarioAbierto = true;
    this.movilHistorialAbierto = true;
    this.pagMovs.reset();
    this.api.cuenta(id).subscribe({
      next: (c) => {
        this.seleccionada = c;
        this.sincronizarTdcEdit(c);
        this.error = '';
        this.api.movimientos(id).subscribe({
          next: (m) => {
            this.movimientos = m;
            this.pagMovs.reset();
            this.cdr.markForCheck();
          },
        });
        // En móvil: dejar la deuda abierta a la altura del clic (cabecera visible arriba).
        if (this.esMovil) {
          this.cdr.detectChanges();
          const top = this.scrollTopAlClic;
          this.scrollTopAlClic = null;
          setTimeout(() => {
            if (top != null) {
              const hostEl = this.host.nativeElement;
              const max = Math.max(0, hostEl.scrollHeight - hostEl.clientHeight);
              hostEl.scrollTop = Math.min(top, max);
            }
            this.anclarCuentaEnVista(id, 'start');
          }, 50);
        }
      },
      error: (e) => {
        this.seleccionada = undefined;
        this.movimientos = [];
        this.pagMovs.reset();
        this.error = e?.error?.error || 'Cuenta no encontrada';
      },
    });
  }

  get movimientosPagina(): Movimiento[] {
    return this.pagMovs.slice(this.movimientos);
  }

  alCambiarPagMovs(pagina: number): void {
    this.pagMovs.alCambiarPagina(pagina, this.movimientos.length);
    this.cdr.markForCheck();
  }

  alCambiarTamMovs(tam: number): void {
    this.pagMovs.alCambiarTam(tam, this.movimientos.length);
    this.cdr.markForCheck();
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
        this.altaNuevaAbierta = false;
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

  /** Bloquea/desbloquea compras nuevas en Gastos (solo TDC). */
  toggleBloqueoTdc(): void {
    if (!this.seleccionada?.id || !this.esTdc(this.seleccionada) || this.guardandoBloqueo) return;
    this.error = '';
    this.guardandoBloqueo = true;
    const body: Cuenta = {
      ...this.seleccionada,
      bloqueada: !this.seleccionada.bloqueada,
    };
    this.api.actualizarCuenta(this.seleccionada.id, body).subscribe({
      next: (c) => {
        this.seleccionada = c;
        this.guardandoBloqueo = false;
        this.cargarCuentas();
      },
      error: (e) => {
        this.guardandoBloqueo = false;
        this.error = e?.error?.error || 'No se pudo actualizar el bloqueo';
      },
    });
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
    if (this.esTdc(cuenta)) {
      this.error = 'Las TDC no se eliminan; usa «Dejar de usar» para quitarlas de compras';
      return;
    }
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
    if (this.esMovil) {
      this.movilHistorialAbierto = true;
    }
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
