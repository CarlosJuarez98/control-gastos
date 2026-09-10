import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../api.service';
import { AuthService } from '../../auth.service';
import { ConfirmDialogService } from '../../confirm-dialog.service';
import { UsuarioAcceso } from '../../modelos';
import { sha256Hex } from '../../password-digest';
import { firstValueFrom } from 'rxjs';
import { EnterAvanceDirective } from '../../enter-avance.directive';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [FormsModule, EnterAvanceDirective],
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

  /** Actualizado en cada tecleo para que el botón reaccione siempre. */
  formCrearOk = false;
  formEditOk = false;

  ngOnInit(): void {
    this.cargar();
    this.refrescarCrearOk();
  }

  refrescarCrearOk(): void {
    this.formCrearOk = !!(this.form.usuario || '').trim() && !!this.form.password;
  }

  refrescarEditOk(u: UsuarioAcceso): void {
    const nombre = (this.editUsuario || '').trim();
    if (!nombre) {
      this.formEditOk = false;
      return;
    }
    const nombreCambio = nombre.toLowerCase() !== (u.usuario || '').toLowerCase();
    const claveCambio = !!this.editPassword;
    this.formEditOk = nombreCambio || claveCambio;
  }

  get puedeCrear(): boolean {
    return this.formCrearOk;
  }

  puedeGuardarEdicion(u: UsuarioAcceso): boolean {
    return this.editId === u.id && this.formEditOk;
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
    if (!this.puedeCrear) {
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
            this.refrescarCrearOk();
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
    this.refrescarEditOk(u);
  }

  cerrarEdicion(): void {
    this.editId = null;
    this.editUsuario = '';
    this.editPassword = '';
    this.formEditOk = false;
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
    if (!this.puedeDesactivar(u)) {
      this.error = this.tituloActivo(u);
      return;
    }
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

  /** Admins con sesión activa (pueden administrar la app). */
  adminsActivos(): number {
    return this.items.filter(
      (u) => u.activo && String(u.rol).toUpperCase() === 'ADMIN',
    ).length;
  }

  esUnicoAdminActivo(u: UsuarioAcceso): boolean {
    return (
      u.activo &&
      String(u.rol).toUpperCase() === 'ADMIN' &&
      this.adminsActivos() <= 1
    );
  }

  /** Pausar solo si no deja el sistema sin admin. */
  puedeDesactivar(u: UsuarioAcceso): boolean {
    if (!u.activo) return true;
    if (this.esUnicoAdminActivo(u)) return false;
    if (this.esYo(u)) return false;
    return true;
  }

  tituloActivo(u: UsuarioAcceso): string {
    if (!u.activo) return 'Activar';
    if (this.esUnicoAdminActivo(u)) {
      return 'No se puede pausar: es el único administrador';
    }
    if (this.esYo(u)) return 'No puedes pausar tu propio usuario';
    return 'Desactivar';
  }

  puedeQuitarAdmin(u: UsuarioAcceso): boolean {
    if (String(u.rol).toUpperCase() !== 'ADMIN') return true;
    if (this.esUnicoAdminActivo(u)) return false;
    if (this.esYo(u)) return false;
    return true;
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
