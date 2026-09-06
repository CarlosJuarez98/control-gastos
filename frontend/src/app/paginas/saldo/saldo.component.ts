import { Component, OnInit } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../api.service';
import { Denominacion, SaldoSnapshot } from '../../modelos';

@Component({
  selector: 'app-saldo',
  standalone: true,
  imports: [FormsModule, CurrencyPipe],
  templateUrl: './saldo.component.html',
  styleUrl: './saldo.component.css',
})
export class SaldoComponent implements OnInit {
  saldo: SaldoSnapshot = {
    fecha: new Date().toISOString().slice(0, 10),
    saldoTotal: 0,
  };
  denominaciones: Denominacion[] = [];
  mensaje = '';
  error = '';

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.saldo().subscribe({
      next: (r) => {
        if (r.saldo && Object.keys(r.saldo).length) {
          this.saldo = { ...r.saldo };
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
      },
      error: (e) => (this.error = e?.error?.error || 'Error al cargar saldo'),
    });
  }

  get totalEfectivo(): number {
    return this.denominaciones.reduce((a, d) => a + Number(d.valor) * Number(d.cantidad), 0);
  }

  guardar(): void {
    this.api.guardarSaldo({
      ...this.saldo,
      saldoTotal: Number(this.saldo.saldoTotal),
      totalFisico: this.totalEfectivo,
    }).subscribe({
      next: () => {
        this.api.guardarDenominaciones(this.denominaciones.map((d) => ({
          valor: Number(d.valor),
          cantidad: Number(d.cantidad),
        }))).subscribe({
          next: () => (this.mensaje = 'Saldo guardado'),
        });
      },
      error: (e) => (this.error = e?.error?.error || 'No se pudo guardar'),
    });
  }
}
