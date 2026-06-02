// ══════════════════════════════════════════════════════════════════
//  ARSA · Apps Script — API Nómina v3
//  Campos verificados del Excel real
//  Escencial Consultora · 2026
//
//  INSTRUCCIONES:
//  1. Google Sheets → Extensiones → Apps Script
//  2. Pegá este código completo y guardá
//  4. Implementar → Nueva implementación
//     · Tipo: Aplicación web
//     · Ejecutar como: Yo
//     · Acceso: Cualquier persona
//  5. Copiá la URL → pegala en environment.ts como APPS_SCRIPT_URL
// ══════════════════════════════════════════════════════════════════

const HOJA        = 'NOMENCLADOR DE PUESTO';
const FILA_INICIO = 3;   // fila 1=título, 2=encabezados, 3=primer empleado

// Layout estándar para pestañas auxiliares (Usuarios, Descriptivos, etc.)
const HEADER_ROW = 1;
const DATA_ROW   = 2;

// Nombres de pestañas conocidas
const TAB_USUARIOS       = 'Usuarios';
const TAB_DESCRIPTIVOS   = 'Descriptivos';
const TAB_PROCEDIMIENTOS = 'NOMENCLADOR DE PROCESOS — ARSA';
const TAB_REVISIONES     = 'Revisiones';

// Índices de columna (0-based) de la hoja Revisiones.
// Una fila por par (empleado, jefe). Crear con backend/_setup_revisiones.js.
const COL_REV = {
  LEGAJO_EMPLEADO:   0,   // A
  JEFE_LEGAJO:       1,   // B
  JEFE_NOMBRE:       2,   // C — "APELLIDO, Nombre" denormalizado para display
  ASIGNADO_POR:      3,   // D
  FECHA_ASIGNACION:  4,   // E
  FIRMADO:           5,   // F — "SI" / ""
  FECHA_FIRMA:       6,   // G
  OBSERVACION:       7    // H
};
const REV_HEADER_ROW = 1;
const REV_DATA_ROW   = 2;

// Índices de columna (base 0 = columna A)
const COL = {
  CODIGO:        0,   // A  - CÓDIGO PUESTO
  COD_COMPLETO:  1,   // B  - CÓDIGO COMPLETO
  NRO_FAM:       2,   // C  - NRO FAM
  LEGAJO:        3,   // D  - LEGAJO
  APELLIDO:      4,   // E  - APELLIDO
  NOMBRE:        5,   // F  - NOMBRE
  SEDE:          6,   // G  - SEDE / ORGANIZACIÓN
  CAT_SERV:      7,   // H  - CAT SERV
  RIESGO:        8,   // I  - RIESGO OPERATIVO
  FUNCION_CCT:   9,   // J  - FUNCIÓN CCT
  FAMILIA:      10,   // K  - FAMILIA
  // L (idx 11) vacía — no se usa
  CAT_NTS:      12,   // M  - CATEGORÍA N-T-ST
  REGIMEN:      13,   // N  - RÉGIMEN
  BASICO:       14,   // O  - BÁSICO FEB 2026
  ESTADO:       15,   // P  - ESTADO RELEVAMIENTO
  PERFIL_ANT:   16,   // Q  - PERFIL ANTERIOR
  AGENDA:       17,   // R  - AGENDA
  TRANSCRIPT:   18,   // S  - link/archivo de transcripción (OPCIONAL)
  LINK_BORRAD:  19,   // T  - link del perfil sin revisión / borrador (OPCIONAL)
  LINK_DEFIN:   20,   // U  - link definitivo (OBLIGATORIO para presentar a RRHH)
  DOMINIO:      21,   // V  - DOMINIO EMPLEADO
  ENEAGRAMA:    22,   // W  - eneagrama (privado)
  OBSERVACION:  23,   // X  - observación (privado)
  PROC_INTER:   24,   // Y  - proceso intervinientes
  // Z..AF (idx 25..31) actualmente sin uso / con data legacy de Laura — no tocar.
  TELEFONO:     32,   // AG - celular del empleado (para WhatsApp — Parte 2)
  OBS_COLAB:    33,   // AH - observación que deja el empleado al revisar (Parte 3)
  FECHA_COLAB:  34,   // AI - fecha de confirmación del empleado (Parte 3)
};

// Calcula el nivel jerárquico a partir de FAMILIA + FUNCIÓN (cols K + J).
//   "Jefatura de Servicio" → 3 (cualquier función)
//   "Gerencia / Subgerencia":
//     "GERENTE GRAL." → 0
//     "GERENTE"       → 1
//     "SUBGERENTE" / "A/C SUBGERENCIA" → 2
//   cualquier otra familia → "OPERATIVO"
// La familia manda: corrige errores de función mal cargada.
function calcularNivel(familia, funcion) {
  const fam = String(familia || '').trim();
  const fn  = String(funcion || '').trim().toUpperCase();
  if (fam === 'Jefatura de Servicio') return 3;
  if (fam === 'Gerencia / Subgerencia') {
    if (fn === 'GERENTE GRAL.') return 0;
    if (fn === 'GERENTE')        return 1;
    if (fn === 'SUBGERENTE' || fn === 'A/C SUBGERENCIA') return 2;
  }
  return 'OPERATIVO';
}

// Flujo de aprobación v2 — cadena secuencial colaborador → jefe → RRHH.
// OBSERVADO y FUERA DE FLUJO viven fuera de la cadena (orden -1).
// "Borrador" no es un estado: es derivado (= cualquier estado que no sea SELLADO).
const ESTADOS_VALIDOS = [
  'PENDIENTE',
  'ENTREVISTADO',
  'REVISIÓN COLABORADOR',
  'REVISIÓN JEFE',
  'PRESENTADO A RRHH',
  'SELLADO',
  'OBSERVADO',
  'FUERA DE FLUJO'
];

// Orden canónico del flujo. OBSERVADO y FUERA DE FLUJO no participan de avances/reverses.
const ORDEN_ESTADO = {
  'PENDIENTE':            0,
  'ENTREVISTADO':         1,
  'REVISIÓN COLABORADOR': 2,
  'REVISIÓN JEFE':        3,
  'PRESENTADO A RRHH':    4,
  'SELLADO':              5,
  'OBSERVADO':           -1,
  'FUERA DE FLUJO':      -1
};

// Tabla de transiciones forward permitidas.
// Cada entrada: { from, to, roles: [...], requiere: 'link' | 'observacion' | null }
// Reglas finas (quién puede rebotar a quién, observaciones discriminadas por actor)
// llegan en Fase 4. Por ahora cadena secuencial + rebote a OBSERVADO + reinyección admin.
const TRANSICIONES = [
  // FORWARD admin — cadena secuencial
  { from: 'PENDIENTE',            to: 'ENTREVISTADO',         roles: ['admin'], requiere: null },
  { from: 'ENTREVISTADO',         to: 'REVISIÓN COLABORADOR', roles: ['admin'], requiere: null },
  { from: 'REVISIÓN COLABORADOR', to: 'REVISIÓN JEFE',        roles: ['admin'], requiere: null },
  { from: 'REVISIÓN JEFE',        to: 'PRESENTADO A RRHH',    roles: ['admin'], requiere: 'link' },

  // FORWARD rrhh — último paso (sella). NO exige link definitivo: RRHH sella
  // sobre el borrador + observaciones. El link definitivo se sube después.
  { from: 'PRESENTADO A RRHH',    to: 'SELLADO',              roles: ['rrhh'],  requiere: null },

  // REBOTE rrhh → admin (descriptivo con observaciones a corregir)
  { from: 'PRESENTADO A RRHH',    to: 'OBSERVADO',            roles: ['rrhh'],  requiere: 'observacion' },

  // OBSERVADO → cualquier estado de la cadena (admin permisivo: corrige y reinyecta donde corresponda)
  { from: 'OBSERVADO',            to: 'PENDIENTE',            roles: ['admin'], requiere: null },
  { from: 'OBSERVADO',            to: 'ENTREVISTADO',         roles: ['admin'], requiere: null },
  { from: 'OBSERVADO',            to: 'REVISIÓN COLABORADOR', roles: ['admin'], requiere: null },
  { from: 'OBSERVADO',            to: 'REVISIÓN JEFE',        roles: ['admin'], requiere: null },
  { from: 'OBSERVADO',            to: 'PRESENTADO A RRHH',    roles: ['admin'], requiere: 'link' }
];

// Normaliza valores del Sheets al vocabulario canónico v2 (sin tocar la planilla).
// Mapea legacy del v1 + typos comunes + casos especiales (jubilado, licencia, informe).
// Cualquier basura no reconocida cae a PENDIENTE (default seguro).
function normalizarEstado(raw) {
  const v = str(raw).toUpperCase();

  // Vacío → default seguro
  if (!v) return 'PENDIENTE';

  // Legacy / typos → vocabulario actual
  if (v === 'ENTREVISTA' || v === 'ENTREISTADO' ||
      v === 'EN CONSTRUCCION' || v === 'EN CONSTRUCCIÓN') return 'ENTREVISTADO';
  if (v === 'REVISIÓN' || v === 'REVISION') return 'REVISIÓN COLABORADOR';
  if (v === 'COMPLETADO') return 'SELLADO';

  // Casos fuera del flujo (no se entrevistan ni se sellan)
  if (v === 'JUBILADO' ||
      v === 'LIC POR MATERNIDAD' || v === 'LICENCIA POR MATERNIDAD' ||
      v === 'INFORME A REVISAR') return 'FUERA DE FLUJO';

  // Estado válido → tal cual
  if (ESTADOS_VALIDOS.indexOf(v) >= 0) return v;

  // Cualquier otra basura → PENDIENTE
  return 'PENDIENTE';
}

