import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api';
import {
  estadoClass as estadoClassShared,
  estadoLabel as estadoLabelShared,
  transicionesValidas,
  Transicion,
} from '../../shared/estados';

const FAMILIAS = [
  { code: 'OPA', name: 'Operaciones Agua' },
  { code: 'ADM', name: 'Administración' },
  { code: 'AYC', name: 'Operaciones A y C' },
  { code: 'EM', name: 'Electromecánica / Mant.' },
  { code: 'OPC', name: 'Operaciones Cloacas' },
  { code: 'TEC', name: 'Técnica / Planta' },
  { code: 'JEF', name: 'Jefatura de Servicio' },
  { code: 'CAP', name: 'Capataz' },
  { code: 'COM', name: 'Gestión Comercial' },
  { code: 'PROF', name: 'Profesional' },
  { code: 'GER', name: 'Gerencia / Subgerencia' },
  { code: 'OTR', name: 'Otros' },
  { code: 'PAS', name: 'Pasantía' },
];

const SEDES = [
  { code: 'BRC', name: 'Bariloche' }, { code: 'GRC', name: 'Gral. Roca' },
  { code: 'VDM', name: 'Viedma' }, { code: 'ALL', name: 'Allen' },
  { code: 'CAT', name: 'Catriel' }, { code: 'CHO', name: 'Choele Choel' },
  { code: '5ST', name: 'Cinco Saltos' }, { code: 'CPT', name: 'Cipolletti' },
  { code: 'FRO', name: 'Fernández Oro' }, { code: 'HUE', name: 'Ing. Huergo' },
  { code: 'RCO', name: 'Río Colorado' }, { code: 'SAO', name: 'S.A.O.' },
  { code: 'CNS', name: 'Gral. Conesa' }, { code: 'LGR', name: 'Las Grutas' },
  { code: 'SGR', name: 'Sierra Grande' }, { code: 'VAL', name: 'Valcheta' },
  { code: 'GEG', name: 'Gral. Enrique Godoy' }, { code: 'CRV', name: 'Cervantes' },
  { code: 'CHK', name: 'Chichinales' }, { code: 'CCO', name: 'Clte. Cordero' },
  { code: 'CBE', name: 'Cnel. Belisle' }, { code: 'COM', name: 'Comallo' },
  { code: 'CNI', name: 'Cona Niyeu' }, { code: 'DAR', name: 'Darwin' },
  { code: 'ELB', name: 'El Bolsón' }, { code: 'ELC', name: 'El Cóndor' },
  { code: 'GMI', name: 'Guardia Mitre' }, { code: 'LPE', name: 'Lago Pellegrini' },
  { code: 'LBE', name: 'Los Berros' }, { code: 'LME', name: 'Los Menucos' },
  { code: 'MQC', name: 'Maquinchao' }, { code: 'PLP', name: 'Paraje Las Perlas' },
  { code: 'PIL', name: 'Pilcaniyeu' }, { code: 'POM', name: 'Pomona' },
  { code: 'PSE', name: 'Puerto S.A.E.' }, { code: 'RME', name: 'Ramos Mexía' },
  { code: 'RCH', name: 'Río Chico' }, { code: 'SJV', name: 'San Javier' },
  { code: 'SCO', name: 'Sierra Colorada' }, { code: 'VRE', name: 'Villa Regina' },
  { code: 'NOR', name: 'Ñorquinco' }, { code: 'VDC', name: 'Viedma Central' },
  { code: 'SAV', name: 'Subg. Alto Valle' }, { code: 'SVE', name: 'Subg. Alto Valle Este' },
  { code: 'SAN', name: 'Subg. Andina' }, { code: 'SAT', name: 'Subg. Atlántica' },
  { code: 'SES', name: 'Subg. Este' },
];

@Component({
  selector: 'app-relevamiento',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './relevamiento.html',
  styleUrl: './relevamiento.css'
})
export class Relevamiento implements OnInit {

  // ── Signals ──────────────────────────────────────────────────────
  empleados = signal<any[]>([]);
  cargando = signal(false);
  errorMsg = signal('');

  // ── Filtros ──────────────────────────────────────────────────────
  busqueda = '';
  filtroSede = '';
  filtroFamilia = '';
  filtroEstado = '';

