import { Component, OnInit } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../api.service';
import { Resumen } from '../../modelos';

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, RouterLink],
  templateUrl: './resumen.component.html',
  styleUrl: './resumen.component.css',
})
export class ResumenComponent implements OnInit {
  data?: Resumen;
  error = '';

  readonly colores = [
    '#3dbea0',
    '#f0a45d',
    '#6ea8fe',
    '#e57373',
    '#c9a0ff',
    '#5dce9a',
    '#ffb74d',
    '#80cbc4',
    '#f48fb1',
    '#90caf9',
    '#aed581',
  ];

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.api.resumen().subscribe({
      next: (r) => (this.data = r),
      error: (e) => (this.error = e?.error?.error || 'No se pudo cargar el resumen'),
    });
  }

  maxFlujo(): number {
    if (!this.data) return 1;
    return Math.max(
      Number(this.data.totalIngresos) || 0,
      Number(this.data.totalGastos) || 0,
      Number(this.data.deudaTotal) || 0,
      1
    );
  }

  pctFlujo(valor: number): number {
    return Math.min(100, (Number(valor) / this.maxFlujo()) * 100);
  }

  maxCat(): number {
    if (!this.data?.gastosPorCategoria?.length) return 1;
    return Math.max(...this.data.gastosPorCategoria.map((c) => Number(c.total) || 0), 1);
  }

  maxCuenta(): number {
    if (!this.data?.topCuentas?.length) return 1;
    return Math.max(...this.data.topCuentas.map((c) => Number(c.saldoActual) || 0), 1);
  }

  totalCategorias(): number {
    if (!this.data?.gastosPorCategoria?.length) return 0;
    return this.data.gastosPorCategoria.reduce((a, c) => a + Number(c.total), 0);
  }

  /** Segmentos del donut (conic-gradient). */
  donutBackground(): string {
    const total = this.totalCategorias();
    if (!total || !this.data?.gastosPorCategoria?.length) {
      return 'conic-gradient(rgba(255,255,255,0.08) 0 100%)';
    }
    let acc = 0;
    const parts: string[] = [];
    this.data.gastosPorCategoria.forEach((c, i) => {
      const start = (acc / total) * 100;
      acc += Number(c.total);
      const end = (acc / total) * 100;
      const color = this.colores[i % this.colores.length];
      parts.push(`${color} ${start}% ${end}%`);
    });
    return `conic-gradient(${parts.join(', ')})`;
  }

  pctCat(total: number): number {
    const t = this.totalCategorias();
    if (!t) return 0;
    return (Number(total) / t) * 100;
  }
}
