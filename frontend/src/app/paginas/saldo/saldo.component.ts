import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../api.service';
import { ConfirmDialogService } from '../../confirm-dialog.service';
import { Denominacion, SaldoSnapshot } from '../../modelos';
import { formatDineroInput, formatDineroNumero, parseDinero, soloMontoKey } from '../../dinero.util';
import { FechaCortaPipe, formatFechaCorta } from '../../fecha.util';
import { EnterAvanceDirective } from '../../enter-avance.directive';

type DigitalKey = 'dineroBbva' | 'dineroMercadoLibre' | 'dineroNu' | 'dineroDidi';
type SeccionMovil = 'digital' | 'efectivo' | null;

@Component({
  selector: 'app-saldo',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, FechaCortaPipe, EnterAvanceDirective],
  templateUrl: './saldo.component.html',
  styleUrl: './saldo.component.css',
})
export class SaldoComponent implements OnInit, OnDestroy {
  saldo: SaldoSnapshot = {
    fecha: this.hoy(),
    saldoTotal: 0,
  };
  denominaciones: Denominacion[] = [];
  historial: SaldoSnapshot[] = [];
  error = '';
  cargandoEsperado = false;
  guardando = false;
  exitoVisible = false;
  private exitoTimer: ReturnType<typeof setTimeout> | null = null;

  /** Corte en edición (modal). */
  editando: SaldoSnapshot | null = null;
  editTextos: Record<DigitalKey, string> = {
    dineroBbva: '',
    dineroMercadoLibre: '',
    dineroNu: '',
    dineroDidi: '',
  };
  editEfectivo = '';
  editEsperado = '';
  guardandoEdit = false;

  readonly camposDigital: { key: DigitalKey; label: string; corto: string }[] = [
    { key: 'dineroBbva', label: 'BBVA', corto: 'BBVA' },
    { key: 'dineroMercadoLibre', label: 'Mercado Libre / MP', corto: 'MP' },
    { key: 'dineroNu', label: 'Nu', corto: 'Nu' },
    { key: 'dineroDidi', label: 'Didi', corto: 'Didi' },
  ];

  textosDigital: Record<DigitalKey, string> = {
    dineroBbva: '',
    dineroMercadoLibre: '',
    dineroNu: '',
    dineroDidi: '',
  };

  /** Saldo teórico según ingresos − gastos − abonos (no editable). */
  esperado = 0;

  /** Últimos totales guardados (solo pista en el encabezado). */
  ultimoTotalDigital = 0;
  ultimoTotalEfectivo = 0;

  /** Base del último corte guardado (para recalcular al guardar). */
  private baselineSaldo = 0;
  private baselineFecha = '';

  /**
   * Si false, aún no se contaron billetes en esta sesión:
   * no pisar el último conteo guardado con ceros al guardar.
   */
  private conteoEfectivoActivo = false;

  esMovil = false;
  seccionMovil: SeccionMovil = 'digital';
  historialAbierto = false;

  private media?: MediaQueryList;
  private onMedia?: () => void;

  constructor(
    private api: ApiService,
    private confirmDlg: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.media = window.matchMedia('(max-width: 700px)');
    this.onMedia = () => {
      this.esMovil = !!this.media?.matches;
      this.cdr.detectChanges();
    };
    this.onMedia();
    this.media.addEventListener('change', this.onMedia);

    this.api.saldo().subscribe({
      next: (r) => {
        this.historial = r.historial ?? [];
        const corte = r.saldo && Object.keys(r.saldo).length ? r.saldo : null;
        if (corte) {
          this.baselineSaldo = this.n(corte.saldoTotal);
          this.baselineFecha = corte.fecha || '';
          this.recordarUltimosTotales(corte);
        } else {
          this.baselineSaldo = 0;
          this.baselineFecha = '';
          this.ultimoTotalDigital = 0;
          this.ultimoTotalEfectivo = 0;
        }
        this.iniciarFormularioVacio();
        if (r.esperado != null && Number.isFinite(Number(r.esperado))) {
          this.esperado = this.redondear(this.n(r.esperado));
          this.cargandoEsperado = false;
        } else {
          this.recalcularEsperado();
        }
      },
      error: (e) => (this.error = e?.error?.error || 'Error al cargar saldo'),
    });
  }

