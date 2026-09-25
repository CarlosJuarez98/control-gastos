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
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);

  @ViewChild('navDock') private navDock?: ElementRef<HTMLElement>;
  @ViewChild('dockMeasure') private dockMeasure?: ElementRef<HTMLElement>;

  perfilAbierto = false;
  perfilUsuario = '';
  perfilPassword = '';
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
    return nombreCambio || claveCambio;
  }

  /** Pull-to-refresh en móvil. */
  pullDistancia = 0;
  pullListo = false;
  private pullInicioY: number | null = null;
  private pullActivo = false;
  private readonly pullUmbral = 78;

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
    this.routeSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.programarRecalcDock());

    void Promise.resolve().then(() => {
      this.recalcularDock();
      this.conectarDockObserver();
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
  }

  sincronizarAhora(): void {
    void this.offline.sincronizar();
  }

  cerrarBanner(): void {
    this.offline.ocultarBanner();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.programarRecalcDock();
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
    const body: { usuario?: string; password?: string } = {};
    if (usuario.toLowerCase() !== (this.auth.usuario || '').toLowerCase()) {
      body.usuario = usuario;
    }
    if (this.perfilPassword) {
      try {
        body.password = await sha256Hex(this.perfilPassword);
      } catch {
        this.perfilError = 'No se pudo preparar la contraseña';
        return;
      }
    }
    this.perfilCargando = true;
    this.auth.actualizarPerfil(body).subscribe({
      next: () => {
        this.perfilCargando = false;
        this.cerrarPerfil();
      },
      error: (e) => {
        this.perfilCargando = false;
        this.perfilError = e?.error?.error || 'No se pudo actualizar';
      },
    });
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
