// import dotenv from 'dotenv';
// dotenv.config();
// const USE_OLLAMA =true

// // const USE_OLLAMA = String(process.env.USE_OLLAMA || 'false').toLowerCase() === 'true';
// const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
// const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral:7b-instruct';

// const lookups = {
//   servers: {
//     'web01': 'WEB01',
//     'dc01': 'DC01',
//     'file01': 'FILE01'
//   },
//   pools: {
//     'intranetpool': 'IntranetPool'
//   },
//   groups: {
//     'gg_ventas': 'GG_Ventas',
//     'gg_marketing': 'GG_Marketing'
//   },
//   ous: {
//     'usuarios': process.env.DEFAULT_OU || 'OU=Usuarios,DC=empresa,DC=local'
//   }
// };

// function norm(s) {
//   return String(s || '').trim();
// }

// function mapLookup(table, value) {
//   if (!value) return value;
//   const key = String(value).toLowerCase();
//   return table[key] || value;
// }
// // Alias rápido: usá tu parseLocal como fallback
// function parseWithRegex(text) {
//   return parseLocal(text);
// }

// function parseLocal(text) {
//   const t = norm(text);

//   // ad_create_user: "crear usuario Ana Gomez (sam: ana.gomez) en Usuarios"
//   let m;
//   m = t.match(/crear\s+usuario\s+([a-záéíóúñ]+)\s+([a-záéíóúñ]+)(?:.*?sam\s*[:=]\s*([a-z]+\.[a-z]+))?(?:.*?en\s+([\w=,\s]+))?/i);
//   if (m) {
//     const givenName = m[1];
//     const surname = m[2];
//     const sam = m[3] || (givenName && surname ? `${givenName}.${surname}`.toLowerCase() : null);
//     let ouPart = m[4]?.trim();
//     if (ouPart) {
//       if (/^ou=/i.test(ouPart)) {
//         // full OU
//       } else {
//         // map friendly name like "Usuarios"
//         ouPart = lookups.ous[ouPart.toLowerCase()] || process.env.DEFAULT_OU;
//       }
//     }
//     return { intent: 'ad_create_user', params: { givenName, surname, sam, ou: ouPart || process.env.DEFAULT_OU } };
//   }

//   // ad_add_to_group: "agregar a ana.gomez al grupo GG_Ventas"
//   m = t.match(/agregar\s+a\s+([a-z]+\.[a-z]+)\s+al\s+grupo\s+([\w_-]+)/i);
//   if (m) {
//     const sam = m[1];
//     const group = mapLookup(lookups.groups, m[2]);
//     return { intent: 'ad_add_to_group', params: { sam, group } };
//   }

//   // ad_create_group: "crear grupo GG_Marketing" (optional scope, ou)
//   m = t.match(/crear\s+grupo\s+([\w_-]+)(?:.*?scope\s*[:=]\s*(Global|Local|Universal))?(?:.*?en\s+([\w=,\s]+))?/i);
//   if (m) {
//     const name = mapLookup(lookups.groups, m[1]);
//     const scope = m[2] || null;
//     let ou = m[3]?.trim();
//     if (ou) {
//       if (!/^ou=/i.test(ou)) {
//         ou = lookups.ous[ou.toLowerCase()] || process.env.DEFAULT_OU;
//       }
//     }
//     return { intent: 'ad_create_group', params: { name, scope, ou: ou || process.env.DEFAULT_OU } };
//   }

//   // ad_unlock: "desbloquear a juan.perez"
//   m = t.match(/desbloquear\s+a\s+([a-z]+\.[a-z]+)/i);
//   if (m) {
//     return { intent: 'ad_unlock', params: { sam: m[1] } };
//   }

//   // dns_add_a: "crear A intranet → 10.0.0.50" or "crear A intranet 10.0.0.50"
//   m = t.match(/crear\s+a\s+([\w.-]+)\s*(?:→|->|\s)\s*(\d+\.\d+\.\d+\.\d+)/i);
//   if (m) {
//     return { intent: 'dns_add_a', params: { name: m[1], ip: m[2] } };
//   }

//   // dns_del_a: "borrar A intranet → 10.0.0.50"
//   m = t.match(/borrar\s+a\s+([\w.-]+)\s*(?:→|->|\s)\s*(\d+\.\d+\.\d+\.\d+)/i);
//   if (m) {
//     return { intent: 'dns_del_a', params: { name: m[1], ip: m[2] } };
//   }