  ngOnDestroy(): void {
    if (this.media && this.onMedia) {
      this.media.removeEventListener('change', this.onMedia);
    }
    if (this.exitoTimer) {
      clearTimeout(this.exitoTimer);
      this.exitoTimer = null;
    }
  }

  /** Abre el apartado; si ya está abierto, lo contrae. */
  irSeccion(s: Exclude<SeccionMovil, null>): void {
    this.seccionMovil = this.seccionMovil === s ? null : s;
  }

  /** Rellena apps/bancos con los montos del último corte. */
  usarUltimoDigital(): void {
    const c = this.ultimoCorte;
    if (!c) return;
    for (const campo of this.camposDigital) {
      const v = this.n(c[campo.key]);
      this.textosDigital[campo.key] = v > 0 ? formatDineroNumero(v) : '';
      this.alEscribirDinero(campo.key);
    }
  }

  /** Efectivo + digital de un corte guardado. */
  realDe(s: SaldoSnapshot): number {
    return this.redondear(
      this.n(s.totalFisico) +
        this.n(s.dineroBbva) +
        this.n(s.dineroMercadoLibre) +
        this.n(s.dineroNu) +
        this.n(s.dineroDidi)
    );
  }

  /** real − esperado del corte. Negativo = faltó. */
  diffDe(s: SaldoSnapshot): number {
    return this.redondear(this.realDe(s) - this.n(s.saldoTotal));
  }

  estadoDiff(s: SaldoSnapshot): 'ok' | 'falta' | 'demas' {
    const d = this.diffDe(s);
    if (Math.abs(d) < 0.005) return 'ok';
    return d < 0 ? 'falta' : 'demas';
  }

  /**
   * Debería tener lo calcula el backend: último corte
   * + ingresos − gastos (efectivo) − abonos posteriores al corte.
   */
  recalcularEsperado(): void {
    this.cargandoEsperado = true;
    this.api.saldo().subscribe({
      next: (r) => {
        if (r.esperado != null && Number.isFinite(Number(r.esperado))) {
          this.esperado = this.redondear(this.n(r.esperado));
        } else if (r.saldo && Object.keys(r.saldo).length) {
          this.esperado = this.redondear(this.n(r.saldo.saldoTotal));
        } else {
          this.esperado = 0;
        }
        this.cargandoEsperado = false;
      },
      error: () => {
        this.esperado = this.redondear(this.baselineSaldo);
        this.cargandoEsperado = false;
      },
    });
  }

  private n(v: number | string | null | undefined): number {
    if (typeof v === 'string') {
      const t = v.trim().replace(/,/g, '');
      if (t === '') return 0;
      const x = Number(t);
      return Number.isFinite(x) ? x : 0;
    }
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }

  private redondear(v: number): number {
    return Math.round(v * 100) / 100;
  }

