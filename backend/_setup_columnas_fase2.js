// ══════════════════════════════════════════════════════════════════
//  FASE 2 — Setup de columnas nuevas para el acceso del empleado.
//  Archivo TEMPORAL. Borrar después de ejecutar.
//
//  Crea (idempotente):
//    Nomenclador:
//      AG (idx 32 en COL · col 33 acá) - TELEFONO
//      AH (idx 33 en COL · col 34 acá) - OBSERVACION COLABORADOR
//      AI (idx 34 en COL · col 35 acá) - FECHA REVISION COLABORADOR
//    Usuarios:
//      <al final> - HABILITADO COLABORADOR
//
//  Cómo correr:
//    1) clasp push (ya hecho)
//    2) Editor Apps Script → dropdown:
//         · verificarColumnasFase2  → confirma que AG/AH/AI estén vacías ANTES de crear
//         · setupColumnasFase2      → crea los headers (solo correr si la verificación da limpio)
//    3) Logger te dice qué creó y qué saltó
// ══════════════════════════════════════════════════════════════════

const _F2_HOJA_NOMEN = 'NOMENCLADOR DE PUESTO';
const _F2_HOJA_USERS = 'Usuarios';
const _F2_HEADER_ROW_NOMEN = 2;   // headers del nomenclador en fila 2
const _F2_HEADER_ROW_USERS = 1;   // headers de usuarios en fila 1

// Posiciones hardcodeadas para Nomenclador en AG / AH / AI (decidido con Laura el 2026-05-27,
// porque las cols Z..AF tienen data legacy que NO hay que tocar).
// ⚠ CONVENCIÓN: `col` acá es 1-based porque Apps Script `getRange(row, col)` usa 1-based.
// El backend (Código.js → COL) usa 0-based porque accede via `f[COL.X]` sobre el array de
// getValues(). Las dos apuntan a la misma columna física — diferencia es solo de API:
//   - Letra AG →  Código.js: COL.TELEFONO    = 32 (0-based)  →  acá: col 33 (1-based)
//   - Letra AH →  Código.js: COL.OBS_COLAB   = 33 (0-based)  →  acá: col 34 (1-based)
//   - Letra AI →  Código.js: COL.FECHA_COLAB = 34 (0-based)  →  acá: col 35 (1-based)
const _F2_COLS_NOMEN = [
  { col: 33, header: 'TELEFONO' },                   // AG  ← Código.js COL.TELEFONO    = 32
  { col: 34, header: 'OBSERVACION COLABORADOR' },    // AH  ← Código.js COL.OBS_COLAB   = 33
  { col: 35, header: 'FECHA REVISION COLABORADOR' }  // AI  ← Código.js COL.FECHA_COLAB = 34
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


// ══════════════════════════════════════════════════════════════════
//  Verificación PREVIA — confirma que AG/AH/AI están vacías
//  antes de correr setupColumnasFase2.
//  Lee TODAS las filas (incluida la 1 de título y la 2 de headers).
// ══════════════════════════════════════════════════════════════════

function verificarColumnasFase2() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(_F2_HOJA_NOMEN);
  if (!hoja) { Logger.log('ERROR: no existe la pestaña ' + _F2_HOJA_NOMEN); return; }

  const lastRow = hoja.getLastRow();
  Logger.log('═══ Verificación AG / AH / AI en ' + _F2_HOJA_NOMEN + ' ═══');
  Logger.log('Filas totales: ' + lastRow);
  Logger.log('');

  const cols = [
    { letra: 'AG', col: 33 },
    { letra: 'AH', col: 34 },
    { letra: 'AI', col: 35 }
  ];

  let totalNoVacios = 0;

  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    const valores = hoja.getRange(1, c.col, lastRow, 1).getValues();
    const noVacios = [];
    for (let j = 0; j < valores.length; j++) {
      const v = String(valores[j][0] === null || valores[j][0] === undefined ? '' : valores[j][0]).trim();
      if (v) noVacios.push({ fila: j + 1, valor: v });
    }

    Logger.log('Columna ' + c.letra + ' (col ' + c.col + ' en 1-based):');
    Logger.log('  Celdas no vacías: ' + noVacios.length);
    if (noVacios.length === 0) {
      Logger.log('  ✅ LIMPIA');
    } else {
      totalNoVacios += noVacios.length;
      Logger.log('  ⚠ NO ESTÁ VACÍA — muestra primeras 10:');
      const muestra = noVacios.slice(0, 10);
      for (let k = 0; k < muestra.length; k++) {
        Logger.log('    fila ' + muestra[k].fila + ': "' + muestra[k].valor + '"');
      }
      if (noVacios.length > 10) {
        Logger.log('    ... y ' + (noVacios.length - 10) + ' más');
      }
    }
    Logger.log('');
  }

  Logger.log('═══ Resumen ═══');
  if (totalNoVacios === 0) {
    Logger.log('✅ AG, AH y AI están las 3 LIMPIAS. Es seguro correr setupColumnasFase2.');
  } else {
    Logger.log('⚠ Hay ' + totalNoVacios + ' celdas con contenido. NO correr setupColumnasFase2 todavía.');
    Logger.log('Pasale el log a Claude para decidir cómo seguir.');
  }
}

