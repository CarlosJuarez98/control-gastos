import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, tap } from 'rxjs';

export interface AuthMe {
  autenticado: boolean;
  usuario?: string;
  rol?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = '/api/auth';

  usuario: string | null = null;
  rol: string | null = null;

  get autenticado(): boolean {
    return !!this.usuario;
  }

  get esAdmin(): boolean {
    return (this.rol || '').toUpperCase() === 'ADMIN';
  }

  me(): Observable<boolean> {
    return this.http.get<AuthMe>(`${this.base}/me`, { withCredentials: true }).pipe(
      tap((res) => this.aplicarSesion(res)),
      map((res) => !!res.autenticado),
      catchError(() => {
        this.limpiar();
        return of(false);
      }),
    );
  }

  login(usuario: string, password: string): Observable<AuthMe> {
    return this.http
      .post<AuthMe>(`${this.base}/login`, { usuario, password }, { withCredentials: true })
      .pipe(
        tap((res) => {
          this.aplicarSesion({ ...res, autenticado: true, usuario: res.usuario ?? usuario });
        }),
      );
  }

  logout(): Observable<unknown> {
    return this.http.post(`${this.base}/logout`, {}, { withCredentials: true }).pipe(
      tap(() => {
        this.limpiar();
        void this.router.navigateByUrl('/login');
      }),
      catchError(() => {
        this.limpiar();
        void this.router.navigateByUrl('/login');
        return of(null);
      }),
    );
  }

  private aplicarSesion(res: AuthMe): void {
    if (!res.autenticado) {
      this.limpiar();
      return;
    }
    this.usuario = res.usuario ?? null;
    this.rol = res.rol ?? 'USER';
  }

  private limpiar(): void {
    this.usuario = null;
    this.rol = null;
  }
}