//   // iis_pool_status: "estado del app pool IntranetPool en WEB01"
//   m = t.match(/estado\s+del\s+app\s+pool\s+([\w_-]+)\s+en\s+([\w_-]+)/i);
//   if (m) {
//     const pool = mapLookup(lookups.pools, m[1]);
//     const server = mapLookup(lookups.servers, m[2]);
//     return { intent: 'iis_pool_status', params: { server, pool } };
//   }

//   // iis_pool_recycle: "reciclá IntranetPool en WEB01"
//   m = t.match(/recicla[rá]?\s+([\w_-]+)\s+en\s+([\w_-]+)/i);
//   if (m) {
//     const pool = mapLookup(lookups.pools, m[1]);
//     const server = mapLookup(lookups.servers, m[2]);
//     return { intent: 'iis_pool_recycle', params: { server, pool } };
//   }

//   return { intent: 'unknown', params: {} };
// }

// // utils mínimas
// const DEFAULT_OU = process.env.DEFAULT_OU || 'OU=Usuarios,DC=empresa,DC=com';

// function toAscii(s = '') {
//   return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
// }
// function buildSam(givenName, surname) {
//   if (!givenName || !surname) return null;
//   const g = toAscii(String(givenName).trim().toLowerCase());
//   const s = toAscii(String(surname).trim().toLowerCase());
//   if (!g || !s) return null;
//   return `${g}.${s}`.replace(/[^a-z0-9._-]/g, '');
// }
// function coalesce(v, def = null) { return (v === undefined || v === '') ? def : v; }
// function firstJsonChunk(txt = '') {
//   // Extrae el primer bloque {...} balanceado de la respuesta por si el modelo habló de más
//   const start = txt.indexOf('{');
//   if (start === -1) return null;
//   let depth = 0;
//   for (let i = start; i < txt.length; i++) {
//     const ch = txt[i];
//     if (ch === '{') depth++;
//     else if (ch === '}') {
//       depth--;
//       if (depth === 0) return txt.slice(start, i + 1);
//     }
//   }
//   return null;
// }

// export async function parseWithOllama(text) {
//   // 1) Prompt estricto + few-shot minimal
//   const systemMsg = `
// Eres un parser de órdenes de IT (Active Directory, grupos, DNS, IIS) en español.
// Debes responder SIEMPRE y SOLO un JSON válido con este esquema EXACTO:
// {
//   "intent": "ad_create_user|ad_add_to_group|ad_create_group|ad_unlock|dns_add_a|dns_del_a|iis_pool_status|iis_pool_recycle|unknown",
//   "givenName": "<string|null>",
//   "surname": "<string|null>",
//   "sam": "<string|null>",
//   "ou": "<string|null>",
//   "tempPassword": "<string|null>",
//   "name": "<string|null>",
//   "ip": "<string|null>",
//   "scope": "<string|null>",
//   "group": "<string|null>",
//   "server": "<string|null>",
//   "pool": "<string|null>",
//   "confidence": <number entre 0 y 1>
// }

// REGLAS:
// - Si falta un dato, usa null. NO inventes.
// - Para usuarios: si tienes givenName y surname pero falta sam, construye sam = "<nombre>.<apellido>" en minúsculas sin tildes ni espacios.
// - Si falta "ou" en operaciones de usuario, usa "${DEFAULT_OU}".
// - No agregues texto fuera del JSON. No uses markdown, no comentes.
// - Si la intención no es inequívoca, devuelve "intent":"unknown" con confidence ≤ 0.5.
// `;

//   const fewshot = `
// Usuario: "crear usuario Ana Diaz en usuarios"
// Respuesta:
// {"intent":"ad_create_user","givenName":"Ana","surname":"Diaz","sam":"ana.diaz","ou":"${DEFAULT_OU}","tempPassword":null,"name":null,"ip":null,"scope":null,"group":null,"server":null,"pool":null,"confidence":0.92}

// Usuario: "agregar a ana.diaz al grupo ventas"
// Respuesta:
// {"intent":"ad_add_to_group","givenName":null,"surname":null,"sam":"ana.diaz","ou":null,"tempPassword":null,"name":null,"ip":null,"scope":null,"group":"GG_Ventas","server":null,"pool":null,"confidence":0.88}

// Usuario: "no se que quiero, mostra opciones"
// Respuesta:
// {"intent":"unknown","givenName":null,"surname":null,"sam":null,"ou":null,"tempPassword":null,"name":null,"ip":null,"scope":null,"group":null,"server":null,"pool":null,"confidence":0.2}
// `.trim();

//   // 2) Construimos prompt final
//   const prompt = `${systemMsg}\n\n${fewshot}\n\nUsuario: "${text}"\nRespuesta:`.trim();

