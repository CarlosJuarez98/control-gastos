import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders, HttpRequest } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  OfflineQueueItem,
  cacheDelete,
  cacheGet,
  cacheKeyFromUrl,
  cacheKeys,
  cacheSet,
  metaGet,
  metaSet,
  queueAdd,
  queueAll,
  queueCount,
  queueRemove,
} from './offline-db';

export type OfflineBanner = {
  modo: 'offline' | 'sync' | 'ok' | 'error';
  texto: string;
};

@Injectable({ providedIn: 'root' })
export class OfflineService {
  private readonly http = inject(HttpClient);

  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly pendientes = signal(0);
  readonly sincronizando = signal(false);
  readonly banner = signal<OfflineBanner | null>(null);
  readonly ultimoSyncOk = signal<number | null>(null);

  private syncLock: Promise<void> | null = null;
  private listenersListos = false;

  init(): void {
    if (this.listenersListos || typeof window === 'undefined') return;
    this.listenersListos = true;
    this.online.set(navigator.onLine);
    void this.refreshPendientes();

    window.addEventListener('online', () => {
      this.online.set(true);
      this.mostrar('ok', 'Conexión recuperada. Sincronizando…');
      void this.sincronizar();
    });
    window.addEventListener('offline', () => {
      this.online.set(false);
      this.mostrar('offline', 'Sin conexión. Puedes seguir usando la app; los cambios se guardan aquí.');
    });

    if (!navigator.onLine) {
      this.mostrar('offline', 'Sin conexión. Modo offline activo.');
    }
  }

  esOffline(): boolean {
    return !this.online();
  }

  async refreshPendientes(): Promise<void> {
    this.pendientes.set(await queueCount());
  }

  mostrar(modo: OfflineBanner['modo'], texto: string, ms = 4500): void {
    this.banner.set({ modo, texto });
    if (modo === 'offline') return;
    window.setTimeout(() => {
      const actual = this.banner();
      if (actual?.texto === texto) this.banner.set(null);
    }, ms);
  }

  ocultarBanner(): void {
    this.banner.set(null);
  }

  async guardarSesion(usuario: string, rol: string): Promise<void> {
    await metaSet('auth', { usuario, rol, autenticado: true, ts: Date.now() });
  }

  async leerSesion(): Promise<{ usuario: string; rol: string; autenticado: boolean } | null> {
    const s = await metaGet<{ usuario: string; rol: string; autenticado: boolean }>('auth');
    if (!s?.autenticado || !s.usuario) return null;
    return s;
  }

  async limpiarSesion(): Promise<void> {
    await metaSet('auth', null);
  }

  async guardarCache(url: string, body: unknown): Promise<void> {
    await cacheSet(cacheKeyFromUrl(url), { body, ts: Date.now() });
  }

  async leerCache<T>(url: string): Promise<T | undefined> {
    const hit = await cacheGet(cacheKeyFromUrl(url)) as { body: T } | undefined;
    return hit?.body;
  }

  async encolar(
    method: string,
    url: string,
    body: unknown,
  ): Promise<{ id: string; synthetic: unknown }> {
    const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const item: OfflineQueueItem = {
      id,
      method: method.toUpperCase(),
      url: cacheKeyFromUrl(url),
      body,
      createdAt: Date.now(),
    };
    await queueAdd(item);
    await this.refreshPendientes();
    const synthetic = await this.aplicarOptimistic(item);
    this.mostrar(
      'offline',
      `Guardado offline (${this.pendientes()} pendiente${this.pendientes() === 1 ? '' : 's'}). Se subirá al volver la red.`,
      6000,
    );
    return { id, synthetic };
  }

  async sincronizar(): Promise<void> {
    if (this.syncLock) return this.syncLock;
    if (!navigator.onLine) return;

    this.syncLock = this.correrSync().finally(() => {
      this.syncLock = null;
    });
    return this.syncLock;
  }

  private async correrSync(): Promise<void> {
    const items = await queueAll();
    if (!items.length) {
      await this.refreshPendientes();
      return;
    }

    this.sincronizando.set(true);
    this.mostrar('sync', `Sincronizando ${items.length} cambio${items.length === 1 ? '' : 's'}…`, 8000);

    let ok = 0;
    let fail = 0;
    for (const item of items) {
      try {
        await this.reproducir(item);
        await queueRemove(item.id);
        ok++;
        await this.refreshPendientes();
      } catch {
        fail++;
        // Detenerse para no desordenar dependencias
        break;
      }
    }

    this.sincronizando.set(false);
    await this.refreshPendientes();

    if (fail === 0 && ok > 0) {
      this.ultimoSyncOk.set(Date.now());
      this.mostrar('ok', `Sincronizado: ${ok} cambio${ok === 1 ? '' : 's'}. Recargando…`);
      await this.invalidarListasPrincipales();
      // IDs temporales offline → reales: recargar para alinear UI con servidor
      window.setTimeout(() => window.location.reload(), 600);
    } else if (fail > 0) {
      this.mostrar(
        'error',
        `Quedaron ${this.pendientes()} pendientes. Revisa la conexión e inténtalo de nuevo.`,
        8000,
      );
    }
  }

