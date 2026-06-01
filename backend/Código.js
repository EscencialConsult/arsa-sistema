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

  // FORWARD rrhh — último paso (sella)
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
      default: res = { ok: false, error: 'Acción no reconocida' };
    }
    return json(res);
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

// Cambia el estado del relevamiento aplicando la máquina de transiciones.
// Si la transición es a REVISIÓN, escribe también la observación (col X) en la misma ejecución.
function actualizarEstado(legajo, nuevoEstado, rol, observacion, forzar) {
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

  return {
    ok: true,
    legajo: str(legajo),
    estadoAnterior: estadoAnterior,
    estado: nuevo,
    observacionGuardada: observacionGuardada
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
    const r = actualizarEstado(legajo, data.estado, data.rol, data.observacion, data.forzar);
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