import { Injectable, OnDestroy, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';

/**
 * Detecta builds nuevos vía Service Worker + appData.version (ngsw-config).
 * El botón «Actualizar app» solo aparece si la versión remota es mayor.
 * No recarga sola ni limpia caches a lo bruto (eso volvía lenta la app).
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService implements OnDestroy {
  readonly updateDisponible = signal(false);
  readonly versionNueva = signal<string | null>(null);

  private reloading = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCheck = 0;
  private readonly minCheckMs = 15 * 60_000;
  private readonly intervalMs = 30 * 60_000;

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

    setTimeout(() => void this.buscarActualizacion(), 20_000);
    this.timer = setInterval(() => void this.buscarActualizacion(), this.intervalMs);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  ngOnDestroy(): void {
    if (this.timer != null) clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  async buscarActualizacion(): Promise<void> {
    if (!this.sw.isEnabled || this.reloading) return;
    const ahora = Date.now();
    if (this.lastCheck > 0 && ahora - this.lastCheck < this.minCheckMs) return;
    this.lastCheck = ahora;
    try {
      await this.sw.checkForUpdate();
    } catch {
      /* red / SW ocupado */
    }
  }

  aplicarActualizacion(): void {
    if (this.reloading || !this.updateDisponible()) return;
    this.reloading = true;
    document.location.reload();
  }

  private evaluarVersionLista(evt: VersionReadyEvent): void {
    const actual = versionDe(evt.currentVersion?.appData);
    const nueva = versionDe(evt.latestVersion?.appData);

    if (!actual) {
      this.updateDisponible.set(true);
      this.versionNueva.set(nueva);
      return;
    }
    if (nueva && esVersionMayor(nueva, actual)) {
      this.updateDisponible.set(true);
      this.versionNueva.set(nueva);
    }
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