  private hoy(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  get totalEfectivo(): number {
    return this.sumaDenominaciones();
  }

  get totalDigital(): number {
    return (
      this.n(this.saldo.dineroBbva) +
      this.n(this.saldo.dineroMercadoLibre) +
      this.n(this.saldo.dineroNu) +
      this.n(this.saldo.dineroDidi)
    );
  }

  get hayCapturaDigital(): boolean {
    return this.camposDigital.some((c) => !!(this.textosDigital[c.key] || '').trim());
  }

  get hayCapturaEfectivo(): boolean {
    return this.conteoEfectivoActivo || this.denominaciones.some((d) => String(d.cantidad ?? '').trim() !== '');
  }

  /** Ya empezó a contar en esta sesión (apps o efectivo). */
  get hayCaptura(): boolean {
    return this.hayCapturaDigital || this.hayCapturaEfectivo;
  }

  /** Último corte del historial (más reciente). */
  get ultimoCorte(): SaldoSnapshot | null {
    return this.historial.length ? this.historial[0] : null;
  }

  /** Real del último corte guardado. */
  get tuve(): number {
    return this.ultimoCorte ? this.realDe(this.ultimoCorte) : 0;
  }

  get real(): number {
    return this.redondear(this.totalEfectivo + this.totalDigital);
  }

  /**
   * Con captura: compara “Tengo”.
   * Sin captura (Tengo en 0): compara “Tuve” del último corte.
   */
  get realComparacion(): number {
    return this.hayCaptura ? this.real : this.tuve;
  }

  get usandoTuve(): boolean {
    return !this.hayCaptura && this.tuve > 0;
  }

  get diferencia(): number {
    if (!this.hayCaptura && this.tuve <= 0) {
      return 0;
    }
    return this.redondear(this.realComparacion - this.esperado);
  }

  get cuadra(): boolean {
    if (!this.hayCaptura && this.tuve <= 0) {
      return false;
    }
    return Math.abs(this.diferencia) < 0.005;
  }

  get mensajeDiferencia(): string {
    if (this.cargandoEsperado) {
      return 'Calculando saldo según tus registros…';
    }
    return '';
  }

  /** Ancho del input según dígitos (mín. 2). */
  anchoCantidad(valor: number | string | null | undefined): number {
    const texto = String(valor ?? '').replace(/\D/g, '');
    return Math.max(2, texto.length || 1) + 1.1;
  }

  soloDigitos(ev: KeyboardEvent): void {
    const ok = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (ok.includes(ev.key) || ev.ctrlKey || ev.metaKey) return;
    if (!/^\d$/.test(ev.key)) ev.preventDefault();
  }

  /** Solo dígitos en cantidades de billetes. */
  teclaCantidad(ev: KeyboardEvent, _indice: number): void {
    if (ev.key === 'Enter') return; // lo maneja enterAvance
    this.soloDigitos(ev);
  }

  alEscribirCantidad(d: Denominacion, ev: Event): void {
    this.conteoEfectivoActivo = true;
    const el = ev.target as HTMLInputElement;
    const limpio = el.value.replace(/\D/g, '');
    el.value = limpio;
    d.cantidad = limpio === '' ? ('' as unknown as number) : Number(limpio);
  }

  normalizarCantidad(d: Denominacion): void {
    const raw = String(d.cantidad ?? '').trim();
    if (raw === '') {
      d.cantidad = '' as unknown as number;
      return;
    }
    d.cantidad = Math.max(0, Math.trunc(this.n(d.cantidad)));
  }

  soloMonto(ev: KeyboardEvent): void {
    if (ev.key === 'Enter') return; // lo maneja enterAvance
    soloMontoKey(ev);
  }

  /** Filtra teclas de monto; Enter lo maneja enterAvance. */
  teclaDinero(ev: KeyboardEvent, _indice: number): void {
    if (ev.key === 'Enter') return;
    this.soloMonto(ev);
  }

  alEscribirDinero(key: DigitalKey): void {
    const t = formatDineroInput(this.textosDigital[key]);
    this.textosDigital[key] = t;
    if (t === '' || t === '.') {
      this.saldo[key] = null;
      return;
    }
    const num = parseDinero(t);
    this.saldo[key] = Number.isFinite(num) ? num : null;
  }

  alSalirDinero(key: DigitalKey): void {
    const v = this.saldo[key];
    if (v == null || !Number.isFinite(Number(v))) {
      this.textosDigital[key] = '';
      this.saldo[key] = null;
      return;
    }
    this.saldo[key] = this.redondear(Number(v));
    this.textosDigital[key] = formatDineroNumero(this.saldo[key]!);
  }

  alEscribirEdit(campo: 'esperado' | 'efectivo' | DigitalKey, v: string): void {
    const fmt = formatDineroInput(v);
    if (campo === 'esperado') this.editEsperado = fmt;
    else if (campo === 'efectivo') this.editEfectivo = fmt;
    else this.editTextos[campo] = fmt;
  }

  guardar(): void {
    if (this.guardando) return;

    this.error = '';
    this.exitoVisible = false;
    if (this.exitoTimer) {
      clearTimeout(this.exitoTimer);
      this.exitoTimer = null;
    }

    for (const { key } of this.camposDigital) {
      this.alEscribirDinero(key);
      this.alSalirDinero(key);
    }
    for (const d of this.denominaciones) {
      this.normalizarCantidad(d);
    }

    if (this.real <= 0) {
      this.error = 'No se puede guardar un corte vacío: captura al menos un monto en apps o efectivo.';
      return;
    }

    const corte = this.hoy();
    const densCapturadas = this.denominaciones.map((d) => ({
      valor: this.n(d.valor),
      cantidad: this.n(d.cantidad),
    }));
    const textosKeep: Record<DigitalKey, string> = { ...this.textosDigital };
    const efectivoKeep = this.totalEfectivo;
    const conteoKeep = this.conteoEfectivoActivo;
    const payload: SaldoSnapshot = {
      fecha: corte,
      saldoTotal: this.esperado,
      totalFisico: efectivoKeep,
      dineroBbva: this.dineroONull('dineroBbva'),
      dineroMercadoLibre: this.dineroONull('dineroMercadoLibre'),
      dineroNu: this.dineroONull('dineroNu'),
      dineroDidi: this.dineroONull('dineroDidi'),
    };

    this.guardando = true;
    this.api.guardarSaldo(payload).subscribe({
      next: (guardado) => {
        this.baselineSaldo = this.esperado;
        this.baselineFecha = corte;
        if (guardado) {
          this.historial = [guardado, ...this.historial.filter((h) => h.id !== guardado.id)];
        }

        const terminar = () =>
          this.despuesDeGuardarOk({
            dens: densCapturadas,
            textos: textosKeep,
            efectivo: efectivoKeep,
            conteo: conteoKeep,
            digital: {
              dineroBbva: payload.dineroBbva ?? null,
              dineroMercadoLibre: payload.dineroMercadoLibre ?? null,
              dineroNu: payload.dineroNu ?? null,
              dineroDidi: payload.dineroDidi ?? null,
            },
          });

        // Solo persiste billetes si el usuario contó; no guardar ceros encima del último conteo.
        if (conteoKeep) {
          this.api.guardarDenominaciones(densCapturadas).subscribe({
            next: () => terminar(),
            error: () => terminar(),
          });
        } else {
          terminar();
        }
      },
      error: (e) => {
        this.guardando = false;
        this.error = e?.error?.error || 'No se pudo guardar';
      },
    });
  }

  abrirEditar(h: SaldoSnapshot): void {
    this.error = '';
    this.editando = { ...h };
    this.editEsperado = formatDineroNumero(this.n(h.saldoTotal));
    this.editEfectivo = h.totalFisico == null ? '' : formatDineroNumero(Number(h.totalFisico));
    for (const { key } of this.camposDigital) {
      const v = h[key];
      this.editTextos[key] = v == null ? '' : formatDineroNumero(Number(v));
    }
  }

  cancelarEditar(): void {
    this.editando = null;
    this.guardandoEdit = false;
  }

  realEditando(): number {
    if (!this.editando) return 0;
    return this.redondear(
      this.n(this.editEfectivo) +
        this.n(this.editTextos.dineroBbva) +
        this.n(this.editTextos.dineroMercadoLibre) +
        this.n(this.editTextos.dineroNu) +
        this.n(this.editTextos.dineroDidi)
    );
  }

  diffEditando(): number {
    return this.redondear(this.realEditando() - this.n(this.editEsperado));
  }

  guardarEdicion(): void {
    if (!this.editando?.id || this.guardandoEdit) return;
    if (this.realEditando() <= 0) {
      this.error = 'No se puede guardar un corte vacío: captura al menos un monto real.';
      return;
    }

    const payload: SaldoSnapshot = {
      id: this.editando.id,
      fecha: this.editando.fecha,
      saldoTotal: this.redondear(this.n(this.editEsperado)),
      totalFisico: this.editEfectivo.trim() === '' ? null : this.redondear(this.n(this.editEfectivo)),
      dineroBbva: this.textoANull(this.editTextos.dineroBbva),
      dineroMercadoLibre: this.textoANull(this.editTextos.dineroMercadoLibre),
      dineroNu: this.textoANull(this.editTextos.dineroNu),
      dineroDidi: this.textoANull(this.editTextos.dineroDidi),
    };

    this.guardandoEdit = true;
    this.api.actualizarSaldo(this.editando.id, payload).subscribe({
      next: (act) => {
        this.historial = this.historial.map((h) => (h.id === act.id ? act : h));
        this.sincronizarBaselineDesdeHistorial();
        if (this.historial[0]?.id === act.id) {
          this.recordarUltimosTotales(act);
          this.iniciarFormularioVacio();
        }
        this.editando = null;
        this.guardandoEdit = false;
        this.exitoVisible = true;
        this.recalcularEsperado();
        this.exitoTimer = setTimeout(() => {
          this.exitoVisible = false;
          this.exitoTimer = null;
        }, 3500);
      },
      error: (e) => {
        this.guardandoEdit = false;
        this.error = e?.error?.error || 'No se pudo actualizar el corte';
      },
    });
  }

  async eliminarCorte(h: SaldoSnapshot): Promise<void> {
    if (!h.id || this.guardando) return;
    const ok = await this.confirmDlg.ask(`¿Eliminar el corte del ${formatFechaCorta(h.fecha)}?`);
    if (!ok) return;

    this.api.eliminarSaldo(h.id).subscribe({
      next: () => {
        this.historial = this.historial.filter((x) => x.id !== h.id);
        if (this.editando?.id === h.id) this.editando = null;
        this.sincronizarBaselineDesdeHistorial();
        this.recalcularEsperado();
      },
      error: (e) => (this.error = e?.error?.error || 'No se pudo eliminar el corte'),
    });
  }

  private sincronizarBaselineDesdeHistorial(): void {
    const ultimo = this.historial[0];
    if (ultimo) {
      this.baselineSaldo = this.n(ultimo.saldoTotal);
      this.baselineFecha = ultimo.fecha || '';
    } else {
      this.baselineSaldo = 0;
      this.baselineFecha = '';
    }
  }

  private textoANull(t: string): number | null {
    const s = (t || '').trim();
    if (!s) return null;
    const num = this.redondear(parseDinero(s));
    return Number.isFinite(num) ? num : null;
  }

  private despuesDeGuardarOk(keep: {
    dens: Denominacion[];
    textos: Record<DigitalKey, string>;
    efectivo: number;
    conteo: boolean;
    digital: Record<DigitalKey, number | null>;
  }): void {
    this.ultimoTotalDigital = this.redondear(
      this.n(keep.digital.dineroBbva) +
        this.n(keep.digital.dineroMercadoLibre) +
        this.n(keep.digital.dineroNu) +
        this.n(keep.digital.dineroDidi)
    );
    this.ultimoTotalEfectivo = this.redondear(keep.efectivo);
    this.iniciarFormularioVacio();
    this.guardando = false;
    this.exitoVisible = true;
    this.recalcularEsperado();
    this.exitoTimer = setTimeout(() => {
      this.exitoVisible = false;
      this.exitoTimer = null;
    }, 3500);
  }

  private recordarUltimosTotales(corte: SaldoSnapshot): void {
    this.ultimoTotalDigital = this.redondear(
      this.n(corte.dineroBbva) +
        this.n(corte.dineroMercadoLibre) +
        this.n(corte.dineroNu) +
        this.n(corte.dineroDidi)
    );
    this.ultimoTotalEfectivo = this.redondear(this.n(corte.totalFisico));
  }

  /** Formulario en blanco; los últimos totales solo se muestran como pista. */
  private iniciarFormularioVacio(): void {
    this.saldo = {
      fecha: this.hoy(),
      saldoTotal: 0,
      totalFisico: 0,
      dineroBbva: null,
      dineroMercadoLibre: null,
      dineroNu: null,
      dineroDidi: null,
    };
    this.textosDigital = {
      dineroBbva: '',
      dineroMercadoLibre: '',
      dineroNu: '',
      dineroDidi: '',
    };
    this.denominaciones = [
      { valor: 1000, cantidad: '' as unknown as number },
      { valor: 500, cantidad: '' as unknown as number },
      { valor: 200, cantidad: '' as unknown as number },
      { valor: 100, cantidad: '' as unknown as number },
      { valor: 50, cantidad: '' as unknown as number },
      { valor: 20, cantidad: '' as unknown as number },
      { valor: 10, cantidad: '' as unknown as number },
      { valor: 5, cantidad: '' as unknown as number },
      { valor: 2, cantidad: '' as unknown as number },
      { valor: 1, cantidad: '' as unknown as number },
      { valor: 0.5, cantidad: '' as unknown as number },
    ];
    this.conteoEfectivoActivo = false;
  }

  private sumaDenominaciones(): number {
    return this.denominaciones.reduce((a, d) => a + this.n(d.valor) * this.n(d.cantidad), 0);
  }

  private dineroONull(key: DigitalKey): number | null {
    const t = (this.textosDigital[key] || '').trim();
    if (!t) return null;
    const num = this.redondear(parseDinero(t));
    return Number.isFinite(num) && num !== 0 ? num : null;
  }
}
