import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { OfflineService } from './offline/offline.service';

export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const offline = inject(OfflineService);
  const withCreds = req.clone({ withCredentials: true });
  return next(withCreds).pipe(
    catchError((err) => {
      const esAuthPublico =
        req.url.includes('/api/auth/login') || req.url.includes('/api/auth/me');
      // Offline / red caída: no borrar sesión
      const redCaida = err?.status === 0 || offline.esOffline();
      if (err?.status === 401 && !esAuthPublico && !redCaida) {
        auth.limpiar();
        void offline.limpiarSesion();
        if (!router.url.startsWith('/login')) {
          void router.navigateByUrl('/login');
        }
      }
      return throwError(() => err);
    }),
  );
};
