import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { ApiService } from '../../services/api';
import { estadoClass as estadoClassShared, estadoLabel as estadoLabelShared } from '../../shared/estados';

export interface Empleado {
  codigo:          string;
  legajo:          string;
  apellido_nombre: string;
  sede:            string;
  sedeCode:        string;
  familia:         string;
  puesto:          string;
  categoria:       string;
  estado_relev:    string;
}

const FAMILIAS = [
  { code: 'OPA',  name: 'Operaciones Agua' },
  { code: 'ADM',  name: 'Administración' },
  { code: 'AYC',  name: 'Operaciones A y C' },
  { code: 'EM',   name: 'Electromecánica / Mant.' },
  { code: 'OPC',  name: 'Operaciones Cloacas' },
  { code: 'TEC',  name: 'Técnica / Planta' },
  { code: 'JEF',  name: 'Jefatura de Servicio' },
  { code: 'CAP',  name: 'Capataz' },
  { code: 'COM',  name: 'Gestión Comercial' },
  { code: 'PROF', name: 'Profesional' },
  { code: 'GER',  name: 'Gerencia / Subgerencia' },
  { code: 'OTR',  name: 'Otros' },
  { code: 'PAS',  name: 'Pasantía' },
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
  selector: 'app-nomina',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './nomina.html',
  styleUrl: './nomina.css'
})
export class Nomina implements OnInit, OnDestroy {

  // ── Signals ──────────────────────────────────────────────────────
  empleados       = signal<Empleado[]>([]);
  empleadosFiltrados = signal<Empleado[]>([]);
  cargando        = signal(false);
  errorMsg        = signal('');

  // ── Filtros ──────────────────────────────────────────────────────
  busqueda      = '';
  filtroSede    = '';
  filtroFamilia = '';
  filtroEstado  = '';

  // ── Dropdowns ────────────────────────────────────────────────────
  listaFamilias = FAMILIAS;
  listaSedes    = SEDES;

  // ── Computed ─────────────────────────────────────────────────────
  hayResultados = computed(() => this.empleadosFiltrados().length > 0);

  // ── Internos ─────────────────────────────────────────────────────
  todosLosEmpleados: Empleado[] = [];
  private busquedaSubject = new Subject<void>();
  private destroy$        = new Subject<void>();
  rolUsuario: string = '';

  // ── Modal Agregar ─────────────────────────────────────────────────
  modalAbierto = false;
  guardando    = false;
  errorModal   = '';
  form: any = {
    legajo: '', codigo_arsa: '', apellido_nombre: '',
    sede: '', puesto: '', categoria: '',
    nivel_cct: '', estado_relev: 'PENDIENTE'
  };

  constructor(private api: ApiService) {}