  // ── Dropdowns ────────────────────────────────────────────────────
  listaFamilias = FAMILIAS;
  listaSedes = SEDES;

  // ── Computed ─────────────────────────────────────────────────────
  hayResultados = computed(() => this.empleados().length > 0);

  // ── Rol desde localStorage ────────────────────────────────────────
  rolUsuario = '';

  // Admin y RRHH ven campos privados (transcripción, eneagrama, observación)
  get esPrivilegiado(): boolean {
    return this.rolUsuario === 'admin' || this.rolUsuario === 'rrhh';
  }

  // Solo Admin puede cambiar estados, cargar links y editar privados
  get puedeEditar(): boolean {
    return this.rolUsuario === 'admin';
  }

  // RRHH puede ver links pero no editarlos
  get puedeVerLinks(): boolean {
    return this.rolUsuario === 'admin' || this.rolUsuario === 'rrhh';
  }

  // Badge de rol para mostrar en el header
  get labelRol(): string {
    const labels: Record<string, string> = {
      admin: 'Administrador',
      rrhh: 'RRHH',
      gerente: 'Gerente',
    };
    return labels[this.rolUsuario] || this.rolUsuario;
  }

  // ── UI ────────────────────────────────────────────────────────────
  filaAbierta = '';
  guardadoMsg = '';

  // ── Stats ─────────────────────────────────────────────────────────
  stats = {
    total: 860,
    pendiente: 0,
    entrevistado: 0,
    revision: 0,      // = revColab + revJefe (agrupado en la card "En revisión")
    revColab: 0,
    revJefe: 0,
    presentadoRrhh: 0,
    sellado: 0,
    observado: 0,
    fueraFlujo: 0,
    avance: 0,        // sellado / (total - fueraFlujo)
  };

  // ── Modal link ────────────────────────────────────────────────────
  modalLink: {
    abierto: boolean;
    tipo: 'borrador' | 'definitivo';
    empleado: any;
    url: string;
  } = { abierto: false, tipo: 'borrador', empleado: null, url: '' };

  // ── Modal avance (con nota opcional para el próximo revisor) ─────
  modalAvance: {
    abierto: boolean;
    empleado: any;
    destino: string;
    texto: string;
  } = { abierto: false, empleado: null, destino: '', texto: '' };

  // ── Internos ──────────────────────────────────────────────────────
  private todosLosEmpleados: any[] = [];

  constructor(private api: ApiService) { }

  // ─────────────────────────────────────────────────────────────────
  ngOnInit() {
    const raw = localStorage.getItem('usuario');
    if (raw) {
      const u = JSON.parse(raw);
      this.rolUsuario = (u.rol || '').toLowerCase();
    }
    if (this.rolUsuario === 'rrhh') {
      this.filtroEstado = 'PRESENTADO A RRHH';
      this.buscar();
    }
    this.cargarStats();
  }

  get hayFiltro(): boolean {
    return !!(this.busqueda || this.filtroSede || this.filtroFamilia || this.filtroEstado);
  }

  // ── Helpers de estado ─────────────────────────────────────────────
  estaSellado(emp: any): boolean {
    return emp.estado?.toUpperCase() === 'SELLADO' && !!emp.linkDefinitivo;
  }

  definitivoPendiente(emp: any): boolean {
    return emp.estado?.toUpperCase() === 'OBSERVADO' && !emp.linkDefinitivo;
  }

  definitivoSinAprobar(emp: any): boolean {
    return !!emp.linkDefinitivo && emp.estado?.toUpperCase() !== 'SELLADO';
  }

  tieneObservacion(emp: any): boolean {
    return emp.estado?.toUpperCase() === 'OBSERVADO' && !!emp.observacion;
  }

  // ── Transiciones disponibles por fila ─────────────────────────────
  transicionesPermitidas(emp: any): Transicion[] {
    return transicionesValidas(emp.estado, this.rolUsuario);
  }

  hayTransiciones(emp: any): boolean {
    if (this.rolUsuario !== 'admin' && this.rolUsuario !== 'rrhh') return false;
    return this.transicionesPermitidas(emp).length > 0;
  }

  estadoLabel(estado: string): string {
    return estadoLabelShared(estado);
  }

