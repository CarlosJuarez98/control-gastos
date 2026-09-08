import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../api.service';
import { ConfirmDialogService } from '../../confirm-dialog.service';
import { UsuarioAcceso } from '../../modelos';
import { sha256Hex } from '../../password-digest';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './usuarios.component.html',
  styleUrl: './usuarios.component.css',
})
export class UsuariosComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly confirmDlg = inject(ConfirmDialogService);

  items: UsuarioAcceso[] = [];
  error = '';
  ok = '';
  cargando = false;

  form = {
    usuario: '',
    password: '',
    rol: 'USER',
  };

  resetId: number | null = null;
  resetPassword = '';

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.api.usuarios().subscribe({
      next: (r) => (this.items = r),
      error: (e) => (this.error = e?.error?.error || 'No se pudieron cargar usuarios'),
    });
  }

  async crear(): Promise<void> {
    this.error = '';
    this.ok = '';
    if (!this.form.usuario.trim() || !this.form.password) {
      this.error = 'Usuario y contraseña son obligatorios';
      return;
    }
    this.cargando = true;
    try {
      const digest = await sha256Hex(this.form.password);
      this.api
        .crearUsuario({
          usuario: this.form.usuario.trim(),
          password: digest,
          rol: this.form.rol,
        })
        .subscribe({
          next: () => {
            this.cargando = false;
            this.ok = 'Usuario creado';
            this.form = { usuario: '', password: '', rol: 'USER' };
            this.cargar();
          },
          error: (e) => {
            this.cargando = false;
            this.error = e?.error?.error || 'No se pudo crear el usuario';
          },
        });
    } catch {
      this.cargando = false;
      this.error = 'No se pudo preparar la contraseña';
    }
  }

  async guardarPassword(u: UsuarioAcceso): Promise<void> {
    this.error = '';
    this.ok = '';
    if (this.resetId !== u.id || !this.resetPassword) {
      this.error = 'Escribe la nueva contraseña';
      return;
    }
    this.cargando = true;
    try {
      const digest = await sha256Hex(this.resetPassword);
      this.api.cambiarPasswordUsuario(u.id, digest).subscribe({
        next: () => {
          this.cargando = false;
          this.ok = `Contraseña actualizada para ${u.usuario}`;
          this.resetId = null;
          this.resetPassword = '';
        },
        error: (e) => {
          this.cargando = false;
          this.error = e?.error?.error || 'No se pudo cambiar la contraseña';
        },
      });
    } catch {
      this.cargando = false;
      this.error = 'No se pudo preparar la contraseña';
    }
  }

  async toggleActivo(u: UsuarioAcceso): Promise<void> {
    const accion = u.activo ? 'desactivar' : 'activar';
    const ok = await this.confirmDlg.ask(`¿Seguro que quieres ${accion} a “${u.usuario}”?`, {
      titulo: `${accion[0].toUpperCase()}${accion.slice(1)} usuario`,
      confirmarTexto: accion[0].toUpperCase() + accion.slice(1),
    });
    if (!ok) return;
    this.api.cambiarActivoUsuario(u.id, !u.activo).subscribe({
      next: () => {
        this.ok = `Usuario ${u.usuario} ${u.activo ? 'desactivado' : 'activado'}`;
        this.cargar();
      },
      error: (e) => (this.error = e?.error?.error || 'No se pudo cambiar el estado'),
    });
  }

  cambiarRol(u: UsuarioAcceso, rol: string): void {
    this.api.cambiarRolUsuario(u.id, rol).subscribe({
      next: () => {
        this.ok = `Rol de ${u.usuario} → ${rol}`;
        this.cargar();
      },
      error: (e) => (this.error = e?.error?.error || 'No se pudo cambiar el rol'),
    });
  }

  abrirReset(u: UsuarioAcceso): void {
    this.resetId = u.id;
    this.resetPassword = '';
    this.error = '';
    this.ok = '';
  }
}
