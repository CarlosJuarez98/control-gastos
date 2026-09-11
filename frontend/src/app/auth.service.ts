import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, from, map, of, shareReplay, switchMap, tap } from 'rxjs';
import { OfflineService } from './offline/offline.service';

export interface AuthMe {
  autenticado: boolean;
  usuario?: string;
  rol?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly offline = inject(OfflineService);
  private readonly base = '/api/auth';

  usuario: string | null = null;
  rol: string | null = null;

  /** Evita varias llamadas /me en paralelo al recargar. */
  private meInflight: Observable<boolean> | null = null;

  get autenticado(): boolean {
    return !!this.usuario;
  }

  get esAdmin(): boolean {
    return (this.rol || '').toUpperCase() === 'ADMIN';
  }

  me(): Observable<boolean> {
    if (this.usuario) {
      return of(true);
    }
    if (this.meInflight) {
      return this.meInflight;
    }
    this.meInflight = this.http.get<AuthMe>(`${this.base}/me`, { withCredentials: true }).pipe(
      tap((res) => this.aplicarSesion(res)),
      map((res) => !!res.autenticado),
      catchError(() =>
        from(this.offline.leerSesion()).pipe(
          map((cached) => {
            if (cached?.autenticado && cached.usuario) {
              this.usuario = cached.usuario;
              this.rol = cached.rol || 'USER';
              return true;
            }
            this.limpiar();
            return false;
          }),
        ),
      ),
      finalize(() => {
        this.meInflight = null;
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    return this.meInflight;
  }

  login(usuario: string, password: string): Observable<AuthMe> {
    return this.http
      .post<AuthMe>(`${this.base}/login`, { usuario, password }, { withCredentials: true })
      .pipe(
        tap((res) => {
          this.aplicarSesion({ ...res, autenticado: true, usuario: res.usuario ?? usuario });
        }),
        switchMap((res) =>
          from(this.offline.guardarSesion(res.usuario ?? usuario, res.rol || 'USER')).pipe(map(() => res)),
        ),
      );
  }

  actualizarPerfil(body: { usuario?: string; password?: string }): Observable<AuthMe> {
    return this.http.put<AuthMe>(`${this.base}/perfil`, body, { withCredentials: true }).pipe(
      tap((res) => this.aplicarSesion(res)),
      switchMap((res) => {
        if (res.autenticado && res.usuario) {
          return from(this.offline.guardarSesion(res.usuario, res.rol || 'USER')).pipe(map(() => res));
        }
        return of(res);
      }),
    );
  }

  logout(): Observable<unknown> {
    return this.http.post(`${this.base}/logout`, {}, { withCredentials: true }).pipe(
      tap(() => {
        this.limpiar();
        void this.offline.limpiarSesion();
        void this.router.navigateByUrl('/login');
      }),
      catchError(() => {
        this.limpiar();
        void this.offline.limpiarSesion();
        void this.router.navigateByUrl('/login');
        return of(null);
      }),
    );
  }

  /** Limpia estado local (p. ej. 401 / sesión expirada). */
  limpiar(): void {
    this.usuario = null;
    this.rol = null;
    this.meInflight = null;
  }

  private aplicarSesion(res: AuthMe): void {
    if (!res.autenticado) {
      this.limpiar();
      return;
    }
    this.usuario = res.usuario ?? null;
    this.rol = res.rol ?? 'USER';
    if (this.usuario) {
      void this.offline.guardarSesion(this.usuario, this.rol || 'USER');
    }
  }
}
