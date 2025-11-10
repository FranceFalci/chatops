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

  // DEBUG: fuerza usuario si querés
  // userId = 'Administrator';
  userId = 'Administrator';

  const role = getUserRole(userId);
  dbg(`[DBG] ${req.__corr} /chat body=`, req.body);
  dbg(`[DBG] ${req.__corr} rol detectado=`, { userId, role });

  try {
    const parsed = await parseText(text);
    dbg(`[DBG] ${req.__corr} parsed=`, parsed);

    if (parsed.intent === 'unknown' || parsed.lowConfidence) {
      return res.json({ ok: false, message: '❌ No entendí, por favor reformulá' });
    }

    // --- HELP: responder directo (pero respetando RBAC)
    if (parsed.intent === 'ad_help') {
      if (!isAllowedIntent(role, 'ad_help')) {
        return res.json({ ok: false, message: '❌ No tenés permisos para ad_help', role, intent: 'ad_help' });
      }
      return res.json({
        ok: true,
        message: [
          'Puedo hacer:',
          '- crear usuario Nombre Apellido [en OU] [sam: nombre.apellido]',
          '- agregar a usuario.algo al grupo VENTAS',
          '- resetear clave a usuario.algo [a NuevaClave123!]',
          '- desbloquear/habilitar/deshabilitar/eliminar usuario.algo',
          '- info de usuario.algo',
          '- crear grupo GG_MiGrupo [scope Global|Local|Universal] [en OU]',
          '- listar usuarios [con filtro]',
          '- listar grupos [que contengan filtro]',
          '- listar miembros de GG_MiGrupo',
          '- DNS: crear/borrar A host -> 10.0.0.10',
          '- IIS: estado/reciclar app pool'
        ].join('\n')
      });
    }

    // --- intents compuestos
    const intents = String(parsed.intent).split('|').map(s => s.trim()).filter(Boolean);
    if (!intents.length) {
      return res.json({ ok: false, message: '❌ Intent vacío' });
    }

    // RBAC por todos los intents
    if (!isAllowedIntent(role, parsed.intent)) {
      return res.json({ ok: false, message: `❌ No tenés permisos para ${parsed.intent}`, role, intent: parsed.intent });
    }

    // Normalizar OU si hace falta (no dejes null para creaciones)
    if (intents.some(i => i === 'ad_create_user' || i === 'ad_create_group')) {
      if (!parsed.params.ou) {
        parsed.params.ou = process.env.DEFAULT_OU || null;
        dbg(`[DBG] ${req.__corr} OU faltaba, seteo OU desde DEFAULT_OU=`, parsed.params.ou);
        if (!parsed.params.ou) {
          return res.json({ ok: false, message: '❌ Falta OU (DEFAULT_OU no configurada). Definí DEFAULT_OU en .env o decí "en OU=...".' });
        }
      }
    }

    // Whitelists + Validaciones por CADA intent
    for (const it of intents) {
      const wlErr = enforceWhitelists(it, parsed.params);
      if (wlErr) {
        return res.json({ ok: false, message: `❌ ${wlErr}`, intent: it, params: parsed.params });
      }
      const valErr = validateParams(it, parsed.params);
      dbg(`[DBG] ${req.__corr} validateParams(${it})=`, valErr || 'OK');
      if (valErr) {
        return res.json({ ok: false, message: `❌ ${valErr}`, intent: it, params: parsed.params });
      }
    }

    // ¿requiere aprobación alguno?
    if (requiresApproval(parsed.intent)) {
      const payload = { intent: parsed.intent, params: parsed.params, userId };
      writeLog({ ts: new Date().toISOString(), corr: req.__corr, userId, intent: parsed.intent, params: parsed.params, resultOk: true, message: 'requiresApproval' });
      return res.json({ ok: true, requiresApproval: true, message: '⚠️ Esta acción requiere confirmación', payload });
    }

    // EJECUCIÓN SECUENCIAL
    const results = [];
    for (const it of intents) {
      const r = await executeIntent(req.__corr, it, parsed.params, userId);
      results.push({ intent: it, ...r });
      if (!r.ok) {
        // si falla uno, cortar y devolver contexto
        writeLog({ ts: new Date().toISOString(), corr: req.__corr, userId, intent: it, params: parsed.params, resultOk: r.ok, message: r.message, data: r.data || null, error: r.error || null });
        return res.json({ ok: false, message: r.message, step: it, previous: results.slice(0, -1) });
      }
    }

    // todo OK
    writeLog({ ts: new Date().toISOString(), corr: req.__corr, userId, intent: parsed.intent, params: parsed.params, resultOk: true, message: 'OK', data: results });
    return res.json({ ok: true, message: '✅ Acciones completadas', results });

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

  // DEBUG
  userId = 'Administrator';
  const role = getUserRole(userId);
  dbg(`[DBG] ${req.__corr} /chat/confirm body=`, req.body, 'role=', role);

  const intents = String(payload.intent).split('|').map(s => s.trim()).filter(Boolean);
  if (!intents.length) {
    return res.json({ ok: false, message: '❌ Intent vacío' });
  }

  if (!isAllowedIntent(role, payload.intent)) {
    return res.json({ ok: false, message: `❌ No tenés permisos para ${payload.intent}`, role, intent: payload.intent });
  }

  try {
    // Normalización OU para creaciones
    if (intents.some(i => i === 'ad_create_user' || i === 'ad_create_group')) {
      if (!payload.params.ou) {
        payload.params.ou = process.env.DEFAULT_OU || null;
        dbg(`[DBG] ${req.__corr} (confirm) OU faltaba, set desde DEFAULT_OU=`, payload.params.ou);
        if (!payload.params.ou) {
          return res.json({ ok: false, message: '❌ Falta OU (DEFAULT_OU no configurada).' });
        }
      }
    }

    // Whitelists + Validaciones por intent
    for (const it of intents) {
      const wlErr = enforceWhitelists(it, payload.params);
      if (wlErr) {
        return res.json({ ok: false, message: `❌ ${wlErr}`, intent: it, params: payload.params });
      }
      const valErr = validateParams(it, payload.params);
      if (valErr) {
        return res.json({ ok: false, message: `❌ ${valErr}`, intent: it, params: payload.params });
      }
    }

    // Ejecutar secuencial
    const results = [];
    for (const it of intents) {
      const r = await executeIntent(req.__corr, it, payload.params, userId);
      results.push({ intent: it, ...r });
      if (!r.ok) {
        writeLog({ ts: new Date().toISOString(), corr: req.__corr, userId, intent: it, params: payload.params, resultOk: r.ok, message: r.message, data: r.data || null, error: r.error || null });
        return res.json({ ok: false, message: r.message, step: it, previous: results.slice(0, -1) });
      }
    }

    writeLog({ ts: new Date().toISOString(), corr: req.__corr, userId, intent: payload.intent, params: payload.params, resultOk: true, message: 'OK', data: results });
    return res.json({ ok: true, message: '✅ Acciones completadas', results });

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
      case 'ad_help': {
        // por si llegara a ejecutarse aquí (normalmente se responde arriba)
        return { ok: true, message: 'ℹ️ Usa /chat para ver ayuda (ya se respondió arriba).' };
      }
      case 'ad_reset_password': {
        const body = { sam: params.sam, tempPassword: params.tempPassword || undefined };
        dbg(`[PS>] ${corr} ad_reset_password body=`, body);
        const r = await psAgent.adResetPassword(body);
        dbg(`[PS<] ${corr} ad_reset_password resp=`, r, `(${Date.now() - t0}ms)`);
        return { ok: true, message: `✅ Clave reseteada para ${params.sam}`, data: r };
      }
      case 'ad_disable_user': {
        const body = { sam: params.sam };
        dbg(`[PS>] ${corr} ad_disable_user body=`, body);
        const r = await psAgent.adDisableUser(body);
        dbg(`[PS<] ${corr} ad_disable_user resp=`, r, `(${Date.now() - t0}ms)`);
        return { ok: true, message: `✅ Usuario ${params.sam} deshabilitado`, data: r };
      }
      case 'ad_enable_user': {
        const body = { sam: params.sam };
        dbg(`[PS>] ${corr} ad_enable_user body=`, body);
        const r = await psAgent.adEnableUser(body);
        dbg(`[PS<] ${corr} ad_enable_user resp=`, r, `(${Date.now() - t0}ms)`);
        return { ok: true, message: `✅ Usuario ${params.sam} habilitado`, data: r };
      }
      case 'ad_delete_user': {
        const body = { sam: params.sam };
        dbg(`[PS>] ${corr} ad_delete_user body=`, body);
        const r = await psAgent.adDeleteUser(body);
        dbg(`[PS<] ${corr} ad_delete_user resp=`, r, `(${Date.now() - t0}ms)`);
        return { ok: true, message: `✅ Usuario ${params.sam} eliminado`, data: r };
      }
      case 'ad_info_user': {
        const q = { sam: params.sam };
        dbg(`[PS>] ${corr} ad_info_user query=`, q);
        const r = await psAgent.adInfoUser(q);
        dbg(`[PS<] ${corr} ad_info_user resp=`, r, `(${Date.now() - t0}ms)`);
        return { ok: true, message: `ℹ️ Info de ${params.sam}`, data: r };
      }
      case 'ad_list_users': {
        const q = { filter: params.filter || '' };
        dbg(`[PS>] ${corr} ad_list_users query=`, q);
        const r = await psAgent.adListUsers(q);
        dbg(`[PS<] ${corr} ad_list_users resp=`, r, `(${Date.now() - t0}ms)`);
        return { ok: true, message: '📋 Usuarios', data: r };
      }
      case 'ad_list_groups': {
        const q = { filter: params.filter || '' };
        dbg(`[PS>] ${corr} ad_list_groups query=`, q);
        const r = await psAgent.adListGroups(q);
        dbg(`[PS<] ${corr} ad_list_groups resp=`, r, `(${Date.now() - t0}ms)`);
        return { ok: true, message: '📋 Grupos', data: r };
      }
      case 'ad_list_group_members': {
        const q = { group: params.group };
        dbg(`[PS>] ${corr} ad_list_group_members query=`, q);
        const r = await psAgent.adListGroupMembers(q);
        dbg(`[PS<] ${corr} ad_list_group_members resp=`, r, `(${Date.now() - t0}ms)`);
        return { ok: true, message: `📋 Miembros de ${params.group}`, data: r };
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
