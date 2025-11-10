import dotenv from 'dotenv';
dotenv.config();

const PS_BASE = process.env.PS_BASE || 'http://localhost:8080';
const API_KEY = process.env.PS_API_KEY || '';

async function doFetch(url, options = {}) {
  const headers = {
    'content-type': 'application/json',
    'x-api-key': API_KEY,
    ...(options.headers || {})
  };
  const resp = await fetch(url, { ...options, headers });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`PS Agent error ${resp.status}: ${text}`);
  }
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  return resp.text();
}

async function postJson(path, body) {
  return doFetch(`${PS_BASE}${path}`, {
    method: 'POST',
    body: JSON.stringify(body || {})
  });
}

async function getJson(path, query) {
  const qs = new URLSearchParams(query || {}).toString();
  const url = `${PS_BASE}${path}${qs ? `?${qs}` : ''}`;
  return doFetch(url, { method: 'GET' });
}


// ./lib/psAgent.js  (ESM)
import dotenv from 'dotenv';
dotenv.config();

// Config
const PS_API_KEY = process.env.PS_API_KEY || '1234';
const PS_TIMEOUT_MS = Number(process.env.PS_TIMEOUT_MS || 7000);

// Helper HTTP genérico
async function req(method, path, { query = null, body = null } = {}) {
  const url = new URL(PS_BASE + path);
  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    });
  }

  const headers = { 'x-api-key': PS_API_KEY };
  const init = { method, headers };

  if (body && method !== 'GET') {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), PS_TIMEOUT_MS);
  init.signal = controller.signal;

  let resp, txt;
  try {
    resp = await fetch(url, init);
    txt = await resp.text();
  } catch (e) {
    clearTimeout(t);
    throw new Error(`PS Agent network error: ${e?.message || e}`);
  } finally {
    clearTimeout(t);
  }

  let data;
  try { data = txt ? JSON.parse(txt) : {}; } catch { data = { ok: false, error: 'invalid json', raw: txt }; }

  if (!resp.ok || data?.ok === false) {
    const statusInfo = `${resp.status} ${resp.statusText}`.trim();
    const detail = data?.error || txt || '(no body)';
    throw new Error(`PS Agent error ${statusInfo}: ${detail}`);
  }

  return data;
}

// Wrapper API — AD
async function adCreateUser(body) { return req('POST', '/api/ad/create-user', { body }); }
async function adCreateGroup(body) { return req('POST', '/api/ad/create-group', { body }); }
async function adAddToGroup(body) { return req('POST', '/api/ad/add-to-group', { body }); }
async function adUnlock(body) { return req('POST', '/api/ad/unlock', { body }); }

async function adResetPassword(body) { return req('POST', '/api/ad/reset-password', { body }); }
async function adDisableUser(body) { return req('POST', '/api/ad/disable-user', { body }); }
async function adEnableUser(body) { return req('POST', '/api/ad/enable-user', { body }); }
async function adDeleteUser(body) { return req('POST', '/api/ad/delete-user', { body }); }

// GET con querystring
async function adInfoUser(q) { return req('GET', '/api/ad/info-user', { query: q }); }
async function adListUsers(q) { return req('GET', '/api/ad/list-users', { query: q }); }
async function adListGroups(q) { return req('GET', '/api/ad/list-groups', { query: q }); }
async function adListGroupMembers(q) { return req('GET', '/api/ad/list-group-members', { query: q }); }

// DNS
async function dnsAddA(body) { return req('POST', '/api/dns/add-a', { body }); }
async function dnsDelA(body) { return req('POST', '/api/dns/del-a', { body }); }

// IIS
async function iisPoolStatus(q) { return req('GET', '/api/iis/pool/status', { query: q }); }
async function iisPoolRecycle(body) { return req('POST', '/api/iis/pool/recycle', { body }); }

export const psAgent = {
  // AD
  adCreateUser,
  adCreateGroup,
  adAddToGroup,
  adUnlock,
  adResetPassword,
  adDisableUser,
  adEnableUser,
  adDeleteUser,
  adInfoUser,
  adListUsers,
  adListGroups,
  adListGroupMembers,
  // DNS
  dnsAddA,
  dnsDelA,
  // IIS
  iisPoolStatus,
  iisPoolRecycle,
};


