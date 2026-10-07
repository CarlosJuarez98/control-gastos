import { Injectable, OnDestroy, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';

/**
 * Al entrar (o volver a primer plano) pregunta al SW si hay build nuevo.
 * Si appData.version remota es mayor, recarga sola — eso es el versionado.
 * El botón «Actualizar» queda como respaldo manual.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService implements OnDestroy {
  readonly updateDisponible = signal(false);
  readonly versionNueva = signal<string | null>(null);

  private reloading = false;
  private checking = false;

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'visible') void this.buscarActualizacion();
  };

  constructor(private readonly sw: SwUpdate) {
    if (!this.sw.isEnabled) return;

    this.sw.versionUpdates.subscribe((evt) => {
      if (evt.type === 'VERSION_READY') {
        this.evaluarVersionLista(evt);
      }
    });

    void this.buscarActualizacion();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  async buscarActualizacion(): Promise<void> {
    if (!this.sw.isEnabled || this.reloading || this.checking) return;
    this.checking = true;
    try {
      await this.sw.checkForUpdate();
    } catch {
      /* red / SW ocupado */
    } finally {
      this.checking = false;
    }
  }

  aplicarActualizacion(): void {
    if (this.reloading || !this.updateDisponible()) return;
    void this.recargarConNuevaVersion();
  }

  private evaluarVersionLista(evt: VersionReadyEvent): void {
    const actual = versionDe(evt.currentVersion?.appData);
    const nueva = versionDe(evt.latestVersion?.appData);

    const hayVersionNueva = !actual || (!!nueva && esVersionMayor(nueva, actual));
    if (!hayVersionNueva) return;

    this.updateDisponible.set(true);
    this.versionNueva.set(nueva);
    void this.recargarConNuevaVersion();
  }

  private async recargarConNuevaVersion(): Promise<void> {
    if (this.reloading) return;
    this.reloading = true;
    try {
      await this.sw.activateUpdate();
    } catch {
      /* igual recarga */
    }
    document.location.reload();
  }
}

function versionDe(appData: unknown): string | null {
  if (!appData || typeof appData !== 'object') return null;
  const v = (appData as { version?: unknown }).version;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function esVersionMayor(nueva: string, actual: string): boolean {
  const a = nueva.split('.').map((x) => parseInt(x, 10) || 0);
  const b = actual.split('.').map((x) => parseInt(x, 10) || 0);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}
