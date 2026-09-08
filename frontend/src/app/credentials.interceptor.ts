import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const withCreds = req.clone({ withCredentials: true });
  return next(withCreds).pipe(
    catchError((err) => {
      const esAuthPublico =
        req.url.includes('/api/auth/login') || req.url.includes('/api/auth/me');
      if (err?.status === 401 && !esAuthPublico) {
        auth.limpiar();
        if (!router.url.startsWith('/login')) {
          void router.navigateByUrl('/login');
        }
      }
      return throwError(() => err);
    }),
  );
};
