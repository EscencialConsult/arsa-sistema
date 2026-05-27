// ════════════════════════════════════════════════════════════════════════════
//  Estados del flujo de aprobación v2.
//
//  Fuente única de verdad en frontend para:
//   · lista canónica de los 8 estados
//   · label legible
//   · clase CSS por contexto (Nómina · Relevamiento · Stats cards)
//   · tono semántico (para CSS dinámico futuro)
//
//  Los nombres legacy (COMPLETADO, REVISIÓN, EN PROCESO) se mantienen como
//  alias defensivos por si llega data vieja antes de que la planilla se
//  termine de migrar — el backend ya normaliza al leer.
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
const LABELS: Record<string, string> = {
  // v2 canónicos
  'PENDIENTE':            'Pendiente',
  'ENTREVISTADO':         'Entrevistado',
  'REVISIÓN COLABORADOR': 'Revisión colaborador',
  'REVISIÓN JEFE':        'Revisión jefe',
  'PRESENTADO A RRHH':    'Presentado a RRHH',
  'SELLADO':              'Sellado',
  'OBSERVADO':            'Observado',
  'FUERA DE FLUJO':       'Fuera de flujo',
  // legacy (defensivos hasta que la planilla termine de migrar)
  'COMPLETADO':           'Sellado',
  'COMPLETADA':           'Sellado',
  'REVISIÓN':             'Revisión colaborador',
  'EN PROCESO':           'Entrevistado',
};

export function estadoLabel(estado: string): string {
  return LABELS[(estado || '').toUpperCase()] || 'Pendiente';
}

// ─── Clase CSS por contexto ────────────────────────────────────────────────
// Cada módulo tiene su propio prefijo. Las CSS correspondientes viven en
// nomina.css y relevamiento.css.
export type ContextoBadge = 'nomina' | 'relevamiento' | 'stats';

const CLASES_POR_CONTEXTO: Record<ContextoBadge, Record<TonoEstado, string>> = {
  // Nómina — pildora read-only.
  nomina: {
    pend:  'b-pend',
    proc:  'b-proc',
    rev:   'b-rev',
    pres:  'b-pres',
    ok:    'b-ok',
    obs:   'b-obs',
    fuera: 'b-fuera',
  },
  // Relevamiento — pildora-select en la tabla.
  relevamiento: {
    pend:  'est-pend',
    proc:  'est-proc',
    rev:   'est-rev',
    pres:  'est-pres',
    ok:    'est-ok',
    obs:   'est-obs',
    fuera: 'est-fuera',
  },
  // Stats cards (relevamiento).
  stats: {
    pend:  's-pend',
    proc:  's-proc',
    rev:   's-rev',
    pres:  's-pres',
    ok:    's-ok',
    obs:   's-obs',
    fuera: 's-fuera',
  },
};

export function estadoClass(estado: string, contexto: ContextoBadge): string {
  return CLASES_POR_CONTEXTO[contexto][colorEstado(estado)];
}