  // ── Stats desde ApiService ────────────────────────────────────────
  cargarStats(): void {
    this.api.stats().subscribe({
      next: (res) => {
        if (res.ok && res.data) {
          const d = res.data;
          const pe = d.porEstado || {};
          const total    = d.total || 0;
          const revColab = pe['REVISIÓN COLABORADOR'] || 0;
          const revJefe  = pe['REVISIÓN JEFE'] || 0;
          const sellado  = pe['SELLADO'] || pe['COMPLETADO'] || 0;
          const fuera    = pe['FUERA DE FLUJO'] || 0;
          // Avance: SELLADO sobre el universo en curso (saca FUERA DE FLUJO del denominador).
          const denom    = Math.max(0, total - fuera);
          this.stats = {
            total,
            pendiente:      pe['PENDIENTE'] || 0,
            entrevistado:   pe['ENTREVISTADO'] || 0,
            revColab,
            revJefe,
            revision:       revColab + revJefe,
            presentadoRrhh: pe['PRESENTADO A RRHH'] || 0,
            sellado,
            observado:      pe['OBSERVADO'] || 0,
            fueraFlujo:     fuera,
            avance:         denom > 0 ? Math.round((sellado / denom) * 100) : 0,
          };
        }
      },
      error: () => { /* silencioso */ }
    });
  }

  // ── Filtros ───────────────────────────────────────────────────────
  onFiltroChange() {
    if (!this.busqueda) this.buscar();
  }

  // ── Búsqueda — lee Nomina y filtra localmente ─────────────────────
  buscar(): void {
    if (!this.hayFiltro) { this.empleados.set([]); return; }

    this.cargando.set(true);
    this.errorMsg.set('');

    // Si ya tenemos datos cargados, solo filtrar
    if (this.todosLosEmpleados.length > 0) {
      this.aplicarFiltros();
      this.cargando.set(false);
      return;
    }

    // Primera carga: leer la hoja Nomina
    this.api.leerTabla('Nomina').subscribe({
      next: (res) => {
        if (res.ok) {
          this.todosLosEmpleados = (res.data as any[]).map(r => ({
            legajo:          r.legajo || '—',
            apellido_nombre: r.apellido_nombre || '—',
            codigo:          r.codigo || '—',
            sede:            r.sede || '—',
            sedeCode:        r.sedeCode || '',
            sedeName:        r.sedeName || r.sede || '—',
            familia:         r.familia || '—',
            familiaNombre:   r.familiaNombre || r.puesto || '—',
            estado:          (r.estado || r.estado_relev || 'PENDIENTE').toUpperCase(),
            linkBorrador:    r.linkBorrador || '',
            linkDefinitivo:  r.linkDefinitivo || '',
            transcripcion:   r.transcripcion || '',
            eneagrama:       r.eneagrama || '',
            observacion:     r.observacion || '',
          }));
          this.aplicarFiltros();
        } else {
          this.errorMsg.set(res.error || 'Error al consultar');
          this.empleados.set([]);
        }
        this.cargando.set(false);
      },
      error: () => {
        this.errorMsg.set('No se pudo conectar con Google Sheets');
        this.empleados.set([]);
        this.cargando.set(false);
      }
    });
  }

  private aplicarFiltros(): void {
    let lista = [...this.todosLosEmpleados];

    if (this.busqueda.trim()) {
      const q = this.busqueda.toLowerCase().trim();
      lista = lista.filter(e =>
        e.apellido_nombre.toLowerCase().includes(q) ||
        e.legajo.toLowerCase().includes(q) ||
        e.codigo.toLowerCase().includes(q)
      );
    }

    if (this.filtroSede) {
      lista = lista.filter(e =>
        (e.sedeCode || '').toUpperCase() === this.filtroSede.toUpperCase()
      );
    }

    if (this.filtroFamilia) {
      lista = lista.filter(e =>
        e.codigo.toUpperCase().startsWith(this.filtroFamilia.toUpperCase())
      );
    }

    if (this.filtroEstado) {
      lista = lista.filter(e =>
        e.estado.toUpperCase() === this.filtroEstado.toUpperCase()
      );
    }

    this.empleados.set(lista);
  }

