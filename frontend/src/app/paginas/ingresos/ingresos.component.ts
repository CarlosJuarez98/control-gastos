import { Component, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../api.service';
import { ConfirmDialogService } from '../../confirm-dialog.service';
import { Ingreso } from '../../modelos';
import { formatDineroInput, parseDinero, soloMontoKey } from '../../dinero.util';

export interface GrupoMes {
  clave: string;
  etiqueta: string;
  total: number;
  items: Ingreso[];
}

@Component({
  selector: 'app-ingresos',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DatePipe],
  templateUrl: './ingresos.component.html',
  styleUrl: './ingresos.component.css',
})
export class IngresosComponent implements OnInit {
  items: Ingreso[] = [];
  hoy = this.fechaLocal();
  form: { fecha: string; concepto: string; monto: string } = {
    fecha: this.hoy,
    concepto: '',
    monto: '',
  };
  filtro = '';
  error = '';

  private readonly meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];

  constructor(private api: ApiService, private confirmDlg: ConfirmDialogService) {}

  ngOnInit(): void { this.cargar(); }

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

  cargar(): void {
    this.api.ingresos().subscribe({
      next: (r) => (this.items = r),
      error: (e) => (this.error = e?.error?.error || 'Error al cargar ingresos'),
    });
  }

  get filtrados(): Ingreso[] {
    const q = this.filtro.trim().toLowerCase();
    if (!q) return this.items;
    return this.items.filter((i) => i.concepto.toLowerCase().includes(q));
  }

  get porMes(): GrupoMes[] {
    const map = new Map<string, Ingreso[]>();
    for (const i of this.filtrados) {
      const clave = (i.fecha || '').slice(0, 7); // yyyy-MM
      if (!clave) continue;
      if (!map.has(clave)) map.set(clave, []);
      map.get(clave)!.push(i);
    }

    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([clave, items]) => {
        const [y, m] = clave.split('-').map(Number);
        const etiqueta = `${this.meses[m - 1]} ${y}`;
        const total = items.reduce((a, i) => a + Number(i.monto), 0);
        const ordenados = [...items].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
        return { clave, etiqueta, total, items: ordenados };
      });
  }

  guardar(): void {
    this.error = '';
    if (!this.form.concepto || !this.form.fecha) return;
    if (this.form.fecha > this.hoy) {
      this.error = 'La fecha no puede ser mayor a hoy';
      return;
    }
    const monto = parseDinero(this.form.monto);
    if (!monto || monto <= 0) {
      this.error = 'El monto debe ser mayor a cero';
      return;
    }
    this.api.crearIngreso({
      fecha: this.form.fecha,
      concepto: this.form.concepto,
      monto,
    }).subscribe({
      next: () => {
        this.hoy = this.fechaLocal();
        this.form = { fecha: this.hoy, concepto: '', monto: '' };
        this.cargar();
      },
      error: (e) => (this.error = e?.error?.error || 'No se pudo guardar'),
    });
  }

  async eliminar(id?: number): Promise<void> {
    if (!id) return;
    const ok = await this.confirmDlg.ask('¿Eliminar este ingreso?');
    if (!ok) return;
    this.api.eliminarIngreso(id).subscribe({ next: () => this.cargar() });
  }
}
