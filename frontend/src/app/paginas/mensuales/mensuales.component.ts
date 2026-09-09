import { Component, OnInit } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../api.service';
import { ConfirmDialogService } from '../../confirm-dialog.service';
import { GastoMensual } from '../../modelos';
import { formatDineroInput, parseDinero, soloMontoKey } from '../../dinero.util';

@Component({
  selector: 'app-mensuales',
  standalone: true,
  imports: [FormsModule, CurrencyPipe],
  templateUrl: './mensuales.component.html',
  styleUrl: './mensuales.component.css',
})
export class MensualesComponent implements OnInit {
  items: GastoMensual[] = [];
  form: { motivo: string; monto: string } = { motivo: '', monto: '' };
  error = '';

  constructor(private api: ApiService, private confirmDlg: ConfirmDialogService) {}

  ngOnInit(): void { this.cargar(); }

  get total(): number {
    return this.items.reduce((a, i) => a + Number(i.monto), 0);
  }

  /** Aprox. al repartir el mes en 2 quincenas. */
  get porQuincena(): number {
    return Math.round((this.total / 2) * 100) / 100;
  }

  quincenaDe(monto: number | string): number {
    return Math.round((Number(monto) / 2) * 100) / 100;
  }

  cargar(): void {
    this.api.mensuales().subscribe({
      next: (r) => (this.items = r),
      error: (e) => (this.error = e?.error?.error || 'Error al cargar'),
    });
  }

  soloMonto(ev: KeyboardEvent): void {
    soloMontoKey(ev);
  }

  alEscribirMonto(v: string): void {
    this.form.monto = formatDineroInput(v);
  }

  guardar(): void {
    if (!this.form.motivo) return;
    const monto = parseDinero(this.form.monto);
    if (!monto || monto <= 0) {
      this.error = 'El monto debe ser mayor a cero';
      return;
    }
    this.error = '';
    this.api.crearMensual({ motivo: this.form.motivo, monto }).subscribe({
      next: () => {
        this.form = { motivo: '', monto: '' };
        this.cargar();
      },
      error: (e) => (this.error = e?.error?.error || 'No se pudo guardar'),
    });
  }

  async eliminar(id?: number): Promise<void> {
    if (!id) return;
    const ok = await this.confirmDlg.ask('¿Quitar este gasto mensual?');
    if (!ok) return;
    this.api.eliminarMensual(id).subscribe({ next: () => this.cargar() });
  }
}
