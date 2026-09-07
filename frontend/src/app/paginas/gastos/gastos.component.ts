import { Component, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../api.service';
import { ConfirmDialogService } from '../../confirm-dialog.service';
import { Cuenta, Gasto } from '../../modelos';
import { formatDineroInput, parseDinero, soloMontoKey } from '../../dinero.util';

@Component({
  selector: 'app-gastos',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DatePipe],
  templateUrl: './gastos.component.html',
  styleUrl: './gastos.component.css',
})
export class GastosComponent implements OnInit {
  items: Gasto[] = [];
  cuentas: Cuenta[] = [];
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
  error = '';
  guardando = false;
  hoy = this.fechaLocal();

  constructor(private api: ApiService, private confirmDlg: ConfirmDialogService) {}

  ngOnInit(): void {
    this.hoy = this.fechaLocal();
    this.form.fecha = this.hoy;
    this.cargar();
    this.api.cuentas().subscribe({
      next: (r) => (this.cuentas = r),
      error: () => (this.cuentas = []),
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

  /** Solo TDC para pagar con tarjeta. */
  get cuentasTdc(): Cuenta[] {
    return this.cuentas
      .filter((c) => (c.tipo || '').toUpperCase() === 'TDC')
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));
  }

  cargar(): void {
    this.api.gastos().subscribe({
      next: (r) => (this.items = r),
      error: (e) => (this.error = e?.error?.error || 'Error al cargar gastos'),
    });
  }

  get filtrados(): Gasto[] {
    const q = this.filtro.trim().toLowerCase();
    if (!q) return this.items;
    return this.items.filter((g) =>
      `${g.categoria} ${g.motivo || ''} ${g.formaPago || ''} ${g.cuenta?.nombre || ''}`
        .toLowerCase()
        .includes(q)
    );
  }

  get total(): number {
    return this.filtrados.reduce((a, g) => a + Number(g.monto), 0);
  }

  etiquetaPago(g: Gasto): string {
    const forma = (g.formaPago || 'EFECTIVO').toUpperCase();
    if (forma === 'TARJETA') {
      return g.cuenta?.nombre ? `Tarjeta · ${g.cuenta.nombre}` : 'Tarjeta';
    }
    return 'Efectivo';
  }

  guardar(): void {
    if (this.guardando) return;
    this.error = '';
    this.hoy = this.fechaLocal();
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
    this.api.crearGasto(body).subscribe({
      next: () => {
        this.hoy = this.fechaLocal();
        this.form = {
          fecha: this.hoy,
          categoria: 'Yo',
          monto: '',
          motivo: '',
          formaPago: 'EFECTIVO',
          cuentaId: null,
        };
        this.guardando = false;
        this.cargar();
      },
      error: (e) => {
        this.guardando = false;
        this.error = e?.error?.error || 'No se pudo guardar';
      },
    });
  }

  async eliminar(id?: number): Promise<void> {
    if (!id) return;
    const ok = await this.confirmDlg.ask('¿Eliminar este gasto?');
    if (!ok) return;
    this.api.eliminarGasto(id).subscribe({
      next: () => this.cargar(),
      error: (e) => (this.error = e?.error?.error || 'No se pudo eliminar'),
    });
  }
}
