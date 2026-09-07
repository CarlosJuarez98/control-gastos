import { Component, OnInit } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../api.service';
import { Cuenta, Movimiento } from '../../modelos';
import { formatDineroInput, formatDineroNumero, parseDinero, soloMontoKey } from '../../dinero.util';

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
  saldoNueva = '';
  mov: { fecha: string; tipo: string } = {
    fecha: this.fechaLocal(),
    tipo: 'ABONO',
  };
  montoMov = '';
  tipos = ['TDC', 'PRESTAMO', 'TIENDA', 'TERRENO', 'PRESTAMO_OTORGADO', 'OTRO'];
  tiposMov = ['ABONO', 'CARGO', 'INTERES', 'REEMBOLSO'];
  error = '';
  hoy = this.fechaLocal();
  guardandoTipo = false;

  constructor(private api: ApiService, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.hoy = this.fechaLocal();
    this.mov.fecha = this.hoy;
    this.cargarCuentas();
    this.route.paramMap.subscribe((p) => {
      const id = p.get('id');
      if (id) this.abrir(+id);
    });
  }

  etiquetaTipo(t: string): string {
    switch ((t || '').toUpperCase()) {
      case 'TDC': return 'TDC';
      case 'PRESTAMO': return 'Préstamo';
      case 'TIENDA': return 'Tienda';
      case 'TERRENO': return 'Terreno';
      case 'PRESTAMO_OTORGADO': return 'Te deben (prestamista)';
      case 'OTRO': return 'Otro';
      default: return t;
    }
  }

  etiquetaMov(t: string): string {
    switch ((t || '').toUpperCase()) {
      case 'ABONO': return 'Abono';
      case 'CARGO': return 'Cargo';
      case 'INTERES': return 'Interés';
      case 'REEMBOLSO': return 'Reembolso';
      default: return t;
    }
  }

  onTipoMovChange(tipo: string): void {
    this.mov.tipo = tipo;
    this.error = '';
    if (tipo === 'INTERES' && this.seleccionada) {
      const actual = Number(this.seleccionada.saldoActual) || 0;
      this.montoMov = actual > 0 ? formatDineroNumero(actual) : '';
    } else {
      this.montoMov = '';
    }
  }

  /** Si tipo=INTERES, montoMov es la deuda nueva → interés = nueva − actual. */
  get interesCalculado(): number {
    if (this.mov.tipo !== 'INTERES' || !this.seleccionada) return 0;
    const nueva = parseDinero(this.montoMov);
    const actual = Number(this.seleccionada.saldoActual) || 0;
    return Math.round((nueva - actual) * 100) / 100;
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
    this.montoMov = formatDineroInput(v);
  }

  alEscribirSaldoNueva(v: string): void {
    this.saldoNueva = formatDineroInput(v);
  }

  get deudaVisible(): number {
    return this.misDeudasPendientes
      .reduce((a, c) => a + Number(c.saldoActual), 0);
  }

  get meDebenTotal(): number {
    return this.meDebenPendientes
      .reduce((a, c) => a + Number(c.saldoActual), 0);
  }

  private porNombre(a: Cuenta, b: Cuenta): number {
    return (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' });
  }

  private esPrestamista(c: Cuenta): boolean {
    return (c.tipo || '').toUpperCase() === 'PRESTAMO_OTORGADO';
  }

  /** Lo que tú debes (excluye prestamistas). */
  get misDeudasPendientes(): Cuenta[] {
    return this.cuentas
      .filter((c) => !this.esPrestamista(c) && Number(c.saldoActual) !== 0)
      .sort((a, b) => this.porNombre(a, b));
  }

  /** Dinero que te deben. */
  get meDebenPendientes(): Cuenta[] {
    return this.cuentas
      .filter((c) => this.esPrestamista(c) && Number(c.saldoActual) !== 0)
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
    const saldo = parseDinero(this.saldoNueva);
    this.api.crearCuenta({ ...this.nueva, saldoActual: saldo }).subscribe({
      next: () => {
        this.nueva = { nombre: '', tipo: 'TDC', saldoActual: 0 };
        this.saldoNueva = '';
        this.cargarCuentas();
      },
    });
  }

  cambiarTipo(tipo: string): void {
    if (!this.seleccionada?.id || this.guardandoTipo) return;
    if ((this.seleccionada.tipo || '') === tipo) return;
    this.error = '';
    this.guardandoTipo = true;
    const body: Cuenta = {
      ...this.seleccionada,
      tipo,
    };
    this.api.actualizarCuenta(this.seleccionada.id, body).subscribe({
      next: (c) => {
        this.seleccionada = c;
        this.guardandoTipo = false;
        this.cargarCuentas();
      },
      error: (e) => {
        this.guardandoTipo = false;
        this.error = e?.error?.error || 'No se pudo cambiar la categoría';
      },
    });
  }

  agregarMovimiento(): void {
    if (!this.seleccionada?.id) return;
    this.error = '';
    this.hoy = this.fechaLocal();
    if (!this.mov.fecha || this.mov.fecha > this.hoy) {
      this.error = 'La fecha no puede ser mayor a hoy';
      return;
    }

    let monto: number;
    if (this.mov.tipo === 'INTERES') {
      const deudaHoy = parseDinero(this.montoMov);
      const actual = Number(this.seleccionada.saldoActual) || 0;
      if (!deudaHoy || deudaHoy <= 0) {
        this.error = 'Captura la deuda que marca hoy';
        return;
      }
      monto = Math.round((deudaHoy - actual) * 100) / 100;
      if (monto <= 0) {
        this.error = 'La deuda de hoy debe ser mayor al saldo registrado para calcular el interés';
        return;
      }
    } else {
      monto = parseDinero(this.montoMov);
      if (!monto || monto <= 0) {
        this.error = 'El monto debe ser mayor a cero';
        return;
      }
    }

    const body: Movimiento = {
      fecha: this.mov.fecha,
      tipo: this.mov.tipo,
      monto,
    };
    this.api.agregarMovimiento(this.seleccionada.id, body).subscribe({
      next: () => {
        this.hoy = this.fechaLocal();
        this.mov = { fecha: this.hoy, tipo: 'ABONO' };
        this.montoMov = '';
        this.abrir(this.seleccionada!.id!);
        this.cargarCuentas();
      },
      error: (e) => (this.error = e?.error?.error || 'No se pudo registrar'),
    });
  }
}