  // ── Cambiar estado ────────────────────────────────────────────────
  // Estados a los que se avanza con modal (para que el actor pueda dejar
  // una nota opcional para quien sigue aguas abajo).
  private readonly ESTADOS_CON_MODAL = [
    'REVISIÓN COLABORADOR',
    'REVISIÓN JEFE',
    'PRESENTADO A RRHH',
  ];

  cambiarEstado(emp: any, nuevoEstado: string): void {
    // Si el dropdown re-emitió el estado actual (caso normal cuando se cierra modal), no hacer nada.
    if (!nuevoEstado || nuevoEstado === emp.estado) return;

    const trans = transicionesValidas(emp.estado, this.rolUsuario)
      .find(t => t.to === nuevoEstado);

    if (!trans) {
      this.errorMsg.set('Transición no permitida');
      setTimeout(() => this.errorMsg.set(''), 4000);
      this.empleados.update(l => l.slice());  // re-render → select vuelve al estado real
      return;
    }

    if (trans.requiere === 'link' && !emp.linkDefinitivo) {
      this.errorMsg.set(`${emp.apellido_nombre} no tiene link definitivo cargado. Cargá el link en la columna Definitivo antes de avanzar.`);
      setTimeout(() => this.errorMsg.set(''), 5000);
      this.empleados.update(l => l.slice());
      return;
    }

    // Reinyección desde OBSERVADO: si admin saltea pasos (no es PEND ni ENTREV),
    // pedir confirmación.
    const estadoActual = (emp.estado || '').toUpperCase();
    if (estadoActual === 'OBSERVADO' && nuevoEstado !== 'PENDIENTE' && nuevoEstado !== 'ENTREVISTADO') {
      const ok = confirm(`Vas a reinyectar a "${estadoLabelShared(nuevoEstado)}" — te salteás pasos del flujo. ¿Continuar?`);
      if (!ok) {
        this.empleados.update(l => l.slice());
        return;
      }
    }

    if (this.ESTADOS_CON_MODAL.indexOf(nuevoEstado) >= 0) {
      this.abrirModalAvance(emp, nuevoEstado);
      return;
    }

    // POST directo (sin nota)
    this.ejecutarAvance(emp, nuevoEstado, '');
  }

  // Ejecuta el cambio de estado con reflejo optimista y revert en error.
  // observacion vacía = no se envía nota (el backend la persiste solo si viene con contenido).
  private ejecutarAvance(emp: any, nuevoEstado: string, observacion: string): void {
    const anterior    = emp.estado;
    const obsAnterior = emp.observacion;
    const obsNueva    = observacion || emp.observacion;

    this.empleados.update(l =>
      l.map(e => e.legajo === emp.legajo ? { ...e, estado: nuevoEstado, observacion: obsNueva } : e)
    );
    this.todosLosEmpleados = this.todosLosEmpleados.map(e =>
      e.legajo === emp.legajo ? { ...e, estado: nuevoEstado, observacion: obsNueva } : e
    );

    const revertir = () => {
      this.empleados.update(l =>
        l.map(e => e.legajo === emp.legajo ? { ...e, estado: anterior, observacion: obsAnterior } : e)
      );
      this.todosLosEmpleados = this.todosLosEmpleados.map(e =>
        e.legajo === emp.legajo ? { ...e, estado: anterior, observacion: obsAnterior } : e
      );
    };

    this.api.post({
      action: 'updateEntrevista',
      data: {
        id_entrevista: emp.legajo,
        estado:        nuevoEstado,
        observacion:   observacion,
        rol:           this.rolUsuario,
      }
    }).subscribe({
      next: (res) => {
        if (res.ok) {
          this.cargarStats();
        } else {
          revertir();
          this.errorMsg.set(res.error || 'Error al actualizar estado');
        }
      },
      error: () => {
        revertir();
        this.errorMsg.set('Error de conexión');
      }
    });
  }

  // ── Toggle fila privada ───────────────────────────────────────────
  toggleDetalle(legajo: string) {
    this.filaAbierta = this.filaAbierta === legajo ? '' : legajo;
  }

