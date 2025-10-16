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

export const psAgent = {
  adCreateUser: (body) => postJson('/api/ad/create-user', body),
  adCreateGroup: (body) => postJson('/api/ad/create-group', body),
  adAddToGroup: (body) => postJson('/api/ad/add-to-group', body),
  adUnlock: (body) => postJson('/api/ad/unlock', body),
  dnsAddA: (body) => postJson('/api/dns/add-a', body),
  dnsDelA: (body) => postJson('/api/dns/del-a', body),
  iisPoolStatus: (query) => getJson('/api/iis/pool/status', query),
  iisPoolRecycle: (body) => postJson('/api/iis/pool/recycle', body)
};

