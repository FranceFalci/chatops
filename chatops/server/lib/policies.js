// ./lib/policies.js
import dotenv from 'dotenv';
dotenv.config();

/* ============================
   0) Config (con defaults)
============================ */
const serversWhitelist = (
  process.env.SERVERS_WHITELIST?.split(',').map(s => s.trim()) ||
  ['franserver', 'DC01', 'WEB01', 'FILE01']
);
const poolsAllowed = (
  process.env.POOLS_ALLOWED?.split(',').map(s => s.trim()) ||
  ['IntranetPool']
);
const groupsAllowed = (
  process.env.GROUPS_ALLOWED?.split(',').map(s => s.trim()) ||
  ['GG_Ventas', 'GG_Marketing']
);
const groupSafePrefix = process.env.GROUP_SAFE_PREFIX || 'GG_';

const OU_BASE_SUFFIX = process.env.OU_BASE_SUFFIX || 'DC=empresa,DC=com';

const ROLE = {
  Admin: 'Admin',
  HelpDesk: 'HelpDesk'
};

// Permisos por rol (defaults = los tuyos). Se pueden extender/override por .env.
// Si necesitás *todo* permitido, poné ROLE_ADMIN_ALLOW=* en .env.
const PERMISSIONS = {
  [ROLE.Admin]: (() => {
    const base = [
      'ad_create_user', 'ad_create_group', 'ad_add_to_group', 'ad_unlock',
      'dns_add_a', 'dns_del_a', 'iis_pool_status', 'iis_pool_recycle',
      // añadimos safe por si tu parser los emite:
      'ad_reset_password', 'ad_disable_user', 'ad_enable_user', 'ad_delete_user', 'ad_info_user',
      'ad_list_groups', 'ad_list_users', 'ad_list_group_members', 'ad_help'
    ];
    const envCsv = process.env.ROLE_ADMIN_ALLOW?.trim();
    if (!envCsv) return base;
    if (envCsv === '*') return ['*'];
    return envCsv.split(',').map(s => s.trim()).filter(Boolean);
  })(),
  [ROLE.HelpDesk]: (() => {
    const base = [
      'ad_add_to_group', 'ad_unlock', 'dns_add_a', 'dns_del_a', 'iis_pool_status',
      'ad_help', 'ad_reset_password', 'ad_info_user', 'ad_list_groups', 'ad_list_users', 'ad_list_group_members'
    ];
    const envCsv = process.env.ROLE_HELPDESK_ALLOW?.trim();
    if (!envCsv) return base;
    return envCsv.split(',').map(s => s.trim()).filter(Boolean);
  })()
};

// Operaciones sensibles (override opcional por .env)
const SENSITIVE = new Set(
  (process.env.SENSITIVE_INTENTS
    ? process.env.SENSITIVE_INTENTS.split(',').map(s => s.trim())
    : ['iis_pool_recycle', 'dns_del_a'])
);

/* ============================
   1) API pública
============================ */
export function requiresApproval(intent) {
  // acepta compuestos a|b
  const intents = String(intent || '').split('|').map(s => s.trim()).filter(Boolean);
  if (!intents.length) return false;
  return intents.some(it => SENSITIVE.has(it));
}

export function isAllowedIntent(role, intent) {
  const allow = PERMISSIONS[role] || [];
  // wildcard para Admin si ROLE_ADMIN_ALLOW=*
  if (allow.includes('*')) return true;

  // soporta compuestos "a|b|c": TODOS deben estar permitidos
  const intents = String(intent || '').split('|').map(s => s.trim()).filter(Boolean);
  if (!intents.length) return false;
  return intents.every(it => allow.includes(it));
}

