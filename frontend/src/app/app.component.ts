import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router } from '@angular/router';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ConfirmDialogComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

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

  salir(): void {
    this.auth.logout().subscribe();
  }
}
