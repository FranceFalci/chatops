// index.js (versión depuración extendida)
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { parseText } from './lib/parser.js';
import { isAllowedIntent, requiresApproval, validateParams, getUserRole, enforceWhitelists } from './lib/policies.js';
import { psAgent } from './lib/psAgent.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3001;
const logsDir = path.join(__dirname, 'logs');
const logFile = path.join(logsDir, 'actions.jsonl');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ───────── Logger util ─────────
function rotateLogIfNeeded() {
  try {
    if (fs.existsSync(logFile)) {
      const { size } = fs.statSync(logFile);
      if (size > 1024 * 1024) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.renameSync(logFile, path.join(logsDir, `actions-${stamp}.jsonl`));
      }
    }
  } catch (_) { }
}

function writeLog(entry) {
  try {
    rotateLogIfNeeded();
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch (_) { }
}

function dbg(...args) {
  // Logging a consola SIEMPRE (estás depurando)
  const stamp = new Date().toISOString();
  console.log(stamp, ...args);
}

// ───────── Sanity check de env ─────────
function envSnapshot() {
  // Dump de variables CLAVE (sin secretos)
  return {
    NODE_ENV: process.env.NODE_ENV || null,
    PORT: process.env.PORT || 3001,
    DEFAULT_OU: process.env.DEFAULT_OU || null,
    DEFAULT_SCOPE: process.env.DEFAULT_SCOPE || null,
    ADMINS: process.env.ADMINS || null,
    HELPDESK: process.env.HELPDESK || null,
    PS_BASE: process.env.PS_BASE || null,
    USE_OLLAMA: process.env.USE_OLLAMA || null,
    OLLAMA_URL: process.env.OLLAMA_URL || null
  };
}

dbg('[BOOT] chatops starting with env:', envSnapshot());
if (!process.env.DEFAULT_OU) {
  dbg('⚠️ [WARN] DEFAULT_OU no está definida en .env. Si el parser no trae OU, PS Agent recibirá Path = null y fallará New-ADUser.');
}

// Health
app.get('/health', (req, res) => {
  res.json({ ok: true, env: envSnapshot() });
});

// ───────── Middlewares de trazas ─────────
app.use((req, _res, next) => {
  req.__corr = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  req.__t0 = Date.now();
  dbg(`[IN ] ${req.__corr} ${req.method} ${req.url}`);
  next();
});

app.use((req, res, next) => {
  const orig = res.json.bind(res);
  res.json = (payload) => {
    const dt = Date.now() - req.__t0;
    dbg(`[OUT] ${req.__corr} ${req.method} ${req.url} (${dt}ms) =>`, payload);
    return orig(payload);
  };
  next();
});

// ───────── Rutas principales ─────────
app.post('/chat', async (req, res) => {
  let { text, userId } = req.body || {};
  if (!text || !userId) {
    return res.status(400).json({ ok: false, message: '❌ Falta text o userId' });
  }

  // Forzado temporal para depurar con Administrator (si querés, comentá esta línea)
  // userId = 'Administrator';
  userId = "Administrator"

  const role = getUserRole(userId);
  // const role = "Administrator"
  dbg(`[DBG] ${req.__corr} /chat body=`, req.body);
  dbg(`[DBG] ${req.__corr} rol detectado=`, { userId, role });

  try {
    const parsed = await parseText(text);
    dbg(`[DBG] ${req.__corr} parsed=`, parsed);

    if (parsed.intent === 'unknown' || parsed.lowConfidence) {
      return res.json({ ok: false, message: '❌ No entendí, por favor reformulá' });
    }

    if (!isAllowedIntent(role, parsed.intent)) {
      return res.json({ ok: false, message: `❌ No tenés permisos para ${parsed.intent}`, role, intent: parsed.intent });
    }

    const wlErr = enforceWhitelists(parsed.intent, parsed.params);
    if (wlErr) {
      return res.json({ ok: false, message: `❌ ${wlErr}`, intent: parsed.intent, params: parsed.params });
    }

    const valErr = validateParams(parsed.intent, parsed.params);
    dbg(`[DBG] ${req.__corr} validateParams=`, valErr || 'OK');
    if (valErr) {
      return res.json({ ok: false, message: `❌ ${valErr}`, intent: parsed.intent, params: parsed.params });
    }

    // Normalización explícita de OU para que NUNCA vaya null al PS Agent
    if (parsed.intent === 'ad_create_user' || parsed.intent === 'ad_create_group') {
      if (!parsed.params.ou) {
        parsed.params.ou = process.env.DEFAULT_OU || null;
        dbg(`[DBG] ${req.__corr} OU faltaba, seteo OU desde DEFAULT_OU=`, parsed.params.ou);
      }
      if (!parsed.params.ou) {
        return res.json({ ok: false, message: '❌ Falta OU (DEFAULT_OU no configurada). Definí DEFAULT_OU en .env o decí "en OU=...".' });
      }
    }

    if (requiresApproval(parsed.intent)) {
      const payload = { intent: parsed.intent, params: parsed.params, userId };
      writeLog({ ts: new Date().toISOString(), corr: req.__corr, userId, intent: parsed.intent, params: parsed.params, resultOk: true, message: 'requiresApproval' });
      return res.json({ ok: true, requiresApproval: true, message: '⚠️ Esta acción requiere confirmación', payload });
    }

    const execResult = await executeIntent(req.__corr, parsed.intent, parsed.params, userId);
    writeLog({ ts: new Date().toISOString(), corr: req.__corr, userId, intent: parsed.intent, params: parsed.params, resultOk: execResult.ok, message: execResult.message, data: execResult.data || null, error: execResult.error || null });
    return res.json(execResult);
  } catch (err) {
    dbg(`[ERR] ${req.__corr} /chat error=`, err);
    return res.status(500).json({ ok: false, message: '❌ Error interno', error: String(err?.message || err) });
  }
});

app.post('/chat/confirm', async (req, res) => {
  let { payload, userId } = req.body || {};
  if (!payload || !payload.intent || !payload.params || !userId) {
    return res.status(400).json({ ok: false, message: '❌ Payload inválido o falta userId' });
  }
  userId = "Administrator"
  const role = getUserRole(userId);
  dbg(`[DBG] ${req.__corr} /chat/confirm body=`, req.body, 'role=', role);

  if (!isAllowedIntent(role, payload.intent)) {
    return res.json({ ok: false, message: `❌ No tenés permisos para ${payload.intent}`, role, intent: payload.intent });
  }

  try {
    const wlErr = enforceWhitelists(payload.intent, payload.params);
    if (wlErr) {
      return res.json({ ok: false, message: `❌ ${wlErr}`, intent: payload.intent, params: payload.params });
    }
    const valErr = validateParams(payload.intent, payload.params);
    if (valErr) {
      return res.json({ ok: false, message: `❌ ${valErr}`, intent: payload.intent, params: payload.params });
    }

    // Normalización OU también aquí
    if ((payload.intent === 'ad_create_user' || payload.intent === 'ad_create_group') && !payload.params.ou) {
      payload.params.ou = process.env.DEFAULT_OU || null;
      dbg(`[DBG] ${req.__corr} (confirm) OU faltaba, set desde DEFAULT_OU=`, payload.params.ou);
      if (!payload.params.ou) {
        return res.json({ ok: false, message: '❌ Falta OU (DEFAULT_OU no configurada).' });
      }
    }

    const execResult = await executeIntent(req.__corr, payload.intent, payload.params, userId);
    writeLog({ ts: new Date().toISOString(), corr: req.__corr, userId, intent: payload.intent, params: payload.params, resultOk: execResult.ok, message: execResult.message, data: execResult.data || null, error: execResult.error || null });
    return res.json(execResult);
  } catch (err) {
    dbg(`[ERR] ${req.__corr} /chat/confirm error=`, err);
    return res.status(500).json({ ok: false, message: '❌ Error interno', error: String(err?.message || err) });
  }
});

// ───────── Ejecutor con trazas hacia PS Agent ─────────
async function executeIntent(corr, intent, params, actor) {
  const t0 = Date.now();
  try {
    switch (intent) {
      case 'ad_create_user': {
        const body = {
          givenName: params.givenName,
          surname: params.surname,
          sam: params.sam,
          ou: params.ou || process.env.DEFAULT_OU,
          tempPassword: params.tempPassword || undefined
        };
        dbg(`[PS>] ${corr} ad_create_user body=`, body);
        const r = await psAgent.adCreateUser(body); // hará POST a PS_BASE/api/ad/create-user :contentReference[oaicite:1]{index=1}
        dbg(`[PS<] ${corr} ad_create_user resp=`, r, `(${Date.now() - t0}ms)`);
        return { ok: true, message: `✅ Usuario ${params.sam} creado en ${body.ou}`, data: r };
      }
      case 'ad_create_group': {
        const body = {
          name: params.name,
          scope: params.scope || process.env.DEFAULT_SCOPE || 'Global',
          ou: params.ou || process.env.DEFAULT_OU
        };
        dbg(`[PS>] ${corr} ad_create_group body=`, body);
        const r = await psAgent.adCreateGroup(body);
        dbg(`[PS<] ${corr} ad_create_group resp=`, r, `(${Date.now() - t0}ms)`);
        return { ok: true, message: `✅ Grupo ${params.name} creado`, data: r };
      }
      case 'ad_add_to_group': {
        const body = { sam: params.sam, group: params.group };
        dbg(`[PS>] ${corr} ad_add_to_group body=`, body);
        const r = await psAgent.adAddToGroup(body);
        dbg(`[PS<] ${corr} ad_add_to_group resp=`, r, `(${Date.now() - t0}ms)`);
        return { ok: true, message: `✅ ${params.sam} agregado a ${params.group}`, data: r };
      }
      case 'ad_unlock': {
        const body = { sam: params.sam };
        dbg(`[PS>] ${corr} ad_unlock body=`, body);
        const r = await psAgent.adUnlock(body);
        dbg(`[PS<] ${corr} ad_unlock resp=`, r, `(${Date.now() - t0}ms)`);
        return { ok: true, message: `✅ Usuario ${params.sam} desbloqueado`, data: r };
      }
      case 'dns_add_a': {
        const body = { name: params.name, ip: params.ip };
        dbg(`[PS>] ${corr} dns_add_a body=`, body);
        const r = await psAgent.dnsAddA(body);
        dbg(`[PS<] ${corr} dns_add_a resp=`, r, `(${Date.now() - t0}ms)`);
        return { ok: true, message: `✅ Registro A ${params.name} → ${params.ip} creado`, data: r };
      }
      case 'dns_del_a': {
        const body = { name: params.name, ip: params.ip };
        dbg(`[PS>] ${corr} dns_del_a body=`, body);
        const r = await psAgent.dnsDelA(body);
        dbg(`[PS<] ${corr} dns_del_a resp=`, r, `(${Date.now() - t0}ms)`);
        return { ok: true, message: `✅ Registro A ${params.name} → ${params.ip} eliminado`, data: r };
      }
      case 'iis_pool_status': {
        const q = { server: params.server, pool: params.pool };
        dbg(`[PS>] ${corr} iis_pool_status query=`, q);
        const r = await psAgent.iisPoolStatus(q);
        dbg(`[PS<] ${corr} iis_pool_status resp=`, r, `(${Date.now() - t0}ms)`);
        return { ok: true, message: `✅ Estado de ${params.pool} en ${params.server}: ${r?.status ?? 'desconocido'}`, data: r };
      }
      case 'iis_pool_recycle': {
        const body = { server: params.server, pool: params.pool };
        dbg(`[PS>] ${corr} iis_pool_recycle body=`, body);
        const r = await psAgent.iisPoolRecycle(body);
        dbg(`[PS<] ${corr} iis_pool_recycle resp=`, r, `(${Date.now() - t0}ms)`);
        return { ok: true, message: `✅ Pool ${params.pool} en ${params.server} reciclado`, data: r };
      }
      default:
        return { ok: false, message: '❌ Intent desconocido' };
    }
  } catch (err) {
    const ms = Date.now() - t0;
    // psAgent ya arroja mensaje del tipo "PS Agent error 500: { ... }" si el HTTP no es 2xx. :contentReference[oaicite:2]{index=2}
    dbg(`[PSE] ${corr} intent=${intent} params=`, params, `error=`, err?.message || err, `(${ms}ms)`);
    return {
      ok: false,
      message: '❌ Error ejecutando acción',
      error: String(err?.message || err),
      intent,
      params
    };
  }
}

// ───────── errores globales ─────────
process.on('unhandledRejection', (reason) => {
  dbg('[UNHANDLED REJECTION]', reason);
});
process.on('uncaughtException', (err) => {
  dbg('[UNCAUGHT EXCEPTION]', err);
});

// ───────── start ─────────
app.listen(PORT, () => {
  console.log(`chatops server listening on :${PORT}`);
});
