import dotenv from 'dotenv';
dotenv.config();

const USE_OLLAMA = String(process.env.USE_OLLAMA || 'false').toLowerCase() === 'true';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';

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
  const systemMsg = `Sos un parser de comandos para administración de Windows (Active Directory, DNS, IIS). \nDevolvés SOLO JSON válido con este esquema:\n{\n  "intent": "ad_create_user|ad_create_group|ad_add_to_group|ad_unlock|dns_add_a|dns_del_a|iis_pool_status|iis_pool_recycle|unknown",\n  "givenName": null, "surname": null, "sam": null, "ou": null, "tempPassword": null,\n  "name": null, "ip": null, "scope": null, "group": null, "server": null, "pool": null,\n  "confidence": 0.0\n}\nSi falta un valor poné null. No agregues texto fuera del JSON.`;
  const prompt = `${systemMsg}\n\nUser message: Texto: "${text}"`;

  const resp = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'llama3.1:8b-instruct',
      prompt,
      stream: false
    })
  });
  if (!resp.ok) throw new Error(`Ollama error: ${resp.status}`);
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
  if (USE_OLLAMA) {
    try {
      const r = await parseWithOllama(text);
      if (r.intent !== 'unknown') return r;
    } catch {
      // fallback to local if ollama fails
    }
  }
  const r = parseLocal(text);
  return { intent: r.intent, params: r.params || {}, lowConfidence: false };
}

