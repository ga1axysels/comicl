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
