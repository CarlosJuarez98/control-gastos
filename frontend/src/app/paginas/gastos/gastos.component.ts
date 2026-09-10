import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../api.service';
import { ConfirmDialogService } from '../../confirm-dialog.service';
import { Cuenta, Gasto } from '../../modelos';
import { formatDineroInput, formatDineroInputFlexible, formatDineroNumero, parseDineroSuma, soloMontoKey } from '../../dinero.util';
import { formatFechaCorta, fechaHoyLocal } from '../../fecha.util';
import { EnterAvanceDirective } from '../../enter-avance.directive';
import { PaginadorComponent } from '../../compartido/paginador/paginador.component';
import { PaginasPorClave } from '../../compartido/paginar.util';
import { calendarioCompraTdc, recomendarTdc, CalendarioTdc } from '../../tdc-calendario.util';

export interface GastoFila {
  id?: number;
  fechaIso: string;
  fechaTxt: string;
  categoria: string;
  motivo?: string;
  montoTxt: string;
  pago: string;
  meses?: number | null;
}

export interface GrupoQuincena {
  clave: string;
  etiqueta: string;
  totalTxt: string;
  cuantos: number;
  abierta: boolean;
  items: GastoFila[];
}

@Component({
  selector: 'app-gastos',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, EnterAvanceDirective, PaginadorComponent],
  templateUrl: './gastos.component.html',
  styleUrl: './gastos.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GastosComponent implements OnInit, OnDestroy {
  items: Gasto[] = [];
  cuentas: Cuenta[] = [];
  cuentasTdc: Cuenta[] = [];
  grupos: GrupoQuincena[] = [];
  total = 0;
  totalQuincenaActual = 0;
  etiquetaQuincenaActual = '';

  form: {
    fecha: string;
    categoria: string;
    monto: string;
    motivo: string;
    formaPago: 'EFECTIVO' | 'TARJETA';
    cuentaId: number | null;
    aMeses: boolean;
    meses: string;
  } = {
    fecha: fechaHoyLocal(),
    categoria: 'Yo',
    monto: '',
    motivo: '',
    formaPago: 'EFECTIVO',
    cuentaId: null,
    aMeses: false,
    meses: '',
  };
  categorias = ['Yo', 'Familia', 'Vehiculos', 'Casa', 'Mama', 'Otro'];
  filtro = '';
  /** total = todas las quincenas; quincena = solo la actual. */
  vista: 'total' | 'quincena' = 'quincena';
  error = '';
  editandoId: number | null = null;
  guardando = false;
  hoy = fechaHoyLocal();
  esMovil = false;
  /** En móvil el alta va contraída para priorizar la lista. */
  altaAbierta = false;

  private claveHoy = '';
  private filtroTimer: ReturnType<typeof setTimeout> | null = null;
  /** Filas por quincena; solo se montan en el DOM si el grupo está abierto. */
  private filasPorClave = new Map<string, GastoFila[]>();
  private abiertas = new Set<string>();
  readonly paginas = new PaginasPorClave();
  private media?: MediaQueryList;
  private onMedia?: () => void;

  private readonly meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];

  constructor(
    private api: ApiService,
    private confirmDlg: ConfirmDialogService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.media = window.matchMedia('(max-width: 720px)');
    this.onMedia = () => {
      this.esMovil = !!this.media?.matches;
      this.cdr.markForCheck();
    };
    this.onMedia();
    this.media.addEventListener('change', this.onMedia);

    this.hoy = fechaHoyLocal();
    this.form.fecha = this.hoy;
    this.claveHoy = this.claveQuincena(this.hoy);
    this.etiquetaQuincenaActual = this.etiquetaDeClave(this.claveHoy);
    this.cargar();
    this.cargarTarjetas();
  }

  ngOnDestroy(): void {
    if (this.media && this.onMedia) {
      this.media.removeEventListener('change', this.onMedia);
    }
    if (this.filtroTimer) clearTimeout(this.filtroTimer);
  }

  toggleAlta(): void {
    this.altaAbierta = !this.altaAbierta;
  }

  /** Misma lista que Deudas → cuentas tipo TDC (activas). */
  private cargarTarjetas(): void {
    this.api.cuentas().subscribe({
      next: (r) => {
        this.cuentas = r;
        this.cuentasTdc = r
          .filter((c) => (c.tipo || '').toUpperCase() === 'TDC')
          .sort((a, b) =>
            (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' })
          );
        this.cdr.markForCheck();
      },
      error: () => {
        this.cuentas = [];
        this.cuentasTdc = [];
        this.cdr.markForCheck();
      },
    });
  }

  alCambiarFormaPago(): void {
    this.form.cuentaId = null;
    this.form.aMeses = false;
    if (this.form.formaPago === 'TARJETA') {
      this.cargarTarjetas();
    }
  }

  /** TDC con más días hasta el pago del ciclo de la fecha del gasto. */
  get recomendacionTdc(): CalendarioTdc | null {
    if (this.form.formaPago !== 'TARJETA') return null;
    return recomendarTdc(this.cuentasTdc, this.form.fecha);
  }

  /** Compra de contado (no a meses): ciclo de pago según corte de la TDC elegida. */
  get calendarioPagoUnico(): CalendarioTdc | null {
    if (this.form.formaPago !== 'TARJETA' || this.form.aMeses) return null;
    if (this.form.cuentaId == null) return null;
    const c = this.cuentasTdc.find((x) => x.id === this.form.cuentaId);
    if (!c) return null;
    return calendarioCompraTdc(c, this.form.fecha);
  }

  etiquetaOpcionTdc(c: Cuenta): string {
    const cal = calendarioCompraTdc(c, this.form.fecha);
    if (!cal) return c.nombre || 'TDC';
    return `${c.nombre} · paga ${cal.etiquetaPagoCorta} (${cal.diasHastaPago}d)`;
  }

  usarRecomendacionTdc(): void {
    const id = this.recomendacionTdc?.cuenta?.id;
    if (id == null) return;
    this.form.cuentaId = id;
    this.cdr.markForCheck();
  }

  private fechaLocal(d = new Date()): string {
    return fechaHoyLocal(d);
  }

  soloMonto(ev: KeyboardEvent): void {
    soloMontoKey(ev);
  }

  alEscribirMonto(v: string): void {
    this.form.monto = formatDineroInputFlexible(v);
  }

  /** En móvil el teclado decimal no trae +; botón del campo. */
  insertarMasMonto(): void {
    let cur = String(this.form.monto ?? '').trimEnd();
    if (!cur) return;
    if (!/[+;]$/.test(cur)) {
      this.form.monto = formatDineroInputFlexible(cur + '+');
    }
    this.cdr.detectChanges();
    const valor = this.form.monto;
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>('form.alta input[name="monto"]');
      if (!el) return;
      el.focus();
      const len = valor.length;
      el.setSelectionRange(len, len);
      el.scrollLeft = el.scrollWidth;
    }, 0);
  }

  /** Debounce del filtro para no reagrupar en cada tecla. */
  alFiltrar(v: string): void {
    this.filtro = v;
    if (this.filtroTimer) clearTimeout(this.filtroTimer);
    this.filtroTimer = setTimeout(() => {
      this.recalcular();
      this.cdr.markForCheck();
    }, 120);
  }

  cargar(): void {
    this.api.gastos().subscribe({
      next: (r) => {
        this.items = r;
        this.recalcular();
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.error = e?.error?.error || 'Error al cargar gastos';
        this.cdr.markForCheck();
      },
    });
  }

  seleccionarVista(v: 'total' | 'quincena'): void {
    if (this.vista === v) return;
    this.vista = v;
    this.abiertas.clear();
    this.recalcular();
  }

  toggleGrupo(clave: string): void {
    if (this.abiertas.has(clave)) {
      this.abiertas.delete(clave);
    } else {
      this.abiertas.add(clave);
    }
    this.sincronizarGruposAbiertos();
    this.cdr.markForCheck();
  }

  itemsPagina(grupo: GrupoQuincena): GastoFila[] {
    return this.paginas.slice(grupo.clave, grupo.items);
  }

  paginaDe(clave: string): number {
    return this.paginas.paginaDe(clave);
  }

  alCambiarPaginaGrupo(clave: string, pagina: number, total: number): void {
    this.paginas.setPagina(clave, pagina, total);
    this.cdr.markForCheck();
  }

  alCambiarTamPagina(tam: number): void {
    this.paginas.setTam(tam);
    this.cdr.markForCheck();
  }

  private sincronizarGruposAbiertos(): void {
    this.grupos = this.grupos.map((g) => {
      const abierta = this.abiertas.has(g.clave);
      return {
        ...g,
        abierta,
        items: abierta ? this.filasPorClave.get(g.clave) || [] : [],
      };
    });
  }

  private recalcular(): void {
    const q = this.filtro.trim().toLowerCase();
    const base = !q
      ? this.items
      : this.items.filter((g) =>
          `${g.categoria} ${g.motivo || ''} ${g.formaPago || ''} ${g.cuenta?.nombre || ''}`
            .toLowerCase()
            .includes(q)
        );

    let total = 0;
    let totalQ = 0;
    for (const g of base) {
      const monto = Number(g.monto) || 0;
      total += monto;
      if (this.claveQuincena(g.fecha || '') === this.claveHoy) {
        totalQ += monto;
      }
    }
    this.total = total;
    this.totalQuincenaActual = totalQ;

    const list =
      this.vista === 'quincena'
        ? base.filter((g) => this.claveQuincena(g.fecha || '') === this.claveHoy)
        : base;

    const map = new Map<string, GastoFila[]>();
    const totales = new Map<string, number>();

    for (const g of list) {
      const clave = this.claveQuincena(g.fecha || '');
      if (!clave) continue;
      if (!map.has(clave)) {
        map.set(clave, []);
        totales.set(clave, 0);
      }
      const monto = Number(g.monto) || 0;
      map.get(clave)!.push({
        id: g.id,
        fechaIso: (g.fecha || '').slice(0, 10),
        fechaTxt: formatFechaCorta(g.fecha),
        categoria: g.categoria,
        motivo: g.motivo,
        montoTxt: `$${formatDineroNumero(monto)}`,
        pago: this.etiquetaPago(g),
        meses: g.meses && g.meses > 1 ? g.meses : null,
      });
      totales.set(clave, (totales.get(clave) || 0) + monto);
    }

    this.filasPorClave = map;
    for (const items of map.values()) {
      items.sort((a, b) => (b.fechaIso || '').localeCompare(a.fechaIso || ''));
    }

    const claves = [...map.keys()].sort((a, b) => b.localeCompare(a));

    // En Total: solo la quincena actual (o la más reciente) abierta → menos DOM al scrollear
    if (this.vista === 'quincena') {
      this.abiertas = new Set(claves);
    } else if (!this.abiertas.size) {
      const preferida = claves.includes(this.claveHoy) ? this.claveHoy : claves[0];
      if (preferida) this.abiertas.add(preferida);
    } else {
      for (const k of [...this.abiertas]) {
        if (!map.has(k)) this.abiertas.delete(k);
      }
      if (!this.abiertas.size && claves[0]) this.abiertas.add(claves[0]);
    }

    this.paginas.limpiar(claves);
    this.grupos = claves.map((clave) => {
      const items = map.get(clave) || [];
      const abierta = this.abiertas.has(clave);
      return {
        clave,
        etiqueta: this.etiquetaDeClave(clave),
        totalTxt: `$${formatDineroNumero(totales.get(clave) || 0)}`,
        cuantos: items.length,
        abierta,
        items: abierta ? items : [],
      };
    });
  }

  /** yyyy-MM-Q1 | yyyy-MM-Q2 */
  private claveQuincena(fecha: string): string {
    const f = (fecha || '').slice(0, 10);
    if (f.length < 10) return '';
    const day = Number(f.slice(8, 10));
    if (!Number.isFinite(day) || day < 1) return '';
    const mes = f.slice(0, 7);
    return `${mes}-Q${day <= 15 ? 1 : 2}`;
  }

  private etiquetaDeClave(clave: string): string {
    const m = /^(\d{4})-(\d{2})-Q([12])$/.exec(clave);
    if (!m) return clave;
    const anio = Number(m[1]);
    const mesNum = Number(m[2]);
    const mesIdx = mesNum - 1;
    const q = m[3];
    const nombreMes = this.meses[mesIdx] || m[2];
    if (q === '1') {
      return `1ª quincena · ${nombreMes} ${anio} (1–15)`;
    }
    const ultimoDia = new Date(anio, mesNum, 0).getDate();
    return `2ª quincena · ${nombreMes} ${anio} (16–${ultimoDia})`;
  }

  private etiquetaPago(g: Gasto): string {
    const forma = (g.formaPago || 'EFECTIVO').toUpperCase();
    if (forma === 'TARJETA') {
      const base = g.cuenta?.nombre ? `Tarjeta · ${g.cuenta.nombre}` : 'Tarjeta';
      if (g.meses && g.meses > 1) return `${base} · ${g.meses} meses`;
      return base;
    }
    return 'Efectivo';
  }

  /** Vista previa de la cuota MSI. */
  get puedeGuardarMonto(): boolean {
    const txt = String(this.form.monto ?? '').trim();
    if (!txt) return false;
    const { total } = parseDineroSuma(txt);
    return Number.isFinite(total) && total > 0;
  }

  get puedeGuardar(): boolean {
    if (!this.puedeGuardarMonto) return false;
    if (this.form.formaPago === 'TARJETA') {
      if (!this.form.cuentaId) return false;
      if (this.form.aMeses) {
        const m = Number(String(this.form.meses).replace(/\D/g, ''));
        if (!m || m < 2 || m > 48) return false;
      }
    }
    return true;
  }

  editar(g: GastoFila): void {
    if (!g.id) return;
    const original = this.items.find((x) => x.id === g.id);
    if (!original) return;
    this.error = '';
    this.editandoId = g.id;
    if (this.esMovil) this.altaAbierta = true;
    const forma = ((original.formaPago || 'EFECTIVO').toUpperCase() === 'TARJETA'
      ? 'TARJETA'
      : 'EFECTIVO') as 'EFECTIVO' | 'TARJETA';
    const meses = original.meses && original.meses > 1 ? original.meses : null;
    const cuentaId = forma === 'TARJETA' ? (original.cuentaId ?? original.cuenta?.id ?? null) : null;
    this.cargarTarjetas();
    this.form = {
      fecha: (original.fecha || '').slice(0, 10) || fechaHoyLocal(),
      categoria: original.categoria || 'Yo',
      monto: formatDineroInput(String(original.monto)),
      motivo: original.motivo || '',
      formaPago: forma,
      cuentaId,
      aMeses: forma === 'TARJETA' && !!meses,
      meses: meses ? String(meses) : '',
    };
    this.cdr.markForCheck();
    queueMicrotask(() => {
      document.querySelector<HTMLElement>('form.alta')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  cancelarEdicion(): void {
    this.editandoId = null;
    this.error = '';
    this.hoy = fechaHoyLocal();
    this.form = {
      fecha: this.hoy,
      categoria: 'Yo',
      monto: '',
      motivo: '',
      formaPago: 'EFECTIVO',
      cuentaId: null,
      aMeses: false,
      meses: '',
    };
    if (this.esMovil) this.altaAbierta = false;
    this.cdr.markForCheck();
  }

  guardar(): void {
    if (this.guardando || !this.puedeGuardar) return;
    this.error = '';
    this.hoy = fechaHoyLocal();
    this.claveHoy = this.claveQuincena(this.hoy);
    this.etiquetaQuincenaActual = this.etiquetaDeClave(this.claveHoy);
    if (!this.form.fecha) {
      this.form.fecha = this.hoy;
    }
    if (this.form.fecha > this.hoy) {
      this.error = 'La fecha no puede ser mayor a hoy';
      this.cdr.markForCheck();
      return;
    }
    if (!this.montoOk()) {
      return;
    }
    const { total: monto } = parseDineroSuma(this.form.monto);
    if (this.form.formaPago === 'TARJETA') {
      if (!this.form.cuentaId) {
        this.error = this.cuentasTdc.length
          ? 'Elige una TDC de la lista'
          : 'No hay tarjetas TDC en Deudas; crea una con tipo TDC';
        this.cdr.markForCheck();
        return;
      }
      const tdc = this.cuentasTdc.some((c) => c.id === this.form.cuentaId);
      if (!tdc) {
        this.error = 'Solo puedes pagar con una tarjeta de crédito (TDC)';
        this.cdr.markForCheck();
        return;
      }
      if (this.form.aMeses) {
        const m = Number(String(this.form.meses).replace(/\D/g, ''));
        if (!m || m < 2 || m > 48) {
          this.error = 'El plazo a meses debe ser entre 2 y 48';
          this.cdr.markForCheck();
          return;
        }
        this.form.meses = String(m);
      }
    }

    const meses =
      this.form.formaPago === 'TARJETA' && this.form.aMeses
        ? Number(this.form.meses)
        : null;

    const body: Gasto = {
      fecha: this.form.fecha,
      categoria: this.form.categoria,
      motivo: this.form.motivo,
      monto,
      formaPago: this.form.formaPago,
      cuentaId: this.form.formaPago === 'TARJETA' ? this.form.cuentaId : null,
      meses,
    };

    this.guardando = true;
    this.cdr.markForCheck();
    const fechaGuardada = this.form.fecha;
    const categoriaGuardada = this.form.categoria;
    const formaGuardada = this.form.formaPago;
    const cuentaGuardada = this.form.cuentaId;
    const req = this.editandoId
      ? this.api.actualizarGasto(this.editandoId, body)
      : this.api.crearGasto(body);
    const eraAlta = this.editandoId == null;
    req.subscribe({
      next: () => {
        this.guardando = false;
        if (eraAlta) {
          // Misma fecha (y categoría/pago) lista para otro gasto del día
          this.editandoId = null;
          this.form = {
            fecha: fechaGuardada,
            categoria: categoriaGuardada,
            monto: '',
            motivo: '',
            formaPago: formaGuardada,
            cuentaId: formaGuardada === 'TARJETA' ? cuentaGuardada : null,
            aMeses: false,
            meses: '',
          };
          if (this.esMovil) this.altaAbierta = true;
        } else {
          this.cancelarEdicion();
          if (this.esMovil) this.altaAbierta = false;
        }
        this.claveHoy = this.claveQuincena(this.hoy);
        this.etiquetaQuincenaActual = this.etiquetaDeClave(this.claveHoy);
        this.cargar();
      },
      error: (e) => {
        this.guardando = false;
        this.error = e?.error?.error || 'No se pudo guardar';
        this.cdr.markForCheck();
      },
    });
  }

  /** Monto obligatorio y > 0; enfoca el campo si falla. */
  private montoOk(): boolean {
    const txt = String(this.form.monto ?? '').trim();
    if (!txt) {
      this.error = 'El monto no puede ir vacío';
      this.enfocarMonto();
      this.cdr.markForCheck();
      return false;
    }
    const { total: monto } = parseDineroSuma(txt);
    if (!Number.isFinite(monto) || monto <= 0) {
      this.error = 'El monto debe ser mayor a cero';
      this.enfocarMonto();
      this.cdr.markForCheck();
      return false;
    }
    return true;
  }

  private enfocarMonto(): void {
    queueMicrotask(() => {
      const el = document.querySelector<HTMLInputElement>('form.alta input[name="monto"]');
      el?.focus();
      el?.select();
    });
  }

  async eliminar(id?: number): Promise<void> {
    if (!id) return;
    const ok = await this.confirmDlg.ask('¿Eliminar este gasto?');
    if (!ok) return;
    this.api.eliminarGasto(id).subscribe({
      next: () => {
        if (this.editandoId === id) this.cancelarEdicion();
        this.cargar();
      },
      error: (e) => {
        this.error = e?.error?.error || 'No se pudo eliminar';
        this.cdr.markForCheck();
      },
    });
  }
}