  ngOnInit() {
    // Debounce para búsqueda de texto
    this.busquedaSubject.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(() => this.aplicarFiltros());

const raw = localStorage.getItem('usuario');
if (raw) {
    this.rolUsuario = (JSON.parse(raw).rol || '').toLowerCase();
}
if (this.rolUsuario === 'rrhh') {
    this.filtroEstado = 'PRESENTADO A RRHH';
}

    // Cargar todos los empleados al iniciar
    this.cargarNomina();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Carga inicial desde ApiService ───────────────────────────────
  cargarNomina() {
    this.cargando.set(true);
    this.errorMsg.set('');

    this.api.leerTabla('Nomina').subscribe({
      next: (res) => {
        if (res.ok) {
          this.todosLosEmpleados = (res.data as any[]).map(r => ({
            codigo:          r.codigo          || '—',
            legajo:          r.legajo          || '—',
            apellido_nombre: r.apellido_nombre || '—',
            sede:            r.sedeName || r.sede || '—',
            sedeCode:        r.sedeCode        || '',
            familia:         r.familia         || '—',
            puesto:          r.puesto          || '—',
            categoria:       r.catServicio || r.categoria || '—',
            estado_relev:    r.estado_relev || 'PENDIENTE',
          }));
          this.aplicarFiltros();
        } else {
          this.errorMsg.set('Error al cargar la nómina');
        }
        this.cargando.set(false);
      },
      error: () => {
        this.errorMsg.set('No se pudo conectar con Google Sheets');
        this.cargando.set(false);
      }
    });
  }

  // ── Filtros locales (sin llamada a API) ───────────────────────────
  aplicarFiltros() {
    let lista = [...this.todosLosEmpleados];

    if (this.busqueda.trim()) {
      const q = this.busqueda.toLowerCase().trim();
      lista = lista.filter(e =>
        e.apellido_nombre.toLowerCase().includes(q) ||
        e.legajo.toLowerCase().includes(q) ||
        (e.codigo || '').toLowerCase().includes(q)
      );
    }

    if (this.filtroSede) {
      lista = lista.filter(e =>
        (e.sedeCode || '').toUpperCase() === this.filtroSede.toUpperCase()
      );
    }

    if (this.filtroFamilia) {
      lista = lista.filter(e =>
        (e.codigo || '').toUpperCase().startsWith(this.filtroFamilia.toUpperCase())
      );
    }

    if (this.filtroEstado) {
      lista = lista.filter(e =>
        e.estado_relev.toUpperCase() === this.filtroEstado.toUpperCase()
      );
    }

    this.empleadosFiltrados.set(lista);
  }

  // ── Eventos ───────────────────────────────────────────────────────
  get hayFiltro(): boolean {
    return !!(this.busqueda || this.filtroSede || this.filtroFamilia || this.filtroEstado);
  }

  buscar() {
    this.busquedaSubject.next();
  }

  onFiltroChange() {
    this.busqueda = '';
    this.aplicarFiltros();
  }

  limpiarBusqueda() {
    this.busqueda = '';
    this.aplicarFiltros();
  }

  limpiarFiltros() {
    this.busqueda = this.filtroSede = this.filtroFamilia = this.filtroEstado = '';
    this.empleadosFiltrados.set(this.todosLosEmpleados);
    this.errorMsg.set('');
  }

  refrescar() {
    this.todosLosEmpleados = [];
    this.empleadosFiltrados.set([]);
    this.cargarNomina();
  }

  // ── Exportar CSV ──────────────────────────────────────────────────
  exportarCSV() {
    if (!this.hayResultados()) return;
    const headers = ['Código ARSA', 'Legajo', 'Empleado', 'Sede', 'Puesto', 'CAT', 'Estado'];
    const filas   = this.empleadosFiltrados().map(e => [
      e.codigo, e.legajo, e.apellido_nombre,
      e.sede, e.puesto, e.categoria, e.estado_relev
    ]);
    const csv = [headers, ...filas]
      .map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `arsa-nomina-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  // ── TrackBy ───────────────────────────────────────────────────────
  trackByLegajo(_: number, e: Empleado): string { return e.legajo; }

  // ── Helpers CSS ───────────────────────────────────────────────────
  estadoClass(e: string): string {
    return estadoClassShared(e, 'nomina');
  }

  estadoLabel(e: string): string {
    return estadoLabelShared(e);
  }

  catClass(cat: string): string {
    const m: Record<string, string> = {
      'CAT1': 'cat1', 'CAT2': 'cat2', 'CAT3': 'cat3', 'CAT4': 'cat4'
    };
    return m[cat?.toUpperCase().replace(/\s/g, '')] || 'cat-c';
  }

  catLabel(cat: string): string {
    const c = cat?.toUpperCase().replace(/\s/g, '');
    if (c === 'CAT1') return 'CAT 1';
    if (c === 'CAT2') return 'CAT 2';
    if (c === 'CAT3') return 'CAT 3';
    if (c === 'CAT4') return 'CAT 4';
    return cat || '—';
  }

  formVacio() {
    return {
      legajo: '', codigo_arsa: '', apellido_nombre: '',
      sede: '', puesto: '', categoria: '',
      nivel_cct: '', estado_relev: 'PENDIENTE'
    };
  }

  abrirModal() {
    this.form = this.formVacio();
    this.errorModal = '';
    this.modalAbierto = true;
  }

  cerrarModal() {
    this.modalAbierto = false;
  }

  guardar() {
    if (!this.form.legajo || !this.form.apellido_nombre) {
      this.errorModal = 'Legajo y nombre son obligatorios.';
      return;
    }
    this.guardando = true;
    this.errorModal = '';
    this.api.post({ action: 'createEmpleado', data: this.form }).subscribe({ error: () => {} });
    setTimeout(() => {
      this.guardando = false;
      this.cerrarModal();
      this.refrescar();
    }, 2000);
  }
}