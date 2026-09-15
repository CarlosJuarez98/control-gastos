import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

function esRutaCuentas(path: string | undefined): boolean {
  return path === 'cuentas' || path === 'cuentas/:id';
}

/**
 * Reutiliza la misma instancia de CuentasComponent entre /cuentas y /cuentas/:id
 * para no perder el scroll al abrir/cerrar una deuda en móvil.
 */
export class CuentasReuseStrategy implements RouteReuseStrategy {
  shouldDetach(_route: ActivatedRouteSnapshot): boolean {
    return false;
  }

  store(_route: ActivatedRouteSnapshot, _handle: DetachedRouteHandle | null): void {}

  shouldAttach(_route: ActivatedRouteSnapshot): boolean {
    return false;
  }

  retrieve(_route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    return null;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    if (future.routeConfig === curr.routeConfig) {
      return true;
    }
    return esRutaCuentas(future.routeConfig?.path) && esRutaCuentas(curr.routeConfig?.path);
  }
}
