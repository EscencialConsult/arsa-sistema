import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, from } from 'rxjs';

// URL pública del sistema (cliente). Se usa para armar links que viajan
// fuera de la app (ej. el link al login que se manda al empleado por WhatsApp).
// Cuando ARSA pase a dominio propio, cambiar solo esta línea.
export const APP_URL = 'https://arsa-sistema-gestion-personal.netlify.app';

@Injectable({ providedIn: 'root' })
export class ApiService {

  private url = 'https://script.google.com/macros/s/AKfycbzfZuxFDewRwu49fKyXEJvK4Vk55pJLrPg1tf2_XnA9othbql46_H8FduY_4LdOn9Ii/exec';

  constructor(private http: HttpClient) { }

  login(usuario: string, password: string): Observable<any> {
    const params = new HttpParams()
      .set('action', 'login')
      .set('usuario', usuario)
      .set('password', password);
    return this.http.get(this.url, { params });
  }

  // Login del empleado por legajo. El frontend prueba primero login() y si falla
  // cae acá — el input "Usuario" acepta cualquier cosa, el sistema decide.
  loginEmpleado(legajo: string, password: string): Observable<any> {
    const params = new HttpParams()
      .set('action', 'loginEmpleado')
      .set('legajo', legajo)
      .set('password', password);
    return this.http.get(this.url, { params });
  }

  // Datos del descriptivo para la pantalla /mi-descriptivo del empleado.
  // No incluye campos privados (transcripción/eneagrama/observación interna ni link definitivo).
  getMiDescriptivo(legajo: string): Observable<any> {
    const params = new HttpParams()
      .set('action', 'getMiDescriptivo')
      .set('legajo', legajo);
    return this.http.get(this.url, { params });
  }

  stats(): Observable<any> {
    const params = new HttpParams().set('action', 'stats');
    return this.http.get(this.url, { params });
  }

  statsHistorico(): Observable<any> {
    const params = new HttpParams().set('action', 'statsHistorico');
    return this.http.get(this.url, { params });
  }

  leerTabla(tab: string): Observable<any> {
    const rol = localStorage.getItem('rol') || '';
    const params = new HttpParams()
      .set('action', 'read')
      .set('tab', tab)
      .set('rol', rol);
    return this.http.get(this.url, { params });
  }

  getEmpleado(legajo: string): Observable<any> {
    const params = new HttpParams()
      .set('action', 'getEmpleado')
      .set('legajo', legajo);
    return this.http.get(this.url, { params });
  }

  // POST real para escrituras — evita el 302 que genera doGet en Apps Script
  post(body: any): Observable<any> {
    const promise = fetch(this.url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body)
    }).then(r => r.json());
    return from(promise);
  }
}