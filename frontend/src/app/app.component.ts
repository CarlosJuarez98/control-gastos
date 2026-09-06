import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  links = [
    { path: '/resumen', label: 'Resumen', exact: true },
    { path: '/ingresos', label: 'Ingresos', exact: false },
    { path: '/gastos', label: 'Gastos', exact: false },
    { path: '/mensuales', label: 'Mensuales', exact: false },
    { path: '/cuentas', label: 'Deudas', exact: false },
    { path: '/saldo', label: 'Saldo', exact: false },
  ];
}
