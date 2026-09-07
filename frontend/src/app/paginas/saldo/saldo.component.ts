import { Component, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../api.service';
import { ConfirmDialogService } from '../../confirm-dialog.service';
import { Denominacion, SaldoSnapshot } from '../../modelos';
import { formatDineroInput, formatDineroNumero, parseDinero, soloMontoKey } from '../../dinero.util';

type DigitalKey = 'dineroBbva' | 'dineroMercadoLibre' | 'dineroNu' | 'dineroDidi';

@Component({
  selector: 'app-saldo',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DatePipe],
  templateUrl: './saldo.component.html',
  styleUrl: './saldo.component.css',
})
export class SaldoComponent implements OnInit {
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

  readonly camposDigital: { key: DigitalKey; label: string }[] = [
    { key: 'dineroBbva', label: 'BBVA' },
    { key: 'dineroMercadoLibre', label: 'Mercado Libre / MP' },
    { key: 'dineroNu', label: 'Nu' },
    { key: 'dineroDidi', label: 'Didi' },
  ];

  textosDigital: Record<DigitalKey, string> = {
    dineroBbva: '',
    dineroMercadoLibre: '',
    dineroNu: '',
    dineroDidi: '',
  };

  /** Saldo teórico según ingresos − gastos − abonos (no editable). */
  esperado = 0;

  /** Base del último corte guardado (para recalcular al guardar). */
  private baselineSaldo = 0;
  private baselineFecha = '';

  /**
   * Si false, el efectivo de “Tengo” usa totalFisico del último corte
   * (las denominaciones pueden estar vacías o desfasadas).
   * Pasa a true al contar billetes/monedas.
   */
  private conteoEfectivoActivo = false;

  constructor(
    private api: ApiService,
    private confirmDlg: ConfirmDialogService
  ) {}

