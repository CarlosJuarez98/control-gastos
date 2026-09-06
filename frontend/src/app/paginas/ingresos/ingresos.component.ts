import { Component, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../api.service';
import { Ingreso } from '../../modelos';

@Component({
  selector: 'app-ingresos',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DatePipe],
  templateUrl: './ingresos.component.html',
  styleUrl: './ingresos.component.css',
})
export class IngresosComponent implements OnInit {
  items: Ingreso[] = [];
  form: Ingreso = { fecha: new Date().toISOString().slice(0, 10), concepto: '', monto: 0 };
  filtro = '';
  error = '';

  constructor(private api: ApiService) {}

  ngOnInit(): void { this.cargar(); }

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

  get total(): number {
    return this.filtrados.reduce((a, i) => a + Number(i.monto), 0);
  }

  guardar(): void {
    if (!this.form.concepto || !this.form.fecha) return;
    this.api.crearIngreso({ ...this.form, monto: Number(this.form.monto) }).subscribe({
      next: () => {
        this.form = { fecha: new Date().toISOString().slice(0, 10), concepto: '', monto: 0 };
        this.cargar();
      },
      error: (e) => (this.error = e?.error?.error || 'No se pudo guardar'),
    });
  }

  eliminar(id?: number): void {
    if (!id || !confirm('¿Eliminar este ingreso?')) return;
    this.api.eliminarIngreso(id).subscribe({ next: () => this.cargar() });
  }
}