//   // 3) Llamada a Ollama en modo JSON (determinista)
//   const resp = await fetch(process.env.OLLAMA_URL, {
//     method: 'POST',
//     headers: { 'content-type': 'application/json' },
//     body: JSON.stringify({
//       model: process.env.OLLAMA_MODEL,
//       prompt,
//       stream: false,
//       // ¡clave!: forzar JSON, ser deterministas y cortar antes de que siga hablando
//       format: 'json',
//       options: {
//         temperature: 0,
//         top_p: 0.9,
//         num_ctx: 2048,
//         stop: ['\nUsuario:', '\n\nUsuario:'] // si se le ocurre seguir, que corte
//       }
//     })
//   });

//   if (!resp.ok) {
//     const errText = await resp.text().catch(() => '');
//     throw new Error(`Ollama error: ${resp.status} ${resp.statusText} - ${errText}`);
//   }
//   const data = await resp.json();
//   let txt = data?.response ?? '';

//   // 4) Reparación mínima si el modelo habló de más
//   if (txt && txt.trim()[0] !== '{') {
//     const maybe = firstJsonChunk(txt);
//     if (maybe) txt = maybe;
//   }

//   // 5) Parseo + saneo + defaults
//   let raw;
//   try {
//     raw = JSON.parse(txt);
//   } catch {
//     return { intent: 'unknown', params: {}, lowConfidence: true };
//   }

//   // normalizamos campos y aplicamos reglas
//   let intent = String(raw.intent || 'unknown');
//   const out = {
//     givenName: coalesce(raw.givenName, null),
//     surname: coalesce(raw.surname, null),
//     sam: coalesce(raw.sam, null),
//     ou: coalesce(raw.ou, null),
//     tempPassword: coalesce(raw.tempPassword, null),
//     name: coalesce(raw.name, null),
//     ip: coalesce(raw.ip, null),
//     scope: coalesce(raw.scope, null),
//     group: coalesce(raw.group, null),
//     server: coalesce(raw.server, null),
//     pool: coalesce(raw.pool, null),
//   };

//   // si hay nombre+apellido y no hay sam, lo construimos
//   if (!out.sam && out.givenName && out.surname) {
//     out.sam = buildSam(out.givenName, out.surname);
//   }
//   // si es operación de usuario y no hay OU, ponemos la default
//   if (['ad_create_user', 'ad_add_to_group', 'ad_unlock'].includes(intent)) {
//     if (!out.ou) out.ou = DEFAULT_OU;
//   }

//   // confidence y umbral
//   const conf = Number(raw.confidence);
//   const confidence = isNaN(conf) ? (intent === 'unknown' ? 0.2 : 0.85) : Math.max(0, Math.min(1, conf));
//   const lowConfidence = confidence < 0.75 || intent === 'unknown';

//   return { intent, params: out, lowConfidence };
// }



// export async function parseText(text) {
//   console.log("\n--- PARSER IN ---", text);     // <--- LOG ENTRADA

//   try {
//     if (USE_OLLAMA) {
//       console.log("[parser] intentando IA (ollama)...");
//       const iaResult = await parseWithOllama(text);
//       console.log("[parser] resultado IA =", iaResult);   // <--- LOG RESULTADO IA

//       if (!iaResult.lowConfidence && iaResult.intent !== 'unknown') {
//         console.log("[parser] ✅ IA entiende");
//         return iaResult;
//       }

//       console.log("[parser] ❓ IA no segura / desconocido, fallback a regex...");
//     }

//     // FALLBACK -> regex
//     const regexResult = parseWithRegex(text);
//     console.log("[parser] resultado regex =", regexResult);  // <--- LOG REGEX
//     return regexResult;

//   } catch (err) {
//     console.error("[parser] ❌ ERROR", err);
//     return { intent: "unknown", params: {}, lowConfidence: true };
//   }
// }

import dotenv from 'dotenv';
dotenv.config();

const USE_OLLAMA = true;

// ✅ Base URL sin /api ni /api/generate
function normalizeBase(u) {
  return (u || 'http://localhost:11434').replace(/\/api(\/(generate|chat))?\/?$/, '');
}
const OLLAMA_BASE = normalizeBase(process.env.OLLAMA_URL);
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';

