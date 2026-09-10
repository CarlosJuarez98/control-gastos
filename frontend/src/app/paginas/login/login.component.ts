import { AfterViewInit, Component, ElementRef, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../auth.service';
import { sha256Hex } from '../../password-digest';
import { EnterAvanceDirective } from '../../enter-avance.directive';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, EnterAvanceDirective],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent implements AfterViewInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  @ViewChild('usuarioInput') usuarioInput?: ElementRef<HTMLInputElement>;

  usuario = '';
  password = '';
  error = '';
  cargando = false;
  verClave = false;

  get puedeEntrar(): boolean {
    return !!(this.usuario || '').trim() && !!(this.password || '');
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => this.usuarioInput?.nativeElement.focus());
  }

  async entrar(): Promise<void> {
    if (!this.puedeEntrar || this.cargando) return;
    this.error = '';
    this.cargando = true;
    try {
      const digest = await sha256Hex(this.password);
      this.auth.login(this.usuario.trim(), digest).subscribe({
        next: () => {
          this.cargando = false;
          this.password = '';
          void this.router.navigateByUrl('/resumen');
        },
        error: () => {
          this.cargando = false;
          this.error = 'Usuario o contraseña incorrectos';
        },
      });
    } catch {
      this.cargando = false;
      this.error = 'No se pudo preparar el acceso';
    }
  }
}
