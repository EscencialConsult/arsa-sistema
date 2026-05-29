import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from '../../services/api';

// Vista de la pantalla según el estado del descriptivo + acción del empleado.
//   A = REVISIÓN COLABORADOR sin confirmar todavía → puede revisar y comentar.
//   B = ya confirmó en esta sesión → mensaje + comentario guardado.
//   C = otro estado del flujo → "siendo revisado por el equipo".
//   D = SELLADO con link definitivo → versión final.
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
  yaConfirmo   = signal(false);              // memoria solamente — se pierde al recargar
  observacionGuardada = '';                  // texto que mandó el empleado al confirmar
  docUrlBorrador:   SafeResourceUrl | null = null;
  docUrlDefinitivo: SafeResourceUrl | null = null;
  comentario   = '';

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
  // Orden de precedencia: D > B > C > A.
  estadoVista = computed<EstadoVista>(() => {
    const e = this.empleado();
    if (!e) return null;
    // D: sellado con link definitivo → versión final
    if (e.estado === 'SELLADO' && e.linkDefinitivo) return 'D';
    // B: ya confirmó en esta sesión (prevalece sobre C, sino el estado cambia a REV JEFE y veríamos "siendo revisado")
    if (this.yaConfirmo()) return 'B';
    // A: en revisión colaborador (con o sin link — el HTML decide si muestra "no listo")
    if (e.estado === 'REVISIÓN COLABORADOR') return 'A';
    // C: cualquier otro estado del flujo
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
          this.observacionGuardada = comentarioActual;
          this.yaConfirmo.set(true);
          this.modalGracias.set(true);
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
}