  ngOnInit(): void {
    this.api.saldo().subscribe({
      next: (r) => {
        this.historial = r.historial ?? [];
        if (r.saldo && Object.keys(r.saldo).length) {
          this.baselineSaldo = this.n(r.saldo.saldoTotal);
          this.baselineFecha = r.saldo.fecha || '';
          this.aplicarRealDesdeCorte(r.saldo);
        } else {
          this.baselineSaldo = 0;
          this.baselineFecha = '';
          this.saldo.fecha = this.hoy();
          this.syncTextosDesdeSaldo();
        }
        this.denominaciones = r.denominaciones?.length
          ? r.denominaciones
          : [
              { valor: 1000, cantidad: 0 },
              { valor: 500, cantidad: 0 },
              { valor: 200, cantidad: 0 },
              { valor: 100, cantidad: 0 },
              { valor: 50, cantidad: 0 },
              { valor: 20, cantidad: 0 },
              { valor: 10, cantidad: 0 },
              { valor: 5, cantidad: 0 },
              { valor: 2, cantidad: 0 },
              { valor: 1, cantidad: 0 },
              { valor: 0.5, cantidad: 0 },
            ];
        this.sincronizarModoEfectivo();
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
    if (this.conteoEfectivoActivo) {
      return this.sumaDenominaciones();
    }
    return this.n(this.saldo.totalFisico);
  }

  get usandoEfectivoDelCorte(): boolean {
    return !this.conteoEfectivoActivo && this.n(this.saldo.totalFisico) > 0;
  }

  get totalDigital(): number {
    return (
      this.n(this.saldo.dineroBbva) +
      this.n(this.saldo.dineroMercadoLibre) +
      this.n(this.saldo.dineroNu) +
      this.n(this.saldo.dineroDidi)
    );
  }

  get real(): number {
    return this.redondear(this.totalEfectivo + this.totalDigital);
  }

  get diferencia(): number {
    return this.redondear(this.real - this.esperado);
  }

  get cuadra(): boolean {
    return Math.abs(this.diferencia) < 0.005;
  }

  get mensajeDiferencia(): string {
    if (this.cargandoEsperado) {
      return 'Calculando saldo según tus registros…';
    }
    if (this.cuadra) {
      return 'Cuadra: lo esperado (según registros) y lo real coinciden.';
    }
    if (this.diferencia < 0) {
      return 'Te falta dinero respecto a lo esperado. ¿Hubo un gasto o abono sin registrar?';
    }
    return 'Tienes de más respecto a lo esperado. ¿Hubo un ingreso sin registrar?';
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

  /** Enter → siguiente cantidad; solo dígitos. */
  teclaCantidad(ev: KeyboardEvent, indice: number): void {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      this.normalizarCantidad(this.denominaciones[indice]);
      const inputs = Array.from(
        document.querySelectorAll<HTMLInputElement>('input.cant-input')
      );
      const siguiente = inputs[indice + 1];
      if (siguiente) {
        siguiente.focus();
        siguiente.select();
      }
      return;
    }
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
    d.cantidad = Math.max(0, Math.trunc(this.n(d.cantidad)));
  }

  private syncTextosDesdeSaldo(): void {
    for (const { key } of this.camposDigital) {
      const v = this.saldo[key];
      this.textosDigital[key] = v == null || v === undefined ? '' : formatDineroNumero(Number(v));
    }
  }

  soloMonto(ev: KeyboardEvent): void {
    soloMontoKey(ev);
  }

  /** Enter → siguiente monto digital. */
  teclaDinero(ev: KeyboardEvent, indice: number): void {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const key = this.camposDigital[indice]?.key;
      if (key) this.alSalirDinero(key);
      const inputs = Array.from(
        document.querySelectorAll<HTMLInputElement>('input.dinero-input')
      );
      const siguiente = inputs[indice + 1];
      if (siguiente) {
        siguiente.focus();
        siguiente.select();
      } else {
        const primeraCant = document.querySelector<HTMLInputElement>('input.cant-input');
        primeraCant?.focus();
        primeraCant?.select();
      }
      return;
    }
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
        // Si editaste el corte más reciente, el formulario de “real” sigue ese valor
        if (this.historial[0]?.id === act.id) {
          this.aplicarRealDesdeCorte(act);
          this.sincronizarModoEfectivo();
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
    const ok = await this.confirmDlg.ask(`¿Eliminar el corte del ${h.fecha}?`);
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
    this.denominaciones = keep.dens.map((d) => ({
      valor: this.n(d.valor),
      cantidad: this.n(d.cantidad),
    }));
    this.conteoEfectivoActivo = keep.conteo;
    this.saldo = {
      ...this.saldo,
      dineroBbva: keep.digital.dineroBbva,
      dineroMercadoLibre: keep.digital.dineroMercadoLibre,
      dineroNu: keep.digital.dineroNu,
      dineroDidi: keep.digital.dineroDidi,
      totalFisico: keep.efectivo,
      fecha: this.hoy(),
    };
    delete this.saldo.id;
    this.textosDigital = { ...keep.textos };
    this.guardando = false;
    this.exitoVisible = true;
    this.recalcularEsperado();
    this.exitoTimer = setTimeout(() => {
      this.exitoVisible = false;
      this.exitoTimer = null;
    }, 3500);
  }

  /** Precarga apps/bancos desde el último corte registrado. */
  private aplicarRealDesdeCorte(corte: SaldoSnapshot): void {
    this.saldo = {
      ...this.saldo,
      dineroBbva: corte.dineroBbva ?? null,
      dineroMercadoLibre: corte.dineroMercadoLibre ?? null,
      dineroNu: corte.dineroNu ?? null,
      dineroDidi: corte.dineroDidi ?? null,
      totalFisico: corte.totalFisico ?? 0,
      fecha: this.hoy(),
    };
    delete this.saldo.id;
    this.syncTextosDesdeSaldo();
  }

  /** Usa billetes solo si cuadran con el efectivo guardado del corte. */
  private sincronizarModoEfectivo(): void {
    const dens = this.sumaDenominaciones();
    const fis = this.n(this.saldo.totalFisico);
    this.conteoEfectivoActivo = dens > 0 && Math.abs(dens - fis) < 0.02;
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
