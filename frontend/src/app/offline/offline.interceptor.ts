import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, of, throwError } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { OfflineService } from './offline.service';

function esApi(url: string): boolean {
  return url.includes('/api/');
}

function esAuthMutacion(url: string): boolean {
  return (
    url.includes('/api/auth/login') ||
    url.includes('/api/auth/logout') ||
    url.includes('/api/auth/perfil')
  );
}

function esGetCacheable(url: string, method: string): boolean {
  return method === 'GET' && esApi(url) && !url.includes('/api/auth/');
}

function esMutacion(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function errorDeRed(err: unknown): boolean {
  if (!(err instanceof HttpErrorResponse)) return false;
  // status 0 = red caída / CORS / offline
  return err.status === 0 || err.status === 504 || err.status === 502;
}

const HEADER_REPLAY = 'X-Cg-Offline-Replay';

function cuerpoFallback(url: string): unknown | undefined {
  const path = url.split('?')[0];
  if (/\/api\/(gastos|ingresos|cuentas|gastos-mensuales|usuarios)$/.test(path)) return [];
  if (/\/movimientos$/.test(path)) return [];
  return undefined;
}

export const offlineInterceptor: HttpInterceptorFn = (req, next) => {
  const offline = inject(OfflineService);
  const method = req.method.toUpperCase();
  const url = req.urlWithParams || req.url;

  // Reproducción de cola: no re-encolar ni cortocircuitar
  if (req.headers.has(HEADER_REPLAY)) {
    return next(req.clone({ headers: req.headers.delete(HEADER_REPLAY) }));
  }

  // Login / logout / perfil: no encolar; requieren servidor
  if (esAuthMutacion(url)) {
    return next(req);
  }

  // GET: si no hay red o hay cambios locales, servir IndexedDB (incluye altas offline).
  // No ir a red primero: el SW/caché HTTP devolvería datos viejos y taparía lo guardado aquí.
  if (esGetCacheable(url, method)) {
    const preferirLocal = offline.esOffline() || offline.pendientes() > 0;
    if (preferirLocal) {
      return from(offline.leerCache(url)).pipe(
        switchMap((cached) => {
          if (cached !== undefined) {
            return of(new HttpResponse({ status: 200, body: cached, url: req.url }));
          }
          const vacio = cuerpoFallback(url);
          if (vacio !== undefined && offline.esOffline()) {
            return of(new HttpResponse({ status: 200, body: vacio, url: req.url }));
          }
          return next(req).pipe(
            tap((event) => {
              if (event instanceof HttpResponse) void offline.guardarCache(url, event.body);
            }),
            catchError((err) => {
              if (vacio !== undefined) {
                return of(new HttpResponse({ status: 200, body: vacio, url: req.url }));
              }
              return throwError(() => err);
            }),
          );
        }),
      );
    }

    return next(req).pipe(
      tap((event) => {
        if (event instanceof HttpResponse) {
          void offline.guardarCache(url, event.body);
        }
      }),
      catchError((err) => {
        if (!errorDeRed(err) && !(offline.esOffline() && err instanceof HttpErrorResponse)) {
          return throwError(() => err);
        }
        return from(offline.leerCache(url)).pipe(
          switchMap((cached) => {
            if (cached !== undefined) {
              return of(new HttpResponse({ status: 200, body: cached, url: req.url }));
            }
            const vacio = cuerpoFallback(url);
            if (vacio !== undefined) {
              return of(new HttpResponse({ status: 200, body: vacio, url: req.url }));
            }
            return throwError(() => err);
          }),
        );
      }),
    );
  }

  // Mutaciones: si offline o cae la red → cola + optimistic
  if (esMutacion(method) && esApi(url)) {
    if (offline.esOffline()) {
      return from(offline.encolar(method, url, req.body)).pipe(
        switchMap(({ synthetic }) =>
          of(
            new HttpResponse({
              status: method === 'DELETE' ? 204 : 200,
              body: synthetic,
              url: req.url,
            }),
          ),
        ),
      );
    }

    return next(req).pipe(
      catchError((err) => {
        if (!errorDeRed(err)) {
          return throwError(() => err);
        }
        return from(offline.encolar(method, url, req.body)).pipe(
          switchMap(({ synthetic }) =>
            of(
              new HttpResponse({
                status: method === 'DELETE' ? 204 : 200,
                body: synthetic,
                url: req.url,
              }),
            ),
          ),
        );
      }),
    );
  }

  return next(req);
};
