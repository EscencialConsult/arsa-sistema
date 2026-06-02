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

  // ── Sistema de revisores (bloque 3) ─────────────────────────────
  // Lista de jefes candidatos a revisar un descriptivo.
  //   nivel: undefined → backend default (1 nivel arriba)
  //          '0'|'1'|'2'|'3' → ese nivel exacto
  //          'TODOS' → toda la nómina (buscador total del modal)
  getJefesElegibles(legajoEmpleado: string, nivel?: string | number): Observable<any> {
    let params = new HttpParams()
      .set('action', 'getJefesElegibles')
      .set('legajo', legajoEmpleado);
    if (nivel !== undefined && nivel !== null && nivel !== '') {
      params = params.set('nivel', String(nivel));
    }
    return this.http.get(this.url, { params });
  }

  // Lista de revisores asignados a un descriptivo, con estado de firma.
  getRevisoresPorDescriptivo(legajoEmpleado: string): Observable<any> {
    const params = new HttpParams()
      .set('action', 'getRevisoresPorDescriptivo')
      .set('legajo', legajoEmpleado);
    return this.http.get(this.url, { params });
  }

  asignarRevisor(payload: { legajo_empleado: string; legajo_jefe: string; asignado_por: string }): Observable<any> {
    return this.post({ action: 'asignarRevisor', data: payload });
  }

  quitarRevisor(payload: { legajo_empleado: string; legajo_jefe: string }): Observable<any> {
    return this.post({ action: 'quitarRevisor', data: payload });
  }

  // ── Vista del jefe (bloque 4) ──────────────────────────────────
  // Devuelve los descriptivos asignados a este jefe que están en estado REVISIÓN JEFE.
  // El filtro lo aplica el backend — el frontend NO debe inferir nada.
  getNominaPorJefe(legajoJefe: string): Observable<any> {
    const params = new HttpParams()
      .set('action', 'getNominaPorJefe')
      .set('legajo_jefe', legajoJefe);
    return this.http.get(this.url, { params });
  }

  firmarRevision(payload: { legajo_empleado: string; legajo_jefe: string; observacion: string; rol: string }): Observable<any> {
    return this.post({ action: 'firmarRevision', data: payload });
  }

  // Historial: descriptivos que este jefe ya firmó.
  // Análogo a getNominaPorJefe pero filtrado por firmados, con fecha_firma.
  getDescriptivosFirmadosPorJefe(legajoJefe: string): Observable<any> {
    const params = new HttpParams()
      .set('action', 'getDescriptivosFirmadosPorJefe')
      .set('legajo_jefe', legajoJefe);
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