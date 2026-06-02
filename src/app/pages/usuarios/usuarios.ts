import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../services/api';

interface Usuario {
  legajo: string;
  usuario: string;
  password: string;
  nombre: string;
  email: string;
  rol: string;
  activo: string;
}

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.css',
})
export class Usuarios implements OnInit {

  usuarios: Usuario[] = [];
  filtrados: Usuario[] = [];
  cargando = true;
  error = '';
  busqueda = '';
  filtroRol = '';
  filtroActivo = '';

  modalAbierto = false;
  modoEdicion = false;
  guardando = false;
  errorModal = '';

  form: Usuario = this.formVacio();

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.cargar();
  }

  // Rol del usuario logueado. Lo usamos para esconderle los admins a RRHH
  // (defensa contra escalation: RRHH no puede ver ni editar cuentas admin).
  private get rolLogueado(): string {
    try {
      return (JSON.parse(localStorage.getItem('usuario') || '{}').rol || '').toLowerCase();
    } catch { return ''; }
  }

  async cargar() {
    this.cargando = true;
    this.error = '';
    try {
      const data = await firstValueFrom(this.api.leerTabla('Usuarios'));
      const todos = (data?.data as any[]) || [];
      // RRHH no ve a los admins. Admin sí ve a todos (incluyendo otros admin).
      this.usuarios = this.rolLogueado === 'rrhh'
        ? todos.filter(u => String(u.rol || '').toLowerCase() !== 'admin')
        : todos;
      this.filtrar();
    } catch (e) {
      this.error = 'Error al cargar usuarios.';
    } finally {
      this.cargando = false;
    }
  }

  filtrar() {
    let lista = [...this.usuarios];
    const b = this.busqueda.toLowerCase();
    if (b) {
      lista = lista.filter(u =>
        u.nombre?.toLowerCase().includes(b) ||
        u.usuario?.toLowerCase().includes(b) ||
        u.legajo?.toString().includes(b)
      );
    }
    if (this.filtroRol) lista = lista.filter(u => u.rol === this.filtroRol);
    if (this.filtroActivo) lista = lista.filter(u => u.activo === this.filtroActivo);
    this.filtrados = lista;
  }

  abrirNuevo() {
    this.form = this.formVacio();
    this.modoEdicion = false;
    this.errorModal = '';
    this.modalAbierto = true;
  }

  abrirEditar(u: Usuario) {
    this.form = { ...u };
    this.modoEdicion = true;
    this.errorModal = '';
    this.modalAbierto = true;
  }

  cerrarModal() {
    this.modalAbierto = false;
  }

  guardar() {
    if (!this.form.legajo || !this.form.usuario || !this.form.rol) {
      this.errorModal = 'Legajo, usuario y rol son obligatorios.';
      return;
    }
    if (!this.modoEdicion && !this.form.password) {
      this.errorModal = 'La contraseña es obligatoria para usuarios nuevos.';
      return;
    }
    this.guardando = true;
    this.errorModal = '';
    const action = this.modoEdicion ? 'updateUsuario' : 'createUsuario';

    // Disparar el guardado sin esperar respuesta (Apps Script no devuelve JSON parseable via POST)
    this.api.post({ action, data: this.form }).subscribe({ error: () => {} });

    // Cerrar modal después de 2 segundos — tiempo suficiente para que Sheets procese
    setTimeout(() => {
      this.guardando = false;
      this.cerrarModal();
      this.cargar();
    }, 2000);
  }

  async toggleActivo(u: Usuario) {
    const nuevoEstado = u.activo === 'SI' ? 'NO' : 'SI';
    try {
      await firstValueFrom(this.api.post({ action: 'updateUsuario', data: { ...u, activo: nuevoEstado } }));
      u.activo = nuevoEstado;
    } catch (e) {
      // silencioso
    }
  }

  formVacio(): Usuario {
    return { legajo: '', usuario: '', password: '', nombre: '', email: '', rol: 'empleado', activo: 'SI' };
  }

  get rolesDisponibles() {
    // Anti-escalation: RRHH no puede crear ni promover a alguien a admin.
    // Admin sí puede asignar cualquier rol.
    return this.rolLogueado === 'rrhh'
      ? ['rrhh', 'gerente', 'empleado']
      : ['admin', 'rrhh', 'gerente', 'empleado'];
  }

  get totalActivos() { return this.usuarios.filter(u => u.activo === 'SI').length; }
  get totalInactivos() { return this.usuarios.filter(u => u.activo === 'NO').length; }
}