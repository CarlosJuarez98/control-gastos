import { Component, OnInit } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../api.service';
import { PagosQuincenaService } from '../../pagos-quincena.service';
import { Resumen } from '../../modelos';

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DecimalPipe, RouterLink],
  templateUrl: './resumen.component.html',
  styleUrl: './resumen.component.css',
})
export class ResumenComponent implements OnInit {
  data?: Resumen;
  error = '';
  cargando = false;
  /** A pagar en la quincena actual (fijos, cuotas, TDC de contado / deudas). */
  pagoEstaQuincena = 0;

  /** yyyy-MM */
  mesSeleccionado = '';
  mesesOpciones: { valor: string; etiqueta: string }[] = [];

  readonly colores = [
    '#3dbea0', // teal marca
    '#f0a45d', // ámbar marca
    '#6ea8fe', // azul suave
    '#e57373', // coral (gastos)
    '#5dce9a', // verde ok
    '#8eb4c7', // gris-azulado
    '#e8b86d', // oro suave
    '#7eb8a8', // sage
    '#d4a0a0', // rosa apagado
    '#9bb7d4', // celeste
    '#a8c5a0', // verde suave
  ];

  private readonly nombresMes = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  constructor(
    private api: ApiService,
    private pagosQuincena: PagosQuincenaService,
  ) {}

  ngOnInit(): void {
    this.mesesOpciones = this.generarMeses();
    this.mesSeleccionado = this.mesActual();
    this.cargar();
    this.cargarPagoQuincena();
  }

  get etiquetaMes(): string {
    const op = this.mesesOpciones.find((m) => m.valor === this.mesSeleccionado);
    return op?.etiqueta ?? this.mesSeleccionado;
  }

  get puedeAnterior(): boolean {
    return this.indiceMes() < this.mesesOpciones.length - 1;
  }

  get puedeSiguiente(): boolean {
    return this.indiceMes() > 0;
  }

  cambiarMes(): void {
    this.cargar();
  }

  mesAnterior(): void {
    if (!this.puedeAnterior) return;
    this.mesSeleccionado = this.mesesOpciones[this.indiceMes() + 1].valor;
    this.cargar();
  }

  mesSiguiente(): void {
    if (!this.puedeSiguiente) return;
    this.mesSeleccionado = this.mesesOpciones[this.indiceMes() - 1].valor;
    this.cargar();
  }

  cargar(): void {
    if (!this.mesSeleccionado) return;
    const [y, m] = this.mesSeleccionado.split('-').map(Number);
    const desde = `${this.mesSeleccionado}-01`;
    const ultimoDia = new Date(y, m, 0).getDate();
    const hasta = `${this.mesSeleccionado}-${String(ultimoDia).padStart(2, '0')}`;

    this.cargando = true;
    this.error = '';
    this.api.resumen(desde, hasta).subscribe({
      next: (r) => {
        this.data = r;
        this.cargando = false;
      },
      error: (e) => {
        this.error = e?.error?.error || 'No se pudo cargar el resumen';
        this.cargando = false;
      },
    });
  }

  private cargarPagoQuincena(): void {
    this.pagosQuincena.cargarTotales().subscribe({
      next: (t) => (this.pagoEstaQuincena = t.esta),
      error: () => (this.pagoEstaQuincena = 0),
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

  maxPrestamista(): number {
    if (!this.data?.prestamistas?.length) return 1;
    return Math.max(...this.data.prestamistas.map((c) => Number(c.saldoActual) || 0), 1);
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

  private mesActual(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /** Opciones de mes: más reciente primero (desde ene 2023 hasta el mes actual). */
  private generarMeses(): { valor: string; etiqueta: string }[] {
    const fin = new Date();
    fin.setDate(1);
    const inicio = new Date(2023, 0, 1);
    const out: { valor: string; etiqueta: string }[] = [];
    const cursor = new Date(fin);
    while (cursor >= inicio) {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const valor = `${y}-${String(m + 1).padStart(2, '0')}`;
      out.push({ valor, etiqueta: `${this.nombresMes[m]} ${y}` });
      cursor.setMonth(cursor.getMonth() - 1);
    }
    return out;
  }

  private indiceMes(): number {
    return this.mesesOpciones.findIndex((m) => m.valor === this.mesSeleccionado);
  }
}
