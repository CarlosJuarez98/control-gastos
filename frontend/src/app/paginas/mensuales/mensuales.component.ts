import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../api.service';
import { AuthService } from '../../auth.service';
import { ConfirmDialogService } from '../../confirm-dialog.service';
import { Cuenta, Gasto, GastoMensual } from '../../modelos';
import { formatDineroInput, parseDinero, soloMontoKey } from '../../dinero.util';
import { EnterAvanceDirective } from '../../enter-avance.directive';
import { PaginadorComponent } from '../../compartido/paginador/paginador.component';
import { EstadoPaginacion } from '../../compartido/paginar.util';
import { CalendarioTdc, calendarioCompraTdc, pagosPorQuincena } from '../../tdc-calendario.util';

/**
 * Perfiles que de momento solo contemplan pagos de quincena
 * con compras hechas desde CALENDARIO_COMPRAS_DESDE (no deuda histórica).
 * El resto de perfiles usa el saldo completo.
 */
const CALENDARIO_SOLO_COMPRAS_NUEVAS = new Set(['carlos']);
/** Inclusive: yyyy-MM-dd (después del 9 sep 2026). */
const CALENDARIO_COMPRAS_DESDE = '2026-09-10';

export interface CompraUnicaFila {
  id?: number;
  motivo: string;
  cuentaNombre: string;
  monto: number;
  etiqueta: string;
  fechaPagoCorta: string;
}

@Component({
  selector: 'app-mensuales',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, EnterAvanceDirective, RouterLink, PaginadorComponent],
  templateUrl: './mensuales.component.html',
  styleUrl: './mensuales.component.css',
})
export class MensualesComponent implements OnInit, OnDestroy {
  items: GastoMensual[] = [];
  readonly pagFijos = new EstadoPaginacion();
  readonly pagMeses = new EstadoPaginacion();
  cuentas: Cuenta[] = [];
  /** Compras TDC de contado (pago único) agrupadas por quincena de vencimiento. */
  comprasUnicas: { esta: CompraUnicaFila[]; siguiente: CompraUnicaFila[]; despues: CompraUnicaFila[] } = {
    esta: [],
    siguiente: [],
    despues: [],
  };
  form: {
    motivo: string;
    monto: string;
    aMeses: boolean;
    /** Lo que aún debes del plan (si no recuerdas los meses). */
    falta: string;
    /** Día de pago opcional (1–31). */
    diaPago: string;
  } = { motivo: '', monto: '', aMeses: false, falta: '', diaPago: '' };
  editandoId: number | null = null;
  error = '';
  ok = '';
  guardando = false;
  /** Flag de formulario listo (se actualiza al teclear). */
  formOk = false;
  esMovil = false;
  altaAbierta = false;

