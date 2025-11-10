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

// chatbot-users.js
import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
dotenv.config();

/* ============================
   0) CONFIG & HELPERS
============================ */
const USE_OLLAMA = (process.env.USE_OLLAMA ?? 'true').toLowerCase() === 'true';

function normalizeBase(u) {
  return (u || 'http://localhost:11434').replace(/\/api(\/(generate|chat))?\/?$/, '');
}
const OLLAMA_BASE = normalizeBase(process.env.OLLAMA_URL);
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';

const DEFAULT_OU = process.env.DEFAULT_OU || 'OU=Usuarios,DC=empresa,DC=com';

// Ejecutor: “powershell local” o “agente http” (tu PS-agent)
const EXECUTOR = (process.env.EXECUTOR || 'pslocal'); // 'pslocal' | 'agent'
const AGENT_URL = process.env.PS_AGENT_URL || 'http://localhost:8080'; // si EXECUTOR=agent

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

function todayTempPass() {
  const dt = new Date();
  const y = dt.getFullYear(); const m = String(dt.getMonth() + 1).padStart(2, '0'); const d = String(dt.getDate()).padStart(2, '0');
  return `Temp${y}${m}${d}!`;
}

// respuestas amistosas
const ok = (msg, extra = {}) => ({ ok: true, message: msg, ...extra });
const ko = (msg, extra = {}) => ({ ok: false, message: msg, ...extra });

/* ============================
   1) LOOKUPS
============================ */
const lookups = {
  groups: {
    'gg_ventas': 'GG_Ventas',
    'gg_marketing': 'GG_Marketing'
  },
  ous: {
    'usuarios': DEFAULT_OU
  }
};
function mapGroup(g = '') {
  const s = String(g).toLowerCase();
  if (s.includes('venta')) return 'GG_Ventas';
  if (s.includes('market')) return 'GG_Marketing';
  return lookups.groups[s] || g;
}

/* ============================
   2) RBAC SIMPLE
============================ */
const ACL = {
  Admin: new Set([
    'ad_help',
    'ad_create_user', 'ad_add_to_group', 'ad_reset_password', 'ad_unlock',
    'ad_disable_user', 'ad_enable_user', 'ad_delete_user', 'ad_info_user',
    'ad_create_group', 'ad_list_groups', 'ad_list_users', 'ad_list_group_members'
  ]),
  Helpdesk: new Set([
    'ad_help', 'ad_add_to_group', 'ad_reset_password', 'ad_unlock', 'ad_info_user', 'ad_list_users', 'ad_list_group_members', 'ad_list_groups'
  ])
};
function splitIntents(intent) {
  return String(intent || '').split('|').map(s => s.trim()).filter(Boolean);
}
function authorizeAll(role = 'Admin', intentStr = 'unknown') {
  const intents = splitIntents(intentStr);
  const allow = ACL[role] || new Set();
  for (const i of intents) if (!allow.has(i)) return { ok: false, denied: i };
  return { ok: true };
}

