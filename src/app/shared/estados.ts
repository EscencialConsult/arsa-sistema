// ════════════════════════════════════════════════════════════════════════════
//  Estados del flujo de aprobación v2.
//
//  Fuente única de verdad en frontend para:
//   · lista canónica de los 8 estados
//   · label legible
//   · clase CSS por contexto (Nómina · Relevamiento · Stats cards)
//   · tono semántico (para CSS dinámico futuro)
//
//  Comportamiento exactamente igual al de los mapas que vivían duplicados en
//  nomina.ts y relevamiento.ts antes del Commit 1. Los nuevos estados v2 que
//  todavía no tienen color propio caen al fallback "pend" igual que hoy —
//  eso se completa en el Commit 2 (renombrar COMPLETADO → SELLADO, sumar
//  colores para PRESENTADO A RRHH en Nómina, OBSERVADO, FUERA DE FLUJO, etc.).
// ════════════════════════════════════════════════════════════════════════════

export const ESTADOS_CANONICOS = [
  'PENDIENTE',
  'ENTREVISTADO',
  'REVISIÓN COLABORADOR',
  'REVISIÓN JEFE',
  'PRESENTADO A RRHH',
  'SELLADO',
  'OBSERVADO',
  'FUERA DE FLUJO',
] as const;

export type EstadoCanonico = typeof ESTADOS_CANONICOS[number];

// ─── Tono semántico ────────────────────────────────────────────────────────
// Categoría visual abstracta. Cada contexto (Nómina, Relevamiento, Stats)
// traduce este tono a su propia clase CSS con su prefijo.
export type TonoEstado = 'pend' | 'proc' | 'rev' | 'pres' | 'ok' | 'obs' | 'fuera';

const TONO_POR_ESTADO: Record<string, TonoEstado> = {
  // v2 canónicos
  'PENDIENTE':            'pend',
  'ENTREVISTADO':         'proc',
  'REVISIÓN COLABORADOR': 'rev',
  'REVISIÓN JEFE':        'rev',
  'PRESENTADO A RRHH':    'pres',
  'SELLADO':              'ok',
  'OBSERVADO':            'obs',
  'FUERA DE FLUJO':       'fuera',
  // legacy — el backend normaliza al leer, pero por las dudas mientras dura
  // la migración seguimos aceptando los nombres viejos.
  'COMPLETADO':           'ok',
  'COMPLETADA':           'ok',
  'REVISIÓN':             'rev',
  'EN PROCESO':           'proc',
};

export function colorEstado(estado: string): TonoEstado {
  return TONO_POR_ESTADO[(estado || '').toUpperCase()] || 'pend';
}

// ─── Label ─────────────────────────────────────────────────────────────────
// Hoy solo lo usa Nómina (la pildora read-only). Conserva el rename "raro"
// COMPLETADO → "Presentado a RRHH" — se corrige en el Commit 2.
const LABELS: Record<string, string> = {
  'COMPLETADO':   'Presentado a RRHH',
  'COMPLETADA':   'Presentado a RRHH',
  'REVISIÓN':     'Revisión',
  'ENTREVISTADO': 'Entrevistado',
  'EN PROCESO':   'En proceso',
};

export function estadoLabel(estado: string): string {
  return LABELS[(estado || '').toUpperCase()] || 'Pendiente';
}

// ─── Clase CSS por contexto ────────────────────────────────────────────────
// Cada módulo tiene su propio prefijo. Hoy los estados que no tienen clase
// propia en CSS caen al fallback "pend" — mismo comportamiento que antes
// del refactor.
export type ContextoBadge = 'nomina' | 'relevamiento' | 'stats';

const CLASES_POR_CONTEXTO: Record<ContextoBadge, Record<TonoEstado, string>> = {
  // Nómina — solo existen .b-pend / .b-proc / .b-rev / .b-ok hoy.
  nomina: {
    pend:  'b-pend',
    proc:  'b-proc',
    rev:   'b-rev',
    pres:  'b-pend',
    ok:    'b-ok',
    obs:   'b-pend',
    fuera: 'b-pend',
  },
  // Relevamiento — pildora-select en la tabla.
  relevamiento: {
    pend:  'est-pend',
    proc:  'est-proc',
    rev:   'est-rev',
    pres:  'est-pres',
    ok:    'est-ok',
    obs:   'est-pend',
    fuera: 'est-pend',
  },
  // Stats cards (relevamiento).
  stats: {
    pend:  's-pend',
    proc:  's-proc',
    rev:   's-rev',
    pres:  's-pres',
    ok:    's-ok',
    obs:   's-pend',
    fuera: 's-pend',
  },
};

export function estadoClass(estado: string, contexto: ContextoBadge): string {
  return CLASES_POR_CONTEXTO[contexto][colorEstado(estado)];
}
