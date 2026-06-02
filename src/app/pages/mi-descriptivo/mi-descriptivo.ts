import { Component, OnInit, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from '../../services/api';

// Vista de la pantalla según los datos del backend (single source of truth).
//   D = linkDefinitivo presente → versión final del descriptivo.
//   B = fechaColaborador set (ya confirmó) y no hay definitivo → esperando.
//   A = REVISIÓN COLABORADOR + linkBorrador + sin confirmar → revisar y comentar.
//   C = cualquier otro caso (sin link, estado previo, etc.) → todavía no listo.
type EstadoVista = 'A' | 'B' | 'C' | 'D' | null;

@Component({
  selector: 'app-mi-descriptivo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mi-descriptivo.html',
  styleUrl: './mi-descriptivo.css'
})
export class MiDescriptivo implements OnInit {

  cargando     = signal(true);
  empleado     = signal<any>(null);
  error        = signal('');
  confirmando  = signal(false);
  modalSalir   = signal(false);
  modalGracias = signal(false);
  docUrlBorrador:   SafeResourceUrl | null = null;
  docUrlDefinitivo: SafeResourceUrl | null = null;
  comentario   = '';

  // ── Tutorial primera vez ──────────────────────────────────────────
  // Se muestra solo en Estado A y solo si nunca se vio (localStorage).
  // 3 pasos secuenciales: leer doc → comentar → confirmar.
  // localStorage.clear() en salir() borra el flag → vuelve a aparecer en próxima sesión.
  private readonly TUTORIAL_KEY = 'arsa_tutorial_visto';
  mostrarTutorial = signal(false);
  pasoTutorial    = signal(1);

  @ViewChild('iframeRef')   iframeRef?:   ElementRef;
  @ViewChild('textareaRef') textareaRef?: ElementRef;
  @ViewChild('botonRef')    botonRef?:    ElementRef;

  constructor(
    private api: ApiService,
    private router: Router,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    const u = JSON.parse(localStorage.getItem('usuario') || '{}');
    const legajo = u.legajo;
    if (!legajo) {
      this.error.set('No encontramos tu legajo. Cerrá sesión e intentá entrar de nuevo.');
      this.cargando.set(false);
      return;
    }

    this.api.getMiDescriptivo(legajo).subscribe({
      next: (res) => {
        this.cargando.set(false);
        if (res.ok) {
          this.empleado.set(res.data);
          this.docUrlBorrador   = this.armarDocUrl(res.data.linkBorrador);
          this.docUrlDefinitivo = this.armarDocUrl(res.data.linkDefinitivo);
          this.chequearTutorial();
        } else {
          this.error.set(res.error || 'No pudimos cargar tu descriptivo.');
        }
      },
      error: () => {
        this.cargando.set(false);
        this.error.set('Error de conexión. Intentá de nuevo en unos minutos.');
      }
    });
  }

  // Releé el descriptivo del backend (lo llamamos después de confirmar para que
  // fechaColaborador y observacionColaborador vengan ya seteados, y estadoVista()
  // pase a B sin trucos en frontend).
  private recargarEmpleado(): void {
    const legajo = this.empleado()?.legajo;
    if (!legajo) return;
    this.api.getMiDescriptivo(legajo).subscribe({
      next: (res) => {
        if (res.ok) {
          this.empleado.set(res.data);
          this.docUrlBorrador   = this.armarDocUrl(res.data.linkBorrador);
          this.docUrlDefinitivo = this.armarDocUrl(res.data.linkDefinitivo);
        }
      }
    });
  }

  private chequearTutorial(): void {
    if (this.estadoVista() !== 'A') return;
    if (!this.empleado()?.linkBorrador) return;
    if (localStorage.getItem(this.TUTORIAL_KEY)) return;
    this.mostrarTutorial.set(true);
    this.pasoTutorial.set(1);
  }

  siguientePasoTutorial(): void {
    if (this.pasoTutorial() < 3) {
      this.pasoTutorial.update(p => p + 1);
      setTimeout(() => this.scrollAlPasoTutorial(), 80);
    } else {
      this.cerrarTutorial();
    }
  }

  private scrollAlPasoTutorial(): void {
    const ref = this.pasoTutorial() === 2 ? this.textareaRef
              : this.pasoTutorial() === 3 ? this.botonRef
              : this.iframeRef;
    ref?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  cerrarTutorial(): void {
    localStorage.setItem(this.TUTORIAL_KEY, 'true');
    this.mostrarTutorial.set(false);
  }

  // Transforma el link de Google Doc en una URL embebible.
  // · Mobile (< 768px): /mobilebasic — texto fluido, sin layout A4 apretado.
  // · Desktop (≥ 768px): /preview — vista completa con formato original.
  private armarDocUrl(link: string): SafeResourceUrl | null {
    if (!link) return null;
    const base = link.replace(/\/(edit|preview|view|mobilebasic)\b.*$/, '').replace(/[?#].*$/, '');
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const url = `${base}/${isMobile ? 'mobilebasic' : 'preview'}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  // Extrae el primer nombre de "APELLIDO, Nombre Apellido2".
  get nombreCorto(): string {
    const full = this.empleado()?.apellido_nombre || '';
    const trozo = full.includes(',') ? full.split(',')[1] : full;
    return (trozo || '').trim().split(' ')[0] || '';
  }

  // ── Estado de la vista (A / B / C / D) ────────────────────────────
  // Source of truth: lo que devuelve el backend. Sin caché frontend.
  estadoVista = computed<EstadoVista>(() => {
    const e = this.empleado();
    if (!e) return null;
    // D: hay versión final (sin importar el estado del flujo).
    if (e.linkDefinitivo) return 'D';
    // B: el colaborador ya confirmó (fecha set) y no hay definitivo todavía.
    if (e.fechaColaborador) return 'B';
    // A: en revisión colaborador, con borrador, sin confirmar.
    if (e.estado === 'REVISIÓN COLABORADOR' && e.linkBorrador) return 'A';
    // C: cualquier otro caso (PENDIENTE, ENTREVISTADO, REV JEFE sin confirmar, sin borrador, etc.)
    return 'C';
  });

  // ── Acciones ──────────────────────────────────────────────────────
  confirmar(): void {
    const e = this.empleado();
    if (!e || this.confirmando()) return;
    this.confirmando.set(true);
    const comentarioActual = this.comentario.trim();

    this.api.post({
      action: 'confirmarDescriptivo',
      data: {
        legajo:      e.legajo,
        observacion: comentarioActual,
        rol:         'empleado'
      }
    }).subscribe({
      next: (res) => {
        this.confirmando.set(false);
        if (res.ok) {
          // Reflejo optimista: seteo fechaColaborador localmente para que
          // estadoVista() pase a B de inmediato (mientras el modal está abierto).
          this.empleado.update(curr => curr ? {
            ...curr,
            fechaColaborador:       new Date().toISOString().slice(0, 10),
            observacionColaborador: comentarioActual
          } : curr);
          this.modalGracias.set(true);
          // Y refresco del backend para sincronizar con la fuente de verdad
          // (formato exacto de fecha, estado nuevo, etc.).
          this.recargarEmpleado();
        } else {
          this.error.set(res.error || 'No pudimos confirmar tu descriptivo.');
        }
      },
      error: () => {
        this.confirmando.set(false);
        this.error.set('Error de conexión. Intentá de nuevo.');
      }
    });
  }

  cerrarModalGracias(): void { this.modalGracias.set(false); }

  pedirSalir():    void { this.modalSalir.set(true); }
  cancelarSalir(): void { this.modalSalir.set(false); }

  salir(): void {
    this.modalSalir.set(false);
    localStorage.clear();
    this.router.navigate(['/login']);
  }

  // ── Volver al panel (solo gerente) ────────────────────────────────
  // Detección robusta del rol guardado: parsea localStorage con try/catch,
  // normaliza a lowercase y compara exacto contra 'gerente'. Para cualquier
  // otro valor (incluido empleado, admin, rrhh, undefined, JSON inválido,
  // localStorage vacío) devuelve false → el botón NO se renderea.
  get esGerente(): boolean {
    try {
      const raw = localStorage.getItem('usuario');
      if (!raw) return false;
      const u = JSON.parse(raw);
      return String(u?.rol || '').trim().toLowerCase() === 'gerente';
    } catch {
      return false;
    }
  }

  volverAlPanel(): void {
    this.router.navigate(['/relevamiento']);
  }
}
