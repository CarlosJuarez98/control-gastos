import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.autenticado) {
    return true;
  }
  return auth.me().pipe(
    map((ok) => (ok ? true : router.createUrlTree(['/login']))),
  );
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.autenticado) {
    return router.createUrlTree(['/resumen']);
  }
  return auth.me().pipe(
    map((ok) => (ok ? router.createUrlTree(['/resumen']) : true)),
  );
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const allow = () => (auth.esAdmin ? true : router.createUrlTree(['/resumen']));
  if (auth.autenticado) {
    return allow();
  }
  return auth.me().pipe(map(() => allow()));
};
