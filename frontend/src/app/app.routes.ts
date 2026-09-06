import { Routes } from '@angular/router';
import { ResumenComponent } from './paginas/resumen/resumen.component';
import { IngresosComponent } from './paginas/ingresos/ingresos.component';
import { GastosComponent } from './paginas/gastos/gastos.component';
import { MensualesComponent } from './paginas/mensuales/mensuales.component';
import { CuentasComponent } from './paginas/cuentas/cuentas.component';
import { SaldoComponent } from './paginas/saldo/saldo.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'resumen' },
  { path: 'resumen', component: ResumenComponent },
  { path: 'ingresos', component: IngresosComponent },
  { path: 'gastos', component: GastosComponent },
  { path: 'mensuales', component: MensualesComponent },
  { path: 'cuentas', component: CuentasComponent },
  { path: 'cuentas/:id', component: CuentasComponent },
  { path: 'saldo', component: SaldoComponent },
  { path: '**', redirectTo: 'resumen' },
];