// Valida una transición de estado. No escribe nada — solo decide si es permitida.
// Devuelve { ok: true, esReverse: bool } o { ok: false, error: '...' }.
function validarTransicion(estadoActual, estadoNuevo, rol, datosFila, observacionNueva, forzar) {
  const actual = normalizarEstado(estadoActual);
  const nuevo  = normalizarEstado(estadoNuevo);
  const r      = str(rol).toLowerCase();

  if (ESTADOS_VALIDOS.indexOf(nuevo) < 0) {
    return { ok: false, error: 'Estado inválido: ' + estadoNuevo };
  }
  if (actual === nuevo) {
    return { ok: false, error: 'No hay cambio de estado' };
  }

  // Revertir SELLADO: solo admin + forzar:true (acto fuerte, descriptivo sellado/publicado)
  if (actual === 'SELLADO') {
    if (r !== 'admin') {
      return { ok: false, error: 'Solo el rol admin puede revertir un SELLADO' };
    }
    if (!forzar) {
      return { ok: false, error: 'SELLADO solo se puede revertir con flag forzar:true (requiere confirmación explícita del frontend)' };
    }
    return { ok: true, esReverse: true };
  }

  // Reverse general: admin libre, otros roles no
  const esReverse = ORDEN_ESTADO[nuevo] < ORDEN_ESTADO[actual];
  if (esReverse) {
    if (r !== 'admin') {
      return { ok: false, error: 'Solo el rol admin puede revertir estados' };
    }
    return { ok: true, esReverse: true };
  }

  // Forward: buscar en tabla
  let t = null;
  for (let i = 0; i < TRANSICIONES.length; i++) {
    if (TRANSICIONES[i].from === actual && TRANSICIONES[i].to === nuevo) { t = TRANSICIONES[i]; break; }
  }
  if (!t) {
    return { ok: false, error: 'Transición no permitida: ' + actual + ' → ' + nuevo };
  }
  if (t.roles.indexOf(r) < 0) {
    return { ok: false, error: "El rol '" + r + "' no puede hacer la transición " + actual + ' → ' + nuevo };
  }

  if (t.requiere === 'link') {
    const linkDef = str(datosFila[COL.LINK_DEFIN]);
    if (!linkDef) {
      return { ok: false, error: 'Debe cargar el link definitivo (columna U) antes de presentar a RRHH' };
    }
  }
  if (t.requiere === 'observacion') {
    if (!str(observacionNueva)) {
      return { ok: false, error: 'Debe agregar observación para marcar como revisión' };
    }
  }

  return { ok: true, esReverse: false };
}

const FAMILIAS = {
  'OPA':'Operaciones Agua','ADM':'Administración','AYC':'Operaciones A y C',
  'EM':'Electromecánica / Mant.','OPC':'Operaciones Cloacas','TEC':'Técnica / Planta',
  'JEF':'Jefatura de Servicio','CAP':'Capataz','COM':'Gestión Comercial',
  'PROF':'Profesional','GER':'Gerencia / Subgerencia','OTR':'Otros','PAS':'Pasantía'
};

const SEDES = {
  'BRC':'Bariloche','GRC':'Gral. Roca','VDM':'Viedma','ALL':'Allen',
  'CAT':'Catriel','CHO':'Choele Choel','5ST':'Cinco Saltos','CPT':'Cipolletti',
  'FRO':'Fernández Oro','HUE':'Ing. Huergo','RCO':'Río Colorado','SAO':'S.A.O.',
  'CNS':'Gral. Conesa','LGR':'Las Grutas','SGR':'Sierra Grande','VAL':'Valcheta',
  'GEG':'Gral. Enrique Godoy','CRV':'Cervantes','CHK':'Chichinales','CCO':'Clte. Cordero',
  'CBE':'Cnel. Belisle','COM':'Comallo','CNI':'Cona Niyeu','DAR':'Darwin',
  'ELB':'El Bolsón','ELC':'El Cóndor','GMI':'Guardia Mitre','LPE':'Lago Pellegrini',
  'LBE':'Los Berros','LME':'Los Menucos','MQC':'Maquinchao','PLP':'Paraje Las Perlas',
  'PIL':'Pilcaniyeu','POM':'Pomona','PSE':'Puerto S.A.E.','RME':'Ramos Mexía',
  'RCH':'Río Chico','SJV':'San Javier','SCO':'Sierra Colorada','VRE':'Villa Regina',
  'NOR':'Ñorquinco','VDC':'Viedma Central','SAV':'Subg. Alto Valle',
  'SVE':'Subg. Alto Valle Este','SAN':'Subg. Andina','SAT':'Subg. Atlántica','SES':'Subg. Este'
};


// ══════════════════════════════════════════════════════════════════
//  HELPERS GENÉRICOS DE TABLA (portados del ARSA_Backend)
//  Asume layout estándar: fila 1 = headers, fila 2+ = datos.
//  NO usar para NOMENCLADOR DE PUESTO (que tiene título en fila 1).
// ══════════════════════════════════════════════════════════════════

// Lectura cruda — uso INTERNO únicamente. NO exponer vía dispatch (action=read);
// para eso está getRows() que aplica el strip de credenciales.
// Lo usa login() porque necesita comparar el password contra el sheet.
function _readRowsRaw(tabName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
  if (!sheet) throw new Error('No existe la pestaña: ' + tabName);
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_ROW) return [];
  const lastCol = sheet.getLastColumn();
  const keys = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
  const data = sheet.getRange(DATA_ROW, 1, lastRow - DATA_ROW + 1, lastCol).getValues();
  return data
    .filter(function(row) { return row.some(function(c) { return c !== ''; }); })
    .map(function(row) {
      const obj = {};
      keys.forEach(function(key, i) { if (key) obj[key] = String(row[i]).trim(); });
      return obj;
    });
}

// Lectura "segura" — siempre strippea campos de credenciales antes de devolver.
// Defensa para evitar fugas si alguien (frontend o curl) llama ?action=read&tab=Usuarios
// y la pestaña tiene un campo password en texto plano. Cubre nombres comunes:
// password / passwd / pwd. Si mañana aparece otra pestaña con credenciales bajo otro
// nombre, agregar el nombre acá y queda cubierto automáticamente.
function getRows(tabName) {
  const SENSITIVE = ['password', 'passwd', 'pwd'];
  return _readRowsRaw(tabName).map(function(row) {
    SENSITIVE.forEach(function(k) { delete row[k]; });
    return row;
  });
}

function appendRow(tabName, data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
  if (!sheet) throw new Error('No existe la pestaña: ' + tabName);
  const keys = sheet.getRange(HEADER_ROW, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(keys.map(function(key) {
    return (key && data[key] !== undefined) ? data[key] : '';
  }));
}

function updateRow(tabName, keyField, data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
  if (!sheet) return { ok: false, error: 'No existe la pestaña: ' + tabName };
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_ROW) return { ok: false, error: 'Sin datos' };
  const lastCol = sheet.getLastColumn();
  const keys = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];
  const keyIdx = keys.indexOf(keyField);
  if (keyIdx < 0) return { ok: false, error: 'Columna no encontrada: ' + keyField };
  const allData = sheet.getRange(DATA_ROW, 1, lastRow - DATA_ROW + 1, lastCol).getValues();
  for (let i = 0; i < allData.length; i++) {
    if (String(allData[i][keyIdx]).trim() === String(data[keyField]).trim()) {
      keys.forEach(function(key, col) {
        if (key && data[key] !== undefined) {
          sheet.getRange(DATA_ROW + i, col + 1).setValue(data[key]);
        }
      });
      return { ok: true, message: 'Actualizado' };
    }
  }
  return { ok: false, error: 'No encontrado' };
}

function createRow(tabName, data, uniqueKey) {
  if (uniqueKey) {
    const rows = getRows(tabName);
    if (rows.find(function(r) { return r[uniqueKey] === data[uniqueKey]; })) {
      return { ok: false, error: 'Ya existe: ' + data[uniqueKey] };
    }
  }
  appendRow(tabName, data);
  return { ok: true, message: 'Creado en ' + tabName };
}


// ══════════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════════

function login(usuario, password) {
  if (!usuario) return { ok: false, error: 'Ingresa tu usuario' };
  // _readRowsRaw conserva el campo password para poder validarlo. NUNCA devolver estas
  // filas tal cual al cliente — el strip de safe.password al final del flujo es obligatorio.
  const rows = _readRowsRaw(TAB_USUARIOS);
  const user = rows.find(function(r) {
    return r.usuario && r.usuario.toLowerCase() === usuario.toLowerCase() &&
           r.password && r.password === password;
  });
  if (!user) return { ok: false, error: 'Usuario o contraseña incorrectos' };
  if (!user.activo || user.activo.toUpperCase() !== 'SI') {
    return { ok: false, error: 'Usuario inactivo' };
  }
  const safe = Object.assign({}, user);
  delete safe.password;
  return { ok: true, data: safe };
}

// Login del empleado: busca por LEGAJO (no por usuario), valida pwd + activo + HABILITADO COLABORADOR.
// Una sola lectura — todo vive en Usuarios. Datos del descriptivo vienen en otro endpoint (Parte 3).
function loginEmpleado(legajo, password) {
  if (!legajo || !password) {
    return { ok: false, error: 'Legajo y contraseña son obligatorios' };
  }
  const rows = _readRowsRaw(TAB_USUARIOS);
  const user = rows.find(function(r) {
    return String(r.legajo).trim() === String(legajo).trim();
  });
  // Mismo mensaje para legajo inexistente y pwd incorrecta (anti-enumeration)
  if (!user) return { ok: false, error: 'Legajo o contraseña incorrectos' };
  if (String(user.password) !== String(password)) {
    return { ok: false, error: 'Legajo o contraseña incorrectos' };
  }
  if (!user.activo || user.activo.toUpperCase() !== 'SI') {
    return { ok: false, error: 'Tu usuario está inactivo' };
  }
  const habilitado = String(user['HABILITADO COLABORADOR'] || '').toUpperCase();
  if (habilitado !== 'SI') {
    return { ok: false, error: 'Tu perfil todavía no está disponible para revisar' };
  }
  const safe = Object.assign({}, user);
  delete safe.password;
  return { ok: true, data: safe };
}

// Pre-carga Usuarios indexado por legajo. Usado por getNomina para enriquecer cada fila
// con `habilitado` sin hacer 860 lecturas individuales.
function _loadUsuariosByLegajo() {
  const map = {};
  try {
    const rows = _readRowsRaw(TAB_USUARIOS);
    for (let i = 0; i < rows.length; i++) {
      const u = rows[i];
      if (u.legajo) map[String(u.legajo).trim()] = u;
    }
  } catch (e) {
    // Si Usuarios no se puede leer (pestaña borrada, permisos, etc.), devolver mapa vacío.
    // Consecuencia: habilitado quedará false para todos. Mejor que romper la pantalla entera.
  }
  return map;
}

// Devuelve true si el usuario tiene HABILITADO COLABORADOR = SI en Usuarios.
function _esHabilitado(usuarioRow) {
  if (!usuarioRow) return false;
  return String(usuarioRow['HABILITADO COLABORADOR'] || '').toUpperCase() === 'SI';
}

