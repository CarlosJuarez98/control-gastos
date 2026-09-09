import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../api.service';
import { ConfirmDialogService } from '../../confirm-dialog.service';
import { Cuenta, Gasto } from '../../modelos';
import { formatDineroInput, formatDineroNumero, parseDinero, soloMontoKey } from '../../dinero.util';
import { formatFechaCorta } from '../../fecha.util';

export interface GastoFila {
  id?: number;
  fechaIso: string;
  fechaTxt: string;
  categoria: string;
  motivo?: string;
  montoTxt: string;
  pago: string;
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
  imports: [FormsModule, CurrencyPipe],
  templateUrl: './gastos.component.html',
  styleUrl: './gastos.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GastosComponent implements OnInit {
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
  } = {
    fecha: this.fechaLocal(),
    categoria: 'Yo',
    monto: '',
    motivo: '',
    formaPago: 'EFECTIVO',
    cuentaId: null,
  };
  categorias = ['Yo', 'Familia', 'Vehiculos', 'Casa', 'Mama', 'Otro'];
  filtro = '';
  /** total = todas las quincenas; quincena = solo la actual. */
  vista: 'total' | 'quincena' = 'total';
  error = '';
  editandoId: number | null = null;
  guardando = false;
  hoy = this.fechaLocal();

  private claveHoy = '';
  private filtroTimer: ReturnType<typeof setTimeout> | null = null;
  /** Filas por quincena; solo se montan en el DOM si el grupo está abierto. */
  private filasPorClave = new Map<string, GastoFila[]>();
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
    this.hoy = this.fechaLocal();
    this.form.fecha = this.hoy;
    this.claveHoy = this.claveQuincena(this.hoy);
    this.etiquetaQuincenaActual = this.etiquetaDeClave(this.claveHoy);
    this.cargar();
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

  private fechaLocal(d = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  soloMonto(ev: KeyboardEvent): void {
    soloMontoKey(ev);
  }

  alEscribirMonto(v: string): void {
    this.form.monto = formatDineroInput(v);
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
      return g.cuenta?.nombre ? `Tarjeta · ${g.cuenta.nombre}` : 'Tarjeta';
    }
    return 'Efectivo';
  }

  editar(g: GastoFila): void {
    if (!g.id) return;
    const original = this.items.find((x) => x.id === g.id);
    if (!original) return;
    this.error = '';
    this.editandoId = g.id;
    const forma = ((original.formaPago || 'EFECTIVO').toUpperCase() === 'TARJETA'
      ? 'TARJETA'
      : 'EFECTIVO') as 'EFECTIVO' | 'TARJETA';
    this.form = {
      fecha: (original.fecha || '').slice(0, 10),
      categoria: original.categoria || 'Yo',
      monto: formatDineroInput(String(original.monto)),
      motivo: original.motivo || '',
      formaPago: forma,
      cuentaId: forma === 'TARJETA' ? (original.cuentaId ?? original.cuenta?.id ?? null) : null,
    };
    this.cdr.markForCheck();
  }

  cancelarEdicion(): void {
    this.editandoId = null;
    this.error = '';
    this.hoy = this.fechaLocal();
    this.form = {
      fecha: this.hoy,
      categoria: 'Yo',
      monto: '',
      motivo: '',
      formaPago: 'EFECTIVO',
      cuentaId: null,
    };
    this.cdr.markForCheck();
  }

  guardar(): void {
    if (this.guardando) return;
    this.error = '';
    this.hoy = this.fechaLocal();
    this.claveHoy = this.claveQuincena(this.hoy);
    this.etiquetaQuincenaActual = this.etiquetaDeClave(this.claveHoy);
    if (!this.form.fecha || this.form.fecha > this.hoy) {
      this.error = 'La fecha no puede ser mayor a hoy';
      return;
    }
    const monto = parseDinero(this.form.monto);
    if (!monto || monto <= 0) {
      this.error = 'El monto debe ser mayor a cero';
      return;
    }
    if (this.form.formaPago === 'TARJETA') {
      if (!this.form.cuentaId) {
        this.error = 'Elige la TDC con la que pagaste';
        return;
      }
      const tdc = this.cuentasTdc.some((c) => c.id === this.form.cuentaId);
      if (!tdc) {
        this.error = 'Solo puedes pagar con una tarjeta de crédito (TDC)';
        return;
      }
    }

    const body: Gasto = {
      fecha: this.form.fecha,
      categoria: this.form.categoria,
      motivo: this.form.motivo,
      monto,
      formaPago: this.form.formaPago,
      cuentaId: this.form.formaPago === 'TARJETA' ? this.form.cuentaId : null,
    };

    this.guardando = true;
    const req = this.editandoId
      ? this.api.actualizarGasto(this.editandoId, body)
      : this.api.crearGasto(body);
    req.subscribe({
      next: () => {
        this.guardando = false;
        this.cancelarEdicion();
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
