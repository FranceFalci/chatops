// parser.js  — WinOps Chat (AD + Ollama) — versión extendida
import dotenv from 'dotenv';
dotenv.config();

/* ============================
   0) CONFIG & HELPERS
============================ */
const USE_OLLAMA = String(process.env.USE_OLLAMA ?? 'true').toLowerCase() === 'true';

function normalizeBase(u) {
  return (u || 'http://localhost:11434').replace(/\/api(\/(generate|chat))?\/?$/, '');
}
const OLLAMA_BASE = normalizeBase(process.env.OLLAMA_URL);
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';
const OLLAMA_GENERATE = `${OLLAMA_BASE}/api/generate`;

const DEFAULT_OU = process.env.DEFAULT_OU || 'OU=Usuarios,DC=empresa,DC=com';

const lookups = {
  servers: { 'web01': 'WEB01', 'dc01': 'DC01', 'file01': 'FILE01' },
  pools: { 'intranetpool': 'IntranetPool' },
  groups: {
    // normalizaciones a “GG_*”
    'gg_ventas': 'GG_Ventas',
    'ventas': 'GG_Ventas',
    'gg_marketing': 'GG_Marketing',
    'marketing': 'GG_Marketing'
  },
  ous: {
    'usuarios': DEFAULT_OU
  }
};

function norm(s) { return String(s || '').trim(); }
function toAscii(s = '') { return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); }
function buildSam(givenName, surname) {
  if (!givenName || !surname) return null;
  const g = toAscii(String(givenName).trim().toLowerCase());
  const s = toAscii(String(surname).trim().toLowerCase());
  if (!g || !s) return null;
  return `${g}.${s}`.replace(/[^a-z0-9._-]/g, '');
}
function coalesce(v, def = null) { return (v === undefined || v === '') ? def : v; }

function mapLookup(table, value) {
  if (!value) return value;
  const key = String(value).toLowerCase();
  return table[key] || value;
}

function firstJsonChunk(txt = '') {
  const start = txt.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < txt.length; i++) {
    const ch = txt[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return txt.slice(start, i + 1);
    }
  }
  return null;
}

