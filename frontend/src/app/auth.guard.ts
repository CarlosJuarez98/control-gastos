import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

/** Siempre pregunta al servidor: no fiarse de usuario en memoria (sesión de 20 min). */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.me().pipe(map((ok) => (ok ? true : router.createUrlTree(['/login']))));
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.me().pipe(map((ok) => (ok ? router.createUrlTree(['/resumen']) : true)));
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.me().pipe(
    map((ok) => {
      if (!ok) return router.createUrlTree(['/login']);
      return auth.esAdmin ? true : router.createUrlTree(['/resumen']);
    }),
  );
};
