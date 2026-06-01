// ══════════════════════════════════════════════════════════════════
//  SETUP de la hoja "Revisiones" — sistema de revisión por jefes.
//  Idempotente: si la hoja ya existe, no hace nada.
//
//  Una fila por par (empleado, jefe). Columnas:
//    A legajo_empleado      F firmado ("SI"/"")
//    B jefe_legajo          G fecha_firma
//    C jefe_nombre          H observacion
//    D asignado_por
//    E fecha_asignacion
//
//  Correr desde editor Apps Script → función crearHojaRevisiones.
// ══════════════════════════════════════════════════════════════════

function crearHojaRevisiones() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nombre = TAB_REVISIONES;   // 'Revisiones' (definido en Código.js)
  let hoja = ss.getSheetByName(nombre);

  if (hoja) {
    Logger.log('SKIP: hoja "' + nombre + '" ya existe.');
    Logger.log('  Filas actuales: ' + hoja.getLastRow());
    Logger.log('  Columnas:       ' + hoja.getLastColumn());
    return;
  }

  hoja = ss.insertSheet(nombre);

  const headers = [
    'legajo_empleado',
    'jefe_legajo',
    'jefe_nombre',
    'asignado_por',
    'fecha_asignacion',
    'firmado',
    'fecha_firma',
    'observacion'
  ];

  hoja.getRange(1, 1, 1, headers.length).setValues([headers]);
  hoja.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#e8f0fb')
    .setHorizontalAlignment('center');
  hoja.setFrozenRows(1);

  // Anchos cómodos para inspección visual.
  hoja.setColumnWidth(1, 110);   // legajo_empleado
  hoja.setColumnWidth(2, 110);   // jefe_legajo
  hoja.setColumnWidth(3, 220);   // jefe_nombre
  hoja.setColumnWidth(4, 140);   // asignado_por
  hoja.setColumnWidth(5, 140);   // fecha_asignacion
  hoja.setColumnWidth(6, 80);    // firmado
  hoja.setColumnWidth(7, 140);   // fecha_firma
  hoja.setColumnWidth(8, 320);   // observacion

  Logger.log('OK: hoja "' + nombre + '" creada con headers.');
  Logger.log('  Próximo paso sugerido: migrarReportaA() para importar los nombres de col AB.');
}
