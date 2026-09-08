import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const withCreds = req.clone({ withCredentials: true });
  return next(withCreds).pipe(
    catchError((err) => {
      if (err?.status === 401 && !req.url.includes('/api/auth/login') && !req.url.includes('/api/auth/me')) {
        void router.navigateByUrl('/login');
      }
      return throwError(() => err);
    }),
  );
};