  private media?: MediaQueryList;
  private onMedia?: () => void;

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private confirmDlg: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.media = window.matchMedia('(max-width: 720px)');
    this.onMedia = () => {
      this.esMovil = !!this.media?.matches;
      this.cdr.markForCheck();
    };
    this.onMedia();
    this.media.addEventListener('change', this.onMedia);
    this.cargar();
    this.cargarCuentas();
    this.refrescarFormOk();
  }

  ngOnDestroy(): void {
    if (this.media && this.onMedia) {
      this.media.removeEventListener('change', this.onMedia);
    }
  }

  toggleAlta(): void {
    this.altaAbierta = !this.altaAbierta;
  }

  /** Carlos: solo compras nuevas. Otros perfiles: flujo completo (saldo). */
  get usaSoloComprasNuevas(): boolean {
    const u = (this.auth.usuario || '').trim().toLowerCase();
    return !!u && CALENDARIO_SOLO_COMPRAS_NUEVAS.has(u);
  }

  get fijos(): GastoMensual[] {
    return this.items.filter((i) => !this.esAMeses(i));
  }

  get aMeses(): GastoMensual[] {
    return this.items.filter((i) => this.esAMeses(i));
  }

  get fijosPagina(): GastoMensual[] {
    return this.pagFijos.slice(this.fijos);
  }

  get aMesesPagina(): GastoMensual[] {
    return this.pagMeses.slice(this.aMeses);
  }

  alCambiarPagFijos(pagina: number): void {
    this.pagFijos.alCambiarPagina(pagina, this.fijos.length);
    this.cdr.markForCheck();
  }

  alCambiarTamFijos(tam: number): void {
    this.pagFijos.alCambiarTam(tam, this.fijos.length);
    this.cdr.markForCheck();
  }

  alCambiarPagMeses(pagina: number): void {
    this.pagMeses.alCambiarPagina(pagina, this.aMeses.length);
    this.cdr.markForCheck();
  }

  alCambiarTamMeses(tam: number): void {
    this.pagMeses.alCambiarTam(tam, this.aMeses.length);
    this.cdr.markForCheck();
  }

  get total(): number {
    return this.items.reduce((a, i) => a + Number(i.monto), 0);
  }

  get totalRestanteMeses(): number {
    return this.aMeses.reduce((a, i) => a + this.restanteDe(i), 0);
  }

  /** Aprox. al repartir el mes en 2 quincenas. */
  get porQuincena(): number {
    return Math.round((this.total / 2) * 100) / 100;
  }

  /** Cuentas a usar en el calendario (perfiles con flujo completo = saldo). */
  private cuentasParaCalendario(): Cuenta[] {
    if (this.usaSoloComprasNuevas) return [];
    return this.cuentas;
  }

  get pagosProgramados(): { esta: CalendarioTdc[]; siguiente: CalendarioTdc[]; despues: CalendarioTdc[] } {
    return pagosPorQuincena(this.cuentasParaCalendario());
  }

  get totalComprasUnicasEsta(): number {
    return this.sumaMontos(this.comprasUnicas.esta);
  }

  get totalComprasUnicasSiguiente(): number {
    return this.sumaMontos(this.comprasUnicas.siguiente);
  }

  get totalComprasUnicasDespues(): number {
    return this.sumaMontos(this.comprasUnicas.despues);
  }

  /** Compromisos (fijos + a meses) repartidos en esta / la otra quincena. */
  get compromisosEstaQuincena(): { g: GastoMensual; monto: number; etiqueta: string }[] {
    return this.compromisosEnQuincena('esta');
  }

  get compromisosSiguienteQuincena(): { g: GastoMensual; monto: number; etiqueta: string }[] {
    return this.compromisosEnQuincena('siguiente');
  }

  get totalCompromisosEstaQuincena(): number {
    return this.sumaMontos(this.compromisosEstaQuincena);
  }

  get totalCompromisosSiguienteQuincena(): number {
    return this.sumaMontos(this.compromisosSiguienteQuincena);
  }

  get hayCompromisosMensuales(): boolean {
    return this.fijos.length > 0 || this.aMeses.length > 0;
  }

  get hayPagosProgramados(): boolean {
    const p = this.pagosProgramados;
    const u = this.comprasUnicas;
    return !!(
      p.esta.length ||
      p.siguiente.length ||
      p.despues.length ||
      u.esta.length ||
      u.siguiente.length ||
      u.despues.length ||
      this.compromisosEstaQuincena.length ||
      this.compromisosSiguienteQuincena.length
    );
  }

  /** Deuda con fecha de pago en esta quincena (saldo completo u otros perfiles). */
  get totalDeudaEstaQuincena(): number {
    return this.sumaSaldos(this.pagosProgramados.esta);
  }

  /** Esta quincena: deuda + compras de contado + fijos/cuotas. */
  get totalEstaQuincenaProgramado(): number {
    return Math.round(
      (this.totalDeudaEstaQuincena + this.totalComprasUnicasEsta + this.totalCompromisosEstaQuincena) * 100,
    ) / 100;
  }

  get totalSiguienteQuincenaProgramado(): number {
    return Math.round(
      (this.sumaSaldos(this.pagosProgramados.siguiente) +
        this.totalComprasUnicasSiguiente +
        this.totalCompromisosSiguienteQuincena) *
        100,
    ) / 100;
  }

  get totalDespuesProgramado(): number {
    return Math.round(
      (this.sumaSaldos(this.pagosProgramados.despues) + this.totalComprasUnicasDespues) * 100,
    ) / 100;
  }

  private sumaSaldos(lista: CalendarioTdc[]): number {
    return Math.round(lista.reduce((a, p) => a + Number(p.cuenta.saldoActual || 0), 0) * 100) / 100;
  }

  private sumaMontos(lista: { monto: number }[]): number {
    return Math.round(lista.reduce((a, x) => a + x.monto, 0) * 100) / 100;
  }

  /** Quincena actual: 1 = días 1–15, 2 = 16–fin. */
  private quincenaActual(): 1 | 2 {
    return new Date().getDate() <= 15 ? 1 : 2;
  }

  private quincenaDeDia(dia: number): 1 | 2 {
    return dia <= 15 ? 1 : 2;
  }

  /**
   * Sin día: mitad en cada quincena.
   * Con día: monto completo en la quincena de ese día.
   */
  montoEnQuincena(g: GastoMensual, cual: 'esta' | 'siguiente'): number {
    const monto = Number(g.monto) || 0;
    if (monto <= 0) return 0;
    const dia = g.diaPago != null ? Number(g.diaPago) : null;
    if (dia == null || !Number.isFinite(dia) || dia < 1 || dia > 31) {
      return this.quincenaDe(monto);
    }
    const qItem = this.quincenaDeDia(dia);
    const qHoy = this.quincenaActual();
    const esEsta = qItem === qHoy;
    if (cual === 'esta') return esEsta ? monto : 0;
    return esEsta ? 0 : monto;
  }

  private compromisosEnQuincena(cual: 'esta' | 'siguiente'): { g: GastoMensual; monto: number; etiqueta: string }[] {
    const out: { g: GastoMensual; monto: number; etiqueta: string }[] = [];
    for (const g of [...this.fijos, ...this.aMeses]) {
      const monto = this.montoEnQuincena(g, cual);
      if (monto <= 0) continue;
      out.push({ g, monto, etiqueta: this.etiquetaCompromiso(g) });
    }
    return out;
  }

  etiquetaCompromiso(g: GastoMensual): string {
    const base = this.esAMeses(g) ? 'A meses' : 'Fijo';
    const dia = g.diaPago != null ? Number(g.diaPago) : null;
    if (dia != null && dia >= 1 && dia <= 31) return `${base} · pago día ${dia}`;
    return `${base} · / quincena`;
  }

  parseDiaPago(v: string): number | null {
    const n = Number(String(v || '').replace(/\D/g, ''));
    if (!Number.isFinite(n) || n < 1 || n > 31) return null;
    return n;
  }

  /** Vista previa: meses ≈ falta ÷ cuota. */
  get previewMeses(): number | null {
    if (!this.form.aMeses) return null;
    const cuota = parseDinero(this.form.monto);
    const falta = parseDinero(this.form.falta);
    if (!cuota || cuota <= 0 || !falta || falta <= 0) return null;
    return Math.max(2, Math.ceil(falta / cuota));
  }

  quincenaDe(monto: number | string): number {
    return Math.round((Number(monto) / 2) * 100) / 100;
  }

  esAMeses(g: GastoMensual): boolean {
    return !!(g.aMeses || (g.mesesTotales != null && g.mesesTotales > 1));
  }

  restanteDe(g: GastoMensual): number {
    if (g.montoRestante != null) return Number(g.montoRestante);
    const rest = Number(g.mesesRestantes) || 0;
    return Math.round(Number(g.monto) * rest * 100) / 100;
  }

  mesesPagados(g: GastoMensual): number {
    const tot = Number(g.mesesTotales) || 0;
    const rest = Number(g.mesesRestantes) || 0;
    return Math.max(0, tot - rest);
  }

  etiquetaMeses(g: GastoMensual): string {
    const tot = Number(g.mesesTotales) || 0;
    const rest = Number(g.mesesRestantes) || 0;
    const pag = this.mesesPagados(g);
    if (rest <= 0) return `Cerrado · era a ${tot} meses`;
    if (pag <= 0) return `≈ ${rest} meses · cuota / mes`;
    return `Restan ≈ ${rest} de ${tot} · ya ${pag}`;
  }

  etiquetaTipoCorto(tipo?: string): string {
    switch ((tipo || '').toUpperCase()) {
      case 'TDC': return 'TDC';
      case 'TIENDA': return 'Tienda';
      case 'PRESTAMO': return 'Préstamo';
      case 'TERRENO': return 'Terreno';
      default: return tipo || '';
    }
  }

  cargar(): void {
    this.api.mensuales().subscribe({
      next: (r) => (this.items = r),
      error: (e) => (this.error = e?.error?.error || 'Error al cargar'),
    });
  }

  private cargarCuentas(): void {
    this.api.cuentas().subscribe({
      next: (r) => {
        this.cuentas = r;
        this.cargarComprasUnicas();
      },
      error: () => {
        this.cuentas = [];
        this.comprasUnicas = { esta: [], siguiente: [], despues: [] };
      },
    });
  }

  /**
   * Compras TDC de contado (no a meses): el pago único cae en la quincena
   * del vencimiento según corte / día de pago de la tarjeta.
   * Carlos: solo desde CALENDARIO_COMPRAS_DESDE. Otros: no listan aquí (usan saldo).
   */
  private cargarComprasUnicas(): void {
    if (!this.usaSoloComprasNuevas) {
      this.comprasUnicas = { esta: [], siguiente: [], despues: [] };
      return;
    }
    const porId = new Map(this.cuentas.map((c) => [c.id!, c]));
    this.api.gastos(CALENDARIO_COMPRAS_DESDE).subscribe({
      next: (gastos) => {
        const esta: CompraUnicaFila[] = [];
        const siguiente: CompraUnicaFila[] = [];
        const despues: CompraUnicaFila[] = [];
        for (const g of gastos) {
          if ((g.formaPago || '').toUpperCase() !== 'TARJETA') continue;
          if (g.meses != null && Number(g.meses) > 1) continue; // a meses → cuota en compromisos
          const id = g.cuentaId ?? g.cuenta?.id;
          if (id == null) continue;
          const cuenta = porId.get(id) || g.cuenta;
          if (!cuenta) continue;
          const cal = calendarioCompraTdc(cuenta, g.fecha);
          if (!cal) continue;
          const fila: CompraUnicaFila = {
            id: g.id,
            motivo: g.motivo || g.categoria || 'Compra TDC',
            cuentaNombre: cuenta.nombre || 'TDC',
            monto: Number(g.monto) || 0,
            etiqueta: `Pago único · ${cuenta.nombre} · ${cal.etiquetaPagoCorta}`,
            fechaPagoCorta: cal.etiquetaPagoCorta,
          };
          if (cal.quincenaPago === 'esta') esta.push(fila);
          else if (cal.quincenaPago === 'siguiente') siguiente.push(fila);
          else despues.push(fila);
        }
        this.comprasUnicas = { esta, siguiente, despues };
      },
      error: () => {
        this.comprasUnicas = { esta: [], siguiente: [], despues: [] };
      },
    });
  }

  soloMonto(ev: KeyboardEvent): void {
    soloMontoKey(ev);
  }

  alEscribirMonto(v: string): void {
    this.form.monto = formatDineroInput(v);
    this.refrescarFormOk();
  }

  alEscribirFalta(v: string): void {
    this.form.falta = formatDineroInput(v);
    this.refrescarFormOk();
  }

  editar(g: GastoMensual): void {
    if (!g.id) return;
    this.editandoId = g.id;
    if (this.esMovil) this.altaAbierta = true;
    this.form = {
      motivo: g.motivo || '',
      monto: formatDineroInput(String(g.monto ?? '')),
      aMeses: this.esAMeses(g),
      falta: this.esAMeses(g)
        ? formatDineroInput(String(this.restanteDe(g)))
        : '',
      diaPago: g.diaPago != null ? String(g.diaPago) : '',
    };
    this.error = '';
    this.ok = '';
    this.refrescarFormOk();
    this.cdr.markForCheck();
    queueMicrotask(() => {
      document.querySelector<HTMLElement>('form.alta')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  cancelarEdicion(): void {
    this.editandoId = null;
    this.form = { motivo: '', monto: '', aMeses: false, falta: '', diaPago: '' };
    this.error = '';
    if (this.esMovil) this.altaAbierta = false;
    this.refrescarFormOk();
    this.cdr.markForCheck();
  }

  get puedeGuardar(): boolean {
    return this.formOk;
  }

  refrescarFormOk(): void {
    if (!this.form.motivo?.trim()) {
      this.formOk = false;
      return;
    }
    const cuota = parseDinero(this.form.monto);
    if (!cuota || cuota <= 0) {
      this.formOk = false;
      return;
    }
    if (this.form.aMeses) {
      const falta = parseDinero(this.form.falta);
      if (!falta || falta <= 0) {
        this.formOk = false;
        return;
      }
    }
    const diaTxt = (this.form.diaPago || '').trim();
    if (diaTxt) {
      const d = this.parseDiaPago(diaTxt);
      if (d == null) {
        this.formOk = false;
        return;
      }
    }
    this.formOk = true;
  }

  guardar(): void {
    this.refrescarFormOk();
    if (!this.formOk || this.guardando) return;
    const cuota = parseDinero(this.form.monto);
    if (!cuota || cuota <= 0) {
      this.error = 'El monto debe ser mayor a cero';
      return;
    }

    const diaPagoTxt = this.form.diaPago.trim();
    let diaPago: number | null = null;
    if (diaPagoTxt) {
      diaPago = this.parseDiaPago(diaPagoTxt);
      if (diaPago == null) {
        this.error = 'El día de pago debe ser entre 1 y 31';
        return;
      }
    }

    let body: GastoMensual = {
      motivo: this.form.motivo.trim(),
      monto: cuota,
      diaPago,
    };

    if (this.form.aMeses) {
      const falta = parseDinero(this.form.falta);
      if (!falta || falta <= 0) {
        this.error = 'Captura cuánto te falta por pagar del plan';
        return;
      }
      const meses = Math.max(2, Math.ceil(falta / cuota));
      if (meses > 120) {
        this.error = 'Con esa cuota tardarías más de 120 meses; sube la cuota o revisa el monto';
        return;
      }
      body = {
        ...body,
        mesesTotales: meses,
        mesesRestantes: meses,
        montoTotal: falta,
      };
    }

    this.error = '';
    this.ok = '';
    this.guardando = true;
    const fueAMeses = !!body.mesesTotales;
    const req = this.editandoId != null
      ? this.api.actualizarMensual(this.editandoId, { ...body, id: this.editandoId })
      : this.api.crearMensual(body);

    req.subscribe({
      next: () => {
        this.guardando = false;
        this.cancelarEdicion();
        this.ok = fueAMeses
          ? 'Plan guardado · no suma deuda extra (la deuda vive en Deudas)'
          : 'Gasto fijo agregado';
        this.cargar();
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.guardando = false;
        this.error = e?.error?.error || 'No se pudo guardar';
        this.cdr.markForCheck();
      },
    });
  }

  async marcarCuota(g: GastoMensual): Promise<void> {
    if (!g.id) return;
    const rest = Number(g.mesesRestantes) || 0;
    const ok = await this.confirmDlg.ask(
      rest <= 1
        ? `¿Marcar la última cuota de “${g.motivo}”? Se cerrará el plan.`
        : `¿Marcar 1 cuota pagada de “${g.motivo}”? Quedarían ≈ ${rest - 1} meses.`,
      { titulo: 'Cuota a meses', confirmarTexto: 'Marcar' },
    );
    if (!ok) return;
    this.error = '';
    this.api.marcarCuotaMensual(g.id).subscribe({
      next: (r) => {
        this.ok = r.activo === false
          ? `Plan cerrado: ${g.motivo}`
          : `Cuota marcada. Restan ≈ ${r.mesesRestantes} meses`;
        this.cargar();
      },
      error: (e) => (this.error = e?.error?.error || 'No se pudo marcar la cuota'),
    });
  }

  async eliminar(id?: number): Promise<void> {
    if (!id) return;
    const ok = await this.confirmDlg.ask('¿Quitar este gasto mensual?');
    if (!ok) return;
    this.api.eliminarMensual(id).subscribe({ next: () => this.cargar() });
  }
}
