import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../api.service';
import { ConfirmDialogService } from '../../confirm-dialog.service';
import { Ingreso } from '../../modelos';
import { formatDineroInput, formatDineroInputFlexible, formatDineroNumero, parseDineroSuma, soloMontoKey } from '../../dinero.util';
import { formatFechaCorta, fechaHoyLocal } from '../../fecha.util';
import { EnterAvanceDirective } from '../../enter-avance.directive';

export interface IngresoFila {
  id?: number;
  fechaIso: string;
  fechaTxt: string;
  concepto: string;
  montoTxt: string;
}

export interface GrupoQuincena {
  clave: string;
  etiqueta: string;
  totalTxt: string;
  cuantos: number;
  abierta: boolean;
  items: IngresoFila[];
}

@Component({
  selector: 'app-ingresos',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, EnterAvanceDirective],
  templateUrl: './ingresos.component.html',
  styleUrl: './ingresos.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IngresosComponent implements OnInit {
  items: Ingreso[] = [];
  grupos: GrupoQuincena[] = [];
  total = 0;
  totalQuincenaActual = 0;
  etiquetaQuincenaActual = '';

  hoy = fechaHoyLocal();
  form: { fecha: string; concepto: string; monto: string } = {
    fecha: fechaHoyLocal(),
    concepto: '',
    monto: '',
  };
  filtro = '';
  vista: 'total' | 'quincena' = 'quincena';
  error = '';
  editandoId: number | null = null;
  guardando = false;

  private claveHoy = '';
  private filtroTimer: ReturnType<typeof setTimeout> | null = null;
  private filasPorClave = new Map<string, IngresoFila[]>();
  private abiertas = new Set<string>();

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
    this.hoy = fechaHoyLocal();
    this.form.fecha = this.hoy;
    this.claveHoy = this.claveQuincena(this.hoy);
    this.etiquetaQuincenaActual = this.etiquetaDeClave(this.claveHoy);
    this.cargar();
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
    const cur = String(this.form.monto ?? '').trimEnd();
    if (!cur || /[+;]$/.test(cur)) return;
    this.form.monto = formatDineroInputFlexible(cur + '+');
  }

  /** Vista previa si hay varios montos con + o ; */
  get montoSumaHint(): string | null {
    const { total, partes } = parseDineroSuma(this.form.monto);
    if (partes.length < 2 || total <= 0) return null;
    return `Suma ${partes.length} montos = $${formatDineroNumero(total)}`;
  }

  alFiltrar(v: string): void {
    this.filtro = v;
    if (this.filtroTimer) clearTimeout(this.filtroTimer);
    this.filtroTimer = setTimeout(() => {
      this.recalcular();
      this.cdr.markForCheck();
    }, 120);
  }

  cargar(): void {
    this.api.ingresos().subscribe({
      next: (r) => {
        this.items = r;
        this.recalcular();
        this.cdr.markForCheck();
      },
      error: (e) => {
        this.error = e?.error?.error || 'Error al cargar ingresos';
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
      : this.items.filter((i) => (i.concepto || '').toLowerCase().includes(q));

    let total = 0;
    let totalQ = 0;
    for (const i of base) {
      const monto = Number(i.monto) || 0;
      total += monto;
      if (this.claveQuincena(i.fecha || '') === this.claveHoy) {
        totalQ += monto;
      }
    }
    this.total = total;
    this.totalQuincenaActual = totalQ;

    const list =
      this.vista === 'quincena'
        ? base.filter((i) => this.claveQuincena(i.fecha || '') === this.claveHoy)
        : base;

    const map = new Map<string, IngresoFila[]>();
    const totales = new Map<string, number>();

    for (const i of list) {
      const clave = this.claveQuincena(i.fecha || '');
      if (!clave) continue;
      if (!map.has(clave)) {
        map.set(clave, []);
        totales.set(clave, 0);
      }
      const monto = Number(i.monto) || 0;
      map.get(clave)!.push({
        id: i.id,
        fechaIso: (i.fecha || '').slice(0, 10),
        fechaTxt: formatFechaCorta(i.fecha),
        concepto: i.concepto,
        montoTxt: `$${formatDineroNumero(monto)}`,
      });
      totales.set(clave, (totales.get(clave) || 0) + monto);
    }

    this.filasPorClave = map;
    for (const items of map.values()) {
      items.sort((a, b) => (b.fechaIso || '').localeCompare(a.fechaIso || ''));
    }

    const claves = [...map.keys()].sort((a, b) => b.localeCompare(a));

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

  editar(i: IngresoFila): void {
    if (!i.id) return;
    const original = this.items.find((x) => x.id === i.id);
    if (!original) return;
    this.error = '';
    this.editandoId = i.id;
    this.form = {
      fecha: (original.fecha || '').slice(0, 10) || fechaHoyLocal(),
      concepto: original.concepto,
      monto: formatDineroInput(String(original.monto)),
    };
    this.cdr.markForCheck();
  }

  cancelarEdicion(): void {
    this.editandoId = null;
    this.error = '';
    this.hoy = fechaHoyLocal();
    this.form = { fecha: this.hoy, concepto: '', monto: '' };
    this.cdr.markForCheck();
  }

  get puedeGuardarMonto(): boolean {
    const txt = String(this.form.monto ?? '').trim();
    if (!txt) return false;
    const { total } = parseDineroSuma(txt);
    return Number.isFinite(total) && total > 0;
  }

  get puedeGuardar(): boolean {
    return !!this.form.concepto?.trim() && this.puedeGuardarMonto;
  }

  guardar(): void {
    if (this.guardando || !this.puedeGuardar) return;
    this.error = '';
    this.hoy = fechaHoyLocal();
    if (!this.form.fecha) {
      this.form.fecha = this.hoy;
    }
    if (!this.form.concepto) {
      this.error = 'Completa fecha y concepto';
      this.cdr.markForCheck();
      return;
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
    const fechaGuardada = this.form.fecha;
    const body = {
      fecha: fechaGuardada,
      concepto: this.form.concepto,
      monto,
    };
    this.guardando = true;
    this.cdr.markForCheck();
    const req = this.editandoId
      ? this.api.actualizarIngreso(this.editandoId, body)
      : this.api.crearIngreso(body);
    const eraAlta = this.editandoId == null;
    req.subscribe({
      next: () => {
        this.guardando = false;
        if (eraAlta) {
          // Misma fecha lista para otro ingreso del día
          this.editandoId = null;
          this.form = { fecha: fechaGuardada, concepto: '', monto: '' };
        } else {
          this.cancelarEdicion();
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
    const ok = await this.confirmDlg.ask('¿Eliminar este ingreso?');
    if (!ok) return;
    this.api.eliminarIngreso(id).subscribe({
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
