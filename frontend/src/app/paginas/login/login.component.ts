import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../auth.service';
import { sha256Hex } from '../../password-digest';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  usuario = 'admin';
  password = '';
  error = '';
  cargando = false;

  async entrar(): Promise<void> {
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
