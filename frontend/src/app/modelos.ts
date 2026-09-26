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
  /** Efectivo guardadito (Compartido); solo si hay. */
  guardaditoTotal?: number;
  guardaditoPorPersona?: { id?: number; nombre: string; monto: number }[];
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
  formaPago?: 'EFECTIVO' | 'TARJETA' | 'DISPOSICION' | string;
  cuentaId?: number | null;
  cuenta?: Cuenta | null;
  movimientoId?: number | null;
  /** Plazo MSI (2–48). Null/1 = de contado. */
  meses?: number | null;
  /**
   * Disposición a meses: total que cobra el banco (con interés).
   * `monto` = efectivo recibido (disponible); cuota = total ÷ meses.
   */
  totalDeuda?: number | null;
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
  servicioFijoCompartidoId?: number | null;
  aMeses?: boolean;
  montoRestante?: number;
  /** Cuota de este mes (última puede diferir por centavos). */
  montoCuotaActual?: number;
  montoUltimaCuota?: number;
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
  /** TDC sin compras nuevas (sigue en Deudas). */
  bloqueada?: boolean;
  /** Cuenta saldada / fuera de lista. */
  archivada?: boolean;
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

/** Persona del módulo Compartido (no es usuario de login). */
export interface PersonaCompartida {
  id?: number;
  nombre: string;
  activa?: boolean;
  /** Caja aparte mental; no afecta Saldo/disponible. */
  efectivoGuardado?: number;
}

export interface ParteGastoCompartido {
  id?: number;
  esPrincipal?: boolean;
  monto: number;
  /** Perfiles/cuotas en el reparto (streaming). Default 1. */
  perfiles?: number;
  personaId?: number | null;
  nombre?: string;
  persona?: PersonaCompartida | null;
}

export interface GastoCompartido {
  id?: number;
  tipo: 'SERVICIO' | 'COMPRA' | string;
  concepto: string;
  montoTotal: number;
  fecha: string;
  formaPago: string;
  cuentaId?: number | null;
  meses?: number | null;
  gastoId?: number | null;
  servicioFijoId?: number | null;
  periodo?: string | null;
  anulado?: boolean;
  partes?: ParteGastoCompartido[];
}

export interface ServicioFijoCompartido {
  id?: number;
  concepto: string;
  monto: number;
  personaIds?: number[];
  personaIdsCsv?: string;
  /** Perfiles por persona (mismo orden que personaIds). */
  personaPerfiles?: number[];
  /** Tus perfiles en el reparto. Default 1. */
  perfilesPrincipal?: number | null;
  /** Día del mes (1–31). Si el mes no lo tiene, se usa el último día. */
  diaCobro?: number | null;
  /** Si false, al cobrar no te toca cuota (solo prestas el pago). */
  incluyePrincipal?: boolean | null;
  /** Si false, otro paga y tu parte se espeja en Mensuales. */
  yoPago?: boolean | null;
  activo?: boolean;
}

export interface MovimientoPersonaCompartida {
  id?: number;
  persona?: PersonaCompartida;
  fecha: string;
  tipo: 'DEUDA' | 'ABONO' | 'GUARDADO_IN' | 'GUARDADO_OUT' | string;
  monto: number;
  concepto?: string;
  gastoCompartidoId?: number | null;
  ingresoId?: number | null;
  desdeGuardado?: boolean;
  anulado?: boolean;
}

export interface PeriodoPendienteCompartido {
  periodo: string;
  concepto: string;
  fechaCobro?: string | null;
  gastoCompartidoId?: number | null;
  cargo: number;
  pagado: number;
  pendiente: number;
}

export interface CuentaPendienteCompartido {
  concepto: string;
  pendiente: number;
  anticipo?: number;
  detalle?: string | null;
}

export interface CuentaGlobalCompartido {
  concepto: string;
  pendiente: number;
  anticipo: number;
  /** Monto original de la(s) deuda(s) abierta(s), incl. tu parte. */
  total?: number;
  personas: number;
  deudores: string[];
}

export interface TdcCargaCompartido {
  cuentaId: number;
  nombre: string;
  monto: number;
  gastos: number;
  conceptos: string[];
}

export interface PersonaResumenCompartido {
  id: number;
  nombre: string;
  activa: boolean;
  debe: number;
  aFavor: number;
  efectivoGuardado: number;
  periodos?: PeriodoPendienteCompartido[];
  porCuenta?: CuentaPendienteCompartido[];
  detalleDeuda?: string | null;
}

export interface ResumenCompartido {
  personas: PersonaResumenCompartido[];
  totalMeDeben: number;
  totalAFavor: number;
  totalGuardado: number;
  porCuenta?: CuentaGlobalCompartido[];
  porTdc?: TdcCargaCompartido[];
  fijosPendientesCobro?: FijoPendienteCobro[];
}

export interface FijoPendienteCobro {
  id: number;
  concepto: string;
  monto: number;
  diaCobro?: number | null;
  periodo: string;
  fechaCobro: string;
}

export interface AnularGastoCompartidoResponse {
  abonosQueQuedanAFavor: number;
  mensaje: string;
}
