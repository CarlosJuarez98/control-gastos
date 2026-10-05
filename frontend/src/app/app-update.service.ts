import { Injectable, OnDestroy } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/**
 * En nube el Service Worker cachea el shell. Sin esto, tras un deploy hay que
 * borrar datos del sitio en cada celular/PC. Aquí se detecta versión nueva y
 * se recarga; el botón fuerza limpieza si quedó atascado.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService implements OnDestroy {
  private reloading = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'visible') void this.buscarActualizacion();
  };

  constructor(private readonly sw: SwUpdate) {
    if (!this.sw.isEnabled) return;

    this.sw.versionUpdates.subscribe((evt) => {
      if (evt.type === 'VERSION_READY') {
        this.recargar();
      }
    });

    void this.buscarActualizacion();
    this.timer = setInterval(() => void this.buscarActualizacion(), 5 * 60_000);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  ngOnDestroy(): void {
    if (this.timer != null) clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  async buscarActualizacion(): Promise<void> {
    if (!this.sw.isEnabled || this.reloading) return;
    try {
      await this.sw.checkForUpdate();
    } catch {
      /* red / SW ocupado */
    }
  }

  async forzarRefresh(): Promise<void> {
    if (this.reloading) return;
    if (this.sw.isEnabled) {
      try {
        const hay = await this.sw.checkForUpdate();
        if (hay) {
          this.recargar();
          return;
        }
      } catch {
        /* sigue a limpieza */
      }
    }
    await this.limpiarCachesYRecargar();
  }

  private async limpiarCachesYRecargar(): Promise<void> {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch {
      /* igual recargamos */
    }
    this.recargar();
  }

  private recargar(): void {
    if (this.reloading) return;
    this.reloading = true;
    document.location.reload();
  }
}
