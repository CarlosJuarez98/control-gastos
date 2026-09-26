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
  /** Mínimo entre heartbeats por movimiento (renueva los 20 min en servidor). */
  private readonly toqueMinMs = 45_000;
  /** Revisa caducidad aunque no haya clic (para mandar a login al vencer). */
  private readonly chequeoCaducidadMs = 60_000;
  private yendoALogin = false;

  get autenticado(): boolean {
    return !!this.usuario;
  }

  get esAdmin(): boolean {
    return (this.rol || '').toUpperCase() === 'ADMIN';
  }

  /**
   * Listeners de actividad: cada movimiento (clic, tecla, scroll…) marca la sesión
   * para renovar el timeout de 20 min en el servidor. Sin movimiento, caduca.
   * Además, un chequeo periódico fuerza /login si la sesión ya murió.
   */
  initSesionViva(): void {
    if (this.listenersListos || typeof window === 'undefined') return;
    this.listenersListos = true;
    const marcar = () => {
      if (!this.usuario && this.router.url.startsWith('/login')) return;
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
    // Renueva por actividad (máx. cada ~45s de toques)
    window.setInterval(() => {
      if (!this.huboMovimiento) return;
      if (Date.now() - this.ultimoToque < this.toqueMinMs) return;
      this.programarToque(0);
    }, 15_000);
    // Si la sesión ya caducó en servidor, manda a login aunque nadie toque
    window.setInterval(() => this.verificarCaducidad(), this.chequeoCaducidadMs);
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

  login(usuario: string, password: string, recordar = false): Observable<AuthMe> {
    return this.http
      .post<AuthMe>(`${this.base}/login`, { usuario, password, recordar }, { withCredentials: true })
      .pipe(
        tap((res) => {
          this.yendoALogin = false;
          this.aplicarSesion({ ...res, autenticado: true, usuario: res.usuario ?? usuario });
          this.marcarToqueOk();
        }),
        switchMap((res) =>
          from(this.offline.guardarSesion(res.usuario ?? usuario, res.rol || 'USER')).pipe(map(() => res)),
        ),
      );
  }

  cambiarMiPassword(actual: string, nueva: string): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(
      `${this.base}/password`,
      { actual, nueva },
      { withCredentials: true },
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
    this.huboMovimiento = false;
  }

  /** Arranque: sin sesión válida → solo login. */
  asegurarLoginSiNoHaySesion(ok: boolean): void {
    if (ok) return;
    this.irALogin();
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

  private verificarCaducidad(): void {
    if (!this.usuario) return;
    if (this.offline.esOffline()) return;
    if (this.router.url.startsWith('/login')) return;
    this.consultarServidor(true).subscribe({
      next: (ok) => {
        if (!ok) this.irALogin();
      },
    });
  }

  /**
   * @param forzarIgnorarCache si true, no usa el atajo sesionOkHasta (chequeo de caducidad).
   */
  private consultarServidor(forzarIgnorarCache = false): Observable<boolean> {
    if (!forzarIgnorarCache && this.usuario && Date.now() < this.sesionOkHasta) {
      return of(true);
    }
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
        // Solo sin red: permite seguir con la última sesión en este dispositivo
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
    if (this.yendoALogin) return;
    this.yendoALogin = true;
    this.limpiar();
    void this.offline.limpiarSesion();
    if (!this.router.url.startsWith('/login')) {
      void this.router.navigateByUrl('/login', { replaceUrl: true }).finally(() => {
        this.yendoALogin = false;
      });
    } else {
      this.yendoALogin = false;
    }
  }

  private aplicarSesion(res: AuthMe): void {
    if (!res.autenticado) {
      const habiaSesion = !!this.usuario;
      this.limpiar();
      void this.offline.limpiarSesion();
      // Sesión cerrada/caducada con red: no deja usar la app
      if (habiaSesion && !this.offline.esOffline()) {
        this.irALogin();
      }
      return;
    }
    this.yendoALogin = false;
    this.usuario = res.usuario ?? null;
    this.rol = res.rol ?? 'USER';
    if (this.usuario) {
      void this.offline.guardarSesion(this.usuario, this.rol || 'USER');
    }
  }
}
