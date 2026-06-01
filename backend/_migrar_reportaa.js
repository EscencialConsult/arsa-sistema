// ══════════════════════════════════════════════════════════════════
//  MIGRACIÓN col AB ("REPORTA A NOMBRE") → hoja Revisiones.
//
//  Recorre los 134 nombres cargados en AB del NOMENCLADOR DE PUESTO,
//  busca cada nombre en la nómina por match permisivo, y crea una fila
//  en Revisiones con (legajo_empleado, jefe_legajo). Promueve a cada
//  jefe único de rol 'empleado' → 'gerente' en Usuarios.
//
//  Idempotente: si la fila (empleado, jefe) ya existe en Revisiones, skip.
//
//  Funciones expuestas:
//    dryRunMigracionReportaA()  → reporta sin escribir (revisar antes)
//    migrarReportaA()           → ejecuta la migración real
//
//  El script NO TOCA NOMENCLADOR (solo lee). Solo escribe en Revisiones
//  y en la columna 'rol' de Usuarios (cambio dinámico de rol).
// ══════════════════════════════════════════════════════════════════

function dryRunMigracionReportaA() { _migrarReportaA(true); }
function migrarReportaA()          { _migrarReportaA(false); }

function _migrarReportaA(dryRun) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nomenclador = ss.getSheetByName(HOJA);
  const revisiones  = ss.getSheetByName(TAB_REVISIONES);
  const usuarios    = ss.getSheetByName(TAB_USUARIOS);

  if (!nomenclador) { Logger.log('ERROR: no existe ' + HOJA); return; }
  if (!revisiones) {
    Logger.log('ERROR: no existe la hoja "' + TAB_REVISIONES + '".');
    Logger.log('  Corré primero crearHojaRevisiones() en el editor.');
    return;
  }
  if (!usuarios)    { Logger.log('ERROR: no existe ' + TAB_USUARIOS); return; }

  Logger.log('═══ Migración Reporta-A → Revisiones ' + (dryRun ? '(DRY RUN)' : '') + ' ═══');

  // ── 1) Leer toda la nómina y construir índice nombre → legajo ──
  const nomLastRow = nomenclador.getLastRow();
  const datos = nomenclador.getRange(FILA_INICIO, 1, nomLastRow - FILA_INICIO + 1, nomenclador.getLastColumn()).getValues();

  // Mapeo permisivo: cada empleado se indexa por varias claves normalizadas
  // ("APELLIDO, NOMBRE", "APELLIDO NOMBRE", "NOMBRE APELLIDO", solo apellido).
  const nombreALegajo = {};
  for (let i = 0; i < datos.length; i++) {
    const apellido = String(datos[i][COL.APELLIDO] || '').trim();
    const nombre   = String(datos[i][COL.NOMBRE] || '').trim();
    const legajo   = String(datos[i][COL.LEGAJO] || '').trim();
    if (!legajo || !apellido) continue;

    const display = (apellido + ', ' + nombre).trim();
    const claves = [
      _normMatchName(apellido + ', ' + nombre),
      _normMatchName(apellido + ' ' + nombre),
      _normMatchName(nombre + ' ' + apellido),
      _normMatchName(nombre + ', ' + apellido)
    ];

    for (let k = 0; k < claves.length; k++) {
      if (claves[k] && !nombreALegajo[claves[k]]) {
        nombreALegajo[claves[k]] = { legajo: legajo, display: display };
      }
    }
  }

  // ── 2) Cargar Revisiones existentes para idempotencia ──
  const revLastRow = revisiones.getLastRow();
  const revYaExiste = {};
  if (revLastRow >= REV_DATA_ROW) {
    const revDatos = revisiones.getRange(REV_DATA_ROW, 1, revLastRow - REV_DATA_ROW + 1, 8).getValues();
    for (let i = 0; i < revDatos.length; i++) {
      const key = String(revDatos[i][COL_REV.LEGAJO_EMPLEADO]).trim() + '|' +
                  String(revDatos[i][COL_REV.JEFE_LEGAJO]).trim();
      if (key !== '|') revYaExiste[key] = true;
    }
  }

  // ── 3) Recorrer AB, matchear, armar filas ──
  // Col AB = idx 27 (0-based). NO se escribe acá, solo se lee.
  const COL_AB = 27;
  const filasAInsertar = [];
  const jefesUnicos    = {};
  const noMatcheados   = [];
  let totalAB = 0, yaExistian = 0;

  for (let i = 0; i < datos.length; i++) {
    const reportaA = String(datos[i][COL_AB] || '').trim();
    if (!reportaA) continue;
    totalAB++;

    const legajoEmpleado = String(datos[i][COL.LEGAJO] || '').trim();
    if (!legajoEmpleado) continue;

    const matched = nombreALegajo[_normMatchName(reportaA)];

    if (!matched) {
      noMatcheados.push({
        fila:   FILA_INICIO + i,
        legajo: legajoEmpleado,
        valor:  reportaA
      });
      continue;
    }

    const key = legajoEmpleado + '|' + matched.legajo;
    if (revYaExiste[key]) { yaExistian++; continue; }
    revYaExiste[key] = true;   // evitar duplicados dentro del mismo run

    filasAInsertar.push([
      legajoEmpleado,    // A legajo_empleado
      matched.legajo,    // B jefe_legajo
      matched.display,   // C jefe_nombre
      'migracion-AB',    // D asignado_por
      new Date(),        // E fecha_asignacion
      '',                // F firmado
      '',                // G fecha_firma
      ''                 // H observacion
    ]);
    jefesUnicos[matched.legajo] = matched.display;
  }

  // ── 4) Insertar filas en Revisiones ──
  if (!dryRun && filasAInsertar.length > 0) {
    const startRow = Math.max(revLastRow + 1, REV_DATA_ROW);
    revisiones.getRange(startRow, 1, filasAInsertar.length, 8).setValues(filasAInsertar);
  }

  // ── 5) Promover jefes a 'gerente' (solo si rol actual == 'empleado') ──
  const jefesPromovidos = [];
  const jefesYaConOtroRol = [];
  const jefesSinUsuario = [];

  const usrLastRow = usuarios.getLastRow();
  const usrHeaders = usuarios.getRange(1, 1, 1, usuarios.getLastColumn()).getValues()[0];
  const colLegajoUsr = usrHeaders.indexOf('legajo');
  const colRolUsr    = usrHeaders.indexOf('rol');

  if (colLegajoUsr < 0 || colRolUsr < 0) {
    Logger.log('⚠ Usuarios no tiene columna "legajo" o "rol" — no puedo promover roles.');
  } else if (usrLastRow >= 2) {
    const usrDatos = usuarios.getRange(2, 1, usrLastRow - 1, usuarios.getLastColumn()).getValues();
    const idxUsr = {};
    for (let i = 0; i < usrDatos.length; i++) {
      idxUsr[String(usrDatos[i][colLegajoUsr]).trim()] = { fila: 2 + i, rol: String(usrDatos[i][colRolUsr] || '').trim().toLowerCase() };
    }
    for (const jefeLegajo of Object.keys(jefesUnicos)) {
      const ent = idxUsr[jefeLegajo];
      if (!ent) {
        jefesSinUsuario.push({ legajo: jefeLegajo, nombre: jefesUnicos[jefeLegajo] });
        continue;
      }
      if (ent.rol === 'empleado') {
        if (!dryRun) usuarios.getRange(ent.fila, colRolUsr + 1).setValue('gerente');
        jefesPromovidos.push({ legajo: jefeLegajo, nombre: jefesUnicos[jefeLegajo] });
      } else {
        jefesYaConOtroRol.push({ legajo: jefeLegajo, nombre: jefesUnicos[jefeLegajo], rol: ent.rol });
      }
    }
  }

  // ── 6) Reporte ──
  Logger.log('');
  Logger.log('── Resultado ──');
  Logger.log('  Total con AB cargado:          ' + totalAB);
  Logger.log('  Filas ' + (dryRun ? 'a crear' : 'creadas') + ' en Revisiones: ' + filasAInsertar.length);
  Logger.log('  Ya existían (skip):            ' + yaExistian);
  Logger.log('  No matcheados (revisar mano):  ' + noMatcheados.length);
  Logger.log('  Jefes únicos involucrados:     ' + Object.keys(jefesUnicos).length);
  Logger.log('  Jefes ' + (dryRun ? 'a promover' : 'promovidos') + ' a gerente: ' + jefesPromovidos.length);
  Logger.log('  Jefes ya con rol no-empleado:  ' + jefesYaConOtroRol.length);
  Logger.log('  Jefes sin row en Usuarios:     ' + jefesSinUsuario.length);
  Logger.log('');

  if (noMatcheados.length > 0) {
    Logger.log('── ⚠ No matcheados ──');
    for (let i = 0; i < Math.min(noMatcheados.length, 40); i++) {
      const x = noMatcheados[i];
      Logger.log('  fila ' + x.fila + ' (legajo ' + x.legajo + '): "' + x.valor + '"');
    }
    if (noMatcheados.length > 40) Logger.log('  ... y ' + (noMatcheados.length - 40) + ' más');
    Logger.log('');
  }

  if (jefesSinUsuario.length > 0) {
    Logger.log('── ⚠ Jefes sin row en Usuarios (no se pudo promover rol) ──');
    for (let i = 0; i < jefesSinUsuario.length; i++) {
      Logger.log('  legajo ' + jefesSinUsuario[i].legajo + ' — "' + jefesSinUsuario[i].nombre + '"');
    }
    Logger.log('');
  }

  if (dryRun) {
    Logger.log('═══ DRY RUN — no se escribió nada. Para ejecutar real: migrarReportaA() ═══');
  } else {
    Logger.log('═══ Listo. Para revertir promociones, asignar rol "empleado" a mano en Usuarios. ═══');
  }
}


// Normaliza un nombre para matching permisivo: sin acentos, mayúsculas,
// solo letras/coma/espacios, espacios colapsados, trim.
function _normMatchName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z, ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
