import { Component, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../api.service';
import { Gasto } from '../../modelos';

@Component({
  selector: 'app-gastos',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DatePipe],
  templateUrl: './gastos.component.html',
  styleUrl: './gastos.component.css',
})
export class GastosComponent implements OnInit {
  items: Gasto[] = [];
  form: Gasto = {
    fecha: new Date().toISOString().slice(0, 10),
    categoria: 'Yo',
    monto: 0,
    motivo: '',
  };
  categorias = ['Yo', 'Familia', 'TDC', 'Vehiculos', 'Nu credito', 'Didi Card', 'Liverpool', 'Mama', 'Otro'];
  filtro = '';
  error = '';

  constructor(private api: ApiService) {}

  ngOnInit(): void { this.cargar(); }

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
      `${g.categoria} ${g.motivo || ''}`.toLowerCase().includes(q)
    );
  }

  get total(): number {
    return this.filtrados.reduce((a, g) => a + Number(g.monto), 0);
  }

  guardar(): void {
    this.api.crearGasto({ ...this.form, monto: Number(this.form.monto) }).subscribe({
      next: () => {
        this.form = {
          fecha: new Date().toISOString().slice(0, 10),
          categoria: 'Yo',
          monto: 0,
          motivo: '',
        };
        this.cargar();
      },
      error: (e) => (this.error = e?.error?.error || 'No se pudo guardar'),
    });
  }

  eliminar(id?: number): void {
    if (!id || !confirm('¿Eliminar este gasto?')) return;
    this.api.eliminarGasto(id).subscribe({ next: () => this.cargar() });
  }
}
