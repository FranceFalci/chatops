// rbac.js (o en tu index.js antes de usarlo)

// 1) Normalización de rol (Admin / Helpdesk / User)
function normalizeRole(rawUserIdOrRole = '') {
  const s = String(rawUserIdOrRole || '').trim();

  // .env con alias típicos
  // ADMINS=Administrator,administrator,EMPRESA\Administrator,admin,administrator@empresa.com
  const ADMINS = String(process.env.ADMINS || 'Administrator,admin').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
  const HELPDESK = String(process.env.HELPDESK || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);

  const key = s.toLowerCase();

  if (ADMINS.includes(key)) return 'Admin';
  if (HELPDESK.includes(key)) return 'Helpdesk';

  // si ya te vino un rol canónico, respétalo
  if (/^admin$/i.test(s)) return 'Admin';
  if (/^helpdesk$/i.test(s)) return 'Helpdesk';

  return 'User';
}

// 2) ACL por rol (incluye ad_help)
const ACL = {
  Admin: new Set([
    'ad_help',
    'ad_create_user', 'ad_add_to_group', 'ad_reset_password', 'ad_unlock',
    'ad_disable_user', 'ad_enable_user', 'ad_delete_user', 'ad_info_user',
    'ad_create_group', 'ad_list_groups', 'ad_list_users', 'ad_list_group_members',
    // si también manejás estos:
    'dns_add_a', 'dns_del_a', 'iis_pool_status', 'iis_pool_recycle'
  ]),
  Helpdesk: new Set([
    'ad_help',
    'ad_add_to_group', 'ad_reset_password', 'ad_unlock', 'ad_info_user',
    'ad_list_groups', 'ad_list_users', 'ad_list_group_members',
    // (sin crear/eliminar usuarios/grupos)
  ]),
  User: new Set([
    'ad_help' // leen ayuda pero no ejecutan nada crítico
  ])
};

// 3) Chequeo por-intent, soporta compuestos con "|"
function rbacAllows(userRoleRaw, intentStr) {
  const role = normalizeRole(userRoleRaw);
  const allowed = ACL[role] || ACL.User;

  // dividir compuestos y chequear TODOS
  const intents = String(intentStr || '').split('|').map(s => s.trim()).filter(Boolean);
  if (intents.length === 0) return false;

  for (const it of intents) {
    if (!allowed.has(it)) {
      // Log útil para demo/troubleshooting
      console.log(`RBAC check: role=${role} intent=${it} => DENY`);
      return false;
    }
    console.log(`RBAC check: role=${role} intent=${it} => ALLOW`);
  }
  return true;
}

export { normalizeRole, rbacAllows };
