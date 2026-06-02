import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
  encapsulation: ViewEncapsulation.None
})
export class LoginComponent {
  usuario = '';
  password = '';
  mostrarPassword = false;
  error = '';
  cargando = false;

  constructor(private router: Router, private api: ApiService) {}

  ingresar() {
    if (!this.usuario || !this.password) {
      this.error = 'Completá usuario y contraseña';
      return;
    }
    this.cargando = true;
    this.error = '';

    // Cascada: primero pruebo como admin/rrhh/gerente (busca por columna `usuario`).
    // Si falla, pruebo como empleado (busca por `legajo`). Si ambos fallan, mensaje único.
    this.api.login(this.usuario, this.password).subscribe({
      next: (res) => {
        if (res.ok) {
          this.entrar(res.data);
        } else {
          this.probarComoEmpleado();
        }
      },
      error: () => this.probarComoEmpleado(),
    });
  }

  private probarComoEmpleado(): void {
    this.api.loginEmpleado(this.usuario, this.password).subscribe({
      next: (res) => {
        this.cargando = false;
        if (res.ok) {
          this.entrar(res.data);
        } else {
          // Mensaje único, no revela cuál falló (anti-enumeration).
          this.error = 'Usuario o contraseña incorrectos';
        }
      },
      error: () => {
        this.cargando = false;
        this.error = 'Error de conexión. Intentá de nuevo.';
      }
    });
  }

  private entrar(data: any): void {
    this.cargando = false;
    localStorage.setItem('rol', data.rol);
    localStorage.setItem('usuario', JSON.stringify(data));
    const rol = (data.rol || '').toLowerCase();
    // Cada rol arranca en su pantalla útil:
    //   empleado → su propio descriptivo
    //   gerente  → relevamiento (no tiene Dashboard en el menú)
    //   admin/rrhh → dashboard
    const landing = rol === 'empleado' ? '/mi-descriptivo'
                  : rol === 'gerente'  ? '/relevamiento'
                  : '/dashboard';
    this.router.navigate([landing]);
  }

}