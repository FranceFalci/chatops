import dotenv from 'dotenv';
dotenv.config();

const serversWhitelist = [ 'DC01', 'WEB01', 'FILE01' ];
const poolsAllowed = [ 'IntranetPool' ];
const groupsAllowed = [ 'GG_Ventas', 'GG_Marketing' ];
const groupSafePrefix = 'GG_';

const OU_BASE_SUFFIX = 'DC=empresa,DC=local';

const ROLE = {
  Admin: 'Admin',
  HelpDesk: 'HelpDesk'
};

const PERMISSIONS = {
  [ROLE.Admin]: [
    'ad_create_user','ad_create_group','ad_add_to_group','ad_unlock',
    'dns_add_a','dns_del_a','iis_pool_status','iis_pool_recycle'
  ],
  [ROLE.HelpDesk]: [
    'ad_add_to_group','ad_unlock','dns_add_a','dns_del_a','iis_pool_status'
  ]
};

const SENSITIVE = new Set(['iis_pool_recycle', 'dns_del_a']);

export function requiresApproval(intent) {
  return SENSITIVE.has(intent);
}

export function isAllowedIntent(role, intent) {
  const allowed = PERMISSIONS[role] || [];
  return allowed.includes(intent);
}

export function getUserRole(userId) {
  const admins = String(process.env.ADMINS || 'admin')
    .split(',').map(s => s.trim()).filter(Boolean);
  const helpdesk = String(process.env.HELPDESK || 'helpdesk')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (admins.includes(userId)) return ROLE.Admin;
  if (helpdesk.includes(userId)) return ROLE.HelpDesk;
  // default to HelpDesk
  return ROLE.HelpDesk;
}

export function validateParams(intent, params) {
  const samRe = /^[a-z]+\.[a-z]+$/;
  const ipv4Re = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

  switch (intent) {
    case 'ad_create_user': {
      if (!params.givenName || !params.surname) return 'Faltan nombre o apellido';
      if (!params.sam || !samRe.test(params.sam)) return 'sam inválido (formato a-z.a-z)';
      if (params.ou && !isValidOU(params.ou)) return 'OU inválida';
      return null;
    }
    case 'ad_create_group': {
      if (!params.name) return 'Falta nombre de grupo';
      if (params.ou && !isValidOU(params.ou)) return 'OU inválida';
      return null;
    }
    case 'ad_add_to_group': {
      if (!params.sam || !samRe.test(params.sam)) return 'sam inválido (formato a-z.a-z)';
      if (!params.group) return 'Falta grupo';
      return null;
    }
    case 'ad_unlock': {
      if (!params.sam || !samRe.test(params.sam)) return 'sam inválido (formato a-z.a-z)';
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
    default:
      return 'Intent inválido';
  }
}

function isValidOU(ou) {
  if (!ou) return false;
  const s = String(ou);
  return s.startsWith('OU=') && s.endsWith(OU_BASE_SUFFIX);
}

export function enforceWhitelists(intent, params) {
  if ((intent === 'iis_pool_status' || intent === 'iis_pool_recycle')) {
    if (!serversWhitelist.includes(params.server)) {
      return `Servidor no permitido: ${params.server}`;
    }
    if (!poolsAllowed.includes(params.pool)) {
      return `App pool no permitido: ${params.pool}`;
    }
  }
  if (intent === 'ad_add_to_group' || intent === 'ad_create_group') {
    const g = params.group || params.name;
    if (g && !(g.startsWith(groupSafePrefix) || groupsAllowed.includes(g))) {
      return `Grupo no permitido: ${g}`;
    }
  }
  if (intent === 'ad_create_user' || intent === 'ad_create_group') {
    if (params.ou && !isValidOU(params.ou)) {
      return `OU no permitida: ${params.ou}`;
    }
  }
  return null;
}