// === LOOKUPS (solo usuarios) ===
const lookups = {
  groups: {
    'gg_ventas': 'GG_Ventas',
    'gg_marketing': 'GG_Marketing'
  },
  ous: {
    'usuarios': process.env.DEFAULT_OU || 'OU=Usuarios,DC=empresa,DC=local'
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
const DEFAULT_OU = process.env.DEFAULT_OU || 'OU=Usuarios,DC=empresa,DC=com';

// === INTENTS DE USUARIOS ADMITIDOS ===
const USER_INTENTS = [
  'ad_help',            // describir capacidades
  'ad_create_user',     // crear usuario
  'ad_add_to_group',    // agregar a grupo
  'ad_reset_password',  // resetear contraseña
  'ad_unlock',          // desbloquear cuenta
  'ad_disable_user',    // deshabilitar
  'ad_enable_user',     // habilitar
  'ad_delete_user',     // eliminar
  'ad_info_user'        // info del usuario
];

// === Regex mínimo (solo usuarios) y combinable ===
function parseLocal(text) {
  const t = norm(text);

  // crear usuario: "crear/crea usuario Ana Gomez (sam: ana.gomez) en usuarios"
  let m = t.match(/\b(crea(?:r)?|crea)\s+usuario\s+([a-záéíóúñ]+)\s+([a-záéíóúñ]+)(?:.*?sam\s*[:=]\s*([a-z]+\.[a-z]+))?(?:.*?en\s+([\w=,\s]+))?/i);
  if (m) {
    const givenName = m[2], surname = m[3];
    const sam = m[4] || buildSam(givenName, surname);
    let ou = m[5]?.trim();
    if (ou && !/^ou=/i.test(ou)) ou = lookups.ous[ou.toLowerCase()] || DEFAULT_OU;
    return { intent: 'ad_create_user', params: { givenName, surname, sam, ou: ou || DEFAULT_OU }, lowConfidence: false };
  }

  // agregar a grupo: "agregalo/agregar a ana.gomez al grupo ventas"
  m = t.match(/\b(agrega(?:r|lo)?|sumar)\s+(?:a\s+)?([a-z]+\.[a-z]+)\s+al\s+grupo\s+([\w_-]+)/i);
  if (m) {
    const sam = m[2];
    const group = mapLookup(lookups.groups, m[3]);
    return { intent: 'ad_add_to_group', params: { sam, group }, lowConfidence: false };
  }

  // reset password: "resetear/cambiar clave a ana.gomez (opcional: a <nueva>)"
  m = t.match(/\b(resetea(?:r)?|cambia(?:r)?)\s+(?:clave|contrasena|password)\s+(?:a\s+)?([a-z]+\.[a-z]+)(?:\s+a\s+(\S+))?/i);
  if (m) return { intent: 'ad_reset_password', params: { sam: m[2], newPassword: m[3] || null }, lowConfidence: false };

  // desbloquear: "desbloquear a ana.gomez"
  m = t.match(/\bdesbloquear\s+a\s+([a-z]+\.[a-z]+)\b/i);
  if (m) return { intent: 'ad_unlock', params: { sam: m[1] }, lowConfidence: false };

  // deshabilitar/habilitar
  m = t.match(/\b(deshabilitar|desactivar)\s+a\s+([a-z]+\.[a-z]+)\b/i);
  if (m) return { intent: 'ad_disable_user', params: { sam: m[2] }, lowConfidence: false };
  m = t.match(/\b(habilitar|activar)\s+a\s+([a-z]+\.[a-z]+)\b/i);
  if (m) return { intent: 'ad_enable_user', params: { sam: m[2] }, lowConfidence: false };

  // eliminar
  m = t.match(/\b(eliminar|borrar)\s+usuario\s+([a-z]+\.[a-z]+)\b/i);
  if (m) return { intent: 'ad_delete_user', params: { sam: m[2] }, lowConfidence: false };

  // info
  m = t.match(/\b(info|informacion|detalle|mostrar)\s+de\s+([a-z]+\.[a-z]+)\b/i);
  if (m) return { intent: 'ad_info_user', params: { sam: m[2] }, lowConfidence: false };

  // ayuda
  if (/\b(ayuda|que puedo hacer|opciones|comandos|help)\b/i.test(t)) {
    return { intent: 'ad_help', params: {}, lowConfidence: false };
  }

  return { intent: 'unknown', params: {}, lowConfidence: true };
}

// Alias (por compatibilidad con tu código actual)
function parseWithRegex(text) { return parseLocal(text); }

// === Prompt de Ollama: SOLO usuarios y permite combinar ===
async function parseWithOllama(text) {
  const systemMsg = `
Eres un parser de órdenes de Active Directory en español (SOLO usuarios).
Responde SIEMPRE y SOLO un JSON válido:
{
  "intent": "ad_help|ad_create_user|ad_add_to_group|ad_reset_password|ad_unlock|ad_disable_user|ad_enable_user|ad_delete_user|ad_info_user|COMBINADO",
  "givenName": "<string|null>",
  "surname": "<string|null>",
  "sam": "<string|null>",
  "ou": "<string|null>",
  "tempPassword": "<string|null>",
  "group": "<string|null>",
  "newPassword": "<string|null>",
  "confidence": <0..1>
}

REGLAS:
- Si el usuario pide MÚLTIPLES acciones (ej: crear usuario y agregar a grupo), devuelve "intent" con INTENTS concatenados por "|", en orden lógico: "ad_create_user|ad_add_to_group".
- No inventes datos. Usa null si falta.
- Si tienes givenName y surname pero falta sam, crea "sam" = "<nombre>.<apellido>" minúsculas sin tildes.
- Si falta "ou" para crear usuario, usa "${DEFAULT_OU}".
- Para "ventas" o "marketing", normaliza a "GG_Ventas" o "GG_Marketing".
- Si la intención es consultar capacidades, usa "ad_help".
- No escribas nada fuera del JSON.
`.trim();

  const fewshot = `
Usuario: "crea un usuario con nombre Fran Falci y agregalo al grupo de ventas"
{"intent":"ad_create_user|ad_add_to_group","givenName":"Fran","surname":"Falci","sam":"fran.falci","ou":"${DEFAULT_OU}","tempPassword":null,"group":"GG_Ventas","newPassword":null,"confidence":0.93}

Usuario: "qué podes hacer?"
{"intent":"ad_help","givenName":null,"surname":null,"sam":null,"ou":null,"tempPassword":null,"group":null,"newPassword":null,"confidence":0.95}
`.trim();

  const prompt = `${systemMsg}\n\n${fewshot}\n\nUsuario: "${text}"\nRespuesta:`.trim();

  const resp = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0, top_p: 0.9, num_ctx: 2048, stop: ['\nUsuario:', '\n\nUsuario:'] }
    })
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Ollama error: ${resp.status} ${resp.statusText} - ${errText}`);
  }
  const data = await resp.json();
  let txt = (data?.response || '').trim();
  if (!txt.startsWith('{')) {
    const start = txt.indexOf('{');
    const end = txt.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) txt = txt.slice(start, end + 1);
  }

  let raw;
  try { raw = JSON.parse(txt); } catch { return { intent: 'unknown', params: {}, lowConfidence: true }; }

  let intent = String(raw.intent || 'unknown');
  const out = {
    givenName: coalesce(raw.givenName, null),
    surname: coalesce(raw.surname, null),
    sam: coalesce(raw.sam, null),
    ou: coalesce(raw.ou, null),
    tempPassword: coalesce(raw.tempPassword, null),
    group: coalesce(raw.group, null),
    newPassword: coalesce(raw.newPassword, null)
  };

  if (!out.sam && out.givenName && out.surname) out.sam = buildSam(out.givenName, out.surname);
  if (intent.includes('ad_create_user') && !out.ou) out.ou = DEFAULT_OU;
  if (/ventas/i.test(out.group || '')) out.group = 'GG_Ventas';
  if (/marketing/i.test(out.group || '')) out.group = 'GG_Marketing';

  const conf = Number(raw.confidence);
  const confidence = isNaN(conf) ? (intent === 'unknown' ? 0.2 : 0.85) : Math.max(0, Math.min(1, conf));
  const lowConfidence = confidence < 0.75 || intent === 'unknown';

  return { intent, params: out, lowConfidence };
}

// === Combinar intents: A|B|C → array (para tu pipeline/RBAC)
function splitIntents(intent) {
  return String(intent || '').split('|').map(s => s.trim()).filter(Boolean);
}

export async function parseText(text) {
  console.log("\n--- PARSER IN ---", text);

  try {
    if (USE_OLLAMA) {
      console.log("[parser] intentando IA (ollama)...");
      const ia = await parseWithOllama(text);
      console.log("[parser] resultado IA =", ia);

      if (!ia.lowConfidence && ia.intent !== 'unknown') {
        console.log("[parser] ✅ IA entiende");
        // ⚠️ si tu RBAC falla con cadenas, usa splitIntents(ia.intent)
        return ia;
      }
      console.log("[parser] ❓ IA no segura / desconocido, fallback a regex...");
    }

    const rx = parseWithRegex(text);
    console.log("[parser] resultado regex =", rx);
    return rx;

  } catch (err) {
    console.error("[parser] ❌ ERROR", err);
    return { intent: "unknown", params: {}, lowConfidence: true };
  }
}
