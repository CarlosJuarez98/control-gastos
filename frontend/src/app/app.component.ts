import { Component, HostListener, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { AuthService } from './auth.service';
import { sha256Hex } from './password-digest';
import { EnterAvanceDirective } from './enter-avance.directive';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConfirmDialogComponent, FormsModule, EnterAvanceDirective],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  perfilAbierto = false;
  perfilUsuario = '';
  perfilPassword = '';
  perfilError = '';
  perfilOk = '';
  perfilCargando = false;

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

  private readonly linksBase = [
    { path: '/resumen', label: 'Resumen', exact: true },
    { path: '/ingresos', label: 'Ingresos', exact: false },
    { path: '/gastos', label: 'Gastos', exact: false },
    { path: '/mensuales', label: 'Mensuales', exact: false },
    { path: '/cuentas', label: 'Deudas', exact: false },
    { path: '/saldo', label: 'Saldo', exact: false },
  ];

  get links() {
    if (this.auth.esAdmin) {
      return [...this.linksBase, { path: '/usuarios', label: 'Usuarios', exact: false }];
    }
    return this.linksBase;
  }

  get mostrarNav(): boolean {
    return this.auth.autenticado && !this.router.url.startsWith('/login');
  }

  get pullVisible(): boolean {
    return this.pullDistancia > 8 && !this.perfilAbierto;
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
      // El usuario está scrolleando hacia abajo: soltar el pull para no trabar
      this.resetPull();
      return;
    }
    this.pullDistancia = Math.min(120, dy * 0.55);
    this.pullListo = this.pullDistancia >= this.pullUmbral;
    // Solo bloquear el scroll nativo cuando ya hay un pull claro
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

  /** Solo pull-to-refresh si todos los contenedores scrollables están arriba. */
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
    this.perfilAbierto = true;
    this.perfilUsuario = this.auth.usuario || '';
    this.perfilPassword = '';
    this.perfilError = '';
    this.perfilOk = '';
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
    this.cerrarPerfil();
    this.auth.logout().subscribe();
  }
}