export function getUserRole(userId) {
  const uid = String(userId || '').trim().toLowerCase();

  // Admins de .env (normalizados a lowercase)
  const adminsEnv = String(process.env.ADMINS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  // HelpDesk de .env (normalizados a lowercase)
  const helpdeskEnv = String(process.env.HELPDESK || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  // Alias comunes del built-in Administrator
  const adminAliases = [
    'administrator',
    'empresa\\administrator',
    'administrator@empresa.com'
  ].map(s => s.toLowerCase());

  const admins = new Set([...adminsEnv, ...adminAliases]);
  const helpdesk = new Set(helpdeskEnv);

  if (admins.has(uid)) return ROLE.Admin;
  if (helpdesk.has(uid)) return ROLE.HelpDesk;

  // Rol por defecto controlado por .env (HelpDesk por compatibilidad)
  const def = (process.env.DEFAULT_ROLE || 'HelpDesk').toLowerCase();
  return def === 'admin' ? ROLE.Admin : ROLE.HelpDesk;
}

export function validateParams(intent, params) {
  // alineado con tu parser (permite ., _, - y números)
  const samRe = /^[a-z0-9._-]+$/;
  const ipv4Re = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

  switch (intent) {
    case 'ad_create_user': {
      if (!params.givenName || !params.surname) return 'Faltan nombre o apellido';
      if (!params.sam || !samRe.test(params.sam)) return 'sam inválido (usa a-z 0-9 . _ -)';
      if (params.ou && !isValidOU(params.ou)) return 'OU inválida';
      return null;
    }
    case 'ad_create_group': {
      if (!params.name) return 'Falta nombre de grupo';
      if (params.ou && !isValidOU(params.ou)) return 'OU inválida';
      // prefijo/allowlist se refuerza en enforceWhitelists
      return null;
    }
    case 'ad_add_to_group': {
      if (!params.sam || !samRe.test(params.sam)) return 'sam inválido (usa a-z 0-9 . _ -)';
      if (!params.group) return 'Falta grupo';
      return null;
    }
    case 'ad_reset_password':
    case 'ad_unlock':
    case 'ad_disable_user':
    case 'ad_enable_user':
    case 'ad_delete_user':
    case 'ad_info_user': {
      if (!params.sam || !samRe.test(params.sam)) return 'sam inválido (usa a-z 0-9 . _ -)';
      return null;
    }
    case 'ad_list_users':
    case 'ad_list_groups':
    case 'ad_list_group_members': {
      // filtros libres (se validan en PowerShell/AD)
      return null;
    }
    case 'dns_add_a':
    case 'dns_del_a': {
      if (!params.name) return 'Falta nombre DNS';
      if (!params.ip || !ipv4Re.test(params.ip)) return 'IP inválida';
      return null;
    }
    case 'iis_pool_status':
    case 'iis_pool_recycle': {
      if (!params.server) return 'Falta servidor';
      if (!params.pool) return 'Falta app pool';
      return null;
    }
    case 'ad_help': {
      return null;
    }
    default:
      return 'Intent inválido';
  }
}

export function enforceWhitelists(intent, params) {
  // IIS: servidores/pools case-insensitive
  if (intent === 'iis_pool_status' || intent === 'iis_pool_recycle') {
    const serverOk = params.server && serversWhitelist.map(s => s.toLowerCase()).includes(String(params.server).toLowerCase());
    if (!serverOk) return `Servidor no permitido: ${params.server}`;

    const poolOk = params.pool && poolsAllowed.map(s => s.toLowerCase()).includes(String(params.pool).toLowerCase());
    if (!poolOk) return `App pool no permitido: ${params.pool}`;
  }

  // Grupos: permitir si está en allowlist o comienza con prefijo seguro
  if (intent === 'ad_add_to_group' || intent === 'ad_create_group' || intent === 'ad_list_group_members') {
    const g = params.group || params.name;
    if (g) {
      const inAllow = groupsAllowed.includes(g);
      const byPrefix = String(g).startsWith(groupSafePrefix);
      if (!(inAllow || byPrefix)) {
        return `Grupo no permitido: ${g}`;
      }
    }
  }

  // OU válida/permitida en creaciones
  if (intent === 'ad_create_user' || intent === 'ad_create_group') {
    if (params.ou && !isValidOU(params.ou)) {
      return `OU no permitida: ${params.ou}`;
    }
  }

  return null;
}

/* ============================
   helpers privados
============================ */
function isValidOU(ou) {
  if (!ou) return false;
  const s = String(ou);
  return s.startsWith('OU=') && s.endsWith(OU_BASE_SUFFIX);
}