/* ============================
   1) CORE: parse con Ollama
============================ */
export async function parseWithOllama(text) {
  const intentsAllowed = [
    "ad_help",
    "ad_create_user",
    "ad_add_to_group",
    "ad_reset_password",
    "ad_unlock",
    "ad_disable_user",
    "ad_enable_user",
    "ad_delete_user",
    "ad_info_user",
    "ad_create_group",
    "ad_list_groups",
    "ad_list_users",
    "ad_list_group_members",
    "iis_pool_status",
    "iis_pool_recycle",
    "dns_add_a",
    "dns_del_a",
    "unknown"
  ];

  const systemMsg = `
Eres un parser de órdenes de IT (Active Directory en español).
Respondes SIEMPRE y SOLO un JSON válido con este esquema EXACTO:

{
  "intent": "<uno o varios intents unidos por |>",
  "params": {
    "givenName": "<string|null>",
    "surname": "<string|null>",
    "sam": "<string|null>",
    "ou": "<string|null>",
    "tempPassword": "<string|null>",
    "name": "<string|null>",
    "ip": "<string|null>",
    "scope": "<Global|Local|Universal|null>",
    "group": "<string|null>",
    "server": "<string|null>",
    "pool": "<string|null>",
    "filter": "<string|null>"      // para listados
  },
  "confidence": <number entre 0 y 1>
}

REGLAS:
- Intent debe ser uno de: ${intentsAllowed.join(', ')}; o combinados con '|'.
- Si la intención no es inequívoca, usa "unknown" y confidence ≤ 0.5.
- Si hay nombre y apellido y falta sam: construye "sam" = "<nombre>.<apellido>" en minúsculas, sin tildes.
- Si falta "ou" en operaciones de usuario, usa "${DEFAULT_OU}".
- Mapea grupos comunes: "ventas"→"GG_Ventas", "marketing"→"GG_Marketing".
- Para listados: "filter" contiene la cadena a buscar (sin comillas) o null si no hay filtro.
- NO agregues nada fuera del JSON. No uses markdown.
`;

  const fewshot = `
Usuario: "crear usuario Ana Diaz en usuarios"
Respuesta:
{"intent":"ad_create_user","params":{"givenName":"Ana","surname":"Diaz","sam":"ana.diaz","ou":"${DEFAULT_OU}","tempPassword":null,"name":null,"ip":null,"scope":null,"group":null,"server":null,"pool":null,"filter":null},"confidence":0.92}

Usuario: "agregar a ana.diaz al grupo ventas"
Respuesta:
{"intent":"ad_add_to_group","params":{"givenName":null,"surname":null,"sam":"ana.diaz","ou":"${DEFAULT_OU}","tempPassword":null,"name":null,"ip":null,"scope":null,"group":"GG_Ventas","server":null,"pool":null,"filter":null},"confidence":0.88}

Usuario: "listar usuarios con gomez"
Respuesta:
{"intent":"ad_list_users","params":{"givenName":null,"surname":null,"sam":null,"ou":null,"tempPassword":null,"name":null,"ip":null,"scope":null,"group":null,"server":null,"pool":null,"filter":"gomez"},"confidence":0.9}

Usuario: "listar grupos que contengan ventas"
Respuesta:
{"intent":"ad_list_groups","params":{"givenName":null,"surname":null,"sam":null,"ou":null,"tempPassword":null,"name":null,"ip":null,"scope":null,"group":null,"server":null,"pool":null,"filter":"ventas"},"confidence":0.9}

Usuario: "listar miembros de GG_Ventas"
Respuesta:
{"intent":"ad_list_group_members","params":{"givenName":null,"surname":null,"sam":null,"ou":null,"tempPassword":null,"name":null,"ip":null,"scope":null,"group":"GG_Ventas","server":null,"pool":null,"filter":null},"confidence":0.9}

Usuario: "crea un usuario Fran Falci y agregalo a ventas"
Respuesta:
{"intent":"ad_create_user|ad_add_to_group","params":{"givenName":"Fran","surname":"Falci","sam":"fran.falci","ou":"${DEFAULT_OU}","tempPassword":null,"name":null,"ip":null,"scope":null,"group":"GG_Ventas","server":null,"pool":null,"filter":null},"confidence":0.86}

Usuario: "ayuda"
Respuesta:
{"intent":"ad_help","params":{"givenName":null,"surname":null,"sam":null,"ou":null,"tempPassword":null,"name":null,"ip":null,"scope":null,"group":null,"server":null,"pool":null,"filter":null},"confidence":0.95}
`.trim();

  const prompt = `${systemMsg}\n\n${fewshot}\n\nUsuario: "${text}"\nRespuesta:`.trim();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  const resp = await fetch(OLLAMA_GENERATE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      format: 'json',
      options: {
        temperature: 0,
        top_p: 0.9,
        num_ctx: 2048,
        stop: ['\nUsuario:', '\n\nUsuario:']
      }
    }),
    signal: controller.signal
  }).catch((e) => { throw e; })
    .finally(() => clearTimeout(timeout));

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Ollama error: ${resp.status} ${resp.statusText} - ${errText}`);
  }

  const data = await resp.json();
  let txt = data?.response ?? '';

  if (txt && txt.trim()[0] !== '{') {
    const maybe = firstJsonChunk(txt);
    if (maybe) txt = maybe;
  }

  let raw;
  try { raw = JSON.parse(txt); }
  catch { return { intent: 'unknown', params: {}, lowConfidence: true }; }

  // Normalización salida
  let intent = String(raw.intent || 'unknown');
  const p = raw.params || {};
  const out = {
    givenName: coalesce(p.givenName, null),
    surname: coalesce(p.surname, null),
    sam: coalesce(p.sam, null),
    ou: coalesce(p.ou, null),
    tempPassword: coalesce(p.tempPassword, null),
    name: coalesce(p.name, null),
    ip: coalesce(p.ip, null),
    scope: coalesce(p.scope, null),
    group: coalesce(p.group, null),
    server: coalesce(p.server, null),
    pool: coalesce(p.pool, null),
    filter: coalesce(p.filter, null),
  };

  // Autogenerar SAM
  if (!out.sam && out.givenName && out.surname) {
    out.sam = buildSam(out.givenName, out.surname);
  }
  // OU por defecto para intents de usuario
  const intentsUserOU = ['ad_create_user', 'ad_add_to_group', 'ad_reset_password', 'ad_unlock', 'ad_disable_user', 'ad_enable_user', 'ad_delete_user', 'ad_info_user'];
  if (intent.split('|').some(i => intentsUserOU.includes(i))) {
    if (!out.ou) out.ou = DEFAULT_OU;
  }
  // Mapear grupos amistosos
  if (out.group) out.group = mapLookup(lookups.groups, out.group);

  // Confidence
  const conf = Number(raw.confidence);
  const confidence = isNaN(conf) ? (intent === 'unknown' ? 0.2 : 0.85) : Math.max(0, Math.min(1, conf));
  const lowConfidence = confidence < 0.75 || intent === 'unknown';

  return { intent, params: out, lowConfidence };
}

/* ============================
   2) FALLBACK: Regex local
============================ */
function extractFilter(maybe) {
  if (!maybe) return null;
  const s = String(maybe).trim();
  return s ? s : null;
}

// Permite intents compuestos separados por “|” o conectores “ y ” / “;”
function splitComposite(text) {
  const t = norm(text);
  // primero respetamos '|' si el usuario lo puso explícito
  if (t.includes('|')) return t.split('|').map(s => s.trim()).filter(Boolean);
  // heurística básica: cortar por “ y ” / “;”
  // (evitamos partir en “nombre y apellido” exigiendo verbos al inicio)
  const parts = t.split(/(?:^|[;])\s*(?=(crear|agregar|resetear|desbloquear|bloquear|habilitar|inhabilitar|eliminar|borrar|info|informacion|listar|ayuda|recicla|estado|crear\s+a|borrar\s+a)\b)/i);
  if (parts.length <= 1) return [t];
  // recomponer en pares “verbo + resto”
  const out = [];
  for (let i = 1; i < parts.length; i += 2) out.push((parts[i] + ' ' + (parts[i + 1] ?? '')).trim());
  return out.length ? out : [t];
}

export function parseLocal(text) {
  const chunks = splitComposite(text);
  const intents = [];
  let mergedParams = {
    givenName: null, surname: null, sam: null, ou: null,
    tempPassword: null, name: null, ip: null, scope: null,
    group: null, server: null, pool: null, filter: null
  };

  const push = (intent, params) => {
    intents.push(intent);
    mergedParams = { ...mergedParams, ...params };
  };

  for (const raw of chunks) {
    const t = norm(raw);
    let m;

    // AYUDA
    if (/^(ayuda|help|qué pod(e|é)s hacer\??|que pod(e|é)s hacer\??)$/i.test(t) || /\b(ayuda|help)\b/i.test(t)) {
      push('ad_help', {});
      continue;
    }

    // crear usuario: “crear usuario Ana Gomez [sam: ana.gomez] [en Usuarios]”
    m = t.match(/crear\s+usuario\s+([a-záéíóúñ]+)\s+([a-záéíóúñ]+)(?:.*?sam\s*[:=]\s*([a-z0-9_.-]+))?(?:.*?en\s+([\w=,\s]+))?/i);
    if (m) {
      const givenName = m[1]; const surname = m[2];
      const sam = m[3] || buildSam(givenName, surname);
      let ouPart = m[4]?.trim();
      if (ouPart) {
        if (!/^ou=/i.test(ouPart)) {
          ouPart = lookups.ous[ouPart.toLowerCase()] || DEFAULT_OU;
        }
      }
      push('ad_create_user', { givenName, surname, sam, ou: ouPart || DEFAULT_OU });
      continue;
    }

    // agregar a grupo: “agregar a ana.gomez al grupo ventas”
    m = t.match(/agregar\s+a\s+([a-z0-9_.-]+)\s+al\s+grupo\s+([\w.-]+)/i);
    if (m) {
      const sam = m[1];
      const group = mapLookup(lookups.groups, m[2]);
      push('ad_add_to_group', { sam, group, ou: DEFAULT_OU });
      continue;
    }

    // resetear clave: “resetear clave a ana.gomez [a Temporal123!]”
    m = t.match(/resetear\s+(?:clave|password)\s+a\s+([a-z0-9_.-]+)(?:\s+a\s+([^\s]+))?/i);
    if (m) {
      push('ad_reset_password', { sam: m[1], tempPassword: m[2] || null, ou: DEFAULT_OU });
      continue;
    }

    // desbloquear usuario
    m = t.match(/desbloquear\s+a\s+([a-z0-9_.-]+)/i);
    if (m) { push('ad_unlock', { sam: m[1], ou: DEFAULT_OU }); continue; }

    // deshabilitar / habilitar
    m = t.match(/(deshabilitar|inhabilitar|bloquear)\s+a\s+([a-z0-9_.-]+)/i);
    if (m) { push('ad_disable_user', { sam: m[2], ou: DEFAULT_OU }); continue; }
    m = t.match(/(habilitar)\s+a\s+([a-z0-9_.-]+)/i);
    if (m) { push('ad_enable_user', { sam: m[2], ou: DEFAULT_OU }); continue; }

    // eliminar usuario
    m = t.match(/(eliminar|borrar)\s+usuario\s+([a-z0-9_.-]+)/i);
    if (m) { push('ad_delete_user', { sam: m[2], ou: DEFAULT_OU }); continue; }

    // info de usuario
    m = t.match(/(info|informaci[oó]n)\s+(?:de\s+)?([a-z0-9_.-]+)/i);
    if (m) { push('ad_info_user', { sam: m[2], ou: DEFAULT_OU }); continue; }

    // crear grupo: “… [scope Global] [en usuarios]”
    m = t.match(/crear\s+grupo\s+([\w.-]+)(?:.*?scope\s*[:=]\s*(Global|Local|Universal))?(?:.*?en\s+([\w=,\s]+))?/i);
    if (m) {
      const name = mapLookup(lookups.groups, m[1]);
      const scope = m[2] || null;
      let ou = m[3]?.trim();
      if (ou) {
        if (!/^ou=/i.test(ou)) ou = lookups.ous[ou.toLowerCase()] || DEFAULT_OU;
      }
      push('ad_create_group', { name, scope, ou: ou || DEFAULT_OU });
      continue;
    }

    // listar usuarios/grupos con filtro
    m = t.match(/listar\s+usuarios(?:\s+(?:con|que\s+contengan?)\s+(.+))?/i);
    if (m) { push('ad_list_users', { filter: extractFilter(m[1]) }); continue; }

    m = t.match(/listar\s+grupos(?:\s+(?:con|que\s+contengan?)\s+(.+))?/i);
    if (m) { push('ad_list_groups', { filter: extractFilter(m[1]) }); continue; }

    // listar miembros de grupo
    m = t.match(/listar\s+miembros\s+de\s+([\w.-]+)/i);
    if (m) {
      const group = mapLookup(lookups.groups, m[1]);
      push('ad_list_group_members', { group });
      continue;
    }

    // DNS A add/del
    m = t.match(/crear\s+a\s+([\w.-]+)\s*(?:→|->|\s)\s*(\d+\.\d+\.\d+\.\d+)/i);
    if (m) { push('dns_add_a', { name: m[1], ip: m[2] }); continue; }
    m = t.match(/borrar\s+a\s+([\w.-]+)\s*(?:→|->|\s)\s*(\d+\.\d+\.\d+\.\d+)/i);
    if (m) { push('dns_del_a', { name: m[1], ip: m[2] }); continue; }

    // IIS pool status / recycle
    m = t.match(/estado\s+del\s+app\s+pool\s+([\w_-]+)\s+en\s+([\w_-]+)/i);
    if (m) {
      const pool = mapLookup(lookups.pools, m[1]);
      const server = mapLookup(lookups.servers, m[2]);
      push('iis_pool_status', { server, pool });
      continue;
    }
    m = t.match(/recicla[rá]?\s+([\w_-]+)\s+en\s+([\w_-]+)/i);
    if (m) {
      const pool = mapLookup(lookups.pools, m[1]);
      const server = mapLookup(lookups.servers, m[2]);
      push('iis_pool_recycle', { server, pool });
      continue;
    }
  }

  if (!intents.length) return { intent: 'unknown', params: {}, lowConfidence: true };
  return { intent: intents.join('|'), params: mergedParams, lowConfidence: false };
}

function parseWithRegex(text) { return parseLocal(text); }

/* ============================
   3) Orquestador
============================ */
export async function parseText(text) {
  console.log("\n--- PARSER IN ---", text);

  try {
    if (USE_OLLAMA) {
      console.log("[parser] intentando IA (ollama)...");
      const iaResult = await parseWithOllama(text);
      console.log("[parser] resultado IA =", iaResult);

      if (!iaResult.lowConfidence && iaResult.intent !== 'unknown') {
        console.log("[parser] ✅ IA entiende");
        return iaResult;
      }
      console.log("[parser] ❓ IA no segura / desconocido, fallback a regex...");
    }

    const regexResult = parseWithRegex(text);
    console.log("[parser] resultado regex =", regexResult);
    return regexResult;

  } catch (err) {
    console.error("[parser] ❌ ERROR", err);
    return { intent: "ad_help", params: {}, lowConfidence: true }; // fallback amable
  }
}
