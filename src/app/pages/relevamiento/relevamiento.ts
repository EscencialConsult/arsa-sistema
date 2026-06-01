import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService, APP_URL } from '../../services/api';
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

  // Vista del jefe: lista filtrada por su legajo desde el backend.
  get esGerente(): boolean {
    return this.rolUsuario === 'gerente';
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
  // ── Modal avance (con nota opcional para el próximo revisor) ─────
  modalAvance: {
    abierto: boolean;
    empleado: any;
    destino: string;
    texto: string;
  } = { abierto: false, empleado: null, destino: '', texto: '' };

  // ── Modal agregar revisor (bloque 3) ──────────────────────────────
  // Cache de TODOS los candidatos en una sola query (con nivel='TODOS'),
  // después filtramos client-side por nivel + búsqueda.
  modalRevisor: {
    abierto: boolean;
    empleado: any;
    nivelEmpleado: any;                          // 0|1|2|3|'OPERATIVO'|null
    candidatosTodos: any[];                      // respuesta completa
    conteoPorNivel: { [k: number]: number };
    nivelSeleccionado: number | null;            // null = ninguno seleccionado
    modoTodos: boolean;                          // true = ignora filtro de nivel
    seleccionado: any | null;
    cargando: boolean;
    asignando: boolean;
    busqueda: string;
  } = {
    abierto: false, empleado: null, nivelEmpleado: null,
    candidatosTodos: [], conteoPorNivel: { 0: 0, 1: 0, 2: 0, 3: 0 },
    nivelSeleccionado: null, modoTodos: false, seleccionado: null,
    cargando: false, asignando: false, busqueda: ''
  };

  // ── Modal habilitar (B2.2 + B2.3 — solo password; el tel se guarda
  //    junto con todos los datos del panel ANTES de abrir este modal) ─
  modalHabilitar: {
    abierto: boolean;
    empleado: any;
    password: string;
    error: string;
    guardando: boolean;
    exito: boolean;       // true tras habilitar OK → modo "éxito con CTA manual"
    waUrl: string;        // link wa.me listo para el anchor (cuando exito = true)
  } = { abierto: false, empleado: null, password: '', error: '', guardando: false, exito: false, waUrl: '' };

  // Flag para evitar dobles clicks en "Guardar cambios" / "Habilitar".
  guardandoPanel = false;

  // ── Vista del jefe (bloque 4) ─────────────────────────────────────
  // Lista de descriptivos que ESTE jefe tiene que firmar. La fuente única es
  // el backend (getNominaPorJefe): ya filtra por asignación + estado REVISIÓN JEFE.
  nominaJefe = signal<any[]>([]);
  cargandoJefe = signal(false);
  errorJefe = signal('');
  legajoJefe = '';
  toastJefe = '';

  modalFirmar: {
    abierto: boolean;
    empleado: any;
    observacion: string;
    firmando: boolean;
    docUrl: SafeResourceUrl | null;
  } = { abierto: false, empleado: null, observacion: '', firmando: false, docUrl: null };

  // ── Internos ──────────────────────────────────────────────────────
  private todosLosEmpleados: any[] = [];

  constructor(private api: ApiService, private sanitizer: DomSanitizer) { }

  // ─────────────────────────────────────────────────────────────────
  ngOnInit() {
    const raw = localStorage.getItem('usuario');
    if (raw) {
      const u = JSON.parse(raw);
      this.rolUsuario = (u.rol || '').toLowerCase();
      this.legajoJefe = String(u.legajo || '').trim();
    }
    if (this.rolUsuario === 'gerente') {
      // El jefe ve SU lista de revisión. No carga la nómina completa ni las stats.
      this.cargarNominaJefe();
      return;
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

  // ── Validaciones del panel ──────────────────────────────────────
  passwordValida(pwd: string): boolean {
    return !!pwd && pwd.length >= 6;
  }

  telefonoValido(tel: string): boolean {
    // Debe arrancar con +54 9 o 54 9, seguido de área (2-4 dígitos) + número (6-8).
    return /^\s*(\+?54\s?9)\s?\d{2,4}\s?\d{6,8}\s*$/.test(tel || '');
  }

  // Precarga el prefijo "+54 9 " cuando el admin hace foco en un campo de teléfono vacío.
  // Si después borra todo (incluido el prefijo) el campo vuelve a quedar vacío — el save
  // acepta vacío, así que no hay riesgo de persistir un prefijo huérfano.
  prefilTelefono(emp: any): void {
    if (!emp.telefono) emp.telefono = '+54 9 ';
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
            habilitado:      !!r.habilitado,
            telefono:        r.telefono || '',
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
    if (this.filaAbierta) {
      const emp = this.empleados().find(e => e.legajo === legajo);
      if (emp && !emp.revisoresCargado) this.cargarRevisores(emp);
    }
  }

  // ── Revisores (bloque 3) ──────────────────────────────────────────
  // Lazy-load: solo se piden al expandir el panel del empleado.
  cargarRevisores(emp: any): void {
    emp.revisoresCargando = true;
    this.empleados.update(l => l.slice());
    this.api.getRevisoresPorDescriptivo(emp.legajo).subscribe({
      next: (res) => {
        emp.revisoresCargando = false;
        if (res.ok) {
          emp.revisores = res.data || [];
          emp.revisoresCargado = true;
        }
        this.empleados.update(l => l.slice());
      },
      error: () => {
        emp.revisoresCargando = false;
        this.empleados.update(l => l.slice());
      }
    });
  }

  tieneRevisores(emp: any): boolean {
    return !!(emp && emp.revisores && emp.revisores.length > 0);
  }

  // Formato DD/MM desde yyyy-MM-dd del backend.
  formatearFecha(fecha: string): string {
    if (!fecha) return '';
    const partes = String(fecha).split('-');
    if (partes.length !== 3) return fecha;
    return `${partes[2]}/${partes[1]}`;
  }

  quitarRevisor(emp: any, jefeLegajo: string): void {
    if (this.rolUsuario !== 'admin') return;
    this.api.quitarRevisor({ legajo_empleado: emp.legajo, legajo_jefe: jefeLegajo }).subscribe({
      next: (res) => {
        if (res.ok) {
          emp.revisoresCargado = false;
          this.cargarRevisores(emp);
          // Si el backend disparó auto-advance (estado pasó a PRESENTADO A RRHH
          // porque los revisores restantes ya habían firmado todos), reflejarlo
          // en la fila local + stats + mensaje en la franja superior.
          if (res.avanzoEstado) {
            emp.estado = res.estadoNuevo;
            this.todosLosEmpleados = this.todosLosEmpleados.map(e =>
              e.legajo === emp.legajo ? { ...e, estado: res.estadoNuevo } : e
            );
            this.empleados.update(l => l.slice());
            this.cargarStats();
            this.errorMsg.set('Revisor quitado. Como los otros ya firmaron, el descriptivo pasó a RRHH.');
            setTimeout(() => this.errorMsg.set(''), 5000);
          }
        } else {
          this.errorMsg.set(res.error || 'No se pudo quitar el revisor');
          setTimeout(() => this.errorMsg.set(''), 4000);
        }
      },
      error: () => {
        this.errorMsg.set('Error de conexión');
        setTimeout(() => this.errorMsg.set(''), 4000);
      }
    });
  }

  // ── Modal agregar revisor ─────────────────────────────────────────
  abrirModalRevisor(emp: any): void {
    if (this.rolUsuario !== 'admin') return;
    this.modalRevisor = {
      abierto: true, empleado: emp, nivelEmpleado: null,
      candidatosTodos: [], conteoPorNivel: { 0: 0, 1: 0, 2: 0, 3: 0 },
      nivelSeleccionado: null, modoTodos: false, seleccionado: null,
      cargando: true, asignando: false, busqueda: ''
    };

    // Una sola query con TODOS. Después filtramos client-side por nivel + búsqueda.
    this.api.getJefesElegibles(emp.legajo, 'TODOS').subscribe({
      next: (res) => {
        if (res.ok) {
          const conteo: { [k: number]: number } = { 0: 0, 1: 0, 2: 0, 3: 0 };
          for (const c of res.data) {
            if (c.nivel === 0 || c.nivel === 1 || c.nivel === 2 || c.nivel === 3) conteo[c.nivel]++;
          }
          // Default seleccionado: 1 nivel arriba del empleado
          const nivelEmp = res.nivelEmpleado;
          let nivelDefault: number | null;
          if (nivelEmp === 'OPERATIVO')   nivelDefault = 3;
          else if (nivelEmp === 0)        nivelDefault = null;   // Gerente Gral. no tiene superior
          else if (typeof nivelEmp === 'number') nivelDefault = nivelEmp - 1;
          else                            nivelDefault = 3;

          this.modalRevisor.nivelEmpleado     = nivelEmp;
          this.modalRevisor.candidatosTodos   = res.data || [];
          this.modalRevisor.conteoPorNivel    = conteo;
          this.modalRevisor.nivelSeleccionado = nivelDefault;
          this.modalRevisor.cargando          = false;
        } else {
          this.modalRevisor.cargando = false;
          this.errorMsg.set(res.error || 'No se pudo cargar la lista de jefes');
        }
      },
      error: () => {
        this.modalRevisor.cargando = false;
        this.errorMsg.set('Error de conexión');
      }
    });
  }

  cerrarModalRevisor(): void {
    this.modalRevisor = {
      abierto: false, empleado: null, nivelEmpleado: null,
      candidatosTodos: [], conteoPorNivel: { 0: 0, 1: 0, 2: 0, 3: 0 },
      nivelSeleccionado: null, modoTodos: false, seleccionado: null,
      cargando: false, asignando: false, busqueda: ''
    };
  }

  seleccionarNivel(nivel: number): void {
    this.modalRevisor.nivelSeleccionado = nivel;
    this.modalRevisor.modoTodos = false;
    this.modalRevisor.seleccionado = null;
  }

  activarModoTodos(): void {
    this.modalRevisor.modoTodos = true;
    this.modalRevisor.seleccionado = null;
  }

  volverANiveles(): void {
    this.modalRevisor.modoTodos = false;
    this.modalRevisor.seleccionado = null;
  }

  seleccionarCandidato(c: any): void {
    if (this.esYaAsignado(c.legajo)) return;
    this.modalRevisor.seleccionado = c;
  }

  esYaAsignado(legajoJefe: string): boolean {
    const emp = this.modalRevisor.empleado;
    if (!emp || !emp.revisores) return false;
    return emp.revisores.some((r: any) => r.jefe_legajo === legajoJefe);
  }

  get candidatosVisibles(): any[] {
    const m = this.modalRevisor;
    if (!m.candidatosTodos.length) return [];
    let lista = m.candidatosTodos;
    if (!m.modoTodos && m.nivelSeleccionado !== null) {
      lista = lista.filter(c => c.nivel === m.nivelSeleccionado);
    }
    const q = m.busqueda.trim().toLowerCase();
    if (q) {
      lista = lista.filter(c =>
        (c.nombre || '').toLowerCase().includes(q) ||
        (c.funcion || '').toLowerCase().includes(q) ||
        (c.familia || '').toLowerCase().includes(q) ||
        (c.sede || '').toLowerCase().includes(q) ||
        (c.legajo || '').includes(q)
      );
    }
    return lista;
  }

  labelNivelEmpleado(): string {
    const n = this.modalRevisor.nivelEmpleado;
    if (n === 'OPERATIVO') return 'Operativo';
    if (n === 0) return 'Gerente General';
    if (n === 1) return 'Gerente';
    if (n === 2) return 'Subgerente';
    if (n === 3) return 'Jefatura';
    return '';
  }

  asignarRevisorSeleccionado(): void {
    const m = this.modalRevisor;
    if (!m.empleado || !m.seleccionado || m.asignando) return;
    if (this.esYaAsignado(m.seleccionado.legajo)) return;
    m.asignando = true;
    this.api.asignarRevisor({
      legajo_empleado: m.empleado.legajo,
      legajo_jefe:     m.seleccionado.legajo,
      asignado_por:    'admin'
    }).subscribe({
      next: (res) => {
        m.asignando = false;
        if (res.ok) {
          const emp = m.empleado;
          this.cerrarModalRevisor();
          emp.revisoresCargado = false;
          this.cargarRevisores(emp);
        } else {
          this.errorMsg.set(res.error || 'No se pudo asignar el revisor');
          setTimeout(() => this.errorMsg.set(''), 4000);
        }
      },
      error: () => {
        m.asignando = false;
        this.errorMsg.set('Error de conexión');
        setTimeout(() => this.errorMsg.set(''), 4000);
      }
    });
  }

  // Abre un link en pestaña nueva (deshabilitado en la UI si está vacío).
  abrirLink(url: string) {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // ── Vista del jefe (bloque 4) ─────────────────────────────────────
  cargarNominaJefe(): void {
    if (!this.legajoJefe) {
      this.errorJefe.set('No pudimos identificar tu legajo. Cerrá sesión y volvé a entrar.');
      return;
    }
    this.cargandoJefe.set(true);
    this.errorJefe.set('');
    this.api.getNominaPorJefe(this.legajoJefe).subscribe({
      next: (res) => {
        if (res.ok) {
          this.nominaJefe.set(res.data || []);
        } else {
          this.errorJefe.set(res.error || 'No se pudo cargar tu lista de revisión');
          this.nominaJefe.set([]);
        }
        this.cargandoJefe.set(false);
      },
      error: () => {
        this.errorJefe.set('No se pudo conectar con el servidor');
        this.cargandoJefe.set(false);
      }
    });
  }

  abrirModalFirmar(emp: any): void {
    this.modalFirmar = {
      abierto: true,
      empleado: emp,
      observacion: '',
      firmando: false,
      docUrl: this.armarDocUrl(emp.linkBorrador),
    };
  }

  cerrarModalFirmar(): void {
    this.modalFirmar = { abierto: false, empleado: null, observacion: '', firmando: false, docUrl: null };
  }

  confirmarFirmar(): void {
    const m = this.modalFirmar;
    if (!m.empleado || m.firmando) return;
    m.firmando = true;
    this.api.firmarRevision({
      legajo_empleado: m.empleado.legajo,
      legajo_jefe:     this.legajoJefe,
      observacion:     m.observacion.trim(),
      rol:             'gerente'
    }).subscribe({
      next: (res) => {
        m.firmando = false;
        if (res.ok) {
          const leg = m.empleado.legajo;
          this.nominaJefe.update(l => l.filter(e => e.legajo !== leg));
          if (res.avanzoEstado) {
            this.toastJefe = 'Firmado. El descriptivo pasó a RRHH.';
          } else if (res.pendientes > 0) {
            const n = res.pendientes;
            this.toastJefe = `Firmado. Falta${n === 1 ? '' : 'n'} ${n} revisor${n === 1 ? '' : 'es'}.`;
          } else {
            this.toastJefe = 'Firmado.';
          }
          setTimeout(() => this.toastJefe = '', 4000);
          this.cerrarModalFirmar();
        } else {
          this.errorJefe.set(res.error || 'No se pudo firmar la revisión');
          setTimeout(() => this.errorJefe.set(''), 4000);
        }
      },
      error: () => {
        m.firmando = false;
        this.errorJefe.set('Error de conexión al firmar');
        setTimeout(() => this.errorJefe.set(''), 4000);
      }
    });
  }

  // Transforma el link del borrador en una URL embebible.
  //   · Mobile (< 768px) → /mobilebasic (texto fluido)
  //   · Desktop (≥ 768px) → /preview (formato original)
  private armarDocUrl(link: string): SafeResourceUrl | null {
    if (!link) return null;
    const base = link.replace(/\/(edit|preview|view|mobilebasic)\b.*$/, '').replace(/[?#].*$/, '');
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const url = `${base}/${isMobile ? 'mobilebasic' : 'preview'}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  trackByLegajoJefe(_: number, e: any): string { return e.legajo; }

  // ── Guardar todo el panel ─────────────────────────────────────────
  // Persiste links + telefono + privados en una sola llamada a updateEntrevista.
  // Usado por el botón "Guardar cambios" del footer, Y por el flujo Habilitar
  // (que llama a esto antes de habilitarColaborador).
  guardarTodo(emp: any, onOk?: () => void, onErr?: () => void): void {
    if (this.guardandoPanel) return;
    this.guardandoPanel = true;
    this.api.post({
      action: 'updateEntrevista',
      data: {
        id_entrevista:        emp.legajo,
        link_sin_revision:    emp.linkBorrador || '',
        link_definitivo:      emp.linkDefinitivo || '',
        telefono:             emp.telefono || '',
        transcripcion:        emp.transcripcion || '',
        eneagrama:            emp.eneagrama || '',
        observacion_privada:  emp.observacion || '',
        rol:                  this.rolUsuario,
      }
    }).subscribe({
      next: (res) => {
        this.guardandoPanel = false;
        if (res.ok) {
          this.guardadoMsg = emp.legajo;
          setTimeout(() => this.guardadoMsg = '', 3000);
          if (onOk) onOk();
        } else {
          this.errorMsg.set(res.error || 'Error al guardar');
          if (onErr) onErr();
        }
      },
      error: () => {
        this.guardandoPanel = false;
        this.errorMsg.set('Error de conexión');
        if (onErr) onErr();
      }
    });
  }

  puedeGuardarTodo(emp: any): boolean {
    if (this.rolUsuario !== 'admin') return false;
    // Permitir guardar si el tel está vacío o válido. Bloquear si está mal escrito.
    return !emp.telefono || this.telefonoValido(emp.telefono);
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

  // ── Modal habilitar acceso (B2.2 + B2.3) ──────────────────────────
  // Habilitar requiere link del borrador + teléfono válido + ≥1 revisor.
  puedeAbrirHabilitar(emp: any): boolean {
    return this.rolUsuario === 'admin'
      && !!emp.linkBorrador
      && this.telefonoValido(emp.telefono)
      && this.tieneRevisores(emp);
  }

  // Texto que explica al admin qué falta para poder habilitar.
  hintHabilitar(emp: any): string {
    const faltantes: string[] = [];
    if (!emp.linkBorrador)                  faltantes.push('el link del borrador');
    if (!this.telefonoValido(emp.telefono)) faltantes.push('el teléfono');
    if (!this.tieneRevisores(emp))          faltantes.push('al menos un revisor');
    if (faltantes.length === 0) return '';
    if (faltantes.length === 1) return `Cargá ${faltantes[0]} para habilitar.`;
    if (faltantes.length === 2) return `Cargá ${faltantes[0]} y ${faltantes[1]} para habilitar.`;
    return `Cargá ${faltantes[0]}, ${faltantes[1]} y ${faltantes[2]} para habilitar.`;
  }

  abrirModalHabilitar(emp: any) {
    // Confirm previo si es reset (la pwd actual del empleado queda invalidada).
    if (emp.habilitado) {
      const ok = confirm('El empleado tendrá que usar la contraseña nueva. ¿Continuar?');
      if (!ok) return;
    }
    this.modalHabilitar = { abierto: true, empleado: emp, password: '', error: '', guardando: false, exito: false, waUrl: '' };
  }

  cerrarModalHabilitar() {
    this.modalHabilitar = { abierto: false, empleado: null, password: '', error: '', guardando: false, exito: false, waUrl: '' };
  }

  generarPasswordAleatoria() {
    // 8 caracteres alfanuméricos sin chars confusos al dictar por teléfono (0/O/o, 1/l/I).
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    for (let i = 0; i < 8; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    this.modalHabilitar.password = out;
  }

  // Flujo Habilitar:
  //   1) Abrir wa.me directamente con el mensaje pre-cargado (sincrónico, con el
  //      user-gesture del click → la pestaña carga al instante, no se queda en blanco).
  //   2) En paralelo, correr la cadena guardarTodo → habilitarColaborador.
  //   3) Si algo falla, cerrar la pestaña y mostrar el error.
  confirmarHabilitar(): void {
    const m = this.modalHabilitar;
    if (!m.empleado) return;
    if (!this.passwordValida(m.password)) {
      m.error = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }
    m.error = '';
    m.guardando = true;
    const emp = m.empleado;
    const password = m.password.trim();
    const telefono = emp.telefono;
    const telLimpio = (telefono || '').replace(/\D/g, '');
    const mensaje = this.armarMensajeWhatsApp(emp, password);
    const waUrl = `https://wa.me/${telLimpio}?text=${encodeURIComponent(mensaje)}`;

    // Abrir wa.me directo (con URL completa) preserva el user-gesture y la pestaña
    // empieza a cargar WhatsApp al instante. Apps Script tarda 1-3 seg en confirmar
    // los POSTs, pero WhatsApp Web demora más en estar listo — el admin nunca ve
    // un estado intermedio raro.
    const ventanaWa = window.open(waUrl, '_blank');
    const cerrarSiHaceFalta = () => {
      if (ventanaWa && !ventanaWa.closed) ventanaWa.close();
    };

    this.guardarTodo(emp,
      () => this.ejecutarHabilitar(emp, password, ventanaWa),
      cerrarSiHaceFalta
    );
  }

  private ejecutarHabilitar(emp: any, password: string, ventanaWa: Window | null): void {
    const habilitadoAnt = emp.habilitado;
    const estadoAnt     = emp.estado;
    const estadoNuevo   = emp.estado?.toUpperCase() === 'ENTREVISTADO' ? 'REVISIÓN COLABORADOR' : emp.estado;
    const telefono      = emp.telefono;

    const aplicar = (next: any) => {
      this.empleados.update(l =>
        l.map(e => e.legajo === emp.legajo ? { ...e, ...next } : e)
      );
      this.todosLosEmpleados = this.todosLosEmpleados.map(e =>
        e.legajo === emp.legajo ? { ...e, ...next } : e
      );
    };

    aplicar({ habilitado: true, estado: estadoNuevo });

    this.api.post({
      action: 'habilitarColaborador',
      data: { legajo: emp.legajo, password, telefono }
    }).subscribe({
      next: (res) => {
        if (res.ok) {
          if (ventanaWa && !ventanaWa.closed) {
            // El navegador abrió la pestaña al toque → cerrar modal sin más.
            this.cerrarModalHabilitar();
          } else {
            // Popup bloqueado → modal pasa a estado de éxito con un anchor
            // grande que el admin clickea (anchors target=_blank NUNCA se bloquean).
            const telLimpio = (telefono || '').replace(/\D/g, '');
            const mensaje   = this.armarMensajeWhatsApp(emp, password);
            this.modalHabilitar.exito     = true;
            this.modalHabilitar.waUrl     = `https://wa.me/${telLimpio}?text=${encodeURIComponent(mensaje)}`;
            this.modalHabilitar.guardando = false;
          }
          this.cargarStats();
        } else {
          // Revertir solo lo de habilitación; los datos del paso 1 quedan persistidos (intencional).
          aplicar({ habilitado: habilitadoAnt, estado: estadoAnt });
          if (ventanaWa && !ventanaWa.closed) ventanaWa.close();
          this.modalHabilitar.guardando = false;
          this.modalHabilitar.error = res.error || 'No se pudo habilitar.';
        }
      },
      error: () => {
        aplicar({ habilitado: habilitadoAnt, estado: estadoAnt });
        if (ventanaWa && !ventanaWa.closed) ventanaWa.close();
        this.cerrarModalHabilitar();
        this.errorMsg.set('Error de conexión al habilitar.');
      }
    });
  }

  // ════════════════════════════════════════════════════════════════════
  //  ✏ Editar acá el texto del mensaje WhatsApp para el empleado.
  //  Las variables disponibles son:
  //    APP_URL       → URL base del sistema (configurada en api.ts)
  //    emp.legajo    → legajo del empleado
  //    password      → contraseña que el admin acaba de generar/tipear
  //  El link DEBE apuntar a /login (no a /mi-descriptivo): el empleado
  //  tiene que loguearse primero; el sistema lo redirige solo después.
  // ════════════════════════════════════════════════════════════════════
  private armarMensajeWhatsApp(emp: any, password: string): string {
    return `¡Hola!\n\nTe escribimos por la actualización de descriptivos de puesto que se está haciendo en ARSA. Tu descriptivo ya está listo para que lo revises — son unos minutos y nos ayuda a confirmar que refleja bien lo que hacés.\n\nPara entrar:\n${APP_URL}/login\n\nTus datos:\n- Legajo: ${emp.legajo}\n- Contraseña: ${password}\n\nCualquier comentario, respondé este mismo mensaje. ¡Gracias!`;
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

  trackByLegajo(_: number, e: any): string { return e.legajo; }

  estadoClass(estado: string): string {
    return estadoClassShared(estado, 'relevamiento');
  }
}