import dotenv from 'dotenv';
dotenv.config();
const USE_OLLAMA =true

// const USE_OLLAMA = String(process.env.USE_OLLAMA || 'false').toLowerCase() === 'true';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral:7b-instruct';

const lookups = {
  servers: {
    'web01': 'WEB01',
    'dc01': 'DC01',
    'file01': 'FILE01'
  },
  pools: {
    'intranetpool': 'IntranetPool'
  },
  groups: {
    'gg_ventas': 'GG_Ventas',
    'gg_marketing': 'GG_Marketing'
  },
  ous: {
    'usuarios': process.env.DEFAULT_OU || 'OU=Usuarios,DC=empresa,DC=local'
  }
};

function norm(s) {
  return String(s || '').trim();
}

function mapLookup(table, value) {
  if (!value) return value;
  const key = String(value).toLowerCase();
  return table[key] || value;
}

function parseLocal(text) {
  const t = norm(text);

  // ad_create_user: "crear usuario Ana Gomez (sam: ana.gomez) en Usuarios"
  let m;
  m = t.match(/crear\s+usuario\s+([a-záéíóúñ]+)\s+([a-záéíóúñ]+)(?:.*?sam\s*[:=]\s*([a-z]+\.[a-z]+))?(?:.*?en\s+([\w=,\s]+))?/i);
  if (m) {
    const givenName = m[1];
    const surname = m[2];
    const sam = m[3] || (givenName && surname ? `${givenName}.${surname}`.toLowerCase() : null);
    let ouPart = m[4]?.trim();
    if (ouPart) {
      if (/^ou=/i.test(ouPart)) {
        // full OU
      } else {
        // map friendly name like "Usuarios"
        ouPart = lookups.ous[ouPart.toLowerCase()] || process.env.DEFAULT_OU;
      }
    }
    return { intent: 'ad_create_user', params: { givenName, surname, sam, ou: ouPart || process.env.DEFAULT_OU } };
  }

  // ad_add_to_group: "agregar a ana.gomez al grupo GG_Ventas"
  m = t.match(/agregar\s+a\s+([a-z]+\.[a-z]+)\s+al\s+grupo\s+([\w_-]+)/i);
  if (m) {
    const sam = m[1];
    const group = mapLookup(lookups.groups, m[2]);
    return { intent: 'ad_add_to_group', params: { sam, group } };
  }

  // ad_create_group: "crear grupo GG_Marketing" (optional scope, ou)
  m = t.match(/crear\s+grupo\s+([\w_-]+)(?:.*?scope\s*[:=]\s*(Global|Local|Universal))?(?:.*?en\s+([\w=,\s]+))?/i);
  if (m) {
    const name = mapLookup(lookups.groups, m[1]);
    const scope = m[2] || null;
    let ou = m[3]?.trim();
    if (ou) {
      if (!/^ou=/i.test(ou)) {
        ou = lookups.ous[ou.toLowerCase()] || process.env.DEFAULT_OU;
      }
    }
    return { intent: 'ad_create_group', params: { name, scope, ou: ou || process.env.DEFAULT_OU } };
  }

  // ad_unlock: "desbloquear a juan.perez"
  m = t.match(/desbloquear\s+a\s+([a-z]+\.[a-z]+)/i);
  if (m) {
    return { intent: 'ad_unlock', params: { sam: m[1] } };
  }

  // dns_add_a: "crear A intranet → 10.0.0.50" or "crear A intranet 10.0.0.50"
  m = t.match(/crear\s+a\s+([\w.-]+)\s*(?:→|->|\s)\s*(\d+\.\d+\.\d+\.\d+)/i);
  if (m) {
    return { intent: 'dns_add_a', params: { name: m[1], ip: m[2] } };
  }

  // dns_del_a: "borrar A intranet → 10.0.0.50"
  m = t.match(/borrar\s+a\s+([\w.-]+)\s*(?:→|->|\s)\s*(\d+\.\d+\.\d+\.\d+)/i);
  if (m) {
    return { intent: 'dns_del_a', params: { name: m[1], ip: m[2] } };
  }

  // iis_pool_status: "estado del app pool IntranetPool en WEB01"
  m = t.match(/estado\s+del\s+app\s+pool\s+([\w_-]+)\s+en\s+([\w_-]+)/i);
  if (m) {
    const pool = mapLookup(lookups.pools, m[1]);
    const server = mapLookup(lookups.servers, m[2]);
    return { intent: 'iis_pool_status', params: { server, pool } };
  }

  // iis_pool_recycle: "reciclá IntranetPool en WEB01"
  m = t.match(/recicla[rá]?\s+([\w_-]+)\s+en\s+([\w_-]+)/i);
  if (m) {
    const pool = mapLookup(lookups.pools, m[1]);
    const server = mapLookup(lookups.servers, m[2]);
    return { intent: 'iis_pool_recycle', params: { server, pool } };
  }

  return { intent: 'unknown', params: {} };
}

