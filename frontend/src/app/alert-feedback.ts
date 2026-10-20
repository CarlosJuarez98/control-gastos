import { AlertDialogService } from './alert-dialog.service';

/**
 * Estado de mensaje ligado al modal auto-dismiss.
 * Usar como campo `error` / `ok` con get/set en el componente.
 */
export class AlertFeedback {
  private _valor = '';

  constructor(
    private readonly alerts: AlertDialogService,
    private readonly tipo: 'error' | 'ok' | 'aviso' = 'error',
  ) {}

  get valor(): string {
    return this._valor;
  }

  set valor(v: string) {
    const msg = String(v ?? '').trim();
    this._valor = msg;
    if (!msg) return;
    if (this.tipo === 'ok') this.alerts.ok(msg);
    else if (this.tipo === 'aviso') this.alerts.aviso(msg);
    else this.alerts.error(msg);
  }

  clear(): void {
    this._valor = '';
  }
}