/* ============================
   3) PARSER (Ollama + Regex)
============================ */
async function parseWithOllama(text) {
  const systemMsg = `
Eres un parser de órdenes de Active Directory en español (SOLO temas de usuarios y grupos).
Responde SIEMPRE y SOLO un JSON válido:
{
  "intent": "ad_help|ad_create_user|ad_add_to_group|ad_reset_password|ad_unlock|ad_disable_user|ad_enable_user|ad_delete_user|ad_info_user|ad_create_group|ad_list_groups|ad_list_users|ad_list_group_members|COMBINADO",
  "givenName": "<string|null>",
  "surname": "<string|null>",
  "sam": "<string|null>",
  "ou": "<string|null>",
  "tempPassword": "<string|null>",
  "group": "<string|null>",
  "newPassword": "<string|null>",
  "name": "<string|null>",
  "filter": "<string|null>",
  "confidence": <0..1>
}

REGLAS:
- Si el usuario pide MÚLTIPLES acciones, concatena intents con "|", en orden lógico (p.ej., "ad_create_user|ad_add_to_group").
- No inventes datos; usa null si falta.
- Si hay givenName y surname pero falta sam: "<nombre>.<apellido>" en minúsculas sin tildes.
- Si falta OU al crear usuario, usa "${DEFAULT_OU}".
- "ventas"→"GG_Ventas"; "marketing"→"GG_Marketing".
- Nada fuera del JSON.
`.trim();

  const fewshot = `
Usuario: "crea usuario Fran Falci y agregalo a ventas"
{"intent":"ad_create_user|ad_add_to_group","givenName":"Fran","surname":"Falci","sam":"fran.falci","ou":"${DEFAULT_OU}","tempPassword":null,"group":"GG_Ventas","newPassword":null,"name":null,"filter":null,"confidence":0.93}

Usuario: "listar usuarios con gomez"
{"intent":"ad_list_users","givenName":null,"surname":null,"sam":null,"ou":null,"tempPassword":null,"group":null,"newPassword":null,"name":null,"filter":"gomez","confidence":0.9}

Usuario: "que podes hacer?"
{"intent":"ad_help","givenName":null,"surname":null,"sam":null,"ou":null,"tempPassword":null,"group":null,"newPassword":null,"name":null,"filter":null,"confidence":0.95}
`.trim();

  const prompt = `${systemMsg}\n\n${fewshot}\n\nUsuario: "${text}"\nRespuesta:`;

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
  if (!resp.ok) throw new Error(`Ollama error: ${resp.status} ${resp.statusText} - ${await resp.text().catch(() => '')}`);

  const data = await resp.json();
  let txt = String(data?.response || '').trim();
  if (!txt.startsWith('{')) {
    const s = txt.indexOf('{'); const e = txt.lastIndexOf('}');
    if (s !== -1 && e !== -1 && e > s) txt = txt.slice(s, e + 1);
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
    newPassword: coalesce(raw.newPassword, null),
    name: coalesce(raw.name, null),
    filter: coalesce(raw.filter, null),
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

// Regex rápido (fallback) — sólo usuarios/grupos
function parseWithRegex(text) {
  const t = norm(text);

  // crear usuario
  let m = t.match(/\b(crea(?:r)?|crear)\s+usuario\s+([a-záéíóúñ]+)\s+([a-záéíóúñ]+)(?:.*?sam\s*[:=]\s*([a-z]+\.[a-z]+))?(?:.*?en\s+([\w=,\s]+))?/i);
  if (m) {
    const givenName = m[2], surname = m[3];
    const sam = m[4] || buildSam(givenName, surname);
    let ou = (m[5] || '').trim();
    if (ou && !/^ou=/i.test(ou)) ou = lookups.ous[ou.toLowerCase()] || DEFAULT_OU;
    return { intent: 'ad_create_user', params: { givenName, surname, sam, ou: ou || DEFAULT_OU }, lowConfidence: false };
  }

  // add group
  m = t.match(/\b(agrega(?:r|lo)?|sumar)\s+(?:a\s+)?([a-z]+\.[a-z]+)\s+al\s+grupo\s+([\w._-]+)/i);
  if (m) return { intent: 'ad_add_to_group', params: { sam: m[2], group: mapGroup(m[3]) }, lowConfidence: false };

  // reset pass
  m = t.match(/\b(resetea(?:r)?|cambia(?:r)?)\s+(?:clave|contrasena|password)\s+(?:a\s+)?([a-z]+\.[a-z]+)(?:\s+a\s+(\S+))?/i);
  if (m) return { intent: 'ad_reset_password', params: { sam: m[2], newPassword: m[3] || null }, lowConfidence: false };

  // desbloquear
  m = t.match(/\bdesbloquear\s+a\s+([a-z]+\.[a-z]+)\b/i);
  if (m) return { intent: 'ad_unlock', params: { sam: m[1] }, lowConfidence: false };

  // (des)habilitar
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

  // crear grupo
  m = t.match(/\b(crea(?:r)?|crear)\s+grupo\s+([\w._-]+)(?:.*?\bscope\s*[:=]\s*(Global|Local|Universal))?(?:.*?\ben\s+([\w=,\s]+))?/i);
  if (m) {
    let name = m[2]; const scope = m[3] || 'Global';
    let ou = (m[4] || '').trim(); if (ou && !/^ou=/i.test(ou)) ou = DEFAULT_OU;
    return { intent: 'ad_create_group', params: { name, scope, ou: ou || DEFAULT_OU }, lowConfidence: false };
  }

  // listar grupos
  m = t.match(/\b(listar|muestra?r?)\s+grupos(?:\s+(?:que\s+contengan|con|que tengan)\s+(.+))?$/i);
  if (m) return { intent: 'ad_list_groups', params: { filter: (m[2] || '').trim() || null }, lowConfidence: false };

  // listar usuarios
  m = t.match(/\b(listar|muestra?r?)\s+usuarios(?:\s+(?:con|que\s+contengan|apellido|nombre)\s+(.+))?$/i);
  if (m) return { intent: 'ad_list_users', params: { filter: (m[2] || '').trim() || null }, lowConfidence: false };

  // listar miembros de grupo
  m = t.match(/\b(listar|muestra?r?)\s+miembros\s+de\s+([\w._-]+)\b/i);
  if (m) return { intent: 'ad_list_group_members', params: { group: m[2] }, lowConfidence: false };

  // ayuda
  if (/\b(ayuda|que puedo hacer|opciones|comandos|help)\b/i.test(t)) {
    return { intent: 'ad_help', params: {}, lowConfidence: false };
  }

  return { intent: 'unknown', params: {}, lowConfidence: true };
}

export async function parseText(text) {
  try {
    if (USE_OLLAMA) {
      const ia = await parseWithOllama(text);
      if (!ia.lowConfidence && ia.intent !== 'unknown') return ia;
    }
  } catch { /* seguimos al regex */ }
  return parseWithRegex(text);
}

/* ============================
   4) EJECUTORES (PS local / agente)
============================ */
async function runPowershell(script, args = []) {
  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script, ...args], { windowsHide: true });
    let out = '', err = '';
    ps.stdout.on('data', d => out += d.toString());
    ps.stderr.on('data', d => err += d.toString());
    ps.on('close', code => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}

async function agentPost(path, json) {
  const res = await fetch(`${AGENT_URL}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(json) });
  const txt = await res.text();
  return { code: res.ok ? 0 : res.status, out: res.ok ? txt : '', err: res.ok ? '' : txt };
}

// AD wrappers (implementación mínima; si no hay AD, respondemos idea)
async function adCreateUser({ sam, givenName, surname, ou, password }) {
  if (EXECUTOR === 'agent') {
    return agentPost('/ad/create-user', { sam, givenName, surname, ou, password });
  }
  const script = `
Import-Module ActiveDirectory
New-ADUser -Name "${givenName} ${surname}" -SamAccountName "${sam}" -GivenName "${givenName}" -Surname "${surname}" -Path "${ou}" -AccountPassword (ConvertTo-SecureString "${password}" -AsPlainText -Force) -Enabled $true
`;
  return runPowershell(script);
}

async function adAddToGroup({ sam, group }) {
  if (EXECUTOR === 'agent') return agentPost('/ad/add-to-group', { sam, group });
  const script = `
Import-Module ActiveDirectory
Add-ADGroupMember -Identity "${group}" -Members "${sam}"
`;
  return runPowershell(script);
}

async function adResetPassword({ sam, newPassword }) {
  if (EXECUTOR === 'agent') return agentPost('/ad/reset-password', { sam, newPassword });
  const script = `
Import-Module ActiveDirectory
Set-ADAccountPassword -Identity "${sam}" -Reset -NewPassword (ConvertTo-SecureString "${newPassword}" -AsPlainText -Force)
Unlock-ADAccount -Identity "${sam}" -ErrorAction SilentlyContinue
`;
  return runPowershell(script);
}

async function adUnlock({ sam }) {
  if (EXECUTOR === 'agent') return agentPost('/ad/unlock', { sam });
  const script = `Import-Module ActiveDirectory; Unlock-ADAccount -Identity "${sam}"`;
  return runPowershell(script);
}

async function adDisable({ sam }) {
  if (EXECUTOR === 'agent') return agentPost('/ad/disable', { sam });
  const script = `Import-Module ActiveDirectory; Disable-ADAccount -Identity "${sam}"`;
  return runPowershell(script);
}

async function adEnable({ sam }) {
  if (EXECUTOR === 'agent') return agentPost('/ad/enable', { sam });
  const script = `Import-Module ActiveDirectory; Enable-ADAccount -Identity "${sam}"`;
  return runPowershell(script);
}

async function adDelete({ sam }) {
  if (EXECUTOR === 'agent') return agentPost('/ad/delete', { sam });
  const script = `Import-Module ActiveDirectory; Remove-ADUser -Identity "${sam}" -Confirm:$false`;
  return runPowershell(script);
}

async function adInfo({ sam }) {
  if (EXECUTOR === 'agent') return agentPost('/ad/info', { sam });
  const script = `
Import-Module ActiveDirectory
Get-ADUser -Identity "${sam}" -Properties * | Select-Object DisplayName,SamAccountName,Enabled,Mail,Department,Title,Office,WhenCreated | ConvertTo-Json -Depth 2
`;
  return runPowershell(script);
}

async function adCreateGroup({ name, scope = 'Global', ou = DEFAULT_OU }) {
  if (EXECUTOR === 'agent') return agentPost('/ad/create-group', { name, scope, ou });
  const script = `
Import-Module ActiveDirectory
New-ADGroup -Name "${name}" -GroupScope ${scope} -GroupCategory Security -Path "${ou}"
`;
  return runPowershell(script);
}

async function adListGroups({ filter = null }) {
  if (EXECUTOR === 'agent') return agentPost('/ad/list-groups', { filter });
  const script = `
Import-Module ActiveDirectory
$flt = ${filter ? `"Name -like '*${filter}*'"` : '"*"'};
Get-ADGroup -Filter $flt | Select-Object Name, GroupScope, DistinguishedName | ConvertTo-Json -Depth 2
`;
  return runPowershell(script);
}

async function adListUsers({ filter = null }) {
  if (EXECUTOR === 'agent') return agentPost('/ad/list-users', { filter });
  const script = `
Import-Module ActiveDirectory
$flt = ${filter ? `"Name -like '*${filter}*'"` : '"*"'};
Get-ADUser -Filter $flt -Properties DisplayName,SamAccountName,Enabled |
  Select-Object DisplayName,SamAccountName,Enabled | ConvertTo-Json -Depth 2
`;
  return runPowershell(script);
}

async function adListGroupMembers({ group }) {
  if (EXECUTOR === 'agent') return agentPost('/ad/list-group-members', { group });
  const script = `
Import-Module ActiveDirectory
Get-ADGroupMember -Identity "${group}" -Recursive | Select-Object Name, SamAccountName, ObjectClass | ConvertTo-Json -Depth 3
`;
  return runPowershell(script);
}

/* ============================
   5) PIPELINE (friendly)
============================ */
function friendlyErrorIdea(intent, params) {
  // Mensaje amable + idea de cómo hacerlo si falta algo
  switch (intent) {
    case 'ad_create_user':
      return "No pude crear el usuario. Idea: indicame nombre y apellido (p. ej. “crear usuario Ana Diaz en usuarios”).";
    case 'ad_add_to_group':
      return "No pude agregar al grupo. Idea: pasame el usuario (sam) y el grupo (p. ej. “agregar a ana.diaz al grupo ventas”).";
    case 'ad_reset_password':
      return "No pude resetear la clave. Idea: decime el usuario y, si querés, la contraseña nueva (p. ej. “resetear clave a ana.diaz a Temporal123!”).";
    case 'ad_info_user':
      return "No pude traer la info. Idea: decime el usuario en formato nombre.apellido (p. ej. “info de ana.diaz”).";
    case 'ad_create_group':
      return "No pude crear el grupo. Idea: decime el nombre y (opcional) OU/scope (p. ej. “crear grupo GG_Proyectos en usuarios scope Global”).";
    case 'ad_list_users':
      return "No pude listar usuarios. Idea: probá “listar usuarios con gomez” o simplemente “listar usuarios”.";
    case 'ad_list_groups':
      return "No pude listar grupos. Idea: probá “listar grupos que contengan ventas” o “listar grupos”.";
    default:
      return "No pude realizar la acción. Si querés, decime “ayuda” y te muestro ejemplos.";
  }
}

function helpMessage() {
  return [
    "Puedo ayudarte con usuarios y grupos. Ejemplos:",
    "• crear usuario Ana Diaz [en usuarios]",
    "• agregar a ana.diaz al grupo ventas",
    "• resetear clave a ana.diaz [a Temporal123!]",
    "• desbloquear / habilitar / deshabilitar / eliminar usuario ana.diaz",
    "• info de ana.diaz",
    "• crear grupo GG_Proyectos [en usuarios] [scope Global]",
    "• listar usuarios [con gomez]",
    "• listar grupos [que contengan ventas]",
    "También puedo combinar: “crea usuario Fran Falci y agregalo a ventas”."
  ].join('\n');
}

async function executeIntent(intent, p) {
  try {
    switch (intent) {
      case 'ad_help':
        return ok(helpMessage());

      case 'ad_create_user': {
        if (!p.givenName || !p.surname) return ko(friendlyErrorIdea(intent, p));
        if (!p.sam) p.sam = buildSam(p.givenName, p.surname);
        if (!p.ou) p.ou = DEFAULT_OU;
        if (!p.tempPassword) p.tempPassword = todayTempPass();
        const r = await adCreateUser({ sam: p.sam, givenName: p.givenName, surname: p.surname, ou: p.ou, password: p.tempPassword });
        if (r.code === 0) return ok(`✔️ Usuario ${p.sam} creado en ${p.ou}. Contraseña temporal: ${p.tempPassword}`);
        return ko(`No pude crear ${p.sam}. ${friendlyErrorIdea('ad_create_user', p)}\nDetalle: ${r.err || r.out}`);
      }

      case 'ad_add_to_group': {
        if (!p.sam || !p.group) return ko(friendlyErrorIdea(intent, p));
        const group = mapGroup(p.group);
        const r = await adAddToGroup({ sam: p.sam, group });
        if (r.code === 0) return ok(`✔️ ${p.sam} agregado a ${group}.`);
        return ko(`No pude agregar a ${p.sam} a ${group}. ${friendlyErrorIdea('ad_add_to_group', p)}\nDetalle: ${r.err || r.out}`);
      }

      case 'ad_reset_password': {
        if (!p.sam) return ko(friendlyErrorIdea(intent, p));
        const newPass = p.newPassword || todayTempPass();
        const r = await adResetPassword({ sam: p.sam, newPassword: newPass });
        if (r.code === 0) return ok(`✔️ Password de ${p.sam} reseteada a: ${newPass}`);
        return ko(`No pude resetear la clave de ${p.sam}. ${friendlyErrorIdea('ad_reset_password', p)}\nDetalle: ${r.err || r.out}`);
      }

      case 'ad_unlock': {
        if (!p.sam) return ko(friendlyErrorIdea(intent, p));
        const r = await adUnlock({ sam: p.sam });
        if (r.code === 0) return ok(`✔️ ${p.sam} fue desbloqueado.`);
        return ko(`No pude desbloquear ${p.sam}. ${friendlyErrorIdea('ad_unlock', p)}\nDetalle: ${r.err || r.out}`);
      }

      case 'ad_disable_user': {
        if (!p.sam) return ko(friendlyErrorIdea(intent, p));
        const r = await adDisable({ sam: p.sam });
        if (r.code === 0) return ok(`✔️ ${p.sam} deshabilitado.`);
        return ko(`No pude deshabilitar ${p.sam}. ${friendlyErrorIdea('ad_disable_user', p)}\nDetalle: ${r.err || r.out}`);
      }

      case 'ad_enable_user': {
        if (!p.sam) return ko(friendlyErrorIdea(intent, p));
        const r = await adEnable({ sam: p.sam });
        if (r.code === 0) return ok(`✔️ ${p.sam} habilitado.`);
        return ko(`No pude habilitar ${p.sam}. ${friendlyErrorIdea('ad_enable_user', p)}\nDetalle: ${r.err || r.out}`);
      }

      case 'ad_delete_user': {
        if (!p.sam) return ko(friendlyErrorIdea(intent, p));
        const r = await adDelete({ sam: p.sam });
        if (r.code === 0) return ok(`✔️ ${p.sam} eliminado.`);
        return ko(`No pude eliminar ${p.sam}. ${friendlyErrorIdea('ad_delete_user', p)}\nDetalle: ${r.err || r.out}`);
      }

      case 'ad_info_user': {
        if (!p.sam) return ko(friendlyErrorIdea(intent, p));
        const r = await adInfo({ sam: p.sam });
        if (r.code === 0) return ok(`ℹ️ Info de ${p.sam}: ${r.out || '(sin datos)'}`, { data: safeJson(r.out) });
        return ko(`No pude obtener info de ${p.sam}. ${friendlyErrorIdea('ad_info_user', p)}\nDetalle: ${r.err || r.out}`);
      }

      case 'ad_create_group': {
        if (!p.name && p.group) p.name = p.group;
        if (!p.name) return ko(friendlyErrorIdea(intent, p));
        const scope = p.scope || 'Global';
        const ou = p.ou || DEFAULT_OU;
        const r = await adCreateGroup({ name: p.name, scope, ou });
        if (r.code === 0) return ok(`✔️ Grupo ${p.name} creado (scope: ${scope}) en ${ou}.`);
        return ko(`No pude crear el grupo ${p.name}. ${friendlyErrorIdea('ad_create_group', p)}\nDetalle: ${r.err || r.out}`);
      }

      case 'ad_list_groups': {
        const r = await adListGroups({ filter: p.filter || null });
        if (r.code === 0) return ok(`📋 Grupos${p.filter ? ` (filtro: ${p.filter})` : ''}: ${prettyCount(r.out)}`, { data: safeJson(r.out) });
        return ko(`No pude listar grupos. ${friendlyErrorIdea('ad_list_groups', p)}\nDetalle: ${r.err || r.out}`);
      }

      case 'ad_list_users': {
        const r = await adListUsers({ filter: p.filter || null });
        if (r.code === 0) return ok(`📋 Usuarios${p.filter ? ` (filtro: ${p.filter})` : ''}: ${prettyCount(r.out)}`, { data: safeJson(r.out) });
        return ko(`No pude listar usuarios. ${friendlyErrorIdea('ad_list_users', p)}\nDetalle: ${r.err || r.out}`);
      }

      case 'ad_list_group_members': {
        if (!p.group) return ko("Decime el grupo. Ej: “listar miembros de GG_Ventas”.");
        const grp = mapGroup(p.group);
        const r = await adListGroupMembers({ group: grp });
        if (r.code === 0) return ok(`👥 Miembros de ${grp}: ${prettyCount(r.out)}`, { data: safeJson(r.out) });
        return ko(`No pude listar miembros de ${grp}. Idea: verificá que exista el grupo.\nDetalle: ${r.err || r.out}`);
      }

      default:
        return ko("No entendí la acción. Decime “ayuda” para ver ejemplos.");
    }
  } catch (e) {
    return ko(`Se me complicó con ${intent}. Idea: probemos una variante más simple.\nDetalle: ${String(e?.message || e)}`);
  }
}

function prettyCount(jsonStr) {
  try {
    const j = JSON.parse(jsonStr); const n = Array.isArray(j) ? j.length : 1;
    return `Total: ${n}${n > 0 ? ' (ver data)' : ''}`;
  } catch { return '(ver data)'; }
}
function safeJson(s) { try { return JSON.parse(s); } catch { return s; } }

/* ============================
   6) HANDLER PRINCIPAL
============================ */
export async function handleChat({ text, userRole = 'Admin' }) {
  const parsed = await parseText(text);
  const auth = authorizeAll(userRole, parsed.intent);
  if (!auth.ok) return ko(`❌ No tenés permisos para ${auth.denied}.`, { intent: parsed.intent, role: userRole });

  // ejecutar intents combinados en orden
  const intents = splitIntents(parsed.intent);
  let last;
  for (const i of intents) {
    last = await executeIntent(i, parsed.params || {});
    if (!last.ok) return last; // cortar en primer error “amistoso”
  }
  // si no hubo salida (p.ej. create + add), enviamos un resumen
  if (!last) return ok("Listo. 😉");
  return last;
}

