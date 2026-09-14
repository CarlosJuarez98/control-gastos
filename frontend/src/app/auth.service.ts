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
  private listenersListos = false;
  private huboMovimiento = false;
  private ultimoToque = 0;
  /** Evita ráfagas de /me (guard + heartbeat) en pocos segundos. */
  private sesionOkHasta = 0;
  private readonly toqueMinMs = 60_000;

  get autenticado(): boolean {
    return !!this.usuario;
  }

  get esAdmin(): boolean {
    return (this.rol || '').toUpperCase() === 'ADMIN';
  }

  /**
   * Listeners de actividad: cada movimiento (clic, tecla, scroll…) marca la sesión
   * para renovar el timeout de 20 min en el servidor. Sin movimiento, caduca.
   */
  initSesionViva(): void {
    if (this.listenersListos || typeof window === 'undefined') return;
    this.listenersListos = true;
    const marcar = () => {
      this.huboMovimiento = true;
      if (Date.now() - this.ultimoToque >= this.toqueMinMs) {
        this.programarToque(0);
      }
    };
    window.addEventListener('click', marcar, { passive: true });
    window.addEventListener('keydown', marcar, { passive: true });
    window.addEventListener('pointerdown', marcar, { passive: true });
    window.addEventListener('touchstart', marcar, { passive: true });
    window.addEventListener('scroll', marcar, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.huboMovimiento = true;
        this.programarToque(0);
      }
    });
    window.setInterval(() => {
      if (!this.huboMovimiento) return;
      if (Date.now() - this.ultimoToque < this.toqueMinMs) return;
      this.programarToque(0);
    }, 15_000);
  }

  me(): Observable<boolean> {
    if (this.usuario && Date.now() < this.sesionOkHasta) {
      return of(true);
    }
    if (this.meInflight) {
      return this.meInflight;
    }
    this.meInflight = this.consultarServidor().pipe(
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
          this.marcarToqueOk();
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
      tap(() => this.irALogin()),
      catchError(() => {
        this.irALogin();
        return of(null);
      }),
    );
  }

  /** Limpia estado local (p. ej. 401 / sesión expirada). */
  limpiar(): void {
    this.usuario = null;
    this.rol = null;
    this.meInflight = null;
    this.sesionOkHasta = 0;
  }

  private programarToque(delayMs: number): void {
    window.setTimeout(() => this.tocarSesion(), delayMs);
  }

  private tocarSesion(): void {
    this.huboMovimiento = false;
    if (this.router.url.startsWith('/login') && !this.usuario) {
      return;
    }
    this.ultimoToque = Date.now();
    this.consultarServidor().subscribe({
      next: (ok) => {
        if (!ok && !this.offline.esOffline()) {
          this.irALogin();
        }
      },
    });
  }

  private consultarServidor(): Observable<boolean> {
    return this.http.get<AuthMe>(`${this.base}/me`, { withCredentials: true }).pipe(
      tap((res) => this.aplicarSesion(res)),
      map((res) => !!res.autenticado),
      tap((ok) => {
        if (ok) this.marcarToqueOk();
      }),
      catchError((err) => {
        const redCaida = err?.status === 0 || this.offline.esOffline();
        if (!redCaida) {
          this.limpiar();
          void this.offline.limpiarSesion();
          return of(false);
        }
        return from(this.offline.leerSesion()).pipe(
          map((cached) => {
            if (cached?.autenticado && cached.usuario) {
              this.usuario = cached.usuario;
              this.rol = cached.rol || 'USER';
              return true;
            }
            this.limpiar();
            return false;
          }),
        );
      }),
    );
  }

  private marcarToqueOk(): void {
    this.ultimoToque = Date.now();
    this.sesionOkHasta = Date.now() + 8_000;
  }

  private irALogin(): void {
    this.limpiar();
    void this.offline.limpiarSesion();
    if (!this.router.url.startsWith('/login')) {
      void this.router.navigateByUrl('/login', { replaceUrl: true });
    }
  }

  private aplicarSesion(res: AuthMe): void {
    if (!res.autenticado) {
      this.limpiar();
      void this.offline.limpiarSesion();
      return;
    }
    this.usuario = res.usuario ?? null;
    this.rol = res.rol ?? 'USER';
    if (this.usuario) {
      void this.offline.guardarSesion(this.usuario, this.rol || 'USER');
    }
  }
}
