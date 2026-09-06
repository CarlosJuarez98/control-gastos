import { Component, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../api.service';
import { Cuenta, Movimiento } from '../../modelos';

@Component({
  selector: 'app-cuentas',
  standalone: true,
  imports: [FormsModule, CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './cuentas.component.html',
  styleUrl: './cuentas.component.css',
})
export class CuentasComponent implements OnInit {
  cuentas: Cuenta[] = [];
  seleccionada?: Cuenta;
  movimientos: Movimiento[] = [];
  nueva: Cuenta = { nombre: '', tipo: 'TDC', saldoActual: 0 };
  mov: Movimiento = {
    fecha: new Date().toISOString().slice(0, 10),
    tipo: 'ABONO',
    monto: 0,
    concepto: '',
  };
  tipos = ['TDC', 'PRESTAMO', 'TIENDA', 'TERRENO', 'PRESTAMO_OTORGADO', 'OTRO'];
  tiposMov = ['ABONO', 'CARGO', 'INTERES', 'REEMBOLSO'];
  error = '';

  constructor(private api: ApiService, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.cargarCuentas();
    this.route.paramMap.subscribe((p) => {
      const id = p.get('id');
      if (id) this.abrir(+id);
    });
  }

  get deudaVisible(): number {
    return this.cuentas
      .filter((c) => c.tipo !== 'PRESTAMO_OTORGADO' && Number(c.saldoActual) !== 0)
      .reduce((a, c) => a + Number(c.saldoActual), 0);
  }

  private porNombre(a: Cuenta, b: Cuenta): number {
    return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
  }

  get cuentasPendientes(): Cuenta[] {
    return this.cuentas
      .filter((c) => Number(c.saldoActual) !== 0)
      .sort((a, b) => this.porNombre(a, b));
  }

  get cuentasSaldadas(): Cuenta[] {
    return this.cuentas
      .filter((c) => Number(c.saldoActual) === 0)
      .sort((a, b) => this.porNombre(a, b));
  }

  cargarCuentas(): void {
    this.api.cuentas().subscribe({
      next: (r) => (this.cuentas = r),
      error: (e) => (this.error = e?.error?.error || 'Error al cargar cuentas'),
    });
  }

  abrir(id: number): void {
    this.api.cuenta(id).subscribe({
      next: (c) => {
        this.seleccionada = c;
        this.api.movimientos(id).subscribe({ next: (m) => (this.movimientos = m) });
      },
    });
  }

  crearCuenta(): void {
    if (!this.nueva.nombre) return;
    this.api.crearCuenta({ ...this.nueva, saldoActual: Number(this.nueva.saldoActual) }).subscribe({
      next: () => {
        this.nueva = { nombre: '', tipo: 'TDC', saldoActual: 0 };
        this.cargarCuentas();
      },
    });
  }

  agregarMovimiento(): void {
    if (!this.seleccionada?.id) return;
    this.api.agregarMovimiento(this.seleccionada.id, {
      ...this.mov,
      monto: Number(this.mov.monto),
    }).subscribe({
      next: () => {
        this.mov = {
          fecha: new Date().toISOString().slice(0, 10),
          tipo: 'ABONO',
          monto: 0,
          concepto: '',
        };
        this.abrir(this.seleccionada!.id!);
        this.cargarCuentas();
      },
    });
  }
}
