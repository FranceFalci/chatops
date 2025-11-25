// index.js  (VERSIÓN FINAL — CHAT DEVUELVE INFO EN message)

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

if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

//────────────────────────────── LOGGING ──────────────────────────────
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
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch (_) { }
}

function dbg(...a) {
  console.log(new Date().toISOString(), ...a);
}

//────────────────────────────── CHAT FORMATEO ──────────────────────────────

function _safe(v, d = '-') { return (v === null || v === undefined || v === '') ? d : String(v); }
function _yn(b) { return b ? "Sí" : "No"; }

function formatIntentForMessage(r) {
  const d = r.data || {};

  switch (r.intent) {

    case "ad_info_user": {
      const u = d.user || {};
      return [
        `ℹ️ Información de ${_safe(u.sam)}`,
        `Nombre: ${_safe(u.name)}`,
        `Habilitado: ${_yn(u.enabled)}`,
        `DN: ${_safe(u.dn)}`,
        `UPN: ${_safe(u.upn)}`,
        `Email: ${_safe(u.mail)}`,
        `Creado: ${_safe(u.whenCreated)}`
      ].join("\n");
    }

    case "ad_list_users": {
      const rows = Array.isArray(d.rows) ? d.rows : [];
      const header = `👥 Usuarios encontrados (${rows.length})`;
      const top = rows.slice(0, 10).map(u => `- ${_safe(u.sam)} — ${_safe(u.name)} (${_yn(u.enabled)})`);
      const more = rows.length > 10 ? `\n… y ${rows.length - 10} más` : "";
      return [header, ...top].join("\n") + more;
    }

    case "ad_list_groups": {
      const rows = Array.isArray(d.rows) ? d.rows : [];
      const header = `📂 Grupos encontrados (${rows.length})`;
      const top = rows.slice(0, 10).map(g => `- ${_safe(g.name)}`);
      const more = rows.length > 10 ? `\n… y ${rows.length - 10} más` : "";
      return [header, ...top].join("\n") + more;
    }

    case "ad_list_group_members": {
      const rows = Array.isArray(d.rows) ? d.rows : [];
      const header = `👤 Miembros del grupo ${_safe(d.group)} (${rows.length})`;
      const top = rows.slice(0, 15).map(m => `- ${_safe(m.sam)} — ${_safe(m.name)} (${_yn(m.enabled)})`);
      const more = rows.length > 15 ? `\n… y ${rows.length - 15} más` : "";
      return [header, ...top].join("\n") + more;
    }

    case "iis_pool_status":
      return `🌐 Estado del pool ${_safe(d.pool)} en ${_safe(d.server)} = ${_safe(d.status)}`;

    default:
      return r.message;   // otros intents ya generan mensaje
  }
}

function composeChatMessage(results) {
  return results.map(formatIntentForMessage).join("\n\n");
}

//────────────────────────────── HEALTH ──────────────────────────────
function envSnapshot() {
  return {
    PORT: process.env.PORT,
    ADMINS: process.env.ADMINS,
    HELPDESK: process.env.HELPDESK,
    USE_OLLAMA: process.env.USE_OLLAMA,
    OLLAMA_URL: process.env.OLLAMA_URL
  };
}

app.get("/health", (req, res) => {
  res.json({ ok: true, env: envSnapshot() });
});

//────────────────────────────── MIDDLEWARE LOG ──────────────────────────────
app.use((req, _res, next) => {
  req.__corr = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  req.__t0 = Date.now();
  dbg(`[IN ] ${req.__corr} ${req.method} ${req.url}`);
  next();
});

app.use((req, res, next) => {
  const orig = res.json;
  res.json = (payload) => {
    dbg(`[OUT] ${req.__corr} ->`, payload);
    return orig.call(res, payload);
  };
  next();
});

