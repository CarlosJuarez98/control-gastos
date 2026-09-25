import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../api.service';
import { ConfirmDialogService } from '../../confirm-dialog.service';
import { LoadingDialogService } from '../../loading-dialog.service';
import {
  Cuenta,
  GastoCompartido,
  MovimientoPersonaCompartida,
  PersonaCompartida,
  PersonaResumenCompartido,
  ResumenCompartido,
  ServicioFijoCompartido,
} from '../../modelos';
import { EnterAvanceDirective } from '../../enter-avance.directive';
import { formatDineroInput, parseDinero } from '../../dinero.util';
import { fechaHoyLocal, formatFechaCorta, fechaCobroEnPeriodo, periodoActual, siguientePeriodo } from '../../fecha.util';
import { repartirPesosPonderado } from '../../compartido/reparto-enteros.util';
import { creditoDisponibleDe } from '../../tdc-calendario.util';

type Tab = 'resumen' | 'gasto' | 'fijos' | 'personas' | 'historial';

const TABS: { id: Tab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'gasto', label: 'Yo pagué' },
  { id: 'fijos', label: 'Fijos' },
  { id: 'personas', label: 'Personas' },
  { id: 'historial', label: 'Historial' },
];

@Component({
  selector: 'app-compartido',
  standalone: true,
  imports: [FormsModule, EnterAvanceDirective, CurrencyPipe],
  templateUrl: './compartido.component.html',
  styleUrl: './compartido.component.css',
})
export class CompartidoComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly confirmDlg = inject(ConfirmDialogService);
  private readonly loading = inject(LoadingDialogService);
  private readonly cdr = inject(ChangeDetectorRef);

  tab: Tab = 'resumen';
  readonly tabs = TABS;
  menuTabsAbierto = false;
  personas: PersonaCompartida[] = [];
  resumen: ResumenCompartido | null = null;
  gastos: GastoCompartido[] = [];
  movimientos: MovimientoPersonaCompartida[] = [];
  serviciosFijos: ServicioFijoCompartido[] = [];
  cuentasTdc: Cuenta[] = [];
  /** Disponible efectivo (Saldo → esperado). */
  saldoDisponible: number | null = null;

  error = '';
  ok = '';
  esMovil = false;
  altaAbierta = false;
  mostrarInactivas = false;

  nombreNuevo = '';
  editId: number | null = null;
  editNombre = '';

  gastoForm = {
    tipo: 'SERVICIO' as 'SERVICIO' | 'COMPRA',
    concepto: '',
    monto: '',
    fecha: fechaHoyLocal(),
    formaPago: 'EFECTIVO' as 'EFECTIVO' | 'TARJETA',
    cuentaId: null as number | null,
    aMeses: false,
    meses: '',
    incluyePrincipal: true,
  };
  personasSeleccionadas = new Set<number>();
  /** Cuotas/perfiles por personaId (streaming o compra). Default 1. */
  gastoPerfiles = new Map<number, number>();
  gastoPerfilesPrincipal = 1;

  fijoForm = {
    concepto: '',
    monto: '',
    diaCobro: 1,
    incluyePrincipal: true,
    yoPago: true,
  };
  fijoPersonas = new Set<number>();
  fijoPerfiles = new Map<number, number>();
  fijoPerfilesPrincipal = 1;
  editFijoId: number | null = null;
  cobrandoId: number | null = null;
  cobroForm = {
    fecha: fechaHoyLocal(),
    periodo: periodoActual(),
    formaPago: 'EFECTIVO' as 'EFECTIVO' | 'TARJETA',
    cuentaId: null as number | null,
    aMeses: false,
    meses: '',
  };

  recalculandoId: number | null = null;
  recalculoPersonas = new Set<number>();
  /** Participantes originales al abrir el panel (para detectar salidas). */
  recalculoAntes = new Set<number>();
  recalculoProporcional = false;
  recalculoFechaIngreso = fechaHoyLocal();
  recalculoFechaSalida = fechaHoyLocal();
  recalculoIncluyePrincipal = true;
  recalculoPerfiles = new Map<number, number>();
  recalculoPerfilesPrincipal = 1;

  abonoPersonaId: number | null = null;
  abono = {
    monto: '',
    fecha: fechaHoyLocal(),
    medio: 'EFECTIVO' as 'EFECTIVO' | 'GUARDADO' | 'PRESTADO',
    concepto: '',
    conceptoDestino: '' as string,
    formaPagoPrestamo: 'EFECTIVO' as 'EFECTIVO' | 'TARJETA',
    cuentaId: null as number | null,
  };

  anticipoPersonaId: number | null = null;
  anticipoForm = {
    conceptoDestino: '',
    monto: '',
  };

  prestarPersonaId: number | null = null;
  prestarForm = {
    montoFavor: '',
    montoPrestamo: '',
    fecha: fechaHoyLocal(),
    formaPago: 'EFECTIVO' as 'EFECTIVO' | 'TARJETA',
    cuentaId: null as number | null,
  };

  adelantoPersonaId: number | null = null;
  adelantoForm = {
    servicioFijoId: null as number | null,
    meses: 1,
    fecha: fechaHoyLocal(),
    medio: 'EFECTIVO' as 'EFECTIVO' | 'GUARDADO',
  };

  guardadoPersonaId: number | null = null;
  guardadoForm = {
    monto: '',
    fecha: fechaHoyLocal(),
    tipo: 'DEJAR' as 'DEJAR' | 'DEVOLVER',
    concepto: '',
  };

  private media?: MediaQueryList;
  private onMedia?: () => void;

  ngOnInit(): void {
    this.media = window.matchMedia('(max-width: 720px)');
    this.onMedia = () => {
      this.esMovil = !!this.media?.matches;
      this.cdr.detectChanges();
    };
    this.onMedia();
    this.media.addEventListener('change', this.onMedia);
    void this.cargarTodo();
  }

  ngOnDestroy(): void {
    if (this.media && this.onMedia) {
      this.media.removeEventListener('change', this.onMedia);
    }
  }

  get personasActivas(): PersonaCompartida[] {
    return this.personas.filter((p) => p.activa !== false);
  }

  get puedeCrearPersona(): boolean {
    return !!(this.nombreNuevo || '').trim();
  }

  get puedeGuardarEdit(): boolean {
    return !!(this.editNombre || '').trim();
  }

  get nParticipantes(): number {
    const otros = this.personasSeleccionadas.size;
    return this.gastoForm.incluyePrincipal ? otros + 1 : otros;
  }

  get previewPartes(): number[] {
    const monto = Math.round(parseDinero(this.gastoForm.monto));
    if (monto <= 0 || this.nParticipantes < 1) return [];
    try {
      return repartirPesosPonderado(monto, this.pesosGastoActual());
    } catch {
      return [];
    }
  }

  /** Nombres alineados con previewPartes (para chips). */
  get previewNombres(): string[] {
    const ids = [...this.personasSeleccionadas];
    const nombres = ids.map((id) => this.personas.find((p) => p.id === id)?.nombre || '?');
    if (this.gastoForm.incluyePrincipal) return ['Tú', ...nombres];
    return nombres;
  }

  get previewPerfilesLabels(): number[] {
    return this.pesosGastoActual();
  }

  private pesosGastoActual(): number[] {
    const ids = [...this.personasSeleccionadas];
    const otros = ids.map((id) => Math.max(1, this.gastoPerfiles.get(id) ?? 1));
    if (this.gastoForm.incluyePrincipal) {
      return [Math.max(1, this.gastoPerfilesPrincipal), ...otros];
    }
    return otros;
  }

  get puedeRegistrarGasto(): boolean {
    return (
      !!(this.gastoForm.concepto || '').trim() &&
      parseDinero(this.gastoForm.monto) > 0 &&
      this.personasSeleccionadas.size >= 1 &&
      (this.gastoForm.formaPago === 'EFECTIVO' || !!this.gastoForm.cuentaId)
    );
  }

  setTab(t: Tab): void {
    this.tab = t;
    this.menuTabsAbierto = false;
    this.error = '';
    this.ok = '';
  }

  etiquetaTab(t: Tab): string {
    return this.tabs.find((x) => x.id === t)?.label ?? t;
  }

  toggleMenuTabs(): void {
    this.menuTabsAbierto = !this.menuTabsAbierto;
    if (this.menuTabsAbierto) {
      queueMicrotask(() => {
        document
          .querySelector<HTMLButtonElement>('#menu-tabs-compartido button.activo, #menu-tabs-compartido button')
          ?.focus();
      });
    }
  }

  /** Esc cancela; Enter confirma (menú / paneles). El diálogo global de confirmación manda. */
  @HostListener('document:keydown', ['$event'])
  onTeclasGlobales(ev: KeyboardEvent): void {
    if (ev.defaultPrevented || ev.isComposing) return;
    if (document.querySelector('.overlay .dialog')) return;

    if (ev.key === 'Escape') {
      if (this.menuTabsAbierto) {
        ev.preventDefault();
        this.menuTabsAbierto = false;
        return;
      }
      if (this.hayCancelable()) {
        ev.preventDefault();
        this.cancelarUiActiva();
      }
      return;
    }

    if (ev.key !== 'Enter') return;

    if (this.menuTabsAbierto) {
      const t = ev.target as HTMLElement | null;
      if (t?.closest?.('#menu-tabs-compartido button')) {
        // El botón recibe el click nativo → setTab
        return;
      }
      ev.preventDefault();
      this.menuTabsAbierto = false;
    }
  }

  private hayCancelable(): boolean {
    return (
      this.editId != null ||
      this.abonoPersonaId != null ||
      this.guardadoPersonaId != null ||
      this.adelantoPersonaId != null ||
      this.anticipoPersonaId != null ||
      this.prestarPersonaId != null ||
      this.cobrandoId != null ||
      this.recalculandoId != null ||
      this.editFijoId != null ||
      (this.esMovil && this.altaAbierta)
    );
  }

  private cancelarUiActiva(): void {
    if (this.editId != null) {
      this.cancelarEdit();
      return;
    }
    if (
      this.abonoPersonaId != null ||
      this.guardadoPersonaId != null ||
      this.adelantoPersonaId != null ||
      this.anticipoPersonaId != null ||
      this.prestarPersonaId != null
    ) {
      this.cerrarPanelesPersona();
      return;
    }
    if (this.cobrandoId != null) {
      this.cancelarCobro();
      return;
    }
    if (this.recalculandoId != null) {
      this.cancelarRecalculo();
      return;
    }
    if (this.editFijoId != null) {
      this.cancelarEditFijo();
      return;
    }
    if (this.esMovil && this.altaAbierta) {
      this.altaAbierta = false;
    }
  }

  async cargarTodo(): Promise<void> {
    this.error = '';
    try {
      await this.loading.run(async () => {
        const [personas, resumen, gastos, movs, fijos, cuentas, saldo] = await Promise.all([
          firstValueFrom(this.api.personasCompartidas(this.mostrarInactivas)),
          firstValueFrom(this.api.resumenCompartido()),
          firstValueFrom(this.api.gastosCompartidos()),
          firstValueFrom(this.api.movimientosCompartidos()),
          firstValueFrom(this.api.serviciosFijosCompartidos()),
          firstValueFrom(this.api.cuentas()),
          firstValueFrom(this.api.saldo()),
        ]);
        this.personas = personas;
        this.resumen = resumen;
        this.gastos = gastos;
        this.movimientos = movs;
        this.serviciosFijos = fijos;
        this.cuentasTdc = (cuentas || []).filter(
          (c) => (c.tipo || '').toUpperCase() === 'TDC' && !c.archivada && !c.bloqueada
        );
        this.saldoDisponible =
          saldo?.esperado == null || saldo.esperado === undefined ? null : Number(saldo.esperado);
        if (!this.gastoForm.cuentaId && this.cuentasTdc.length) {
          this.gastoForm.cuentaId = this.cuentasTdc[0].id ?? null;
        }
        if (!this.cobroForm.cuentaId && this.cuentasTdc.length) {
          this.cobroForm.cuentaId = this.cuentasTdc[0].id ?? null;
        }
      }, 'Cargando compartido…');
    } catch (e: unknown) {
      this.error = this.msg(e, 'No se pudo cargar Compartido');
    }
  }

  togglePersona(id: number | undefined): void {
    if (id == null) return;
    if (this.personasSeleccionadas.has(id)) {
      this.personasSeleccionadas.delete(id);
      this.gastoPerfiles.delete(id);
    } else {
      this.personasSeleccionadas.add(id);
      this.gastoPerfiles.set(id, 1);
    }
  }

  estaSeleccionada(id: number | undefined): boolean {
    return id != null && this.personasSeleccionadas.has(id);
  }

  perfilesDe(map: Map<number, number>, id: number | undefined): number {
    if (id == null) return 1;
    return Math.max(1, map.get(id) ?? 1);
  }

  ajustarPerfiles(
    map: Map<number, number>,
    id: number | undefined,
    delta: number,
    selected: Set<number>
  ): void {
    if (id == null || !selected.has(id)) return;
    const next = Math.max(1, Math.min(20, (map.get(id) ?? 1) + delta));
    map.set(id, next);
  }

  ajustarPerfilesPrincipal(kind: 'gasto' | 'fijo' | 'recalc', delta: number): void {
    const clamp = (v: number) => Math.max(1, Math.min(20, v));
    if (kind === 'gasto') {
      if (!this.gastoForm.incluyePrincipal) return;
      this.gastoPerfilesPrincipal = clamp(this.gastoPerfilesPrincipal + delta);
    } else if (kind === 'fijo') {
      if (!this.fijoForm.incluyePrincipal) return;
      this.fijoPerfilesPrincipal = clamp(this.fijoPerfilesPrincipal + delta);
    } else {
      if (!this.recalculoIncluyePrincipal) return;
      this.recalculoPerfilesPrincipal = clamp(this.recalculoPerfilesPrincipal + delta);
    }
  }

  toggleFijoPersona(id: number | undefined): void {
    if (id == null) return;
    if (this.fijoPersonas.has(id)) {
      this.fijoPersonas.delete(id);
      this.fijoPerfiles.delete(id);
    } else {
      this.fijoPersonas.add(id);
      this.fijoPerfiles.set(id, 1);
    }
  }

  fijoSeleccionada(id: number | undefined): boolean {
    return id != null && this.fijoPersonas.has(id);
  }

  toggleRecalcPersona(id: number | undefined): void {
    if (id == null) return;
    if (this.recalculoPersonas.has(id)) {
      this.recalculoPersonas.delete(id);
      this.recalculoPerfiles.delete(id);
    } else {
      this.recalculoPersonas.add(id);
      this.recalculoPerfiles.set(id, 1);
    }
  }

  toggleRecalcIncluyePrincipal(): void {
    this.recalculoIncluyePrincipal = !this.recalculoIncluyePrincipal;
    if (!this.recalculoIncluyePrincipal) this.recalculoProporcional = false;
  }

  recalcSeleccionada(id: number | undefined): boolean {
    return id != null && this.recalculoPersonas.has(id);
  }

  idsDeServicio(s: ServicioFijoCompartido): number[] {
    if (s.personaIds?.length) return s.personaIds;
    const csv = (s.personaIdsCsv || '').trim();
    if (!csv) return [];
    return csv
      .split(',')
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  onMontoGasto(): void {
    this.gastoForm.monto = formatDineroInput(this.gastoForm.monto);
  }

  async crearPersona(): Promise<void> {
    const nombre = (this.nombreNuevo || '').trim();
    if (!nombre) return;
    this.error = '';
    this.ok = '';
    try {
      await this.loading.run(async () => {
        await firstValueFrom(this.api.crearPersonaCompartida({ nombre }));
        this.nombreNuevo = '';
        this.altaAbierta = false;
        await this.refreshListas();
      }, 'Guardando…');
      this.ok = 'Persona agregada';
    } catch (e: unknown) {
      this.error = this.msg(e, 'No se pudo crear la persona');
    }
  }

  empezarEdit(p: PersonaCompartida): void {
    this.editId = p.id ?? null;
    this.editNombre = p.nombre || '';
    this.ok = '';
    this.error = '';
  }

  cancelarEdit(): void {
    this.editId = null;
    this.editNombre = '';
  }

  async guardarEdit(p: PersonaCompartida): Promise<void> {
    if (!p.id || !this.puedeGuardarEdit) return;
    const nombre = (this.editNombre || '').trim();
    this.error = '';
    this.ok = '';
    try {
      await this.loading.run(async () => {
        await firstValueFrom(this.api.actualizarPersonaCompartida(p.id!, { nombre }));
        this.cancelarEdit();
        await this.refreshListas();
      }, 'Guardando…');
      this.ok = 'Nombre actualizado';
    } catch (e: unknown) {
      this.error = this.msg(e, 'No se pudo actualizar');
    }
  }

  async desactivar(p: PersonaCompartida): Promise<void> {
    if (!p.id) return;
    const ok = await this.confirmDlg.ask(
      `¿Quitar a ${p.nombre} de la lista activa? También se saca de las plantillas de fijos.`,
      { titulo: 'Desactivar persona', confirmarTexto: 'Desactivar', cancelarTexto: 'Cancelar' }
    );
    if (!ok) return;
    this.error = '';
    this.ok = '';
    try {
      await this.loading.run(async () => {
        await firstValueFrom(this.api.desactivarPersonaCompartida(p.id!));
        this.personasSeleccionadas.delete(p.id!);
        await this.refreshListas();
      }, 'Actualizando…');
      this.ok = 'Persona desactivada (y quitada de fijos)';
    } catch (e: unknown) {
      this.error = this.msg(e, 'No se pudo desactivar');
    }
  }

  async reactivar(p: PersonaCompartida): Promise<void> {
    if (!p.id) return;
    this.error = '';
    this.ok = '';
    try {
      await this.loading.run(async () => {
        await firstValueFrom(this.api.reactivarPersonaCompartida(p.id!));
        await this.refreshListas();
      }, 'Actualizando…');
      this.ok = 'Persona reactivada';
    } catch (e: unknown) {
      this.error = this.msg(e, 'No se pudo reactivar');
    }
  }

  async toggleInactivas(): Promise<void> {
    this.mostrarInactivas = !this.mostrarInactivas;
    await this.cargarTodo();
  }

  async registrarGasto(): Promise<void> {
    if (!this.puedeRegistrarGasto) return;
    this.error = '';
    this.ok = '';
    const monto = Math.round(parseDinero(this.gastoForm.monto));
    const meses =
      this.gastoForm.formaPago === 'TARJETA' && this.gastoForm.aMeses
        ? Math.max(2, Math.round(Number(this.gastoForm.meses) || 0))
        : null;
    try {
      await this.loading.run(async () => {
        await firstValueFrom(
          this.api.registrarGastoCompartido({
            tipo: this.gastoForm.tipo,
            concepto: (this.gastoForm.concepto || '').trim(),
            monto,
            fecha: this.gastoForm.fecha || fechaHoyLocal(),
            personaIds: [...this.personasSeleccionadas],
            formaPago: this.gastoForm.formaPago,
            cuentaId: this.gastoForm.formaPago === 'TARJETA' ? this.gastoForm.cuentaId : null,
            meses,
            incluyePrincipal: this.gastoForm.incluyePrincipal,
            perfiles: [...this.personasSeleccionadas].map((id) => this.perfilesDe(this.gastoPerfiles, id)),
            perfilesPrincipal: this.gastoPerfilesPrincipal,
          })
        );
        this.gastoForm.concepto = '';
        this.gastoForm.monto = '';
        this.gastoForm.aMeses = false;
        this.gastoForm.meses = '';
        this.gastoForm.incluyePrincipal = true;
        this.personasSeleccionadas.clear();
        this.gastoPerfiles.clear();
        this.gastoPerfilesPrincipal = 1;
        await this.refreshListas();
      }, 'Registrando…');
      this.ok = 'Gasto compartido registrado (también en Gastos)';
      this.tab = 'resumen';
    } catch (e: unknown) {
      this.error = this.msg(e, 'No se pudo registrar el gasto');
    }
  }

  async anularGasto(g: GastoCompartido): Promise<void> {
    if (!g.id) return;
    const ok = await this.confirmDlg.ask(
      `¿Anular «${g.concepto}»? Se borra el gasto real y esas deudas. Si alguien ya abonó, ese dinero queda a su favor (puedes devolverlo con Dar).`,
      { titulo: 'Anular gasto compartido', confirmarTexto: 'Anular', cancelarTexto: 'Cancelar' }
    );
    if (!ok) return;
    this.error = '';
    this.ok = '';
    try {
      await this.loading.run(async () => {
        const r = await firstValueFrom(this.api.anularGastoCompartido(g.id!));
        await this.refreshListas();
        this.ok = r?.mensaje || 'Gasto anulado';
      }, 'Anulando…');
    } catch (e: unknown) {
      this.error = this.msg(e, 'No se pudo anular');
    }
  }

  empezarRecalculo(g: GastoCompartido): void {
    this.recalculandoId = g.id ?? null;
    const partesOtros = (g.partes || []).filter((p) => !p.esPrincipal && (p.personaId || p.persona?.id));
    const ids = partesOtros.map((p) => (p.personaId || p.persona?.id)!);
    this.recalculoAntes = new Set(ids);
    this.recalculoPersonas = new Set(ids.filter((id) => this.personasActivas.some((x) => x.id === id)));
    this.recalculoPerfiles = new Map();
    for (const p of partesOtros) {
      const id = (p.personaId || p.persona?.id)!;
      if (this.recalculoPersonas.has(id)) {
        this.recalculoPerfiles.set(id, Math.max(1, Number(p.perfiles) || 1));
      }
    }
    this.recalculoProporcional = false;
    this.recalculoFechaIngreso = fechaHoyLocal();
    this.recalculoFechaSalida = fechaHoyLocal();
    const yo = (g.partes || []).find((p) => p.esPrincipal);
    this.recalculoIncluyePrincipal = !!(yo && Math.round(Number(yo.monto) || 0) > 0);
    this.recalculoPerfilesPrincipal = Math.max(1, Number(yo?.perfiles) || 1);
    this.error = '';
    this.ok = '';
  }

  cancelarRecalculo(): void {
    this.recalculandoId = null;
    this.recalculoPersonas.clear();
    this.recalculoAntes.clear();
    this.recalculoPerfiles.clear();
    this.recalculoProporcional = false;
    this.recalculoIncluyePrincipal = true;
    this.recalculoPerfilesPrincipal = 1;
  }

  get recalculoHayEntradas(): boolean {
    for (const id of this.recalculoPersonas) {
      if (!this.recalculoAntes.has(id)) return true;
    }
    return false;
  }

  get recalculoHaySalidas(): boolean {
    for (const id of this.recalculoAntes) {
      if (!this.recalculoPersonas.has(id)) return true;
    }
    return false;
  }

  async confirmarRecalculo(g: GastoCompartido): Promise<void> {
    if (!g.id || this.recalculoPersonas.size < 1) return;
    const msg = this.recalculoProporcional
      ? 'Quien entra paga desde su fecha; quien sale, hasta la suya; el resto el mes completo. Tu gasto real no cambia.'
      : this.recalculoIncluyePrincipal
        ? 'Se reparte el mismo total según las cuotas de cada uno (tú incluido). Tu gasto real no cambia.'
        : 'Se reparte el 100% entre los seleccionados según cuotas (tú no entras). Tu gasto real no cambia.';
    const ok = await this.confirmDlg.ask(msg, {
      titulo: 'Recalcular reparto',
      confirmarTexto: 'Recalcular',
      cancelarTexto: 'Cancelar',
    });
    if (!ok) return;
    this.error = '';
    this.ok = '';
    const eraProporcional = this.recalculoProporcional;
    try {
      await this.loading.run(async () => {
        await firstValueFrom(
          this.api.recalcularGastoCompartido(g.id!, {
            personaIds: [...this.recalculoPersonas],
            proporcionalDias: this.recalculoProporcional,
            fechaIngreso: this.recalculoProporcional ? this.recalculoFechaIngreso : undefined,
            fechaSalida: this.recalculoProporcional ? this.recalculoFechaSalida : undefined,
            incluyePrincipal: this.recalculoIncluyePrincipal,
            perfiles: [...this.recalculoPersonas].map((id) => this.perfilesDe(this.recalculoPerfiles, id)),
            perfilesPrincipal: this.recalculoPerfilesPrincipal,
          })
        );
        this.cancelarRecalculo();
        await this.refreshListas();
      }, 'Recalculando…');
      this.ok = eraProporcional
        ? 'Reparto actualizado (proporcional por días)'
        : 'Reparto actualizado';
    } catch (e: unknown) {
      this.error = this.msg(e, 'No se pudo recalcular');
    }
  }
  get puedeCrearFijo(): boolean {
    const base = !!(this.fijoForm.concepto || '').trim() && parseDinero(this.fijoForm.monto) > 0;
    if (!base) return false;
    if (this.fijoForm.yoPago) return this.fijoPersonas.size >= 1;
    // Otro paga: basta con tu parte (puedes estar solo o con más gente)
    return this.fijoForm.incluyePrincipal;
  }

  get previewCuotaFijoYo(): number {
    const monto = Math.round(parseDinero(this.fijoForm.monto));
    if (monto <= 0 || !this.fijoForm.incluyePrincipal) return 0;
    const ids = [...this.fijoPersonas];
    const pesos = [
      Math.max(1, this.fijoPerfilesPrincipal),
      ...ids.map((id) => this.perfilesDe(this.fijoPerfiles, id)),
    ];
    try {
      return repartirPesosPonderado(monto, pesos)[0] ?? 0;
    } catch {
      return 0;
    }
  }

  setFijoYoPago(yoPago: boolean): void {
    this.fijoForm.yoPago = yoPago;
    if (!yoPago) this.fijoForm.incluyePrincipal = true;
  }

  resetFijoForm(): void {
    this.editFijoId = null;
    this.fijoForm = { concepto: '', monto: '', diaCobro: 1, incluyePrincipal: true, yoPago: true };
    this.fijoPersonas.clear();
    this.fijoPerfiles.clear();
    this.fijoPerfilesPrincipal = 1;
  }

  empezarEditFijo(s: ServicioFijoCompartido): void {
    this.cancelarCobro();
    this.editFijoId = s.id ?? null;
    this.fijoForm = {
      concepto: s.concepto || '',
      monto: formatDineroInput(String(Math.round(Number(s.monto) || 0))),
      diaCobro: Math.max(1, Math.min(31, Math.round(Number(s.diaCobro) || 1))),
      incluyePrincipal: s.incluyePrincipal !== false,
      yoPago: s.yoPago !== false,
    };
    const ids = this.idsDeServicio(s);
    this.fijoPersonas = new Set(ids);
    this.fijoPerfiles = new Map();
    const pesos = s.personaPerfiles || [];
    ids.forEach((id, i) => this.fijoPerfiles.set(id, Math.max(1, pesos[i] || 1)));
    this.fijoPerfilesPrincipal = Math.max(1, Number(s.perfilesPrincipal) || 1);
    this.error = '';
    this.ok = '';
    queueMicrotask(() => {
      document.getElementById('form-fijo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  cancelarEditFijo(): void {
    this.resetFijoForm();
  }

  async crearServicioFijo(): Promise<void> {
    if (!this.puedeCrearFijo) return;
    this.error = '';
    this.ok = '';
    const editando = this.editFijoId != null;
    const body = {
      concepto: (this.fijoForm.concepto || '').trim(),
      monto: Math.round(parseDinero(this.fijoForm.monto)),
      personaIds: [...this.fijoPersonas],
      diaCobro: Math.max(1, Math.min(31, Math.round(Number(this.fijoForm.diaCobro) || 1))),
      incluyePrincipal: this.fijoForm.incluyePrincipal,
      yoPago: this.fijoForm.yoPago,
      perfiles: [...this.fijoPersonas].map((id) => this.perfilesDe(this.fijoPerfiles, id)),
      perfilesPrincipal: this.fijoPerfilesPrincipal,
    };
    try {
      await this.loading.run(async () => {
        if (editando && this.editFijoId != null) {
          await firstValueFrom(this.api.actualizarServicioFijoCompartido(this.editFijoId, body));
        } else {
          await firstValueFrom(this.api.crearServicioFijoCompartido(body));
        }
        this.resetFijoForm();
        await this.refreshListas();
      }, editando ? 'Actualizando fijo…' : 'Guardando servicio…');
      this.ok = editando
        ? 'Fijo actualizado (monto/día aplican a cobros nuevos)'
        : this.fijoForm.yoPago
          ? 'Servicio fijo guardado. Cada mes usa «Cobrar mes».'
          : 'Guardado: tu parte ya está en Mensuales como fijo.';
    } catch (e: unknown) {
      this.error = this.msg(e, editando ? 'No se pudo actualizar' : 'No se pudo guardar el servicio');
    }
  }

  async quitarServicioFijo(s: ServicioFijoCompartido): Promise<void> {
    if (!s.id) return;
    const ok = await this.confirmDlg.ask(`¿Quitar el servicio fijo «${s.concepto}»?`, {
      titulo: 'Quitar servicio',
      confirmarTexto: 'Quitar',
      cancelarTexto: 'Cancelar',
    });
    if (!ok) return;
    try {
      await this.loading.run(async () => {
        await firstValueFrom(this.api.desactivarServicioFijoCompartido(s.id!));
        await this.refreshListas();
      }, 'Actualizando…');
      this.ok = 'Servicio fijo quitado';
    } catch (e: unknown) {
      this.error = this.msg(e, 'No se pudo quitar');
    }
  }

  abrirCobro(s: ServicioFijoCompartido): void {
    this.resetFijoForm();
    const ultimo = this.ultimoCobroDe(s.id);
    const periodo = siguientePeriodo(ultimo?.periodo) || periodoActual();
    this.cobrandoId = s.id ?? null;
    this.cobroForm = {
      fecha: fechaCobroEnPeriodo(periodo, s.diaCobro ?? 1),
      periodo,
      formaPago: 'EFECTIVO',
      cuentaId: this.cuentasTdc[0]?.id ?? null,
      aMeses: false,
      meses: '',
    };
    this.error = '';
    this.ok = '';
  }

  /** Desde el aviso de resumen: salta a Fijos y abre el cobro. */
  irCobrarFijo(servicioId: number): void {
    const s = this.serviciosFijos.find((x) => x.id === servicioId);
    this.tab = 'fijos';
    this.menuTabsAbierto = false;
    if (s) {
      this.abrirCobro(s);
    }
  }

  onPeriodoCobroChange(s: ServicioFijoCompartido): void {
    this.cobroForm.fecha = fechaCobroEnPeriodo(this.cobroForm.periodo, s.diaCobro ?? 1);
  }

  cancelarCobro(): void {
    this.cobrandoId = null;
  }

  ultimoCobroDe(servicioId: number | undefined): GastoCompartido | null {
    if (servicioId == null) return null;
    const lista = this.gastos
      .filter((g) => g.servicioFijoId === servicioId && !g.anulado)
      .sort((a, b) => {
        const pa = a.periodo || '';
        const pb = b.periodo || '';
        if (pa !== pb) return pb.localeCompare(pa);
        return (b.fecha || '').localeCompare(a.fecha || '');
      });
    return lista[0] ?? null;
  }

  async cobrarServicio(s: ServicioFijoCompartido): Promise<void> {
    if (!s.id) return;
    if (this.cobroForm.formaPago === 'TARJETA' && !this.cobroForm.cuentaId) return;
    const meses =
      this.cobroForm.formaPago === 'TARJETA' && this.cobroForm.aMeses
        ? Math.max(2, Math.round(Number(this.cobroForm.meses) || 0))
        : null;
    this.error = '';
    this.ok = '';
    try {
      await this.loading.run(async () => {
        await firstValueFrom(
          this.api.cobrarServicioFijoCompartido(s.id!, {
            fecha: this.cobroForm.fecha || fechaHoyLocal(),
            periodo: this.cobroForm.periodo || periodoActual(),
            formaPago: this.cobroForm.formaPago,
            cuentaId: this.cobroForm.formaPago === 'TARJETA' ? this.cobroForm.cuentaId : null,
            meses,
          })
        );
        this.cancelarCobro();
        await this.refreshListas();
      }, 'Cobrando mes…');
      this.ok =
        this.cobroForm.formaPago === 'TARJETA'
          ? `Cobrado ${this.cobroForm.periodo}: subió deuda TDC`
          : `Cobrado ${this.cobroForm.periodo}: bajó tu disponible`;
      this.tab = 'gasto';
    } catch (e: unknown) {
      this.error = this.msg(e, 'No se pudo cobrar el mes');
    }
  }

  abrirAbono(p: PersonaResumenCompartido | PersonaCompartida): void {
    this.abonoPersonaId = p.id ?? null;
    this.guardadoPersonaId = null;
    this.adelantoPersonaId = null;
    this.anticipoPersonaId = null;
    this.prestarPersonaId = null;
    this.abono = {
      monto: '',
      fecha: fechaHoyLocal(),
      medio: 'EFECTIVO',
      concepto: '',
      conceptoDestino: '',
      formaPagoPrestamo: 'EFECTIVO',
      cuentaId: this.cuentasTdc[0]?.id ?? null,
    };
    this.error = '';
    this.ok = '';
    this.tab = 'resumen';
  }

  abrirAplicarAnticipo(p: PersonaResumenCompartido): void {
    const destinos = this.cuentasDestinoDe(p);
    this.anticipoPersonaId = p.id ?? null;
    this.abonoPersonaId = null;
    this.guardadoPersonaId = null;
    this.adelantoPersonaId = null;
    this.prestarPersonaId = null;
    this.anticipoForm = {
      conceptoDestino: destinos[0] || '',
      monto: p.aFavor > 0 ? String(Math.round(p.aFavor)) : '',
    };
    this.error = '';
    this.ok = '';
    this.tab = 'resumen';
  }

  abrirPrestar(p: PersonaResumenCompartido): void {
    this.prestarPersonaId = p.id ?? null;
    this.abonoPersonaId = null;
    this.guardadoPersonaId = null;
    this.adelantoPersonaId = null;
    this.anticipoPersonaId = null;
    this.prestarForm = {
      montoFavor: '',
      montoPrestamo: '',
      fecha: fechaHoyLocal(),
      formaPago: 'EFECTIVO',
      cuentaId: this.cuentasTdc[0]?.id ?? null,
    };
    this.error = '';
    this.ok = '';
    this.tab = 'resumen';
  }

  abrirAdelanto(p: PersonaResumenCompartido | PersonaCompartida): void {
    const fijos = this.fijosDePersona(p.id);
    this.adelantoPersonaId = p.id ?? null;
    this.abonoPersonaId = null;
    this.guardadoPersonaId = null;
    this.anticipoPersonaId = null;
    this.prestarPersonaId = null;
    this.adelantoForm = {
      servicioFijoId: fijos[0]?.id ?? null,
      meses: 1,
      fecha: fechaHoyLocal(),
      medio: 'EFECTIVO',
    };
    this.error = '';
    this.ok = '';
    this.tab = 'resumen';
  }

  abrirGuardado(p: PersonaResumenCompartido | PersonaCompartida): void {
    this.guardadoPersonaId = p.id ?? null;
    this.abonoPersonaId = null;
    this.adelantoPersonaId = null;
    this.anticipoPersonaId = null;
    this.prestarPersonaId = null;
    this.guardadoForm = { monto: '', fecha: fechaHoyLocal(), tipo: 'DEJAR', concepto: '' };
    this.error = '';
    this.ok = '';
    this.tab = 'resumen';
  }

  cerrarPanelesPersona(): void {
    this.abonoPersonaId = null;
    this.guardadoPersonaId = null;
    this.adelantoPersonaId = null;
    this.anticipoPersonaId = null;
    this.prestarPersonaId = null;
  }

  get montoFavorNum(): number {
    return Math.max(0, Math.round(parseDinero(this.prestarForm.montoFavor)));
  }

  aFavorEntero(p: { aFavor?: number } | null | undefined): number {
    return Math.round(Number(p?.aFavor) || 0);
  }

  get montoPrestarTotal(): number {
    return this.montoFavorNum + this.montoPrestamoPreview;
  }

  get montoPrestamoPreview(): number {
    return Math.max(0, Math.round(parseDinero(this.prestarForm.montoPrestamo)));
  }

  get avisoPrestar(): boolean {
    const favor = Math.max(0, Math.round(parseDinero(this.prestarForm.montoFavor)));
    if (this.prestarForm.formaPago === 'EFECTIVO') {
      return this.superaDisponibleEfectivo('' + this.montoPrestarTotal);
    }
    // TDC: el a favor sigue bajando disponible; el préstamo revisa crédito libre
    return (
      (favor > 0 && this.superaDisponibleEfectivo('' + favor)) ||
      this.superaCreditoTdc('' + this.montoPrestamoPreview, this.prestarForm.cuentaId)
    );
  }

  async enviarPrestar(p: PersonaResumenCompartido): Promise<void> {
    if (!this.prestarPersonaId) return;
    const montoFavor = Math.max(0, Math.round(parseDinero(this.prestarForm.montoFavor)));
    const montoPrestamo = Math.max(0, Math.round(parseDinero(this.prestarForm.montoPrestamo)));
    if (montoFavor + montoPrestamo <= 0) return;
    if (montoFavor > Math.round(p.aFavor) + 1e-9) {
      this.error = `Solo tiene a favor $${Math.round(p.aFavor)}`;
      return;
    }
    if (montoPrestamo > 0 && this.prestarForm.formaPago === 'TARJETA' && !this.prestarForm.cuentaId) {
      this.error = 'Elige la TDC del préstamo';
      return;
    }
    this.error = '';
    this.ok = '';
    try {
      const res = await this.loading.run(async () => {
        const r = await firstValueFrom(
          this.api.entregarFavorPrestamoCompartido(this.prestarPersonaId!, {
            montoFavor,
            montoPrestamo,
            fecha: this.prestarForm.fecha || fechaHoyLocal(),
            formaPagoPrestamo: montoPrestamo > 0 ? this.prestarForm.formaPago : 'EFECTIVO',
            cuentaId:
              montoPrestamo > 0 && this.prestarForm.formaPago === 'TARJETA'
                ? this.prestarForm.cuentaId
                : null,
          })
        );
        this.cerrarPanelesPersona();
        await this.refreshListas();
        return r;
      }, 'Registrando entrega…');
      this.ok = res?.mensaje || 'Entrega registrada';
    } catch (e: unknown) {
      this.error = this.msg(e, 'No se pudo registrar la entrega');
    }
  }

  /** Cuentas a las que se puede dirigir un abono / a favor. */
  cuentasDestinoDe(p: PersonaResumenCompartido | { id?: number; porCuenta?: { concepto: string }[] }): string[] {
    const set = new Set<string>();
    for (const c of p.porCuenta || []) {
      if (c.concepto) set.add(c.concepto);
    }
    for (const s of this.fijosDePersona(p.id)) {
      if (s.concepto) set.add(s.concepto);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }

  fijosDePersona(personaId: number | undefined): ServicioFijoCompartido[] {
    if (personaId == null) return [];
    return this.serviciosFijos.filter((s) => this.idsDeServicio(s).includes(personaId));
  }

  cuotaAdelanto(personaId: number | null): number {
    if (personaId == null || this.adelantoForm.servicioFijoId == null) return 0;
    const s = this.serviciosFijos.find((x) => x.id === this.adelantoForm.servicioFijoId);
    if (!s) return 0;
    const ids = this.idsDeServicio(s);
    const idx = ids.indexOf(personaId);
    if (idx < 0) return 0;
    const pesosPlantilla = s.personaPerfiles || [];
    const otros = ids.map((_, i) => Math.max(1, pesosPlantilla[i] || 1));
    const pesos =
      s.incluyePrincipal !== false
        ? [Math.max(1, Number(s.perfilesPrincipal) || 1), ...otros]
        : otros;
    try {
      const partes = repartirPesosPonderado(Math.round(Number(s.monto) || 0), pesos);
      return partes[s.incluyePrincipal !== false ? idx + 1 : idx] ?? 0;
    } catch {
      return 0;
    }
  }

  get montoAdelantoPreview(): number {
    const cuota = this.cuotaAdelanto(this.adelantoPersonaId);
    const meses = Math.max(1, Math.min(24, Math.round(Number(this.adelantoForm.meses) || 0)));
    return cuota * meses;
  }

  async enviarAdelanto(): Promise<void> {
    if (!this.adelantoPersonaId || !this.adelantoForm.servicioFijoId) return;
    const meses = Math.max(1, Math.min(24, Math.round(Number(this.adelantoForm.meses) || 0)));
    if (meses < 1) return;
    this.error = '';
    this.ok = '';
    try {
      await this.loading.run(async () => {
        await firstValueFrom(
          this.api.adelantoFijoCompartido(this.adelantoPersonaId!, {
            servicioFijoId: this.adelantoForm.servicioFijoId!,
            meses,
            fecha: this.adelantoForm.fecha || fechaHoyLocal(),
            medio: this.adelantoForm.medio,
          })
        );
        this.cerrarPanelesPersona();
        await this.refreshListas();
      }, 'Registrando adelanto…');
      this.ok =
        meses === 1
          ? 'Adelanto de 1 mes registrado'
          : `Adelanto de ${meses} meses registrado`;
    } catch (e: unknown) {
      this.error = this.msg(e, 'No se pudo registrar el adelanto');
    }
  }

  async enviarAbono(): Promise<void> {
    if (!this.abonoPersonaId) return;
    const monto = Math.round(parseDinero(this.abono.monto));
    if (monto <= 0) return;
    if (this.abono.medio === 'PRESTADO' && this.abono.formaPagoPrestamo === 'TARJETA' && !this.abono.cuentaId) {
      this.error = 'Elige la TDC con la que prestas';
      return;
    }
    this.error = '';
    this.ok = '';
    try {
      await this.loading.run(async () => {
        await firstValueFrom(
          this.api.abonarPersonaCompartida(this.abonoPersonaId!, {
            monto,
            fecha: this.abono.fecha || fechaHoyLocal(),
            medio: this.abono.medio,
            concepto: (this.abono.concepto || '').trim() || undefined,
            conceptoDestino: (this.abono.conceptoDestino || '').trim() || null,
            formaPagoPrestamo:
              this.abono.medio === 'PRESTADO' ? this.abono.formaPagoPrestamo : undefined,
            cuentaId:
              this.abono.medio === 'PRESTADO' && this.abono.formaPagoPrestamo === 'TARJETA'
                ? this.abono.cuentaId
                : null,
          })
        );
        this.cerrarPanelesPersona();
        await this.refreshListas();
      }, 'Registrando abono…');
      const dest = (this.abono.conceptoDestino || '').trim();
      if (this.abono.medio === 'PRESTADO') {
        this.ok =
          this.abono.formaPagoPrestamo === 'TARJETA'
            ? 'Abono prestado con TDC: se puso al corriente y te debe el préstamo'
            : 'Abono prestado en efectivo: se puso al corriente y te debe el préstamo';
      } else if (dest) {
        this.ok = `Abono a ${dest}` + (this.abono.medio === 'GUARDADO' ? ' (desde guardado)' : '');
      } else if (this.abono.medio === 'GUARDADO') {
        this.ok = 'Abono general desde guardado';
      } else {
        this.ok = 'Abono general (FIFO a deudas más viejas)';
      }
    } catch (e: unknown) {
      this.error = this.msg(e, 'No se pudo registrar el abono');
    }
  }

  get avisoAbono(): boolean {
    if (this.abono.medio === 'GUARDADO') {
      const p = this.resumen?.personas?.find((x) => x.id === this.abonoPersonaId);
      return this.superaGuardadoPersona(p?.efectivoGuardado, this.abono.monto);
    }
    if (this.abono.medio === 'PRESTADO') {
      if (this.abono.formaPagoPrestamo === 'EFECTIVO') {
        return this.superaDisponibleEfectivo(this.abono.monto);
      }
      return this.superaCreditoTdc(this.abono.monto, this.abono.cuentaId);
    }
    return false;
  }

  /** Preview FIFO del abono general según cuentas pendientes de la persona. */
  previewAbonoGeneral(p: PersonaResumenCompartido): string[] {
    const monto = Math.round(parseDinero(this.abono.monto));
    const cuentas = (p.porCuenta || []).filter((c) => (c.pendiente || 0) > 0);
    if (!cuentas.length) return [];
    if (monto <= 0) {
      return cuentas.map(
        (c) => `${c.concepto}: debe ${Math.round(c.pendiente)}` + (c.detalle ? ` (${c.detalle})` : '')
      );
    }
    let resto = monto;
    const lines: string[] = [];
    for (const c of cuentas) {
      if (resto <= 0) break;
      const pend = Math.round(c.pendiente);
      const aplica = Math.min(resto, pend);
      lines.push(`${c.concepto}: $${aplica}` + (aplica < pend ? ` (queda $${pend - aplica})` : ' (queda en 0)'));
      resto -= aplica;
    }
    if (resto > 0) {
      lines.push(`Sobra $${resto} → a favor`);
    }
    return lines;
  }

  async enviarAplicarAnticipo(p: PersonaResumenCompartido): Promise<void> {
    if (!this.anticipoPersonaId) return;
    const destino = (this.anticipoForm.conceptoDestino || '').trim();
    const monto = Math.round(parseDinero(this.anticipoForm.monto));
    if (!destino || monto <= 0) return;
    this.error = '';
    this.ok = '';
    try {
      await this.loading.run(async () => {
        await firstValueFrom(
          this.api.aplicarAnticipoCompartido(this.anticipoPersonaId!, {
            conceptoDestino: destino,
            monto,
          })
        );
        this.cerrarPanelesPersona();
        await this.refreshListas();
      }, 'Aplicando a favor…');
      const actualizado = this.resumen?.personas?.find((x) => x.id === p.id);
      const cuenta = actualizado?.porCuenta?.find(
        (c) => c.concepto.toLowerCase() === destino.toLowerCase()
      );
      if (cuenta && cuenta.pendiente > 0) {
        this.ok = `A favor mandado a ${destino}. Todavía debe $${Math.round(cuenta.pendiente)} de esa cuenta.`;
      } else if (cuenta && (cuenta.anticipo || 0) > 0) {
        this.ok = `A favor en ${destino}: $${Math.round(cuenta.anticipo || 0)} (cuando cobres, se aplica solo ahí).`;
      } else {
        this.ok = `A favor aplicado a ${destino}.`;
      }
    } catch (e: unknown) {
      this.error = this.msg(e, 'No se pudo aplicar el a favor');
    }
  }

  async enviarGuardado(): Promise<void> {
    if (!this.guardadoPersonaId) return;
    const monto = Math.round(parseDinero(this.guardadoForm.monto));
    if (monto <= 0) return;
    this.error = '';
    this.ok = '';
    try {
      await this.loading.run(async () => {
        await firstValueFrom(
          this.api.guardadoPersonaCompartida(this.guardadoPersonaId!, {
            monto,
            fecha: this.guardadoForm.fecha || fechaHoyLocal(),
            tipo: this.guardadoForm.tipo,
            concepto: (this.guardadoForm.concepto || '').trim() || undefined,
          })
        );
        this.cerrarPanelesPersona();
        await this.refreshListas();
      }, 'Actualizando guardado…');
      this.ok =
        this.guardadoForm.tipo === 'DEJAR'
          ? 'Registrado: te dejaron efectivo a guardar (caja aparte)'
          : 'Registrado: les devolviste efectivo de su caja';
    } catch (e: unknown) {
      this.error = this.msg(e, 'No se pudo actualizar el guardado');
    }
  }

  fechaTxt(v: string | undefined): string {
    return formatFechaCorta(v);
  }

  nombreParte(parte: { esPrincipal?: boolean; nombre?: string; persona?: PersonaCompartida | null }): string {
    if (parte.esPrincipal) return 'Yo';
    return parte.nombre || parte.persona?.nombre || '?';
  }

  creditoLibre(cuentaId: number | null | undefined): number | null {
    if (cuentaId == null) return null;
    const c = this.cuentasTdc.find((x) => x.id === cuentaId);
    return c ? creditoDisponibleDe(c) : null;
  }

  etiquetaTdc(c: Cuenta): string {
    const libre = creditoDisponibleDe(c);
    if (libre == null) return c.nombre;
    return `${c.nombre} · libre $${Math.round(libre).toLocaleString('es-MX')}`;
  }

  superaDisponibleEfectivo(montoStr: string): boolean {
    if (this.saldoDisponible == null) return false;
    const monto = Math.round(parseDinero(montoStr));
    return monto > 0 && monto > this.saldoDisponible + 1e-9;
  }

  superaCreditoTdc(montoStr: string, cuentaId: number | null | undefined): boolean {
    const libre = this.creditoLibre(cuentaId);
    if (libre == null) return false;
    const monto = Math.round(parseDinero(montoStr));
    return monto > 0 && monto > libre + 1e-9;
  }

  superaGuardadoPersona(guardado: number | null | undefined, montoStr: string): boolean {
    const caja = Number(guardado) || 0;
    const monto = Math.round(parseDinero(montoStr));
    return monto > 0 && monto > caja + 1e-9;
  }

  formatFechaCorta = formatFechaCorta;

  tipoMovLabel(t: string): string {
    switch (t) {
      case 'DEUDA':
        return 'Deuda';
      case 'ABONO':
        return 'Abono';
      case 'ANTICIPO_OUT':
        return 'Entregó a favor';
      case 'GUARDADO_IN':
        return 'Guardó';
      case 'GUARDADO_OUT':
        return 'Devolvió';
      default:
        return t;
    }
  }

  private async refreshListas(): Promise<void> {
    const [personas, resumen, gastos, movs, fijos, cuentas, saldo] = await Promise.all([
      firstValueFrom(this.api.personasCompartidas(this.mostrarInactivas)),
      firstValueFrom(this.api.resumenCompartido()),
      firstValueFrom(this.api.gastosCompartidos()),
      firstValueFrom(this.api.movimientosCompartidos()),
      firstValueFrom(this.api.serviciosFijosCompartidos()),
      firstValueFrom(this.api.cuentas()),
      firstValueFrom(this.api.saldo()),
    ]);
    this.personas = personas;
    this.resumen = resumen;
    this.gastos = gastos;
    this.movimientos = movs;
    this.serviciosFijos = fijos;
    this.cuentasTdc = (cuentas || []).filter(
      (c) => (c.tipo || '').toUpperCase() === 'TDC' && !c.archivada && !c.bloqueada
    );
    this.saldoDisponible =
      saldo?.esperado == null || saldo.esperado === undefined ? null : Number(saldo.esperado);
  }

  private msg(e: unknown, fallback: string): string {
    const err = e as { error?: { error?: string; message?: string } | string; message?: string };
    if (typeof err?.error === 'string') return err.error;
    return err?.error?.error || err?.error?.message || err?.message || fallback;
  }
}
