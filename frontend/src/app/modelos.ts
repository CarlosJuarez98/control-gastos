export interface Resumen {
  totalIngresos: number;
  totalGastos: number;
  balance: number;
  gastosMensuales: number;
  deudaTotal: number;
  saldoDisponible: number;
  totalFisico: number | null;
  gastosPorCategoria: { categoria: string; total: number }[];
  topCuentas: { id: number; nombre: string; tipo: string; saldoActual: number }[];
}

export interface Ingreso {
  id?: number;
  fecha: string;
  concepto: string;
  monto: number;
}

export interface Gasto {
  id?: number;
  fecha: string;
  categoria: string;
  monto: number;
  motivo?: string;
  formaPago?: 'EFECTIVO' | 'TARJETA' | string;
  cuentaId?: number | null;
  cuenta?: Cuenta | null;
  movimientoId?: number | null;
}

export interface GastoMensual {
  id?: number;
  motivo: string;
  monto: number;
  activo?: boolean;
}

export interface Cuenta {
  id?: number;
  nombre: string;
  tipo: string;
  saldoActual: number;
}

export interface Movimiento {
  id?: number;
  fecha: string;
  tipo: string;
  monto: number;
  concepto?: string;
  cuenta?: Cuenta;
}

export interface SaldoSnapshot {
  id?: number;
  fecha: string;
  saldoTotal: number;
  totalFisico?: number | null;
  dineroBbva?: number | null;
  dineroMercadoLibre?: number | null;
  dineroNu?: number | null;
  dineroDidi?: number | null;
  ultimoIngresoId?: number | null;
  ultimoGastoId?: number | null;
  ultimoMovimientoId?: number | null;
}

export interface Denominacion {
  id?: number;
  valor: number;
  cantidad: number;
}