// Habilita el acceso del empleado al sistema:
//  1. Valida el estado actual del descriptivo (debe estar en ENTREVISTADO o REVISIÓN COLABORADOR)
//  2. Actualiza password + HABILITADO COLABORADOR = SI en Usuarios
//  3. Si estado era ENTREVISTADO, lo pasa a REVISIÓN COLABORADOR (apertura del flujo al colaborador)
//     Si estado era REVISIÓN COLABORADOR, no toca estado (caso reset de password)
//  4. Si llega telefono, lo escribe en NOMENCLADOR.COL.TELEFONO (para el WhatsApp del admin)
//
//  Idempotente para resets: el admin puede llamarlo varias veces con distinta pwd y queda OK.
function habilitarColaborador(legajo, password, telefono) {
  if (!legajo)   return { ok: false, error: 'Falta legajo' };
  if (!password) return { ok: false, error: 'Falta contraseña' };

  // 1) Localizar la fila del empleado en el Nomenclador para validar el estado actual
  const hoja  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
  const datos = hoja.getDataRange().getValues();
  let rowIndex = -1;
  let fila = null;
  for (let i = FILA_INICIO - 1; i < datos.length; i++) {
    if (str(datos[i][COL.LEGAJO]) === str(legajo)) {
      rowIndex = i;
      fila = datos[i];
      break;
    }
  }
  if (rowIndex < 0) {
    return { ok: false, error: 'Legajo no encontrado en el nomenclador: ' + legajo };
  }

  const estadoActual = normalizarEstado(fila[COL.ESTADO]);
  let cambiarEstadoA = null;
  if (estadoActual === 'ENTREVISTADO') {
    cambiarEstadoA = 'REVISIÓN COLABORADOR';
  } else if (estadoActual === 'REVISIÓN COLABORADOR') {
    cambiarEstadoA = null;  // reset de pwd, no toca estado
  } else {
    return {
      ok: false,
      error: 'Solo se puede habilitar desde ENTREVISTADO o REVISIÓN COLABORADOR. Estado actual: ' + estadoActual
    };
  }

  // 2) Actualizar Usuarios: password + activo + HABILITADO COLABORADOR = SI
  // activo es chequeado por loginEmpleado, así que habilitar también lo activa.
  const updateResult = updateRow(TAB_USUARIOS, 'legajo', {
    legajo: String(legajo),
    password: String(password),
    activo: 'SI',
    'HABILITADO COLABORADOR': 'SI'
  });
  if (!updateResult.ok) {
    return { ok: false, error: 'No pude actualizar Usuarios: ' + updateResult.error };
  }

  // 3) Cambiar estado del Nomenclador si corresponde
  if (cambiarEstadoA) {
    hoja.getRange(rowIndex + 1, COL.ESTADO + 1).setValue(cambiarEstadoA);
  }

  // 4) Teléfono opcional → escribir en NOMENCLADOR.COL.TELEFONO
  const telefonoFinal = telefono ? String(telefono) : str(fila[COL.TELEFONO]);
  if (telefono) {
    hoja.getRange(rowIndex + 1, COL.TELEFONO + 1).setValue(telefonoFinal);
  }

  return {
    ok: true,
    legajo: String(legajo),
    estadoAnterior: estadoActual,
    estado: cambiarEstadoA || estadoActual,
    habilitado: true,
    esReset: cambiarEstadoA === null,
    telefono: telefonoFinal
  };
}


// ══════════════════════════════════════════════════════════════════
//  ACCESO DEL EMPLEADO — /mi-descriptivo
// ══════════════════════════════════════════════════════════════════

// Devuelve los datos del descriptivo del empleado para mostrarle SU PROPIA
// pantalla. NO incluye campos privados (transcripción, eneagrama, observación
// interna ni link definitivo). El borrador es lo que el empleado revisa.
function getMiDescriptivo(legajo) {
  if (!legajo) return { ok: false, error: 'Falta legajo' };
  const hoja  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
  const datos = hoja.getDataRange().getValues();
  for (let i = FILA_INICIO - 1; i < datos.length; i++) {
    if (str(datos[i][COL.LEGAJO]) === str(legajo)) {
      const f = datos[i];
      const codigo   = str(f[COL.CODIGO]);
      const codComp  = str(f[COL.COD_COMPLETO]);
      const apellido = str(f[COL.APELLIDO]);
      const nombre   = str(f[COL.NOMBRE]);
      const sedeNom  = str(f[COL.SEDE]);
      const familia  = str(f[COL.FAMILIA]);
      const famCode  = codigo.split('-')[0].toUpperCase();
      const partes   = codComp.split('|');
      const sedeCode = partes.length > 1 ? partes[1].trim().toUpperCase() : '';
      // Fecha de confirmación del colaborador: si la celda tiene un Date (set
      // por confirmarDescriptivo con `new Date()`), formateamos a yyyy-MM-dd.
      // Si está vacía, queda string vacío. El frontend la usa como flag.
      const fechaRaw = f[COL.FECHA_COLAB];
      const fechaColaborador = fechaRaw instanceof Date
        ? Utilities.formatDate(fechaRaw, Session.getScriptTimeZone(), 'yyyy-MM-dd')
        : str(fechaRaw);

      return {
        ok: true,
        data: {
          legajo:                 str(legajo),
          apellido_nombre:        (apellido + ', ' + nombre).trim(),
          sedeName:               SEDES[sedeCode] || sedeNom,
          puesto:                 familia || FAMILIAS[famCode] || famCode,
          linkBorrador:           str(f[COL.LINK_BORRAD]),
          linkDefinitivo:         str(f[COL.LINK_DEFIN]),
          estado:                 normalizarEstado(f[COL.ESTADO]),
          observacionColaborador: str(f[COL.OBS_COLAB]),
          fechaColaborador:       fechaColaborador
        }
      };
    }
  }
  return { ok: false, error: 'Legajo no encontrado: ' + legajo };
}

// El empleado confirma su descriptivo desde /mi-descriptivo.
//  · Valida que rol == 'empleado' (defensa básica).
//  · Valida que el estado actual sea REVISIÓN COLABORADOR.
//  · Guarda observación en COL.OBS_COLAB (puede venir vacía).
//  · Sella la fecha de confirmación en COL.FECHA_COLAB.
//  · Avanza el estado a REVISIÓN JEFE.
function confirmarDescriptivo(data) {
  if (!data)         return { ok: false, error: 'Falta data' };
  const legajo      = data.legajo;
  const observacion = str(data.observacion);
  const rol         = String(data.rol || '').toLowerCase();
  if (!legajo)        return { ok: false, error: 'Falta legajo' };
  if (rol !== 'empleado') {
    return { ok: false, error: 'Acción reservada para el empleado' };
  }

  const hoja  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
  const datos = hoja.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = FILA_INICIO - 1; i < datos.length; i++) {
    if (str(datos[i][COL.LEGAJO]) === str(legajo)) { rowIndex = i; break; }
  }
  if (rowIndex < 0) return { ok: false, error: 'Legajo no encontrado: ' + legajo };

  const estadoActual = normalizarEstado(datos[rowIndex][COL.ESTADO]);
  if (estadoActual !== 'REVISIÓN COLABORADOR') {
    return {
      ok: false,
      error: 'No podés confirmar ahora. Estado actual: ' + estadoActual
    };
  }

  // Escribir observación, fecha, y avanzar estado.
  if (observacion) {
    hoja.getRange(rowIndex + 1, COL.OBS_COLAB + 1).setValue(observacion);
  }
  hoja.getRange(rowIndex + 1, COL.FECHA_COLAB + 1).setValue(new Date());
  hoja.getRange(rowIndex + 1, COL.ESTADO + 1).setValue('REVISIÓN JEFE');

  return {
    ok: true,
    legajo: str(legajo),
    estadoAnterior: estadoActual,
    estado: 'REVISIÓN JEFE',
    observacionGuardada: !!observacion
  };
}


// ══════════════════════════════════════════════════════════════════
//  REVISORES — sistema de revisión por jefes (bloque 2)
//  Schema en hoja `Revisiones`, creada por _setup_revisiones.js.
//  Una fila por par (empleado, jefe) con su estado de firma.
// ══════════════════════════════════════════════════════════════════

// Devuelve la lista de jefes candidatos a revisar el descriptivo de un empleado.
//   nivelSolicitado:
//     undefined / vacío → calcula 1 nivel arriba del empleado
//     '0' | '1' | '2' | '3' → ese nivel exacto
//     'TODOS' → toda la nómina, sin filtro de nivel (buscador total del modal)
// Cada candidato: { legajo, nombre, familia, funcion, sede, nivel }
function getJefesElegibles(legajoEmpleado, nivelSolicitado) {
  if (!legajoEmpleado) return { ok: false, error: 'Falta legajo del empleado' };

  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
  if (!hoja) return { ok: false, error: 'No existe ' + HOJA };
  const datos = hoja.getDataRange().getValues();

  // 1) Resolver el nivel del empleado
  let nivelEmpleado = null;
  for (let i = FILA_INICIO - 1; i < datos.length; i++) {
    if (str(datos[i][COL.LEGAJO]) === str(legajoEmpleado)) {
      nivelEmpleado = calcularNivel(datos[i][COL.FAMILIA], datos[i][COL.FUNCION_CCT]);
      break;
    }
  }
  if (nivelEmpleado === null) return { ok: false, error: 'Empleado no encontrado: ' + legajoEmpleado };

  // 2) Resolver el nivel objetivo
  let nivelObjetivo;
  const ns = String(nivelSolicitado || '').trim();
  if (ns.toUpperCase() === 'TODOS') {
    nivelObjetivo = 'TODOS';
  } else if (ns !== '') {
    nivelObjetivo = Number(ns);
    if (isNaN(nivelObjetivo) || nivelObjetivo < 0 || nivelObjetivo > 3) {
      return { ok: false, error: 'nivelSolicitado inválido: "' + nivelSolicitado + '" (esperado 0-3 o TODOS)' };
    }
  } else {
    // Default: 1 nivel arriba. Operativo → 3. Niveles 1-3 → uno menos. Nivel 0 → vacío (Gerente Gral no tiene arriba).
    if (nivelEmpleado === 'OPERATIVO') nivelObjetivo = 3;
    else if (nivelEmpleado === 0)      nivelObjetivo = -1;   // sin candidatos posibles
    else                                nivelObjetivo = nivelEmpleado - 1;
  }

  // 3) Filtrar nómina
  const candidatos = [];
  for (let i = FILA_INICIO - 1; i < datos.length; i++) {
    const f = datos[i];
    const legajoCand = str(f[COL.LEGAJO]);
    if (!legajoCand) continue;
    if (legajoCand === str(legajoEmpleado)) continue;          // no ser revisor de uno mismo

    const nivelCand = calcularNivel(f[COL.FAMILIA], f[COL.FUNCION_CCT]);
    if (nivelObjetivo !== 'TODOS' && nivelCand !== nivelObjetivo) continue;

    const apellido = str(f[COL.APELLIDO]);
    const nombre   = str(f[COL.NOMBRE]);
    if (!apellido && !nombre) continue;

    candidatos.push({
      legajo:  legajoCand,
      nombre:  (apellido + ', ' + nombre).trim(),
      familia: str(f[COL.FAMILIA]),
      funcion: str(f[COL.FUNCION_CCT]),
      sede:    str(f[COL.SEDE]),
      nivel:   nivelCand
    });
  }

  // Orden: por familia, luego apellido
  candidatos.sort(function(a, b) {
    if (a.familia !== b.familia) return a.familia < b.familia ? -1 : 1;
    return a.nombre < b.nombre ? -1 : 1;
  });

  return {
    ok: true,
    nivelEmpleado: nivelEmpleado,
    nivelObjetivo: nivelObjetivo,
    data: candidatos
  };
}