  // ── Guardar privados ──────────────────────────────────────────────
  guardarPrivados(emp: any): void {
    this.api.post({
      action: 'updateEntrevista',
      data: {
        id_entrevista: emp.legajo,
        transcripcion: emp.transcripcion || '',
        eneagrama: emp.eneagrama || '',
        observacion_privada: emp.observacion || '',
        rol: this.rolUsuario,
      }
    }).subscribe({
      next: (res) => {
        if (res.ok) {
          this.guardadoMsg = emp.legajo;
          setTimeout(() => this.guardadoMsg = '', 3000);
        } else {
          this.errorMsg.set(res.error || 'Error al guardar');
        }
      },
      error: () => { this.errorMsg.set('Error de conexión'); }
    });
  }

  // ── Modal link ────────────────────────────────────────────────────
  abrirModalLink(emp: any, tipo: 'borrador' | 'definitivo') {
    this.modalLink = {
      abierto: true, tipo, empleado: emp,
      url: tipo === 'borrador' ? (emp.linkBorrador || '') : (emp.linkDefinitivo || '')
    };
  }

  cerrarModal() {
    this.modalLink = { abierto: false, tipo: 'borrador', empleado: null, url: '' };
  }

  confirmarLink(): void {
    if (!this.modalLink.url || !this.modalLink.empleado) return;
    const { empleado: emp, tipo, url } = this.modalLink;
    const urlLimpia = url.trim();

    this.api.post({
      action: 'updateEntrevista',
      data: {
        id_entrevista: emp.legajo,
        link_sin_revision: tipo === 'borrador' ? urlLimpia : undefined,
        link_definitivo: tipo === 'definitivo' ? urlLimpia : undefined,
        rol: this.rolUsuario,
      }
    }).subscribe({
      next: (res) => {
        if (res.ok) {
          this.empleados.update(l => l.map(e => {
            if (e.legajo !== emp.legajo) return e;
            return tipo === 'borrador'
              ? { ...e, linkBorrador: urlLimpia }
              : { ...e, linkDefinitivo: urlLimpia };
          }));
          this.todosLosEmpleados = this.todosLosEmpleados.map(e => {
            if (e.legajo !== emp.legajo) return e;
            return tipo === 'borrador'
              ? { ...e, linkBorrador: urlLimpia }
              : { ...e, linkDefinitivo: urlLimpia };
          });
          this.cerrarModal();
        } else {
          this.errorMsg.set(res.error || 'Error al guardar link');
        }
      },
      error: () => { this.errorMsg.set('Error de conexión'); }
    });
  }

  // ── Modal avance (con nota opcional para el próximo revisor) ──────
  abrirModalAvance(emp: any, destino: string) {
    this.modalAvance = { abierto: true, empleado: emp, destino, texto: '' };
  }

  cerrarModalAvance() {
    this.modalAvance = { abierto: false, empleado: null, destino: '', texto: '' };
    // Re-render del select para que vuelva a sincronizar con e.estado real.
    this.empleados.update(l => l.slice());
  }

  confirmarAvance(): void {
    const { empleado, destino, texto } = this.modalAvance;
    if (!empleado || !destino) return;
    this.ejecutarAvance(empleado, destino, texto.trim());
    this.modalAvance = { abierto: false, empleado: null, destino: '', texto: '' };
  }

  // ── Limpiar ───────────────────────────────────────────────────────
  limpiarFiltros() {
    this.busqueda = this.filtroSede = this.filtroFamilia = this.filtroEstado = '';
    this.empleados.set([]);
    this.errorMsg.set('');
  }

  refrescar() {
    this.todosLosEmpleados = [];
    this.empleados.set([]);
    this.buscar();
  }

  // ── Exportar CSV ──────────────────────────────────────────────────
  exportarCSV() {
    if (!this.hayResultados()) return;
    const headers = ['Legajo', 'Empleado', 'Código', 'Sede', 'Familia', 'Estado', 'Publicado', 'Borrador', 'Definitivo'];
    const filas = this.empleados().map(e => [
      e.legajo, e.apellido_nombre, e.codigo,
      e.sedeName || e.sede, e.familiaNombre, e.estado,
      this.estaSellado(e) ? 'Sí' : 'No',
      e.linkBorrador || '', e.linkDefinitivo || ''
    ]);
    const csv = [headers, ...filas]
      .map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `arsa-relevamiento-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  abrirLink(url: string) { if (url) window.open(url, '_blank'); }
  trackByLegajo(_: number, e: any): string { return e.legajo; }

  estadoClass(estado: string): string {
    return estadoClassShared(estado, 'relevamiento');
  }
}