//────────────────────────────── RUTA PRINCIPAL CHAT ──────────────────────────────
app.post('/chat', async (req, res) => {
  let { text, userId } = req.body || {};
  if (!text || !userId)
    return res.json({ ok: false, message: "❌ Falta text o userId" });

  userId = "Administrator"; 
  const role = getUserRole(userId);

  const parsed = await parseText(text);
  dbg(`[DBG] parsed=`, parsed);

  if (parsed.intent === "ad_help") {
    return res.json({
      ok: true,
      message:
        `Estoy prepardo para ayudarte con lo siguiente:
• listar usuarios [filtro]
• listar grupos [filtro]
• crear usuario / crear grupo / agregar a grupo
`
    });
  }

  if (parsed.intent === "unknown" || parsed.lowConfidence)
    return res.json({ ok: false, message: "❌ No entendí, reformulá" });

  if (!isAllowedIntent(role, parsed.intent))
    return res.json({ ok: false, message: `❌ No tenés permisos para ${parsed.intent}` });

  const intents = parsed.intent.split("|");
  // Normalización para ad_create_group
  if (intents.includes('ad_create_group')) {
    // alias "group" -> "name"
    if (!parsed.params.name && parsed.params.group) {
      parsed.params.name = parsed.params.group;
      dbg(`[DBG] ${req.__corr} normalicé name <- group (${parsed.params.name})`);
    }
    // scope "Local" -> "DomainLocal"; default Global
    const s = (parsed.params.scope || process.env.DEFAULT_SCOPE || 'Global').toString().trim().toLowerCase();
    parsed.params.scope =
      s === 'local' ? 'DomainLocal' :
        s === 'domainlocal' ? 'DomainLocal' :
          s === 'universal' ? 'Universal' : 'Global';
    dbg(`[DBG] ${req.__corr} scope normalizado = ${parsed.params.scope}`);
  }
  // Normalización para ad_create_group
  if (intents.includes('ad_create_group')) {
    // alias "group" -> "name"
    if (!parsed.params.name && parsed.params.group) {
      parsed.params.name = parsed.params.group;
      dbg(`[DBG] ${req.__corr} normalicé name <- group (${parsed.params.name})`);
    }
    // scope "Local" -> "DomainLocal"; default Global
    const s = (parsed.params.scope || process.env.DEFAULT_SCOPE || 'Global').toString().trim().toLowerCase();
    parsed.params.scope =
      s === 'local' ? 'DomainLocal' :
        s === 'domainlocal' ? 'DomainLocal' :
          s === 'universal' ? 'Universal' : 'Global';
    dbg(`[DBG] ${req.__corr} scope normalizado = ${parsed.params.scope}`);
  }

  for (const it of intents) {
    const w = enforceWhitelists(it, parsed.params);
    if (w) return res.json({ ok: false, message: `❌ ${w}` });

    const v = validateParams(it, parsed.params);
    if (v) return res.json({ ok: false, message: `❌ ${v}` });
  }

  if (requiresApproval(parsed.intent)) {
    return res.json({
      ok: true,
      requiresApproval: true,
      payload: { intent: parsed.intent, params: parsed.params, userId }
    });
  }

  const results = [];
  for (const it of intents) {
    const r = await executeIntent(req.__corr, it, parsed.params);
    results.push({ intent: it, ...r });
    if (!r.ok) return res.json({ ok: false, message: r.message });
  }

  const msg = composeChatMessage(results);
  return res.json({ ok: true, message: msg, results });
});

//────────────────────────────── CONFIRM ──────────────────────────────
app.post("/chat/confirm", async (req, res) => {
  let { payload, userId } = req.body;
  userId = "Administrator";

  const intents = payload.intent.split("|");
  const results = [];

  for (const it of intents) {
    const r = await executeIntent(req.__corr, it, payload.params);
    results.push({ intent: it, ...r });
    if (!r.ok) return res.json({ ok: false, message: r.message });
  }

  const msg = composeChatMessage(results);
  return res.json({ ok: true, message: msg, results });
});

//────────────────────────────── EJECUTOR PS AGENT ──────────────────────────────
async function executeIntent(corr, intent, params) {
  const t0 = Date.now();
  try {
    switch (intent) {
      case "ad_create_user": return { ok: true, message: `✅ Usuario ${params.sam} creado`, data: await psAgent.adCreateUser(params) };
      case "ad_create_group": return { ok: true, message: `✅ Grupo ${params.name} creado`, data: await psAgent.adCreateGroup(params) };
      case "ad_add_to_group": return { ok: true, message: `✅ ${params.sam} agregado a ${params.group}`, data: await psAgent.adAddToGroup(params) };
      case "ad_unlock": return { ok: true, message: `✅ Usuario ${params.sam} desbloqueado`, data: await psAgent.adUnlock(params) };
      case "ad_disable_user": return { ok: true, message: `✅ Usuario ${params.sam} deshabilitado`, data: await psAgent.adDisableUser(params) };
      case "ad_enable_user": return { ok: true, message: `✅ Usuario ${params.sam} habilitado`, data: await psAgent.adEnableUser(params) };
      case "ad_delete_user": return { ok: true, message: `🗑️ Usuario ${params.sam} eliminado`, data: await psAgent.adDeleteUser(params) };
      case "ad_reset_password": return { ok: true, message: `🔑 Clave reseteada`, data: await psAgent.adResetPassword(params) };
      case "ad_info_user": return { ok: true, data: await psAgent.adInfoUser(params) };
      case "ad_list_users": return { ok: true, data: await psAgent.adListUsers(params) };
      case "ad_list_groups": return { ok: true, data: await psAgent.adListGroups(params) };
      case "ad_list_group_members": return { ok: true, data: await psAgent.adListGroupMembers(params) };
      default: return { ok: false, message: "Intent no implementado" };
    }
  } catch (err) {
    dbg(`[ERR] ${corr} ${intent}`, err.message);
    return { ok: false, message: `❌ Error ejecutando ${intent}: ${err.message}` };
  }
}

//────────────────────────────── START ──────────────────────────────
app.listen(PORT, () => console.log(`ChatOps listening on :${PORT}`));