// Asigna un jefe como revisor del descriptivo del empleado.
//   · Crea fila en Revisiones (firmado vacío) — error si ya existe el par.
//   · Escribe nombre del jefe en col AB del empleado (organigrama).
//   · Si rol del jefe en Usuarios era 'empleado' → pasa a 'gerente'.
function asignarRevisor(data) {
  if (!data) return { ok: false, error: 'Falta data' };
  const legajoEmp  = str(data.legajo_empleado);
  const legajoJefe = str(data.legajo_jefe);
  const asignadoPor = str(data.asignado_por) || 'admin';

  if (!legajoEmp)  return { ok: false, error: 'Falta legajo_empleado' };
  if (!legajoJefe) return { ok: false, error: 'Falta legajo_jefe' };
  if (legajoEmp === legajoJefe) return { ok: false, error: 'Un empleado no puede ser su propio revisor' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nomenclador = ss.getSheetByName(HOJA);
  const revisiones  = ss.getSheetByName(TAB_REVISIONES);
  const usuarios    = ss.getSheetByName(TAB_USUARIOS);
  if (!revisiones) return { ok: false, error: 'No existe la hoja Revisiones — correr crearHojaRevisiones()' };

  // 1) Localizar fila del empleado + nombre del jefe (1 sola pasada al nomenclador)
  const datos = nomenclador.getDataRange().getValues();
  let rowEmpleado = -1;
  let jefeNombre = '';
  for (let i = FILA_INICIO - 1; i < datos.length; i++) {
    const leg = str(datos[i][COL.LEGAJO]);
    if (leg === legajoEmp) rowEmpleado = i;
    if (leg === legajoJefe) {
      jefeNombre = (str(datos[i][COL.APELLIDO]) + ', ' + str(datos[i][COL.NOMBRE])).trim();
    }
  }
  if (rowEmpleado < 0) return { ok: false, error: 'Empleado no encontrado: ' + legajoEmp };
  if (!jefeNombre)     return { ok: false, error: 'Jefe no encontrado en nómina: ' + legajoJefe };

  // 2) Validar que el par no exista ya en Revisiones
  const revLastRow = revisiones.getLastRow();
  if (revLastRow >= REV_DATA_ROW) {
    const revDatos = revisiones.getRange(REV_DATA_ROW, 1, revLastRow - REV_DATA_ROW + 1, 8).getValues();
    for (let i = 0; i < revDatos.length; i++) {
      if (str(revDatos[i][COL_REV.LEGAJO_EMPLEADO]) === legajoEmp &&
          str(revDatos[i][COL_REV.JEFE_LEGAJO]) === legajoJefe) {
        return { ok: false, error: 'Ese jefe ya está asignado como revisor' };
      }
    }
  }

  // 3) Insertar fila nueva en Revisiones
  const startRow = Math.max(revLastRow + 1, REV_DATA_ROW);
  revisiones.getRange(startRow, 1, 1, 8).setValues([[
    legajoEmp, legajoJefe, jefeNombre, asignadoPor, new Date(), '', '', ''
  ]]);

  // 4) Recomputar col AB del empleado con TODOS los revisores joineados por " / ".
  // (NO sobrescribimos directo: si ya había otros revisores, los preservamos.)
  _actualizarABRevisores(nomenclador, revisiones, legajoEmp);

  // 5) Promover rol del jefe a 'gerente' SI era 'empleado'.
  //    El helper marca el flag `promovido_por_sistema = SI` para que un
  //    futuro quitarRevisor sepa distinguir esta promoción de un gerente nato.
  const rolCambio = _promoverJefe(usuarios, legajoJefe);

  return {
    ok: true,
    legajo_empleado: legajoEmp,
    legajo_jefe: legajoJefe,
    jefe_nombre: jefeNombre,
    rolCambiado: rolCambio
  };
}


// Quita un revisor del descriptivo del empleado.
//   · Error si ese revisor ya firmó.
//   · Error si dejaría el descriptivo huérfano: estado REVISIÓN JEFE + ningún
//     otro revisor cargado. El admin tiene que asignar reemplazo antes.
//   · Borra fila de Revisiones + limpia col AB del empleado.
//   · Si después del quit el empleado estaba en REVISIÓN JEFE y todos los
//     revisores restantes ya firmaron → avanza estado a PRESENTADO A RRHH.
//     (Avance que normalmente dispara firmarRevision; sin esto el quit del
//     único pendiente dejaría el descriptivo trabado.)
//   · Si al jefe no le quedan más revisiones asignadas → degrada rol si
//     corresponde (gerentes natos quedan intactos).
function quitarRevisor(data) {
  if (!data) return { ok: false, error: 'Falta data' };
  const legajoEmp  = str(data.legajo_empleado);
  const legajoJefe = str(data.legajo_jefe);
  if (!legajoEmp)  return { ok: false, error: 'Falta legajo_empleado' };
  if (!legajoJefe) return { ok: false, error: 'Falta legajo_jefe' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const nomenclador = ss.getSheetByName(HOJA);
  const revisiones  = ss.getSheetByName(TAB_REVISIONES);
  const usuarios    = ss.getSheetByName(TAB_USUARIOS);
  if (!revisiones) return { ok: false, error: 'No existe la hoja Revisiones' };

  const revLastRow = revisiones.getLastRow();
  if (revLastRow < REV_DATA_ROW) return { ok: false, error: 'No hay revisiones cargadas' };

  // 1) Localizar fila
  const revDatos = revisiones.getRange(REV_DATA_ROW, 1, revLastRow - REV_DATA_ROW + 1, 8).getValues();
  let rowIdx = -1;
  for (let i = 0; i < revDatos.length; i++) {
    if (str(revDatos[i][COL_REV.LEGAJO_EMPLEADO]) === legajoEmp &&
        str(revDatos[i][COL_REV.JEFE_LEGAJO]) === legajoJefe) {
      rowIdx = i; break;
    }
  }
  if (rowIdx < 0) return { ok: false, error: 'Ese revisor no está asignado a este descriptivo' };

  // 2) Validar que no haya firmado
  if (str(revDatos[rowIdx][COL_REV.FIRMADO]).toUpperCase() === 'SI') {
    return { ok: false, error: 'No se puede quitar: ya firmó' };
  }

  // 3) Leer estado del empleado del nomenclador (usado para el bloqueo de
  //    huérfanos y para el auto-advance post-delete).
  const datosNom = nomenclador.getDataRange().getValues();
  let rowEmpleadoNom = -1;
  let estadoEmp = '';
  for (let i = FILA_INICIO - 1; i < datosNom.length; i++) {
    if (str(datosNom[i][COL.LEGAJO]) === legajoEmp) {
      rowEmpleadoNom = i;
      estadoEmp = normalizarEstado(datosNom[i][COL.ESTADO]);
      break;
    }
  }

  // 4) ANTI-HUÉRFANO: si estado=REV JEFE y este sería el último revisor,
  //    bloquear. Quedaría sin nadie autorizado a firmar → trabado para siempre.
  if (estadoEmp === 'REVISIÓN JEFE') {
    let totalEmpAntes = 0;
    for (let i = 0; i < revDatos.length; i++) {
      if (str(revDatos[i][COL_REV.LEGAJO_EMPLEADO]) === legajoEmp) totalEmpAntes++;
    }
    if (totalEmpAntes <= 1) {
      return {
        ok: false,
        error: 'Este descriptivo está esperando firma. Antes de quitar a ' +
               str(revDatos[rowIdx][COL_REV.JEFE_NOMBRE]) +
               ', asigná otro revisor que tome el lugar.'
      };
    }
  }

  // 5) Borrar la fila
  revisiones.deleteRow(REV_DATA_ROW + rowIdx);

  // 6) Recomputar col AB del empleado con los revisores que QUEDAN en Revisiones.
  // Si quedan 0, AB queda vacío. Si quedan otros, AB sigue mostrándolos.
  _actualizarABRevisores(nomenclador, revisiones, legajoEmp);

  // 7) Re-leer Revisiones después del delete (usado por quedanAlJefe + auto-advance)
  let revDatosAfter = [];
  const revLastRowAfter = revisiones.getLastRow();
  if (revLastRowAfter >= REV_DATA_ROW) {
    revDatosAfter = revisiones.getRange(REV_DATA_ROW, 1, revLastRowAfter - REV_DATA_ROW + 1, 8).getValues();
  }

  // 8) Contar cuántas revisiones le quedan al JEFE
  let quedanAlJefe = 0;
  for (let i = 0; i < revDatosAfter.length; i++) {
    if (str(revDatosAfter[i][COL_REV.JEFE_LEGAJO]) === legajoJefe) quedanAlJefe++;
  }

  // 9) AUTO-ADVANCE: si estado=REV JEFE y al empleado le quedan revisores y
  //    todos ya firmaron → escribir PRESENTADO A RRHH. Análogo al avance
  //    automático que dispara firmarRevision cuando el último pendiente firma.
  let avanzoEstado = false;
  let estadoNuevo  = '';
  if (estadoEmp === 'REVISIÓN JEFE' && rowEmpleadoNom >= 0) {
    let totalEmp = 0, pendientesEmp = 0;
    for (let i = 0; i < revDatosAfter.length; i++) {
      if (str(revDatosAfter[i][COL_REV.LEGAJO_EMPLEADO]) !== legajoEmp) continue;
      totalEmp++;
      if (str(revDatosAfter[i][COL_REV.FIRMADO]).toUpperCase() !== 'SI') pendientesEmp++;
    }
    if (totalEmp > 0 && pendientesEmp === 0) {
      nomenclador.getRange(rowEmpleadoNom + 1, COL.ESTADO + 1).setValue('PRESENTADO A RRHH');
      avanzoEstado = true;
      estadoNuevo  = 'PRESENTADO A RRHH';
    }
  }

  // 10) Si quedan 0 revisiones al jefe, degradar SOLO si fue promoción del
  //     sistema. El helper respeta a gerentes natos (flag vacío) y deja su rol
  //     intacto. Si fue promoción del sistema (flag = SI), degrada y limpia.
  let rolRevertido = false;
  if (quedanAlJefe === 0) {
    rolRevertido = _degradarJefeSiCorresponde(usuarios, legajoJefe);
  }

  return {
    ok: true,
    legajo_empleado: legajoEmp,
    legajo_jefe: legajoJefe,
    quedanAlJefe: quedanAlJefe,
    rolRevertido: rolRevertido,
    avanzoEstado: avanzoEstado,
    estadoNuevo: estadoNuevo
  };
}


// Lista de revisores de un descriptivo, con su estado de firma.
function getRevisoresPorDescriptivo(legajoEmpleado) {
  if (!legajoEmpleado) return { ok: false, error: 'Falta legajo_empleado' };

  const revisiones = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_REVISIONES);
  if (!revisiones) return { ok: false, error: 'No existe la hoja Revisiones' };

  const revLastRow = revisiones.getLastRow();
  if (revLastRow < REV_DATA_ROW) return { ok: true, data: [] };

  const revDatos = revisiones.getRange(REV_DATA_ROW, 1, revLastRow - REV_DATA_ROW + 1, 8).getValues();
  const tz = Session.getScriptTimeZone();
  const out = [];

  for (let i = 0; i < revDatos.length; i++) {
    if (str(revDatos[i][COL_REV.LEGAJO_EMPLEADO]) !== str(legajoEmpleado)) continue;
    const fechaAsig = revDatos[i][COL_REV.FECHA_ASIGNACION];
    const fechaFirma = revDatos[i][COL_REV.FECHA_FIRMA];
    out.push({
      jefe_legajo:      str(revDatos[i][COL_REV.JEFE_LEGAJO]),
      jefe_nombre:      str(revDatos[i][COL_REV.JEFE_NOMBRE]),
      asignado_por:     str(revDatos[i][COL_REV.ASIGNADO_POR]),
      fecha_asignacion: fechaAsig instanceof Date ? Utilities.formatDate(fechaAsig, tz, 'yyyy-MM-dd') : str(fechaAsig),
      firmado:          str(revDatos[i][COL_REV.FIRMADO]).toUpperCase() === 'SI',
      fecha_firma:      fechaFirma instanceof Date ? Utilities.formatDate(fechaFirma, tz, 'yyyy-MM-dd') : str(fechaFirma),
      observacion:      str(revDatos[i][COL_REV.OBSERVACION])
    });
  }

  return { ok: true, data: out };
}


// Devuelve los descriptivos donde un jefe figura como revisor
// Y el empleado está en estado REVISIÓN JEFE (no antes).
// Incluye el comentario del colaborador para que el jefe lo lea.
function getNominaPorJefe(legajoJefe) {
  if (!legajoJefe) return { ok: false, error: 'Falta legajo_jefe' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const revisiones  = ss.getSheetByName(TAB_REVISIONES);
  const nomenclador = ss.getSheetByName(HOJA);
  if (!revisiones) return { ok: false, error: 'No existe la hoja Revisiones' };

  // 1) Recolectar empleados asignados a este jefe
  const revLastRow = revisiones.getLastRow();
  if (revLastRow < REV_DATA_ROW) return { ok: true, data: [] };

  const revDatos = revisiones.getRange(REV_DATA_ROW, 1, revLastRow - REV_DATA_ROW + 1, 8).getValues();
  const asignados = {};
  for (let i = 0; i < revDatos.length; i++) {
    if (str(revDatos[i][COL_REV.JEFE_LEGAJO]) !== str(legajoJefe)) continue;
    const legEmp = str(revDatos[i][COL_REV.LEGAJO_EMPLEADO]);
    asignados[legEmp] = {
      firmado: str(revDatos[i][COL_REV.FIRMADO]).toUpperCase() === 'SI'
    };
  }
  if (Object.keys(asignados).length === 0) return { ok: true, data: [] };

  // 2) Filtrar nómina por estado REVISIÓN JEFE
  const datos = nomenclador.getDataRange().getValues();
  const out = [];
  for (let i = FILA_INICIO - 1; i < datos.length; i++) {
    const f = datos[i];
    const legajoEmp = str(f[COL.LEGAJO]);
    if (!legajoEmp || !asignados[legajoEmp]) continue;

    const estado = normalizarEstado(f[COL.ESTADO]);
    if (estado !== 'REVISIÓN JEFE') continue;

    const codigo   = str(f[COL.CODIGO]);
    const codComp  = str(f[COL.COD_COMPLETO]);
    const sedeNom  = str(f[COL.SEDE]);
    const partes   = codComp.split('|');
    const sedeCode = partes.length > 1 ? partes[1].trim().toUpperCase() : '';
    const famCode  = codigo.split('-')[0].toUpperCase();

    out.push({
      legajo:           legajoEmp,
      apellido_nombre:  (str(f[COL.APELLIDO]) + ', ' + str(f[COL.NOMBRE])).trim(),
      sede:             SEDES[sedeCode] || sedeNom,
      familia:          str(f[COL.FAMILIA]) || FAMILIAS[famCode] || famCode,
      linkBorrador:     str(f[COL.LINK_BORRAD]),
      observacion_colab: str(f[COL.OBS_COLAB]),
      yaFirmoEsteJefe:  asignados[legajoEmp].firmado,
      estado:           estado
    });
  }

  return { ok: true, data: out };
}


// Historial del jefe: descriptivos donde firmó (firmado=SI).
// Análogo a getNominaPorJefe pero invierte el filtro: en vez de pendientes,
// devuelve los aprobados, con la fecha de firma para mostrar en la UI.
function getDescriptivosFirmadosPorJefe(legajoJefe) {
  if (!legajoJefe) return { ok: false, error: 'Falta legajo_jefe' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const revisiones  = ss.getSheetByName(TAB_REVISIONES);
  const nomenclador = ss.getSheetByName(HOJA);
  if (!revisiones) return { ok: false, error: 'No existe la hoja Revisiones' };

  const revLastRow = revisiones.getLastRow();
  if (revLastRow < REV_DATA_ROW) return { ok: true, data: [] };

  // 1) Recolectar empleados firmados por este jefe (con fecha de firma)
  const revDatos = revisiones.getRange(REV_DATA_ROW, 1, revLastRow - REV_DATA_ROW + 1, 8).getValues();
  const firmados = {};
  for (let i = 0; i < revDatos.length; i++) {
    if (str(revDatos[i][COL_REV.JEFE_LEGAJO]) !== str(legajoJefe)) continue;
    if (str(revDatos[i][COL_REV.FIRMADO]).toUpperCase() !== 'SI') continue;
    const legEmp = str(revDatos[i][COL_REV.LEGAJO_EMPLEADO]);
    firmados[legEmp] = {
      fecha_firma: revDatos[i][COL_REV.FECHA_FIRMA] instanceof Date
                    ? Utilities.formatDate(revDatos[i][COL_REV.FECHA_FIRMA], Session.getScriptTimeZone(), 'yyyy-MM-dd')
                    : str(revDatos[i][COL_REV.FECHA_FIRMA])
    };
  }
  if (Object.keys(firmados).length === 0) return { ok: true, data: [] };

  // 2) Enriquecer con datos del nomenclador
  const datos = nomenclador.getDataRange().getValues();
  const out = [];
  for (let i = FILA_INICIO - 1; i < datos.length; i++) {
    const f = datos[i];
    const legajoEmp = str(f[COL.LEGAJO]);
    if (!legajoEmp || !firmados[legajoEmp]) continue;

    const codigo   = str(f[COL.CODIGO]);
    const codComp  = str(f[COL.COD_COMPLETO]);
    const sedeNom  = str(f[COL.SEDE]);
    const partes   = codComp.split('|');
    const sedeCode = partes.length > 1 ? partes[1].trim().toUpperCase() : '';
    const famCode  = codigo.split('-')[0].toUpperCase();

    out.push({
      legajo:           legajoEmp,
      apellido_nombre:  (str(f[COL.APELLIDO]) + ', ' + str(f[COL.NOMBRE])).trim(),
      sede:             SEDES[sedeCode] || sedeNom,
      familia:          str(f[COL.FAMILIA]) || FAMILIAS[famCode] || famCode,
      linkBorrador:     str(f[COL.LINK_BORRAD]),
      linkDefinitivo:   str(f[COL.LINK_DEFIN]),
      estado:           normalizarEstado(f[COL.ESTADO]),
      fecha_firma:      firmados[legajoEmp].fecha_firma
    });
  }

  // Más recientes arriba (fecha en yyyy-MM-dd ordena bien como string)
  out.sort(function(a, b) { return (b.fecha_firma || '').localeCompare(a.fecha_firma || ''); });
  return { ok: true, data: out };
}


// El jefe firma un descriptivo asignado.
//   · Valida rol gerente, asignación, no haber firmado ya.
//   · Marca firmado=SI + fecha + observación.
//   · Si era el último pendiente → avanza estado del empleado a PRESENTADO A RRHH
//     (transición automática del sistema; bypass de validarTransicion porque
//     no es una acción de admin/rrhh manual).
function firmarRevision(data) {
  if (!data) return { ok: false, error: 'Falta data' };
  const legajoEmp   = str(data.legajo_empleado);
  const legajoJefe  = str(data.legajo_jefe);
  const observacion = str(data.observacion);
  const rol         = String(data.rol || '').toLowerCase();

  if (!legajoEmp)  return { ok: false, error: 'Falta legajo_empleado' };
  if (!legajoJefe) return { ok: false, error: 'Falta legajo_jefe' };
  if (rol !== 'gerente') return { ok: false, error: 'Acción reservada para rol gerente' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const revisiones  = ss.getSheetByName(TAB_REVISIONES);
  const nomenclador = ss.getSheetByName(HOJA);
  if (!revisiones) return { ok: false, error: 'No existe la hoja Revisiones' };

  const revLastRow = revisiones.getLastRow();
  if (revLastRow < REV_DATA_ROW) return { ok: false, error: 'No hay revisiones cargadas' };

  // 1) Localizar la fila de este jefe para este empleado
  const revDatos = revisiones.getRange(REV_DATA_ROW, 1, revLastRow - REV_DATA_ROW + 1, 8).getValues();
  let rowIdx = -1;
  for (let i = 0; i < revDatos.length; i++) {
    if (str(revDatos[i][COL_REV.LEGAJO_EMPLEADO]) === legajoEmp &&
        str(revDatos[i][COL_REV.JEFE_LEGAJO]) === legajoJefe) {
      rowIdx = i; break;
    }
  }
  if (rowIdx < 0) return { ok: false, error: 'No estás asignado como revisor de este descriptivo' };

  // 2) Validar que no haya firmado
  if (str(revDatos[rowIdx][COL_REV.FIRMADO]).toUpperCase() === 'SI') {
    return { ok: false, error: 'Ya firmaste este descriptivo' };
  }

  // 3) Marcar firmado
  const filaSheet = REV_DATA_ROW + rowIdx;
  revisiones.getRange(filaSheet, COL_REV.FIRMADO + 1).setValue('SI');
  revisiones.getRange(filaSheet, COL_REV.FECHA_FIRMA + 1).setValue(new Date());
  revisiones.getRange(filaSheet, COL_REV.OBSERVACION + 1).setValue(observacion);

  // 4) Contar pendientes del empleado (re-leer todo)
  const revLastRowAfter = revisiones.getLastRow();
  const revDatosAfter = revisiones.getRange(REV_DATA_ROW, 1, revLastRowAfter - REV_DATA_ROW + 1, 8).getValues();
  let pendientes = 0, total = 0;
  for (let i = 0; i < revDatosAfter.length; i++) {
    if (str(revDatosAfter[i][COL_REV.LEGAJO_EMPLEADO]) !== legajoEmp) continue;
    total++;
    if (str(revDatosAfter[i][COL_REV.FIRMADO]).toUpperCase() !== 'SI') pendientes++;
  }

  // 5) Si era el último pendiente, avanzar estado
  let avanzoEstado = false;
  let estadoNuevo  = '';
  if (pendientes === 0 && total > 0) {
    const datos = nomenclador.getDataRange().getValues();
    for (let i = FILA_INICIO - 1; i < datos.length; i++) {
      if (str(datos[i][COL.LEGAJO]) === legajoEmp) {
        const estadoActual = normalizarEstado(datos[i][COL.ESTADO]);
        if (estadoActual === 'REVISIÓN JEFE') {
          nomenclador.getRange(i + 1, COL.ESTADO + 1).setValue('PRESENTADO A RRHH');
          avanzoEstado = true;
          estadoNuevo  = 'PRESENTADO A RRHH';
        }
        break;
      }
    }
  }

  return {
    ok: true,
    legajo_empleado: legajoEmp,
    legajo_jefe: legajoJefe,
    pendientes: pendientes,
    total: total,
    todosFirmaron: pendientes === 0,
    avanzoEstado: avanzoEstado,
    estadoNuevo: estadoNuevo
  };
}


// Helper privado: recomputa la celda AB (col 28) del empleado leyendo TODAS sus
// filas en Revisiones y joineando los `jefe_nombre` con " / ".
// Lo llaman asignarRevisor y quitarRevisor después de modificar Revisiones —
// así AB siempre refleja el estado real, sin importar cuántos revisores haya.
// Si no quedan revisiones para el empleado, AB queda vacío.
function _actualizarABRevisores(nomencladorSheet, revisionesSheet, legajoEmpleado) {
  // 1) Recolectar jefe_nombre de Revisiones para este empleado
  const nombres = [];
  const revLastRow = revisionesSheet.getLastRow();
  if (revLastRow >= REV_DATA_ROW) {
    const revDatos = revisionesSheet.getRange(REV_DATA_ROW, 1, revLastRow - REV_DATA_ROW + 1, 8).getValues();
    for (let i = 0; i < revDatos.length; i++) {
      if (str(revDatos[i][COL_REV.LEGAJO_EMPLEADO]) === str(legajoEmpleado)) {
        const nombre = str(revDatos[i][COL_REV.JEFE_NOMBRE]);
        if (nombre) nombres.push(nombre);
      }
    }
  }

  // 2) Buscar fila del empleado en NOMENCLADOR y escribir col AB
  const datos = nomencladorSheet.getDataRange().getValues();
  for (let i = FILA_INICIO - 1; i < datos.length; i++) {
    if (str(datos[i][COL.LEGAJO]) === str(legajoEmpleado)) {
      nomencladorSheet.getRange(i + 1, 28).setValue(nombres.join(' / '));
      return;
    }
  }
}


// Asegura que la hoja Usuarios tenga la columna `promovido_por_sistema`.
// Si no existe, la crea como última columna con el header. Idempotente.
// Returns el índice 1-based de la columna, o -1 si la hoja no es válida.
//
// La columna distingue entre dos tipos de gerentes en la hoja Usuarios:
//   · `SI`     → la promoción a 'gerente' la hizo el sistema (asignarRevisor).
//                Si después le sacan la última asignación, el sistema lo baja.
//   · vacío   → gerente nato (rol cargado por admin/RRHH). El sistema NO toca.
function _asegurarColumnaPromocion(usuariosSheet) {
  if (!usuariosSheet) return -1;
  const lastCol = usuariosSheet.getLastColumn();
  const headers = usuariosSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const idx = headers.indexOf('promovido_por_sistema');
  if (idx >= 0) return idx + 1;
  const nuevaCol = lastCol + 1;
  usuariosSheet.getRange(1, nuevaCol).setValue('promovido_por_sistema');
  return nuevaCol;
}

// Promueve a un jefe de 'empleado' a 'gerente' y marca el flag
// `promovido_por_sistema = SI`. Si el rol actual NO es 'empleado'
// (ya era gerente nato, admin, rrhh, etc.), no toca nada.
// Returns true solo si efectivamente promovió.
function _promoverJefe(usuariosSheet, legajo) {
  if (!usuariosSheet) return false;
  const lastRow = usuariosSheet.getLastRow();
  if (lastRow < 2) return false;

  // PRIMERO asegurar la columna del flag — puede agregar una columna nueva.
  const colFlag = _asegurarColumnaPromocion(usuariosSheet);
  if (colFlag < 0) return false;

  const lastCol = usuariosSheet.getLastColumn();
  const headers = usuariosSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const colLegajo = headers.indexOf('legajo');
  const colRol    = headers.indexOf('rol');
  if (colLegajo < 0 || colRol < 0) return false;

  const datos = usuariosSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  for (let i = 0; i < datos.length; i++) {
    if (str(datos[i][colLegajo]) !== str(legajo)) continue;
    const rolActual = String(datos[i][colRol] || '').trim().toLowerCase();
    if (rolActual !== 'empleado') return false;   // ya era gerente nato, admin, rrhh, etc.
    usuariosSheet.getRange(2 + i, colRol + 1).setValue('gerente');
    usuariosSheet.getRange(2 + i, colFlag).setValue('SI');
    return true;
  }
  return false;
}

// Degrada a 'empleado' SOLO si el rol actual es 'gerente' Y el flag
// `promovido_por_sistema` está en 'SI'. Para gerentes natos (flag vacío),
// no toca nada — su rol fue cargado manualmente y el sistema lo respeta.
// Al degradar, limpia el flag para mantener coherencia.
// Returns true solo si efectivamente degradó.
function _degradarJefeSiCorresponde(usuariosSheet, legajo) {
  if (!usuariosSheet) return false;
  const lastRow = usuariosSheet.getLastRow();
  if (lastRow < 2) return false;

  const colFlag = _asegurarColumnaPromocion(usuariosSheet);
  if (colFlag < 0) return false;

  const lastCol = usuariosSheet.getLastColumn();
  const headers = usuariosSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const colLegajo = headers.indexOf('legajo');
  const colRol    = headers.indexOf('rol');
  if (colLegajo < 0 || colRol < 0) return false;

  const datos = usuariosSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  for (let i = 0; i < datos.length; i++) {
    if (str(datos[i][colLegajo]) !== str(legajo)) continue;
    const rolActual = String(datos[i][colRol] || '').trim().toLowerCase();
    const flag      = String(datos[i][colFlag - 1] || '').trim().toUpperCase();
    if (rolActual !== 'gerente') return false;    // ya no es gerente, nada que degradar
    if (flag !== 'SI')           return false;    // gerente nato → respetar
    usuariosSheet.getRange(2 + i, colRol + 1).setValue('empleado');
    usuariosSheet.getRange(2 + i, colFlag).setValue('');   // limpiar flag
    return true;
  }
  return false;
}


// Asegura que el nomenclador tenga las 3 columnas de registro del sellado de RRHH:
//   · sello_rrhh  → autor del sellado, formato "Nombre (legajo)"
//   · fecha_sello → timestamp del sellado
//   · obs_rrhh    → observación de RRHH (al sellar opcional, al devolver obligatoria)
//
// Layout objetivo (confirmado contra la planilla real):
//   · Headers de los nombres técnicos viven en FILA 2 del nomenclador (no fila 1,
//     que mezcla título + headers humanos descriptivos).
//   · Columnas hasta AI (idx 35 1-based) están en uso: ...AG=teléfono, AH=obs_colab,
//     AI=fecha_colab. Las 3 nuevas arrancan en AJ (36) — primer slot libre.
//
// Idempotente:
//   · Si las columnas ya existen (encontradas por nombre en fila 2), retorna sus
//     posiciones actuales sin tocar nada.
//   · Si faltan, las appendea desde max(lastCol+1, AJ=36). El piso AJ garantiza que
//     nunca pisemos las cols AG/AH/AI aunque getLastColumn devuelva algo raro.
//   · Si hubiera data lateral más allá de AI (improbable), el helper salta a la
//     siguiente posición libre para no pisar — defensa adicional.
//
// Returns un objeto con índices 1-based listos para getRange():
//   { sello_rrhh: <col>, fecha_sello: <col>, obs_rrhh: <col> }
function _asegurarColumnasSelloRrhh(nomencladorSheet) {
  if (!nomencladorSheet) return null;
  const NOMBRES = ['sello_rrhh', 'fecha_sello', 'obs_rrhh'];
  const HEADER_ROW_NOM = 2;   // headers técnicos del nomenclador
  const PRIMER_COL_LIBRE = 36;  // AJ — primer slot libre después de AG/AH/AI

  const lastCol = nomencladorSheet.getLastColumn();
  const headers = nomencladorSheet.getRange(HEADER_ROW_NOM, 1, 1, lastCol).getValues()[0];

  // Punto de partida para appendear: max(lastCol, AJ-1). Si lastCol == 35 (AI),
  // nextCol arranca en 35 y al primer ++ va a 36 (AJ). Si por algún motivo
  // lastCol fuera menor (hoja recién creada), igualmente arranca en AJ.
  const out = {};
  let nextCol = Math.max(lastCol, PRIMER_COL_LIBRE - 1);
  for (let i = 0; i < NOMBRES.length; i++) {
    const nombre = NOMBRES[i];
    const idx = headers.indexOf(nombre);
    if (idx >= 0) {
      out[nombre] = idx + 1;   // ya existe → usar su posición actual
    } else {
      nextCol++;
      nomencladorSheet.getRange(HEADER_ROW_NOM, nextCol).setValue(nombre);
      out[nombre] = nextCol;
    }
  }
  return out;
}


// ══════════════════════════════════════════════════════════════════
//  LINKS / preview
// ══════════════════════════════════════════════════════════════════

// Convierte URLs de Google Workspace al formato /preview embebible.
// URLs no-Google (Dropbox, etc.) se devuelven tal cual.
function _toPreviewUrl(url) {
  if (!url) return '';
  let clean = url.split('?')[0].split('#')[0];
  clean = clean.replace(/\/(edit|view)$/, '/preview');
  return clean;
}

function getLinkDefinitivo(legajo) {
  if (!legajo) return { ok: false, error: 'Falta legajo' };
  const hoja  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
  const datos = hoja.getDataRange().getValues();
  for (let i = FILA_INICIO - 1; i < datos.length; i++) {
    if (str(datos[i][COL.LEGAJO]) === str(legajo)) {
      const raw = str(datos[i][COL.LINK_DEFIN]);
      if (!raw) return { ok: false, error: 'Sin link definitivo cargado' };
      return { ok: true, link: _toPreviewUrl(raw) };
    }
  }
  return { ok: false, error: 'Legajo no encontrado: ' + legajo };
}


// ══════════════════════════════════════════════════════════════════
//  DESCRIPTIVOS
//  Headers de la pestaña Descriptivos (13):
//    familia_id, familia_nombre, puesto_nombre, sede_alcance, cant_empleados,
//    categoria, estado, mision, dependencia, publicado, revisor_rrhh,
//    procs_asignados, link_doc
// ══════════════════════════════════════════════════════════════════

function saveDescriptivo(data) {
  // TODO: validar rol admin antes de permitir esta acción (requiere token de sesión, ver CLAUDE.md)
  return updateRow(TAB_DESCRIPTIVOS, 'familia_id', data);
}

function createDescriptivo(data) {
  // TODO: validar rol admin antes de permitir esta acción (requiere token de sesión, ver CLAUDE.md)
  return createRow(TAB_DESCRIPTIVOS, data, 'familia_id');
}

// publicar: marca un descriptivo como publicado.
// Si viene autor Y revisor_rrhh está vacío, lo registra como acta de publicación.
// Si revisor_rrhh ya tiene contenido (comentarios previos), NO lo pisa — preserva el historial.
function publicar(familia_id, autor) {
  if (!familia_id) return { ok: false, error: 'Falta familia_id' };

  const rows = getRows(TAB_DESCRIPTIVOS);
  const row = rows.find(function(r) { return r.familia_id === familia_id; });
  if (!row) return { ok: false, error: 'Descriptivo no encontrado: familia_id=' + familia_id };

  const update = {
    familia_id: familia_id,
    publicado:  'SI',
    estado:     'Publicado'
  };

  if (autor && !str(row.revisor_rrhh)) {
    update.revisor_rrhh = 'Publicado por ' + autor;
  }

  return updateRow(TAB_DESCRIPTIVOS, 'familia_id', update);
}

// comentar: sobrescribe revisor_rrhh con [autor · DD/MM/YYYY]: texto.
// Formato heredado del ARSA_Backend — pobre pero compatible.
function comentar(familia_id, texto, autor) {
  if (!familia_id) return { ok: false, error: 'Falta familia_id' };
  if (!texto)      return { ok: false, error: 'Falta texto del comentario' };

  const d = new Date();
  const hoy = [d.getDate(), d.getMonth() + 1, d.getFullYear()]
    .map(function(n) { return String(n).padStart(2, '0'); })
    .join('/');

  return updateRow(TAB_DESCRIPTIVOS, 'familia_id', {
    familia_id:    familia_id,
    revisor_rrhh:  '[' + (autor || 'RRHH') + ' · ' + hoy + ']: ' + texto
  });
}


// ══════════════════════════════════════════════════════════════════
//  PROCEDIMIENTOS
//  Pestaña 'Procedimientos' — 5 columnas: id, nombre, area, categoria, link_doc
// ══════════════════════════════════════════════════════════════════

function saveProcedimiento(data) {
  // TODO: validar rol admin antes de permitir esta acción (requiere token de sesión, ver CLAUDE.md)
  return updateRow('Procedimientos', 'id', data);
}

function createProcedimiento(data) {
  // TODO: validar rol admin antes de permitir esta acción (requiere token de sesión, ver CLAUDE.md)
  return createRow('Procedimientos', data, 'id');
}


// ══════════════════════════════════════════════════════════════════
//  GET — punto de entrada principal
// ══════════════════════════════════════════════════════════════════
function doGet(e) {
  const p      = e.parameter || {};
  const accion = p.action || p.accion || 'nomina';
  const rol    = p.rol    || 'admin';

  let res;
  try {
    if      (accion === 'nomina')            res = getNomina(p, rol);
    else if (accion === 'empleado' ||
             accion === 'getEmpleado')       res = getEmpleado(p.legajo, rol);
    else if (accion === 'stats')             res = getStats();
    else if (accion === 'familias')          res = { ok: true, data: FAMILIAS };
    else if (accion === 'sedes')             res = { ok: true, data: SEDES };
    else if (accion === 'login')             res = login(p.usuario, p.password);
    else if (accion === 'loginEmpleado')     res = loginEmpleado(p.legajo, p.password);
    else if (accion === 'getMiDescriptivo')  res = getMiDescriptivo(p.legajo);
    else if (accion === 'getJefesElegibles') res = getJefesElegibles(p.legajo, p.nivel);
    else if (accion === 'getRevisoresPorDescriptivo') res = getRevisoresPorDescriptivo(p.legajo);
    else if (accion === 'getNominaPorJefe')  res = getNominaPorJefe(p.legajo_jefe);
    else if (accion === 'getDescriptivosFirmadosPorJefe') res = getDescriptivosFirmadosPorJefe(p.legajo_jefe);
    else if (accion === 'read')              res = (p.tab === 'Nomina')
                                               ? getNomina({ all: 'true' }, rol)
                                               : { ok: true, data: getRows(p.tab) };
    else if (accion === 'getLinkDefinitivo') res = getLinkDefinitivo(p.legajo);
    else                                     res = { ok: false, error: 'Acción no reconocida' };
  } catch (err) {
    res = { ok: false, error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(res))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Nómina con filtros ─────────────────────────────────────────────
function getNomina(p, rol) {
  const hoja  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
  const datos = hoja.getDataRange().getValues();

  const fFamilia = (p.familia || '').toUpperCase().trim();
  const fSede    = (p.sede    || '').toUpperCase().trim();
  const fEstado  = (p.estado  || '').toUpperCase().trim();
  const fLegajo  = (p.legajo  || '').trim();
  const fQ       = (p.q       || '').toLowerCase().trim();

  const hayFiltro = fFamilia || fSede || fEstado || fLegajo || fQ;
  const all = p.all === 'true' || p.all === true;

  // Normalizar rol UNA vez — el Sheets guarda 'RRHH' en mayúsculas pero comparamos
  // contra 'rrhh' lowercase. Usar rolNorm en los checks que siguen.
  const rolNorm = String(rol || '').toLowerCase();

  // Si pide all=true sin rol válido, rechazar (protege los campos privados)
  if (all && rolNorm !== 'admin' && rolNorm !== 'rrhh') {
    return { ok: false, error: 'Acceso completo requiere rol admin o rrhh' };
  }

  if (!hayFiltro && !all) return { ok: true, total: 0, data: [], vacio: true };

  // Pre-load Usuarios indexado por legajo para enriquecer cada fila con `habilitado`.
  // Lectura única (una sola pasada a la pestaña Usuarios), después O(1) por fila.
  const usuariosMap = _loadUsuariosByLegajo();

  const lista = [];

  for (let i = FILA_INICIO - 1; i < datos.length; i++) {
    const f = datos[i];
    if (!f[COL.CODIGO]) continue;

    const codigo   = str(f[COL.CODIGO]);
    const codComp  = str(f[COL.COD_COMPLETO]);
    const apellido = str(f[COL.APELLIDO]);
    const nombre   = str(f[COL.NOMBRE]);
    const sedeNom  = str(f[COL.SEDE]);
    const familia  = str(f[COL.FAMILIA]);
    const catServ  = str(f[COL.CAT_SERV]);
    const legajo   = str(f[COL.LEGAJO]);

    // Extraer familia del código (antes del guión — 3 o 4 letras)
    const famCode  = codigo.split('-')[0].toUpperCase();

    // Extraer código de sede del código completo (segundo segmento | )
    const partes   = codComp.split('|');
    const sedeCode = partes.length > 1 ? partes[1].trim().toUpperCase() : '';

    // Extraer nivel N (sin mostrar T ni ST)
    const nts        = partes.length > 2 ? partes[2].trim() : str(f[COL.CAT_NTS]);
    const nivelMatch = nts.match(/N\s*(\d+)/i);
    const nivel      = nivelMatch ? 'N' + nivelMatch[1] : '';

    // Normalizar estado (incluye mapeo de variantes legacy → canónico)
    const estadoNorm = normalizarEstado(f[COL.ESTADO]);

    // ── Aplicar filtros ──
    if (fFamilia && famCode   !== fFamilia) continue;
    if (fSede    && sedeCode  !== fSede)    continue;
    if (fEstado  && estadoNorm !== fEstado) continue;
    if (fLegajo  && legajo    !== fLegajo)  continue;
    if (fQ) {
      const txt = `${apellido} ${nombre} ${codigo} ${sedeNom} ${legajo}`.toLowerCase();
      if (!txt.includes(fQ)) continue;
    }

    const emp = {
      codigo,
      legajo,
      apellido,
      nombre,
      apellido_nombre: apellido + ', ' + nombre,
      puesto:    familia || FAMILIAS[famCode] || famCode,
      sede:      sedeNom,
      sedeCode,
      sedeName:  SEDES[sedeCode] || sedeNom,
      familia:   famCode,
      familiaNombre: FAMILIAS[famCode] || familia,
      catServicio:   catServ,
      riesgo:        str(f[COL.RIESGO]),
      nivel_cct:     str(f[COL.FUNCION_CCT]),
      nivel,
      basico:        str(f[COL.BASICO]),
      estado:        estadoNorm,
      estado_relev:  estadoNorm,
      linkBorrador:  str(f[COL.LINK_BORRAD]),
      linkDefinitivo:str(f[COL.LINK_DEFIN]),
      dominio:       str(f[COL.DOMINIO]),
      telefono:      str(f[COL.TELEFONO]),
      habilitado:    _esHabilitado(usuariosMap[legajo]),
    };

    // Campos privados — solo admin y rrhh (usa rolNorm para tolerar 'RRHH' mayúscula del Sheets)
    if (rolNorm === 'admin' || rolNorm === 'rrhh') {
      emp.transcripcion = str(f[COL.TRANSCRIPT]);
      emp.eneagrama     = str(f[COL.ENEAGRAMA]);
      emp.observacion   = str(f[COL.OBSERVACION]);
    }

    lista.push(emp);
  }

  return { ok: true, total: lista.length, data: lista };
}

// ── Un empleado por legajo ──────────────────────────────────────────
function getEmpleado(legajo, rol) {
  if (!legajo) return { ok: false, error: 'Falta el legajo' };
  const res = getNomina({ legajo }, rol);
  if (!res.ok || res.data.length === 0) return { ok: false, error: 'No encontrado' };
  return { ok: true, data: res.data[0] };
}

// ── Stats para Dashboard ───────────────────────────────────────────
function getStats() {
  const hoja  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
  const datos = hoja.getDataRange().getValues();

  const stats = {
    total: 0,
    porEstado: {
      'PENDIENTE':         0,
      'ENTREVISTADO':      0,
      'PRESENTADO A RRHH': 0,
      'REVISIÓN':          0,
      'COMPLETADO':        0
    },
    porFamilia:  {},
    porSede:     {},
    porCat:      { CAT1: 0, CAT2: 0, CAT3: 0, CAT4: 0 }
  };

  for (let i = FILA_INICIO - 1; i < datos.length; i++) {
    const f = datos[i];
    if (!f[COL.CODIGO]) continue;
    stats.total++;

    const est = normalizarEstado(f[COL.ESTADO]);
    stats.porEstado[est] = (stats.porEstado[est] || 0) + 1;

    const fam = str(f[COL.CODIGO]).split('-')[0].toUpperCase();
    stats.porFamilia[fam] = (stats.porFamilia[fam] || 0) + 1;

    const partes = str(f[COL.COD_COMPLETO]).split('|');
    const sc = partes.length > 1 ? partes[1].trim().toUpperCase() : '';
    if (sc) stats.porSede[sc] = (stats.porSede[sc] || 0) + 1;

    const cat = str(f[COL.CAT_SERV]).replace(/\s/g,'').toUpperCase();
    if (stats.porCat[cat] !== undefined) stats.porCat[cat]++;
  }

  // Avance = todo lo que no es PENDIENTE. Cuenta filas con estado válido (normalizarEstado descarta basura).
  const relevados = stats.total - stats.porEstado['PENDIENTE'];
  stats.relevados = relevados;
  stats.avancePct = stats.total > 0 ? Math.round((relevados / stats.total) * 100) : 0;

  return { ok: true, data: stats };
}

// ══════════════════════════════════════════════════════════════════
//  POST — escritura desde la plataforma Angular
// ══════════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const accion = body.action || body.accion;
    let res;
    switch (accion) {
      case 'actualizarEstado':  res = actualizarEstado(body.legajo, body.estado, body.rol, body.observacion, body.forzar); break;
      case 'actualizarLinks':   res = actualizarLinks(body.legajo, body.linkBorrador, body.linkDefinitivo); break;
      case 'guardarPrivados':   res = guardarPrivados(body.legajo, body.transcripcion, body.eneagrama, body.observacion); break;
      case 'updateEntrevista':  res = updateEntrevistaRouter(body.data); break;
      case 'updateUsuario':     res = updateRow(TAB_USUARIOS, 'legajo', body.data); break;
      // TODO: verificar que exista pestaña 'Nomina' en el NOMENCLADOR DE PUESTO antes de usar este endpoint.
      // En la migración del ARSA_Backend solo se trajo la pestaña 'Usuarios'. Si el frontend
      // necesita altas manuales de empleados, hay que decidir: (a) crear pestaña 'Nomina' separada,
      // o (b) hacer que createEmpleado agregue fila al nomenclador principal directamente.
      case 'createEmpleado':    res = createRow('Nomina', body.data, 'legajo'); break;
      case 'saveDescriptivo':   res = saveDescriptivo(body.data); break;
      case 'createDescriptivo': res = createDescriptivo(body.data); break;
      case 'publicar':          res = publicar(body.data && body.data.familia_id, body.data && body.data.autor); break;
      case 'comentar':          res = comentar(body.data && body.data.familia_id, body.data && body.data.texto, body.data && body.data.autor); break;
      case 'saveProcedimiento':   res = saveProcedimiento(body.data); break;
      case 'createProcedimiento': res = createProcedimiento(body.data); break;
      case 'createUsuario':       res = createRow(TAB_USUARIOS, body.data, 'usuario'); break;
      case 'habilitarColaborador': res = habilitarColaborador(body.data && body.data.legajo, body.data && body.data.password, body.data && body.data.telefono); break;
      case 'confirmarDescriptivo': res = confirmarDescriptivo(body.data); break;
      case 'asignarRevisor':       res = asignarRevisor(body.data); break;
      case 'quitarRevisor':        res = quitarRevisor(body.data); break;
      case 'firmarRevision':       res = firmarRevision(body.data); break;
      default: res = { ok: false, error: 'Acción no reconocida' };
    }
    return json(res);
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

// Cambia el estado del relevamiento aplicando la máquina de transiciones.
// Si la transición es a REVISIÓN, escribe también la observación (col X) en la misma ejecución.
function actualizarEstado(legajo, nuevoEstado, rol, observacion, forzar, autorNombre, autorLegajo) {
  if (!legajo)      return { ok: false, error: 'Falta legajo' };
  if (!nuevoEstado) return { ok: false, error: 'Falta estado' };
  if (!rol)         return { ok: false, error: 'Falta rol' };

  const nuevo = normalizarEstado(nuevoEstado);

  const hoja  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
  const datos = hoja.getDataRange().getValues();

  let rowIndex = -1;
  let fila = null;
  for (let i = FILA_INICIO - 1; i < datos.length; i++) {
    if (str(datos[i][COL.LEGAJO]) === str(legajo)) {
      rowIndex = i;
      fila = datos[i];
      break;
    }
  }
  if (rowIndex < 0) return { ok: false, error: 'Legajo no encontrado: ' + legajo };

  const estadoAnterior = normalizarEstado(fila[COL.ESTADO]);

  const v = validarTransicion(estadoAnterior, nuevo, rol, fila, observacion, forzar);
  if (!v.ok) return v;

  hoja.getRange(rowIndex + 1, COL.ESTADO + 1).setValue(nuevo);

  let observacionGuardada = false;
  if (str(observacion)) {
    hoja.getRange(rowIndex + 1, COL.OBSERVACION + 1).setValue(observacion);
    observacionGuardada = true;
  }

  // Registrar trazabilidad de la acción de RRHH (sellado o devolución).
  // Las 3 columnas AJ/AK/AL (sello_rrhh / fecha_sello / obs_rrhh) son
  // "RRHH-action-specific": guardan QUIÉN/CUÁNDO/QUÉ-OBSERVÓ del último acto
  // formal de RRHH sobre el descriptivo. SELLADO sin observación, OBSERVADO
  // con observación obligatoria (ya validada por validarTransicion).
  let selloRegistrado = false;
  const rolNorm = String(rol).toLowerCase();
  if (rolNorm === 'rrhh' && (nuevo === 'SELLADO' || nuevo === 'OBSERVADO')) {
    const cols = _asegurarColumnasSelloRrhh(hoja);
    if (cols) {
      const nombre = str(autorNombre);
      const lg     = str(autorLegajo);
      // Formato "Nombre (legajo)". Si no llega el nombre, queda solo el legajo
      // o un placeholder claro para que sea evidente en auditoría.
      const huella = nombre
        ? (lg ? nombre + ' (' + lg + ')' : nombre)
        : (lg ? '(' + lg + ')' : '— sin autor identificado —');
      hoja.getRange(rowIndex + 1, cols.sello_rrhh).setValue(huella);
      hoja.getRange(rowIndex + 1, cols.fecha_sello).setValue(new Date());
      // obs_rrhh: solo en devoluciones. Para SELLADO queda vacía (el sello
      // puede o no llevar observación, pero por convención la guardamos solo
      // cuando es un rebote con motivo).
      if (nuevo === 'OBSERVADO' && str(observacion)) {
        hoja.getRange(rowIndex + 1, cols.obs_rrhh).setValue(observacion);
      }
      selloRegistrado = true;
    }
  }

  return {
    ok: true,
    legajo: str(legajo),
    estadoAnterior: estadoAnterior,
    estado: nuevo,
    observacionGuardada: observacionGuardada,
    selloRegistrado: selloRegistrado
  };
}

function actualizarLinks(legajo, borrador, definitivo) {
  if (!legajo) return { ok: false, error: 'Falta legajo' };
  if (borrador   !== undefined) escribirCelda(legajo, COL.LINK_BORRAD, borrador);
  if (definitivo !== undefined) escribirCelda(legajo, COL.LINK_DEFIN,  definitivo);
  return { ok: true, legajo };
}

function guardarPrivados(legajo, transcripcion, eneagrama, observacion) {
  if (!legajo) return { ok: false, error: 'Falta legajo' };
  if (transcripcion !== undefined) escribirCelda(legajo, COL.TRANSCRIPT,  transcripcion);
  if (eneagrama     !== undefined) escribirCelda(legajo, COL.ENEAGRAMA,   eneagrama);
  if (observacion   !== undefined) escribirCelda(legajo, COL.OBSERVACION, observacion);
  return { ok: true, legajo };
}

// Router de updateEntrevista — traduce el vocabulario legacy del frontend
// (id_entrevista, observacion_privada, link_sin_revision) al de los handlers internos,
// y dispatcha a actualizarLinks / guardarPrivados / actualizarEstado según los campos presentes.
// Orden de ejecución: links → privados → estado. Devuelve el primer error que aparezca.
function updateEntrevistaRouter(data) {
  if (!data) return { ok: false, error: 'Falta data' };
  const legajo = data.legajo || data.id_entrevista;
  if (!legajo) return { ok: false, error: 'Falta legajo / id_entrevista' };

  const tieneEstado   = data.estado !== undefined;
  const tienePrivados = data.transcripcion       !== undefined ||
                        data.eneagrama           !== undefined ||
                        data.observacion_privada !== undefined;
  const tieneLinks    = data.link_sin_revision !== undefined ||
                        data.link_definitivo   !== undefined;
  const tieneTelefono = data.telefono !== undefined;

  if (!tieneEstado && !tienePrivados && !tieneLinks && !tieneTelefono) {
    return { ok: false, error: 'updateEntrevista sin campos reconocidos' };
  }

  // Red de seguridad: si va a tocar el estado, requiere rol explícito en el body.
  if (tieneEstado && !data.rol) {
    return { ok: false, error: "Falta el parámetro 'rol' en el body para actualizar el estado" };
  }

  const resultados = {};

  if (tieneLinks) {
    const r = actualizarLinks(legajo, data.link_sin_revision, data.link_definitivo);
    if (!r.ok) return r;
    resultados.links = r;
  }

  if (tienePrivados) {
    const r = guardarPrivados(legajo, data.transcripcion, data.eneagrama, data.observacion_privada);
    if (!r.ok) return r;
    resultados.privados = r;
  }

  if (tieneTelefono) {
    const r = escribirCelda(legajo, COL.TELEFONO, String(data.telefono || ''));
    if (!r.ok) return r;
    resultados.telefono = r;
  }

  if (tieneEstado) {
    // autor_nombre / autor_legajo: para trazabilidad del sellado de RRHH.
    // Se persisten solo en la transición a SELLADO por rol rrhh.
    const r = actualizarEstado(
      legajo, data.estado, data.rol, data.observacion, data.forzar,
      data.autor_nombre, data.autor_legajo
    );
    if (!r.ok) return r;
    resultados.estado = r;
  }

  return { ok: true, legajo: legajo, resultados: resultados };
}

// ── Helpers ────────────────────────────────────────────────────────
function str(v) { return v !== null && v !== undefined ? String(v).trim() : ''; }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function escribirCelda(legajo, colIdx, valor) {
  const hoja  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA);
  const datos = hoja.getDataRange().getValues();
  for (let i = FILA_INICIO - 1; i < datos.length; i++) {
    if (str(datos[i][COL.LEGAJO]) === str(legajo)) {
      hoja.getRange(i + 1, colIdx + 1).setValue(valor);
      return { ok: true, legajo };
    }
  }
  return { ok: false, error: 'Legajo no encontrado: ' + legajo };
}