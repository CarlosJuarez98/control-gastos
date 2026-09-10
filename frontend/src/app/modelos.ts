export interface Resumen {
  totalIngresos: number;
  totalGastos: number;
  balance: number;
  gastosMensuales: number;
  deudaTotal: number;
  meDebenTotal: number;
  saldoDisponible: number;
  totalFisico: number | null;
  gastosPorCategoria: { categoria: string; total: number }[];
  topCuentas: { id: number; nombre: string; tipo: string; saldoActual: number }[];
  prestamistas: { id: number; nombre: string; tipo: string; saldoActual: number }[];
  /** Totales archivados el 1 de enero al cerrar años anteriores. */
  historialAnual?: { anio: number; totalIngresos: number; totalGastos: number; balance: number }[];
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
  /** Plazo MSI (2–48). Null/1 = de contado. */
  meses?: number | null;
}

export interface GastoMensual {
  id?: number;
  motivo: string;
  monto: number;
  activo?: boolean;
  mesesTotales?: number | null;
  mesesRestantes?: number | null;
  montoTotal?: number | null;
  gastoOrigenId?: number | null;
  aMeses?: boolean;
  montoRestante?: number;
  /** Día del mes de pago (1–31). Null = repartir en ambas quincenas. */
  diaPago?: number | null;
}

export interface Cuenta {
  id?: number;
  nombre: string;
  tipo: string;
  saldoActual: number;
  /** Día del mes de corte (1–31); TDC / tienda / préstamo / terreno. */
  diaCorte?: number | null;
  /** Día del mes límite de pago (1–31); TDC / tienda / préstamo / terreno. */
  diaLimitePago?: number | null;
  /** Límite de crédito (opcional según tipo). */
  limiteCredito?: number | null;
  /** límite − deuda (viene del API). */
  creditoDisponible?: number | null;
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

export interface UsuarioAcceso {
  id: number;
  usuario: string;
  rol: 'ADMIN' | 'USER' | string;
  activo: boolean;
}
