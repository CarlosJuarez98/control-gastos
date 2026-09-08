import { Routes } from '@angular/router';
import { ResumenComponent } from './paginas/resumen/resumen.component';
import { IngresosComponent } from './paginas/ingresos/ingresos.component';
import { GastosComponent } from './paginas/gastos/gastos.component';
import { MensualesComponent } from './paginas/mensuales/mensuales.component';
import { CuentasComponent } from './paginas/cuentas/cuentas.component';
import { SaldoComponent } from './paginas/saldo/saldo.component';
import { LoginComponent } from './paginas/login/login.component';
import { UsuariosComponent } from './paginas/usuarios/usuarios.component';
import { adminGuard, authGuard, guestGuard } from './auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: '', pathMatch: 'full', redirectTo: 'resumen' },
  { path: 'resumen', component: ResumenComponent, canActivate: [authGuard] },
  { path: 'ingresos', component: IngresosComponent, canActivate: [authGuard] },
  { path: 'gastos', component: GastosComponent, canActivate: [authGuard] },
  { path: 'mensuales', component: MensualesComponent, canActivate: [authGuard] },
  { path: 'cuentas', component: CuentasComponent, canActivate: [authGuard] },
  { path: 'cuentas/:id', component: CuentasComponent, canActivate: [authGuard] },
  { path: 'saldo', component: SaldoComponent, canActivate: [authGuard] },
  { path: 'usuarios', component: UsuariosComponent, canActivate: [adminGuard] },
  { path: '**', redirectTo: 'resumen' },
];
