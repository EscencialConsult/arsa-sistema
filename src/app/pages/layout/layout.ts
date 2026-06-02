import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './layout.html',
  styleUrl: './layout.css',
  encapsulation: ViewEncapsulation.None
})
export class LayoutComponent implements OnInit {

  usuario: any = null;
  rutaActual = '';
  notifVisible = false;
  notifMsg = '';
  modalSalir = false;
  // Drawer móvil — cerrado por defecto. En desktop la sidebar es siempre
  // visible y este flag se ignora vía CSS (display: none del overlay).
  menuAbierto = false;

  menuAdmin = [
    {
      nombre: 'General',
      items: [
        { label: 'Dashboard', ruta: '/dashboard', bloqueado: false, icon: 'dashboard' }
      ]
    },
    {
      nombre: 'Gestión',
      items: [
        { label: 'Nómina',         ruta: '/nomina',         bloqueado: false, icon: 'nomina' },
        { label: 'Relevamiento',   ruta: '/relevamiento',   bloqueado: false, icon: 'relevamiento' },
        { label: 'Descriptivos',   ruta: '/descriptivos',   bloqueado: false, icon: 'descriptivos' },
        { label: 'Procedimientos', ruta: '/procedimientos', bloqueado: false, icon: 'procedimientos' },
      ]
    },
    {
      nombre: 'Estructura',
      items: [
        { label: 'Organigrama', ruta: '/organigrama', bloqueado: false, icon: 'organigrama' }
      ]
    },
    {
      nombre: 'Sistema',
      items: [
        { label: 'Usuarios',     ruta: '/usuarios', bloqueado: false, icon: 'usuarios' },
        { label: 'Capacitación', ruta: '',          bloqueado: true,  icon: 'capacitacion' }
      ]
    }
  ];

  menuRrhh = [
    {
      nombre: 'General',
      items: [
        { label: 'Dashboard', ruta: '/dashboard', bloqueado: false, icon: 'dashboard' }
      ]
    },
    {
      nombre: 'Gestión',
      items: [
        { label: 'Nómina',       ruta: '/nomina',       bloqueado: false, icon: 'nomina' },
        { label: 'Relevamiento', ruta: '/relevamiento', bloqueado: false, icon: 'relevamiento' },
        { label: 'Descriptivos', ruta: '/descriptivos', bloqueado: false, icon: 'descriptivos' },
      ]
    },
    {
      nombre: 'Estructura',
      items: [
        { label: 'Organigrama', ruta: '/organigrama', bloqueado: false, icon: 'organigrama' }
      ]
    }
  ];

  menuGerente = [
    {
      nombre: 'Mi Puesto',
      items: [
        { label: 'Mi descriptivo', ruta: '/mi-descriptivo', bloqueado: false, icon: 'descriptivos' }
      ]
    },
    {
      nombre: 'General',
      items: [
        { label: 'Dashboard', ruta: '/dashboard', bloqueado: false, icon: 'dashboard' }
      ]
    },
    {
      nombre: 'Gestión',
      items: [
        { label: 'Nómina',       ruta: '/nomina',       bloqueado: false, icon: 'nomina' },
        { label: 'Relevamiento', ruta: '/relevamiento', bloqueado: false, icon: 'relevamiento' },
        { label: 'Descriptivos', ruta: '/descriptivos', bloqueado: false, icon: 'descriptivos' },
      ]
    }
  ];

  menuEmpleado = [
    {
      nombre: 'Mi Puesto',
      items: [
        { label: 'Mi Descriptivo', ruta: '/mi-descriptivo', bloqueado: false, icon: 'descriptivos' }
      ]
    }
  ];

  seccionesMenu: any[] = [];

  constructor(private router: Router) {}

  ngOnInit() {
    const raw = localStorage.getItem('usuario');
    if (!raw) { this.router.navigate(['/login']); return; }
    this.usuario = JSON.parse(raw);

    // Redirigir empleado directo a su vista
    if (this.usuario.rol === 'empleado') {
      this.router.navigate(['/mi-descriptivo']);
      return;
    }

    // Construir menú según rol
    switch (this.usuario.rol) {
      case 'admin':   this.seccionesMenu = this.menuAdmin;   break;
      case 'rrhh':    this.seccionesMenu = this.menuRrhh;    break;
      case 'gerente': this.seccionesMenu = this.menuGerente; break;
      default:        this.seccionesMenu = this.menuAdmin;   break;
    }

    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd)
    ).subscribe((e: any) => {
      this.rutaActual = e.urlAfterRedirects;
    });
    this.rutaActual = this.router.url;
  }

  navegar(item: any) {
    if (item.bloqueado || !item.ruta) return;
    this.router.navigate([item.ruta]);
    this.cerrarMenu();
  }

  toggleMenu() { this.menuAbierto = !this.menuAbierto; }
  cerrarMenu() { this.menuAbierto = false; }

  pedirSalir()   { this.modalSalir = true; this.cerrarMenu(); }
  cancelarSalir() { this.modalSalir = false; }

  salir() {
    this.modalSalir = false;
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}