  private async reproducir(item: OfflineQueueItem): Promise<void> {
    const method = item.method.toUpperCase();
    const url = item.url;
    const headers = { 'X-Cg-Offline-Replay': '1' };
    if (method === 'DELETE') {
      await firstValueFrom(this.http.delete(url, { withCredentials: true, headers }));
      return;
    }
    if (method === 'POST') {
      await firstValueFrom(this.http.post(url, item.body ?? {}, { withCredentials: true, headers }));
      return;
    }
    if (method === 'PUT' || method === 'PATCH') {
      await firstValueFrom(
        this.http.request(method, url, { body: item.body ?? {}, withCredentials: true, headers }),
      );
      return;
    }
    throw new Error(`Método no soportado en cola: ${method}`);
  }

  /** Actualiza cachés de listas para que la UI vea el cambio al instante. */
  private async aplicarOptimistic(item: OfflineQueueItem): Promise<unknown> {
    const method = item.method.toUpperCase();
    const url = item.url;
    const body = (item.body && typeof item.body === 'object' ? { ...(item.body as object) } : {}) as Record<string, unknown>;

    // POST colección → append
    if (method === 'POST' && !/\/\d+(\/|$)/.test(url.replace(/\?.*$/, ''))) {
      const tempId = -Math.floor(Date.now() % 1_000_000_000);
      const created = { ...body, id: tempId, _offline: true };
      await this.patchListCache(url, (list) => [...list, created]);
      // Invalidar resumen / saldo agregados
      await this.borrarCachesQueEmpiecen('/api/resumen');
      return created;
    }

    // POST acción (marcar-cuota, movimientos)
    if (method === 'POST') {
      const tempId = -Math.floor(Date.now() % 1_000_000_000);
      const created = { ...body, id: body['id'] ?? tempId, _offline: true };
      if (url.includes('/movimientos')) {
        await this.patchListCache(url, (list) => [...list, created]);
      }
      await this.borrarCachesQueEmpiecen('/api/resumen');
      await this.borrarCachesQueEmpiecen('/api/saldo');
      await this.borrarCachesQueEmpiecen('/api/cuentas');
      return created;
    }

    // PUT entidad /:id
    const putMatch = url.match(/^(.*)\/(\d+)(?:\?.*)?$/);
    if ((method === 'PUT' || method === 'PATCH') && putMatch) {
      const collection = putMatch[1];
      const id = Number(putMatch[2]);
      const updated = { ...body, id, _offline: true };
      await this.patchListCache(collection, (list) =>
        list.map((row) => {
          const r = row as Record<string, unknown>;
          return Number(r['id']) === id ? { ...r, ...updated } : row;
        }),
      );
      // También cache de detalle
      await this.guardarCache(url, updated);
      await this.borrarCachesQueEmpiecen('/api/resumen');
      if (url.includes('/saldo')) await this.borrarCachesQueEmpiecen('/api/saldo');
      return updated;
    }

    // PUT colección (saldo, denominaciones)
    if (method === 'PUT') {
      await this.guardarCache(url, body);
      await this.borrarCachesQueEmpiecen('/api/saldo');
      await this.borrarCachesQueEmpiecen('/api/resumen');
      return body;
    }

    // DELETE
    if (method === 'DELETE') {
      const delMatch = url.match(/^(.*)\/(\d+)(?:\?.*)?$/);
      if (delMatch) {
        const collection = delMatch[1];
        const id = Number(delMatch[2]);
        // movimientos: /api/cuentas/X/movimientos/Y
        if (url.includes('/movimientos/')) {
          const movsUrl = url.replace(/\/\d+$/, '');
          await this.patchListCache(movsUrl, (list) =>
            list.filter((row) => Number((row as { id?: number }).id) !== id),
          );
        } else {
          await this.patchListCache(collection, (list) =>
            list.filter((row) => Number((row as { id?: number }).id) !== id),
          );
        }
        await cacheDelete(cacheKeyFromUrl(url));
      }
      await this.borrarCachesQueEmpiecen('/api/resumen');
      await this.borrarCachesQueEmpiecen('/api/saldo');
      return null;
    }

    return body;
  }

  private async patchListCache(
    listUrl: string,
    mutator: (list: unknown[]) => unknown[],
  ): Promise<void> {
    const key = cacheKeyFromUrl(listUrl.split('?')[0]);
    // Actualizar todas las variantes con query de esa colección
    const keys = await cacheKeys();
    const targets = keys.filter((k) => k === key || k.startsWith(`${key}?`));
    if (!targets.length) {
      // Crear caché base
      const next = mutator([]);
      await cacheSet(key, { body: next, ts: Date.now() });
      return;
    }
    for (const k of targets) {
      const hit = (await cacheGet(k)) as { body: unknown } | undefined;
      const list = Array.isArray(hit?.body) ? hit!.body : [];
      await cacheSet(k, { body: mutator(list as unknown[]), ts: Date.now() });
    }
  }

  private async borrarCachesQueEmpiecen(prefix: string): Promise<void> {
    const keys = await cacheKeys();
    for (const k of keys) {
      if (k.startsWith(prefix)) await cacheDelete(k);
    }
  }

  private async invalidarListasPrincipales(): Promise<void> {
    await this.borrarCachesQueEmpiecen('/api/');
  }

  /** Utilidad para tests / debug. */
  asHttpRequest(item: OfflineQueueItem): HttpRequest<unknown> {
    return new HttpRequest(item.method, item.url, item.body, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}
