import { Component, OnInit } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../api.service';
import { GastoMensual } from '../../modelos';

@Component({
  selector: 'app-mensuales',
  standalone: true,
  imports: [FormsModule, CurrencyPipe],
  templateUrl: './mensuales.component.html',
  styleUrl: './mensuales.component.css',
})
export class MensualesComponent implements OnInit {
  items: GastoMensual[] = [];
  form: GastoMensual = { motivo: '', monto: 0 };
  error = '';

  constructor(private api: ApiService) {}

  ngOnInit(): void { this.cargar(); }

  get total(): number {
    return this.items.reduce((a, i) => a + Number(i.monto), 0);
  }

  cargar(): void {
    this.api.mensuales().subscribe({
      next: (r) => (this.items = r),
      error: (e) => (this.error = e?.error?.error || 'Error al cargar'),
    });
  }

  guardar(): void {
    if (!this.form.motivo) return;
    this.api.crearMensual({ ...this.form, monto: Number(this.form.monto) }).subscribe({
      next: () => {
        this.form = { motivo: '', monto: 0 };
        this.cargar();
      },
    });
  }

  eliminar(id?: number): void {
    if (!id || !confirm('¿Quitar este gasto mensual?')) return;
    this.api.eliminarMensual(id).subscribe({ next: () => this.cargar() });
  }
}
