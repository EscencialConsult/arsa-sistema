// ══════════════════════════════════════════════════════════════════
//  FASE 2 — Setup de columnas nuevas para el acceso del empleado.
//  Archivo TEMPORAL. Borrar después de ejecutar.
//
//  Crea (idempotente):
//    Nomenclador:
//      Z  (idx 25) - TELEFONO
//      AA (idx 26) - OBSERVACION COLABORADOR
//      AB (idx 27) - FECHA REVISION COLABORADOR
//    Usuarios:
//      <al final> - HABILITADO COLABORADOR
//
//  Cómo correr:
//    1) clasp push (ya hecho)
//    2) Editor Apps Script → dropdown → setupColumnasFase2 → Run
//    3) Logger te dice qué creó y qué saltó
// ══════════════════════════════════════════════════════════════════

const _F2_HOJA_NOMEN = 'NOMENCLADOR DE PUESTO';
const _F2_HOJA_USERS = 'Usuarios';
const _F2_HEADER_ROW_NOMEN = 2;   // headers del nomenclador en fila 2
const _F2_HEADER_ROW_USERS = 1;   // headers de usuarios en fila 1

// Posiciones hardcodeadas para Nomenclador (sabemos que la última col es Y/idx 24)
const _F2_COLS_NOMEN = [
  { col: 26, header: 'TELEFONO' },                   // Z
  { col: 27, header: 'OBSERVACION COLABORADOR' },    // AA
  { col: 28, header: 'FECHA REVISION COLABORADOR' }  // AB
];

// Para Usuarios: posición dinámica (después de la última col existente)
const _F2_HEADER_USERS = 'HABILITADO COLABORADOR';


function setupColumnasFase2() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('═══ Setup de columnas Fase 2 ═══');
  Logger.log('');

  _f2_setupNomenclador(ss);
  Logger.log('');
  _f2_setupUsuarios(ss);
  Logger.log('');
  Logger.log('═══ Listo ═══');
}


function _f2_setupNomenclador(ss) {
  const hoja = ss.getSheetByName(_F2_HOJA_NOMEN);
  if (!hoja) { Logger.log('ERROR: no existe la pestaña ' + _F2_HOJA_NOMEN); return; }

  Logger.log('→ ' + _F2_HOJA_NOMEN);
  const lastCol = hoja.getLastColumn();
  // Leer toda la fila de headers para chequear duplicados
  const headers = hoja.getRange(_F2_HEADER_ROW_NOMEN, 1, 1, Math.max(lastCol, 28)).getValues()[0];

  for (let i = 0; i < _F2_COLS_NOMEN.length; i++) {
    const c = _F2_COLS_NOMEN[i];

    // 1) ¿el header ya existe en alguna columna? — skip
    const yaExiste = headers.some(function(h) {
      return String(h || '').trim().toUpperCase() === c.header.toUpperCase();
    });
    if (yaExiste) {
      Logger.log('  SKIP "' + c.header + '" — ya existe en la fila de headers');
      continue;
    }

    // 2) ¿la celda destino ya tiene algo distinto? — warning y skip
    const celdaActual = String(hoja.getRange(_F2_HEADER_ROW_NOMEN, c.col).getValue() || '').trim();
    if (celdaActual) {
      Logger.log('  ⚠ SKIP col ' + c.col + ' — ya tiene contenido distinto: "' + celdaActual + '"');
      continue;
    }

    // 3) Escribir
    hoja.getRange(_F2_HEADER_ROW_NOMEN, c.col).setValue(c.header);
    Logger.log('  OK  col ' + c.col + ' ← "' + c.header + '"');
  }
}


function _f2_setupUsuarios(ss) {
  const hoja = ss.getSheetByName(_F2_HOJA_USERS);
  if (!hoja) { Logger.log('ERROR: no existe la pestaña ' + _F2_HOJA_USERS); return; }

  Logger.log('→ ' + _F2_HOJA_USERS);
  const lastCol = hoja.getLastColumn();
  const headers = hoja.getRange(_F2_HEADER_ROW_USERS, 1, 1, lastCol).getValues()[0];

  // ¿ya existe el header?
  const idxExistente = headers.findIndex(function(h) {
    return String(h || '').trim().toUpperCase() === _F2_HEADER_USERS.toUpperCase();
  });
  if (idxExistente >= 0) {
    Logger.log('  SKIP "' + _F2_HEADER_USERS + '" — ya existe en columna ' + (idxExistente + 1));
    return;
  }

  // Posición dinámica: la siguiente columna libre después de la última con header
  const colNueva = lastCol + 1;
  hoja.getRange(_F2_HEADER_ROW_USERS, colNueva).setValue(_F2_HEADER_USERS);
  Logger.log('  OK  col ' + colNueva + ' ← "' + _F2_HEADER_USERS + '"');
}
