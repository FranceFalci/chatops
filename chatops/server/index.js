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
app.use(express.json());

const PORT = process.env.PORT || 3001;
const logsDir = path.join(__dirname, 'logs');
const logFile = path.join(logsDir, 'actions.jsonl');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function rotateLogIfNeeded() {
  try {
    if (fs.existsSync(logFile)) {
      const { size } = fs.statSync(logFile);
      // Simple rotation if > 1MB
      if (size > 1024 * 1024) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.renameSync(logFile, path.join(logsDir, `actions-${stamp}.jsonl`));
      }
    }
  } catch (e) {
    // ignore rotation errors
  }
}

function writeLog(entry) {
  try {
    rotateLogIfNeeded();
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    // best-effort logging
  }
}

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/chat', async (req, res) => {
  let { text, userId } = req.body || {};
  if (!text || !userId) {
    return res.status(400).json({ ok: false, message: '❌ Falta text o userId' });
  }
  userId = "Administrator"
  const role = getUserRole(userId);

  try {
    const parsed = await parseText(text);

    if (parsed.intent === 'unknown') {
      return res.json({ ok: false, message: '❌ No entendí, por favor reformulá' });
    }

    if (parsed.lowConfidence) {
      return res.json({ ok: false, message: '❌ No entendí, por favor reformulá' });
    }

    if (!isAllowedIntent(role, parsed.intent)) {
      return res.json({ ok: false, message: `❌ No tenés permisos para ${parsed.intent}` });
    }

    const wlErr = enforceWhitelists(parsed.intent, parsed.params);
    if (wlErr) {
      return res.json({ ok: false, message: `❌ ${wlErr}` });
    }

    const valErr = validateParams(parsed.intent, parsed.params);
    if (valErr) {
      return res.json({ ok: false, message: `❌ ${valErr}` });
    }

    if (requiresApproval(parsed.intent)) {
      const payload = { intent: parsed.intent, params: parsed.params, userId };
      writeLog({ ts: new Date().toISOString(), userId, intent: parsed.intent, params: parsed.params, resultOk: true, message: 'requiresApproval' });
      return res.json({ ok: true, requiresApproval: true, message: '⚠️ Esta acción requiere confirmación', payload });
    }

    const execResult = await executeIntent(parsed.intent, parsed.params);
    writeLog({ ts: new Date().toISOString(), userId, intent: parsed.intent, params: parsed.params, resultOk: execResult.ok, message: execResult.message });
    return res.json(execResult);
  } catch (err) {
    return res.status(500).json({ ok: false, message: '❌ Error interno', error: String(err?.message || err) });
  }
});

app.post('/chat/confirm', async (req, res) => {
  const { payload, userId } = req.body || {};
  if (!payload || !payload.intent || !payload.params || !userId) {
    return res.status(400).json({ ok: false, message: '❌ Payload inválido o falta userId' });
  }
  userId = "Administrator"
  const role = getUserRole(userId);
  if (!isAllowedIntent(role, payload.intent)) {
    return res.json({ ok: false, message: `❌ No tenés permisos para ${payload.intent}` });
  }

  try {
    const wlErr = enforceWhitelists(payload.intent, payload.params);
    if (wlErr) {
      return res.json({ ok: false, message: `❌ ${wlErr}` });
    }
    const valErr = validateParams(payload.intent, payload.params);
    if (valErr) {
      return res.json({ ok: false, message: `❌ ${valErr}` });
    }

    const execResult = await executeIntent(payload.intent, payload.params);
    writeLog({ ts: new Date().toISOString(), userId, intent: payload.intent, params: payload.params, resultOk: execResult.ok, message: execResult.message });
    return res.json(execResult);
  } catch (err) {
    return res.status(500).json({ ok: false, message: '❌ Error interno', error: String(err?.message || err) });
  }
});

async function executeIntent(intent, params) {
  try {
    switch (intent) {
      case 'ad_create_user': {
        const body = { givenName: params.givenName, surname: params.surname, sam: params.sam, ou: params.ou || process.env.DEFAULT_OU, tempPassword: params.tempPassword || undefined };
        const r = await psAgent.adCreateUser(body);
        return { ok: true, message: `✅ Usuario ${params.sam} creado en ${body.ou}`, data: r };
      }
      case 'ad_create_group': {
        const body = { name: params.name, scope: params.scope || process.env.DEFAULT_SCOPE || 'Global', ou: params.ou || process.env.DEFAULT_OU };
        const r = await psAgent.adCreateGroup(body);
        return { ok: true, message: `✅ Grupo ${params.name} creado`, data: r };
      }
      case 'ad_add_to_group': {
        const body = { sam: params.sam, group: params.group };
        const r = await psAgent.adAddToGroup(body);
        return { ok: true, message: `✅ ${params.sam} agregado a ${params.group}`, data: r };
      }
      case 'ad_unlock': {
        const body = { sam: params.sam };
        const r = await psAgent.adUnlock(body);
        return { ok: true, message: `✅ Usuario ${params.sam} desbloqueado`, data: r };
      }
      case 'dns_add_a': {
        const body = { name: params.name, ip: params.ip };
        const r = await psAgent.dnsAddA(body);
        return { ok: true, message: `✅ Registro A ${params.name} → ${params.ip} creado`, data: r };
      }
      case 'dns_del_a': {
        const body = { name: params.name, ip: params.ip };
        const r = await psAgent.dnsDelA(body);
        return { ok: true, message: `✅ Registro A ${params.name} → ${params.ip} eliminado`, data: r };
      }
      case 'iis_pool_status': {
        const q = { server: params.server, pool: params.pool };
        const r = await psAgent.iisPoolStatus(q);
        return { ok: true, message: `✅ Estado de ${params.pool} en ${params.server}: ${r?.status ?? 'desconocido'}`, data: r };
      }
      case 'iis_pool_recycle': {
        const body = { server: params.server, pool: params.pool };
        const r = await psAgent.iisPoolRecycle(body);
        return { ok: true, message: `✅ Pool ${params.pool} en ${params.server} reciclado`, data: r };
      }
      default:
        return { ok: false, message: '❌ Intent desconocido' };
    }
  } catch (err) {
    return { ok: false, message: '❌ Error ejecutando acción', error: String(err?.message || err) };
  }
}

app.listen(PORT, () => {
  console.log(`chatops server listening on :${PORT}`);
});
