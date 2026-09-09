import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../api.service';
import { AuthService } from '../../auth.service';
import { ConfirmDialogService } from '../../confirm-dialog.service';
import { UsuarioAcceso } from '../../modelos';
import { sha256Hex } from '../../password-digest';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './usuarios.component.html',
  styleUrl: './usuarios.component.css',
})
export class UsuariosComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
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

  editId: number | null = null;
  editUsuario = '';
  editPassword = '';

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

  abrirEdicion(u: UsuarioAcceso): void {
    this.editId = u.id;
    this.editUsuario = u.usuario;
    this.editPassword = '';
    this.error = '';
    this.ok = '';
  }

  cerrarEdicion(): void {
    this.editId = null;
    this.editUsuario = '';
    this.editPassword = '';
  }

  async guardarEdicion(u: UsuarioAcceso): Promise<void> {
    this.error = '';
    this.ok = '';
    const nuevoNombre = this.editUsuario.trim();
    if (!nuevoNombre) {
      this.error = 'El nombre de usuario es obligatorio';
      return;
    }
    this.cargando = true;
    try {
      const nombreCambio = nuevoNombre.toLowerCase() !== u.usuario.toLowerCase();
      const claveCambio = !!this.editPassword;
      if (!nombreCambio && !claveCambio) {
        this.cargando = false;
        this.error = 'No hay cambios que guardar';
        return;
      }
      if (nombreCambio) {
        await firstValueFrom(this.api.cambiarNombreUsuario(u.id, nuevoNombre));
        if (this.auth.usuario?.toLowerCase() === u.usuario.toLowerCase()) {
          this.auth.usuario = nuevoNombre;
        }
      }
      if (claveCambio) {
        const digest = await sha256Hex(this.editPassword);
        await firstValueFrom(this.api.cambiarPasswordUsuario(u.id, digest));
      }
      this.cargando = false;
      this.ok = `Usuario actualizado: ${nuevoNombre}`;
      this.cerrarEdicion();
      this.cargar();
    } catch (e: unknown) {
      this.cargando = false;
      const err = e as { error?: { error?: string } };
      this.error = err?.error?.error || 'No se pudo guardar';
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

  esYo(u: UsuarioAcceso): boolean {
    return !!this.auth.usuario && this.auth.usuario.toLowerCase() === u.usuario.toLowerCase();
  }

  async eliminar(u: UsuarioAcceso): Promise<void> {
    this.error = '';
    this.ok = '';
    const ok = await this.confirmDlg.ask(`¿Eliminar al usuario “${u.usuario}”?`, {
      titulo: 'Eliminar usuario',
      confirmarTexto: 'Eliminar',
    });
    if (!ok) return;
    this.api.eliminarUsuario(u.id).subscribe({
      next: () => {
        this.ok = `Usuario ${u.usuario} eliminado`;
        if (this.editId === u.id) this.cerrarEdicion();
        this.cargar();
      },
      error: (e) => (this.error = e?.error?.error || 'No se pudo eliminar'),
    });
  }
}
