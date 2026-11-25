// Shared helpers for the comic API. Comics are stored in Vercel Blob:
//   img/<id>/1.jpg … 4.jpg                 the four panels
//   meta/daily/<YYYY-MM-DD>/<id>.json      a comic for that day's prompt
//   meta/free/<id>.json                    a freehand comic
//   hidden/…                               comics hidden by a report (restore by moving them back)
// Ids start with a reversed timestamp, so listing a folder returns the newest comics first.
import { put, list, del } from '@vercel/blob';
import { randomBytes, createHash } from 'node:crypto';

export { put, list, del };

export const sha = s => createHash('sha256').update(String(s)).digest('hex');
export const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
export const COLOR = /^#[0-9a-f]{6}$/i;
export const DATE = /^\d{4}-\d{2}-\d{2}$/;

/* ---------- guards: turn away junk before it costs a storage operation ---------- */
const FIRST_DAY = '2026-11-01'; // nothing can be older than the site
const dayStr = t => new Date(t).toISOString().slice(0, 10);
// A real day between launch and tomorrow (people ahead of UTC are already on tomorrow).
export function okDate(d) {
  if (!DATE.test(d || '') || d < FIRST_DAY || d > dayStr(Date.now() + 864e5)) return false;
  return dayStr(d + 'T00:00:00Z') === d; // rejects things like 2026-02-31
}
// Exactly the shape newId() makes, with a timestamp that has already happened.
export function okId(id) {
  const m = /^(?:d(\d{4})(\d{2})(\d{2})|f)-([0-9a-z]{9})[0-9a-f]{8}$/.exec(id || '');
  if (!m) return false;
  if (m[1] && !okDate(`${m[1]}-${m[2]}-${m[3]}`)) return false;
  const t = 9e12 - parseInt(m[4], 36);
  return t > Date.parse(FIRST_DAY) && t < Date.now() + 6e4;
}
export const okCursor = c => /^[A-Za-z0-9+/=_.-]{1,400}$/.test(c || '');
// Only these query settings are allowed, so junk can't be used to dodge the CDN cache.
export const onlyParams = (q, allowed) => Object.keys(q).every(k => allowed.includes(k));

// Simple per-person speed limit. It lives in the server's memory, so it resets when Vercel
// starts a fresh copy, but it stops a script hammering one copy. Vercel's Firewall can add a hard limit.
const hits = new Map();
export function tooMany(req, res, bucket, max, windowMs) {
  const h = req.headers || {};
  const ip = String(h['x-real-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const key = bucket + '|' + ip, now = Date.now();
  let e = hits.get(key);
  if (!e || now - e.start > windowMs) { e = { start: now, n: 0 }; hits.set(key, e); }
  e.n++;
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
  if (e.n <= max) return false;
  res.setHeader('Retry-After', String(Math.ceil((e.start + windowMs - now) / 1000)));
  res.status(429).json({ error: 'too many tries, wait a minute and try again' });
  return true;
}

export function newId(free, date) {
  const inv = (9e12 - Date.now()).toString(36).padStart(9, '0');
  const rand = randomBytes(4).toString('hex');
  return free ? `f-${inv}${rand}` : `d${date.replace(/-/g, '')}-${inv}${rand}`;
}
export const newToken = () => randomBytes(18).toString('hex');

export function metaPath(id) {
  const m = /^d(\d{4})(\d{2})(\d{2})-[a-z0-9]+$/.exec(id || '');
  if (m) return `meta/daily/${m[1]}-${m[2]}-${m[3]}/${id}.json`;
  if (/^f-[a-z0-9]+$/.test(id || '')) return `meta/free/${id}.json`;
  return null;
}

export async function readJsonBlob(url) {
  const r = await fetch(url, { cache: 'no-store' });
  return r.ok ? r.json() : null;
}

export async function readMeta(id) {
  const p = metaPath(id);
  if (!p) return null;
  const { blobs } = await list({ prefix: p, limit: 1 });
  const b = blobs.find(x => x.pathname === p);
  return b ? { meta: await readJsonBlob(b.url), blob: b } : null;
}

export async function writeMeta(meta, overwrite) {
  await put(metaPath(meta.id), JSON.stringify(meta), {
    access: 'public', contentType: 'application/json',
    addRandomSuffix: false, allowOverwrite: !!overwrite, cacheControlMaxAge: 60,
  });
}

// Never send the edit-token hash to browsers.
export const publicView = m => { const { tokenHash, ...rest } = m; return rest; };

export function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}
