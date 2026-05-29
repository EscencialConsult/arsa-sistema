import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ApiService } from '../../services/api';

@Component({
  selector: 'app-mi-descriptivo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mi-descriptivo.html',
  styleUrl: './mi-descriptivo.css'
})
export class MiDescriptivo implements OnInit {

  cargando    = signal(true);
  empleado    = signal<any>(null);
  error       = signal('');
  confirmando = signal(false);
  confirmado  = signal(false);
  modalSalir  = signal(false);
  docUrl: SafeResourceUrl | null = null;
  comentario  = '';

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
          this.docUrl = this.armarDocUrl(res.data.linkBorrador);
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

  // Transforma el link del borrador en una URL embebible.
  // · Mobile (< 768px): /mobilebasic — Google reformatea el doc para celular
  //   (texto fluido, sin scroll horizontal, sin layout A4 apretado).
  // · Desktop (≥ 768px): /preview — vista completa con formato original.
  // Acepta el formato típico de Google Docs (.../document/d/<ID>/edit?...).
  // Sin DomSanitizer Angular bloquea iframes cross-origin.
  private armarDocUrl(linkBorrador: string): SafeResourceUrl | null {
    if (!linkBorrador) return null;
    // Base = todo lo anterior a /edit (o /preview, o /view) sin query ni fragment.
    const base = linkBorrador.replace(/\/(edit|preview|view|mobilebasic)\b.*$/, '').replace(/[?#].*$/, '');
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const url = `${base}/${isMobile ? 'mobilebasic' : 'preview'}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  // ── Estados de la UI ──────────────────────────────────────────────
  get puedeRevisar(): boolean {
    const e = this.empleado();
    return !!e && e.estado === 'REVISIÓN COLABORADOR' && !!e.linkBorrador;
  }

  get descriptivoNoListo(): boolean {
    const e = this.empleado();
    return !!e && e.estado === 'REVISIÓN COLABORADOR' && !e.linkBorrador;
  }

  get fueraDeRevisar(): boolean {
    const e = this.empleado();
    return !!e && e.estado !== 'REVISIÓN COLABORADOR';
  }

  // ── Acciones ──────────────────────────────────────────────────────
  confirmar(): void {
    const e = this.empleado();
    if (!e || this.confirmando()) return;
    this.confirmando.set(true);
    this.api.post({
      action: 'confirmarDescriptivo',
      data: {
        legajo:      e.legajo,
        observacion: this.comentario.trim(),
        rol:         'empleado'
      }
    }).subscribe({
      next: (res) => {
        this.confirmando.set(false);
        if (res.ok) {
          this.confirmado.set(true);
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

  pedirSalir():    void { this.modalSalir.set(true); }
  cancelarSalir(): void { this.modalSalir.set(false); }

  salir(): void {
    this.modalSalir.set(false);
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}
