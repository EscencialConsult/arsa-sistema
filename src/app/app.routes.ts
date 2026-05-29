import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login';
import { LayoutComponent } from './pages/layout/layout';

function authGuard(): boolean {
  const raw = localStorage.getItem('usuario');
  if (!raw) { window.location.href = '/login'; return false; }
  return true;
}

function adminGuard(): boolean {
  const raw = localStorage.getItem('usuario');
  if (!raw) { window.location.href = '/login'; return false; }
  const rol = JSON.parse(raw).rol;
  if (rol !== 'admin') { window.location.href = '/dashboard'; return false; }
  return true;
}

function empleadoGuard(): boolean {
  const raw = localStorage.getItem('usuario');
  if (!raw) { window.location.href = '/login'; return false; }
  const rol = JSON.parse(raw).rol;
  if (rol === 'empleado') { window.location.href = '/mi-descriptivo'; return false; }
  return true;
}

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  // /mi-descriptivo va FUERA del Layout: el empleado no debe ver la sidebar
  // de admin ni la topbar — solo su pantalla limpia. Sin esto, el iframe
  // queda apretado a la derecha y la sidebar azul ocupa el resto.
  { path: 'mi-descriptivo', loadComponent: () => import('./pages/mi-descriptivo/mi-descriptivo').then(m => m.MiDescriptivo), canActivate: [authGuard] },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard',      loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard), canActivate: [empleadoGuard] },
      { path: 'nomina',         loadComponent: () => import('./pages/nomina/nomina').then(m => m.Nomina), canActivate: [empleadoGuard] },
      { path: 'relevamiento',   loadComponent: () => import('./pages/relevamiento/relevamiento').then(m => m.Relevamiento), canActivate: [empleadoGuard] },
      { path: 'descriptivos',   loadComponent: () => import('./pages/descriptivos/descriptivos').then(m => m.Descriptivos), canActivate: [empleadoGuard] },
      { path: 'procedimientos', loadComponent: () => import('./pages/procedimientos/procedimientos').then(m => m.Procedimientos), canActivate: [empleadoGuard] },
      { path: 'organigrama',    loadComponent: () => import('./pages/organigrama/organigrama').then(m => m.Organigrama), canActivate: [empleadoGuard] },
      { path: 'usuarios',       loadComponent: () => import('./pages/usuarios/usuarios').then(m => m.Usuarios), canActivate: [adminGuard] },
    ]
  },
  { path: '**', redirectTo: 'login' }
];