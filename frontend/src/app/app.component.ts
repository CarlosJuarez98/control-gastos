import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  inject,
  NgZone,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { LoadingDialogComponent } from './loading-dialog.component';
import { AuthService } from './auth.service';
import { OfflineService } from './offline/offline.service';
import { AvisosCobroService } from './avisos-cobro.service';
import { sha256Hex } from './password-digest';
import { EnterAvanceDirective } from './enter-avance.directive';
import { filter, Subscription } from 'rxjs';

type NavLink = {
  path: string;
  label: string;
  short: string;
  icon: string;
  exact: boolean;
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ConfirmDialogComponent,
    LoadingDialogComponent,
    FormsModule,
    EnterAvanceDirective,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements AfterViewInit, AfterViewChecked, OnDestroy {
  readonly auth = inject(AuthService);
  readonly offline = inject(OfflineService);
  readonly avisosCobro = inject(AvisosCobroService);
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);

  @ViewChild('navDock') private navDock?: ElementRef<HTMLElement>;
  @ViewChild('dockMeasure') private dockMeasure?: ElementRef<HTMLElement>;

  perfilAbierto = false;
  perfilUsuario = '';
  perfilPassword = '';
  perfilPasswordActual = '';
  perfilError = '';
  perfilOk = '';
  perfilCargando = false;
  menuNavAbierto = false;

  /** Enlaces visibles en el dock (con nombre). */
  dockLinks: NavLink[] = [];
  /** Enlaces que no caben → menú hamburguesa. */
  overflowLinks: NavLink[] = [];

  private dockObserver: ResizeObserver | null = null;
  private routeSub: Subscription | null = null;
  private recalcTimer: ReturnType<typeof setTimeout> | null = null;

  get puedeGuardarPerfil(): boolean {
    const usuario = (this.perfilUsuario || '').trim();
    if (!usuario) return false;
    const nombreCambio = usuario.toLowerCase() !== (this.auth.usuario || '').toLowerCase();
    const claveCambio = !!this.perfilPassword;
    if (claveCambio && !(this.perfilPasswordActual || '').trim()) {
      return false;
    }
    return nombreCambio || claveCambio;
  }

  /** Pull-to-refresh en móvil. */
  pullDistancia = 0;
  pullListo = false;
  private pullInicioY: number | null = null;
  private pullActivo = false;
  private readonly pullUmbral = 78;

  /** Teclado móvil: evita que el layout se aplaste. */
  tecladoAbierto = false;
  private altoAppCongelado = false;
  private focusScrollTimer: ReturnType<typeof setTimeout> | null = null;
  private focusOutTimer: ReturnType<typeof setTimeout> | null = null;
  private insetPollTimer: ReturnType<typeof setTimeout> | null = null;
  private vvCleanup: (() => void) | null = null;

  private readonly linksBase: NavLink[] = [
    { path: '/resumen', label: 'Resumen', short: 'Inicio', icon: '◈', exact: true },
    { path: '/ingresos', label: 'Ingresos', short: 'Ingresos', icon: '↑', exact: false },
    { path: '/gastos', label: 'Gastos', short: 'Gastos', icon: '↓', exact: false },
    { path: '/mensuales', label: 'Mensuales', short: 'Mes', icon: '↻', exact: false },
    { path: '/cuentas', label: 'Deudas', short: 'Deudas', icon: '▣', exact: false },
    { path: '/saldo', label: 'Saldo', short: 'Saldo', icon: '◎', exact: false },
    { path: '/compartido', label: 'Compartido', short: 'Comp.', icon: '⚭', exact: false },
  ];

  get links(): NavLink[] {
    if (this.auth.esAdmin) {
      return [...this.linksBase, { path: '/usuarios', label: 'Usuarios', short: 'Users', icon: '◇', exact: false }];
    }
    return this.linksBase;
  }

  get mostrarNav(): boolean {
    return this.auth.autenticado && !this.router.url.startsWith('/login');
  }

  get pullVisible(): boolean {
    return this.pullDistancia > 8 && !this.perfilAbierto;
  }

  get mostrarBannerOffline(): boolean {
    return this.mostrarNav && (!!this.offline.banner() || this.offline.pendientes() > 0 || !this.offline.online());
  }

  get rutaEnOverflow(): boolean {
    return this.overflowLinks.some((l) => this.rutaActiva(l));
  }

  ngAfterViewInit(): void {
    this.fijarAltoApp(true);
    this.iniciarTecladoViewport();

    this.routeSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        this.programarRecalcDock();
        if (this.mostrarNav) {
          void this.avisosCobro.refrescar();
        } else {
          this.avisosCobro.limpiar();
        }
      });

    void Promise.resolve().then(() => {
      this.recalcularDock();
      this.conectarDockObserver();
      if (this.mostrarNav) {
        void this.avisosCobro.refrescar();
      }
    });
  }

  ngAfterViewChecked(): void {
    if (this.mostrarNav && this.navDock && !this.dockObserver) {
      this.conectarDockObserver();
      this.programarRecalcDock();
    }
    if (!this.mostrarNav && this.dockObserver) {
      this.dockObserver.disconnect();
      this.dockObserver = null;
    }
  }

  ngOnDestroy(): void {
    this.dockObserver?.disconnect();
    this.routeSub?.unsubscribe();
    if (this.recalcTimer != null) clearTimeout(this.recalcTimer);
    if (this.focusScrollTimer != null) clearTimeout(this.focusScrollTimer);
    if (this.focusOutTimer != null) clearTimeout(this.focusOutTimer);
    if (this.insetPollTimer != null) clearTimeout(this.insetPollTimer);
    this.vvCleanup?.();
  }

  sincronizarAhora(): void {
    void this.offline.sincronizar();
  }

  cerrarBanner(): void {
    this.offline.ocultarBanner();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (!this.tecladoAbierto && !this.altoAppCongelado) {
      this.fijarAltoApp(true);
    }
    this.programarRecalcDock();
  }

  @HostListener('window:orientationchange')
  onOrientationChange(): void {
    // Tras rotar, recalcular alto estable (el teclado suele cerrarse)
    window.setTimeout(() => {
      this.tecladoAbierto = false;
      this.altoAppCongelado = false;
      document.body.classList.remove('teclado-abierto');
      this.fijarAltoApp(true);
      this.programarRecalcDock();
    }, 250);
  }

  @HostListener('focusin', ['$event'])
  onFocusIn(ev: FocusEvent): void {
    const t = ev.target as HTMLElement | null;
    if (!this.esCampoEditable(t)) return;
    if (this.focusOutTimer != null) {
      clearTimeout(this.focusOutTimer);
      this.focusOutTimer = null;
    }
    // Congelar alto ANTES de que el viewport se encoja (fallback iOS / navegadores viejos)
    if (!this.altoAppCongelado) {
      this.altoAppCongelado = true;
      this.fijarAltoApp(true);
    }
    this.actualizarInsetTeclado();
    this.marcarTeclado(true);
    this.sondearInsetTeclado();
    if (this.focusScrollTimer != null) clearTimeout(this.focusScrollTimer);
    // Esperar animación del teclado y volver a medir inset
    this.focusScrollTimer = setTimeout(() => {
      this.actualizarInsetTeclado();
      this.asegurarCampoVisible(t!);
    }, 320);
  }

  @HostListener('focusout')
  onFocusOut(): void {
    if (this.focusOutTimer != null) clearTimeout(this.focusOutTimer);
    this.focusOutTimer = setTimeout(() => {
      const activo = document.activeElement as HTMLElement | null;
      if (this.esCampoEditable(activo)) return;
      this.marcarTeclado(false);
      this.altoAppCongelado = false;
      this.fijarAltoApp(true);
      document.documentElement.style.setProperty('--teclado-inset', '0px');
      this.aplicarDockSobreTeclado(0);
    }, 120);
  }

  /** Mientras escribe (móvil), el campo activo sigue visible sobre el teclado + dock. */
  @HostListener('input', ['$event'])
  onInputCampo(ev: Event): void {
    if (!this.tecladoAbierto) return;
    const t = ev.target;
    if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLTextAreaElement)) return;
    this.actualizarInsetTeclado();
    if (this.focusScrollTimer != null) clearTimeout(this.focusScrollTimer);
    this.focusScrollTimer = setTimeout(() => this.asegurarCampoVisible(t), 80);
  }

  private esCampoEditable(el: HTMLElement | null): boolean {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag !== 'INPUT') return false;
    const tipo = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'hidden', 'range', 'color'].includes(tipo);
  }

  private marcarTeclado(abierto: boolean): void {
    if (this.tecladoAbierto === abierto) {
      document.body.classList.toggle('teclado-abierto', abierto);
      return;
    }
    this.tecladoAbierto = abierto;
    document.body.classList.toggle('teclado-abierto', abierto);
  }

  private fijarAltoApp(forzar = false): void {
    if (this.tecladoAbierto && !forzar) return;
    const h = Math.round(window.innerHeight);
    if (h > 0) {
      document.documentElement.style.setProperty('--app-height', `${h}px`);
    }
  }

  /** Altura del teclado ≈ layout − visual viewport (Chrome/Android; iOS similar). */
  private actualizarInsetTeclado(permitirFallback = false): void {
    const vv = window.visualViewport;
    let inset = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    // Algunos WebViews / DevTools no reportan el teclado en visualViewport
    if (
      permitirFallback &&
      inset < 80 &&
      this.tecladoAbierto &&
      window.matchMedia('(max-width: 720px)').matches
    ) {
      inset = Math.min(340, Math.round(window.innerHeight * 0.4));
    }
    document.documentElement.style.setProperty('--teclado-inset', `${inset}px`);
    this.aplicarDockSobreTeclado(inset);
  }

  /** Sube el dock por encima del teclado (inline: más fiable que solo CSS var). */
  private aplicarDockSobreTeclado(inset: number): void {
    const dock = document.querySelector('.nav-dock') as HTMLElement | null;
    const panel = document.querySelector('.menu-nav-panel') as HTMLElement | null;
    if (inset > 80) {
      const bottom = `${inset + 6}px`;
      dock?.style.setProperty('bottom', bottom, 'important');
      if (panel) {
        // panel encima del dock (~4.35rem ≈ 70px)
        panel.style.setProperty('bottom', `${inset + 76}px`, 'important');
      }
    } else {
      dock?.style.removeProperty('bottom');
      panel?.style.removeProperty('bottom');
    }
  }

  /** El teclado tarda en abrir: relee el inset varias veces para subir el dock a tiempo. */
  private sondearInsetTeclado(): void {
    if (this.insetPollTimer != null) clearTimeout(this.insetPollTimer);
    let n = 0;
    const tick = () => {
      // Tras ~300ms sin inset real, usar estimación en móvil
      this.actualizarInsetTeclado(n >= 6);
      n += 1;
      if (n < 14 && this.tecladoAbierto) {
        this.insetPollTimer = setTimeout(tick, 50);
      }
    };
    tick();
  }

  private iniciarTecladoViewport(): void {
    const vv = window.visualViewport;
    if (!vv) return;
    const actualizar = () => {
      this.actualizarInsetTeclado();
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const activo = document.activeElement as HTMLElement | null;
      if (this.esCampoEditable(activo) && inset > 80) {
        this.zone.run(() => this.marcarTeclado(true));
      } else if (!this.esCampoEditable(activo) && inset < 40) {
        this.zone.run(() => {
          this.marcarTeclado(false);
          this.altoAppCongelado = false;
        });
      }
    };
    vv.addEventListener('resize', actualizar);
    vv.addEventListener('scroll', actualizar);
    this.vvCleanup = () => {
      vv.removeEventListener('resize', actualizar);
      vv.removeEventListener('scroll', actualizar);
      document.documentElement.style.removeProperty('--teclado-inset');
      document.documentElement.style.removeProperty('--app-height');
      document.body.classList.remove('teclado-abierto');
      this.aplicarDockSobreTeclado(0);
    };
  }

  private asegurarCampoVisible(el: HTMLElement): void {
    const vv = window.visualViewport;
    const dockH = this.mostrarNav ? 76 : 16;
    const topLimit = (vv?.offsetTop ?? 0) + 12;
    const bottomLimit = vv
      ? vv.offsetTop + vv.height - dockH
      : window.innerHeight - dockH;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > bottomLimit || rect.top < topLimit) {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }
  }

  @HostListener('touchstart', ['$event'])
  onTouchStart(ev: TouchEvent): void {
    if (this.perfilAbierto || ev.touches.length !== 1) return;
    if (!this.contenidoEnTope(ev.target)) {
      this.pullInicioY = null;
      return;
    }
    this.pullInicioY = ev.touches[0].clientY;
    this.pullActivo = true;
    this.pullDistancia = 0;
    this.pullListo = false;
  }

  @HostListener('touchmove', ['$event'])
  onTouchMove(ev: TouchEvent): void {
    if (!this.pullActivo || this.pullInicioY == null || ev.touches.length !== 1) return;
    if (!this.contenidoEnTope(ev.target)) {
      this.resetPull();
      return;
    }
    const dy = ev.touches[0].clientY - this.pullInicioY;
    if (dy <= 0) {
      this.pullDistancia = 0;
      this.pullListo = false;
      this.resetPull();
      return;
    }
    this.pullDistancia = Math.min(120, dy * 0.55);
    this.pullListo = this.pullDistancia >= this.pullUmbral;
    if (this.pullDistancia > 20) {
      ev.preventDefault();
    }
  }

  @HostListener('touchend')
  onTouchEnd(): void {
    if (!this.pullActivo) return;
    const recargar = this.pullListo;
    this.resetPull();
    if (recargar) {
      window.location.reload();
    }
  }

  @HostListener('touchcancel')
  onTouchCancel(): void {
    this.resetPull();
  }

  private resetPull(): void {
    this.pullActivo = false;
    this.pullInicioY = null;
    this.pullDistancia = 0;
    this.pullListo = false;
  }

  private contenidoEnTope(target: EventTarget | null): boolean {
    let el = target as HTMLElement | null;
    while (el && el !== document.documentElement) {
      const style = getComputedStyle(el);
      const oy = style.overflowY;
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && el.scrollTop > 0) {
        return false;
      }
      el = el.parentElement;
    }
    return true;
  }

  abrirPerfil(): void {
    this.menuNavAbierto = false;
    this.perfilAbierto = true;
    this.perfilUsuario = this.auth.usuario || '';
    this.perfilPassword = '';
    this.perfilPasswordActual = '';
    this.perfilError = '';
    this.perfilOk = '';
  }

  toggleMenuNav(): void {
    this.menuNavAbierto = !this.menuNavAbierto;
  }

  cerrarMenuNav(): void {
    this.menuNavAbierto = false;
  }

  @HostListener('document:keydown', ['$event'])
  onTeclasGlobales(ev: KeyboardEvent): void {
    if (ev.key === 'Escape' && this.menuNavAbierto) {
      ev.preventDefault();
      this.menuNavAbierto = false;
    }
  }

  cerrarPerfil(): void {
    this.perfilAbierto = false;
    this.perfilPassword = '';
    this.perfilPasswordActual = '';
    this.perfilError = '';
    this.perfilOk = '';
  }

  async guardarPerfil(): Promise<void> {
    this.perfilError = '';
    this.perfilOk = '';
    if (!this.puedeGuardarPerfil || this.perfilCargando) {
      if (!(this.perfilUsuario || '').trim()) {
        this.perfilError = 'El nombre de usuario es obligatorio';
      } else if (!this.puedeGuardarPerfil) {
        this.perfilError = 'No hay cambios que guardar';
      }
      return;
    }
    const usuario = this.perfilUsuario.trim();
    const nombreCambio = usuario.toLowerCase() !== (this.auth.usuario || '').toLowerCase();
    const claveCambio = !!this.perfilPassword;
    if (claveCambio && !(this.perfilPasswordActual || '').trim()) {
      this.perfilError = 'Indica tu contraseña actual para cambiarla';
      return;
    }
    this.perfilCargando = true;
    try {
      if (claveCambio) {
        const actualHex = await sha256Hex(this.perfilPasswordActual);
        const nuevaHex = await sha256Hex(this.perfilPassword);
        await new Promise<void>((resolve, reject) => {
          this.auth.cambiarMiPassword(actualHex, nuevaHex).subscribe({
            next: () => resolve(),
            error: (e) => reject(e),
          });
        });
      }
      if (nombreCambio) {
        await new Promise<void>((resolve, reject) => {
          this.auth.actualizarPerfil({ usuario }).subscribe({
            next: () => resolve(),
            error: (e) => reject(e),
          });
        });
      }
      this.perfilCargando = false;
      this.cerrarPerfil();
    } catch (e: unknown) {
      this.perfilCargando = false;
      const err = e as { error?: { error?: string } };
      this.perfilError = err?.error?.error || 'No se pudo actualizar';
    }
  }

  salir(): void {
    this.menuNavAbierto = false;
    this.cerrarPerfil();
    this.auth.logout().subscribe();
  }

  rutaActiva(l: NavLink): boolean {
    const url = this.router.url.split('?')[0];
    if (l.exact) return url === l.path || url === '/';
    return url === l.path || url.startsWith(l.path + '/');
  }

  private conectarDockObserver(): void {
    this.dockObserver?.disconnect();
    const el = this.navDock?.nativeElement;
    if (!el || typeof ResizeObserver === 'undefined') return;
    this.dockObserver = new ResizeObserver(() => this.zone.run(() => this.programarRecalcDock()));
    this.dockObserver.observe(el);
  }

  private programarRecalcDock(): void {
    if (this.recalcTimer != null) clearTimeout(this.recalcTimer);
    this.recalcTimer = setTimeout(() => {
      this.recalcTimer = null;
      this.recalcularDock();
    }, 40);
  }

  /**
   * Cuántos módulos caben en el dock con nombre completo;
   * el resto va al menú. Si la ruta activa quedó fuera, se promociona al dock.
   */
  recalcularDock(): void {
    const all = this.links;
    if (!this.mostrarNav || typeof window === 'undefined' || window.innerWidth > 720) {
      this.dockLinks = all;
      this.overflowLinks = [];
      if (this.menuNavAbierto && this.overflowLinks.length === 0) {
        this.menuNavAbierto = false;
      }
      return;
    }

    const dock = this.navDock?.nativeElement;
    const measure = this.dockMeasure?.nativeElement;
    if (!dock || !measure) {
      this.dockLinks = all;
      this.overflowLinks = [];
      return;
    }

    const items = Array.from(measure.querySelectorAll<HTMLElement>('[data-dock-measure="item"]'));
    const menuEl = measure.querySelector<HTMLElement>('[data-dock-measure="menu"]');
    if (items.length !== all.length || !menuEl) {
      this.dockLinks = all;
      this.overflowLinks = [];
      return;
    }

    const cs = getComputedStyle(dock);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const avail = dock.clientWidth - padX;
    const gap = parseFloat(cs.columnGap || cs.gap) || 2;
    const widths = items.map((el) => el.getBoundingClientRect().width);
    const menuW = menuEl.getBoundingClientRect().width;

    let n = all.length;
    while (n > 0) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += widths[i];
      const needMenu = n < all.length;
      const gaps = Math.max(0, n + (needMenu ? 1 : 0) - 1) * gap;
      const total = sum + (needMenu ? menuW : 0) + gaps;
      if (total <= avail + 0.5) break;
      n--;
    }
    n = Math.max(1, Math.min(n, all.length));

    let visible = all.slice(0, n);
    let overflow = all.slice(n);

    const activeIdx = overflow.findIndex((l) => this.rutaActiva(l));
    if (activeIdx >= 0 && visible.length > 0) {
      const promoted = overflow[activeIdx];
      overflow = [...overflow.slice(0, activeIdx), ...overflow.slice(activeIdx + 1)];
      const demoted = visible[visible.length - 1];
      visible = [...visible.slice(0, -1), promoted];
      overflow = [demoted, ...overflow];
    }

    const same =
      visible.length === this.dockLinks.length &&
      overflow.length === this.overflowLinks.length &&
      visible.every((l, i) => l.path === this.dockLinks[i]?.path) &&
      overflow.every((l, i) => l.path === this.overflowLinks[i]?.path);

    if (!same) {
      this.dockLinks = visible;
      this.overflowLinks = overflow;
      if (this.overflowLinks.length === 0) {
        this.menuNavAbierto = false;
      }
    }
  }
}