async function parseWithOllama(text) {
  const systemMsg = `
Sos un parser de órdenes de IT (Active Directory, grupos, DNS, IIS) en español.
Debés responder SIEMPRE un JSON plano con esta forma general:
{
  "intent": "<string>",
  "givenName": "<string|null>",
  "surname": "<string|null>",
  "sam": "<string|null>",
  "ou": "<string|null>",
  "tempPassword": "<string|null>",
  "name": "<string|null>",
  "ip": "<string|null>",
  "scope": "<string|null>",
  "group": "<string|null>",
  "server": "<string|null>",
  "pool": "<string|null>",
  "confidence": <0..1>
}

Reglas:
- "intent" ∈ { "ad_create_user","ad_add_to_group","ad_create_group","ad_unlock","dns_add_a","dns_del_a","iis_pool_status","iis_pool_recycle","unknown" }.
- Si falta un dato, poné null (no inventes).
- Para usuarios: si no dan "sam" pero hay nombre y apellido, construí "sam" = "<nombre>.<apellido>" en minúsculas sin tildes.
- Si no dan "ou", usá "${process.env.DEFAULT_OU || 'OU=Usuarios,DC=empresa,DC=com'}".
- Devolvé SOLO el JSON, sin comentarios ni explicación.
`;

  // few-shot muy cortito para guiar
  const fewshot = `
Usuario: "crear usuario Ana Diaz en usuarios"
Respuesta:
{"intent":"ad_create_user","givenName":"Ana","surname":"Diaz","sam":"ana.diaz","ou":"${process.env.DEFAULT_OU || 'OU=Usuarios,DC=empresa,DC=com'}","tempPassword":null,"name":null,"ip":null,"scope":null,"group":null,"server":null,"pool":null,"confidence":0.92}

Usuario: "agregar a ana.diaz al grupo ventas"
Respuesta:
{"intent":"ad_add_to_group","givenName":null,"surname":null,"sam":"ana.diaz","ou":null,"tempPassword":null,"name":null,"ip":null,"scope":null,"group":"GG_Ventas","server":null,"pool":null,"confidence":0.88}
`;

  const prompt = `${systemMsg}\n${fewshot}\nUsuario: "${text}"\nRespuesta:\n`;

  const resp = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0.1 }
    })
  });
  if (!resp.ok) throw new Error(`Ollama error: \${resp.status}`);
  const data = await resp.json();
  const txt = data?.response || '';
  let parsed;
  try {
    parsed = JSON.parse(txt);
  } catch {
    return { intent: 'unknown', params: {}, lowConfidence: true };
  }
  const intent = parsed.intent || 'unknown';
  const params = {
    givenName: parsed.givenName || null,
    surname: parsed.surname || null,
    sam: parsed.sam || null,
    ou: parsed.ou || null,
    tempPassword: parsed.tempPassword || null,
    name: parsed.name || null,
    ip: parsed.ip || null,
    scope: parsed.scope || null,
    group: parsed.group || null,
    server: parsed.server || null,
    pool: parsed.pool || null
  };
  const confidence = Number(parsed.confidence || 0);
  const lowConfidence = isNaN(confidence) || confidence < 0.75;
  return { intent, params, lowConfidence };
}


export async function parseText(text) {
  console.log("\n--- PARSER IN ---", text);     // <--- LOG ENTRADA

  try {
    if (USE_OLLAMA) {
      console.log("[parser] intentando IA (ollama)...");
      const iaResult = await parseWithOllama(text);
      console.log("[parser] resultado IA =", iaResult);   // <--- LOG RESULTADO IA

      if (!iaResult.lowConfidence && iaResult.intent !== 'unknown') {
        console.log("[parser] ✅ IA entiende");
        return iaResult;
      }

      console.log("[parser] ❓ IA no segura / desconocido, fallback a regex...");
    }

    // FALLBACK -> regex
    const regexResult = parseWithRegex(text);
    console.log("[parser] resultado regex =", regexResult);  // <--- LOG REGEX
    return regexResult;

  } catch (err) {
    console.error("[parser] ❌ ERROR", err);
    return { intent: "unknown", params: {}, lowConfidence: true };
  }
}

