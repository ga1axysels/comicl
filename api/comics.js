// GET    /api/comics?id=<id>                 one comic
// GET    /api/comics?kind=daily&date=<date>  that day's comics (newest first, 24 at a time, &cursor=…)
// GET    /api/comics?kind=free               freehand comics
// POST   /api/comics                         post a finished comic -> { id, token }
// PUT    /api/comics?id=<id>                 change title / name / border / layout (needs token)
// DELETE /api/comics?id=<id>                 remove your comic (needs token)
import {
  put, list, del, sha, clean, COLOR, DATE, newId, newToken,
  metaPath, readJsonBlob, readMeta, writeMeta, publicView, readBody,
  okDate, okId, okCursor, onlyParams, tooMany,
} from './_store.js';

const MAX_PANEL = 700000; // characters of base64 per panel image (~500 KB)
const PAGE = 24;

export default async function handler(req, res) {
  try {
    const q = req.query || {};

    const bad = msg => res.status(400).json({ error: msg });

    if (req.method === 'GET') {
      if (q.id !== undefined) {
        if (!onlyParams(q, ['id'])) return bad('unexpected settings');
        if (!okId(String(q.id))) return bad('not a comic id');
        if (tooMany(req, res, 'read', 40, 6e4)) return;
        const found = await readMeta(String(q.id));
        if (!found || !found.meta) {
          res.setHeader('Cache-Control', 's-maxage=60'); // asking again for the same missing comic is free
          return res.status(404).json({ error: 'not found' });
        }
        // Vercel's CDN keeps the answer for a minute, so a link opened by lots of people costs one storage lookup
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');
        return res.status(200).json(publicView(found.meta));
      }
      let prefix;
      if (q.cursor !== undefined && !okCursor(String(q.cursor))) return bad('bad page marker');
      if (q.kind === 'free' && onlyParams(q, ['kind', 'cursor'])) prefix = 'meta/free/';
      else if (q.kind === 'daily' && onlyParams(q, ['kind', 'date', 'cursor']) && okDate(String(q.date))) prefix = `meta/daily/${q.date}/`;
      else return bad('need kind=free, or kind=daily with a real date');
      if (tooMany(req, res, 'read', 40, 6e4)) return;
      const out = await list({ prefix, limit: PAGE, cursor: q.cursor || undefined });
      const items = (await Promise.all(out.blobs.map(b => readJsonBlob(b.url).catch(() => null))))
        .filter(Boolean).map(publicView);
      // cached on Vercel's CDN for 30s, so a busy gallery costs one storage lookup per 30s instead of one per visit.
      // Removed comics are also filtered out in the browser, so a cached list never shows them for long.
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
      return res.status(200).json({ items, cursor: out.hasMore ? out.cursor : null });
    }

    if (req.method === 'POST') {
      const b = readBody(req);
      const free = !!b.free;
      const date = String(b.date || '');
      if (!onlyParams(q, [])) return bad('unexpected settings');
      if (!okDate(date)) return bad('bad date');
      const panels = Array.isArray(b.panels) ? b.panels : [];
      if (panels.length !== 4 || !panels.every(p => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,') && p.length < MAX_PANEL)) {
        return res.status(400).json({ error: 'need four JPEG panels' });
      }
      if (tooMany(req, res, 'post', 6, 10 * 6e4)) return; // 6 comics per 10 minutes is plenty for one person
      const id = newId(free, date);
      const token = newToken();
      const urls = await Promise.all(panels.map((p, k) =>
        put(`img/${id}/${k + 1}.jpg`, Buffer.from(p.slice(p.indexOf(',') + 1), 'base64'), {
          access: 'public', contentType: 'image/jpeg', addRandomSuffix: false,
        }).then(r => r.url)));
      const meta = {
        id, free, date,
        n: free ? null : (Number.isInteger(b.n) ? b.n : null),
        promptTitle: clean(b.promptTitle, 60),
        title: clean(b.title, 40) || clean(b.promptTitle, 40) || 'Untitled',
        by: clean(b.by, 24),
        border: COLOR.test(b.border || '') ? b.border : '#ffffff',
        layout: b.layout === 'grid' ? 'grid' : 'vertical',
        panels: urls,
        created: Date.now(),
        tokenHash: sha(token),
      };
      await writeMeta(meta, false);
      return res.status(201).json({ id, token });
    }

    if (req.method === 'PUT' || req.method === 'DELETE') {
      const b = readBody(req);
      if (!onlyParams(q, ['id']) || !okId(String(q.id || ''))) return bad('not a comic id');
      if (typeof b.token !== 'string' || !/^[0-9a-f]{36}$/.test(b.token)) return res.status(403).json({ error: 'not your comic' });
      if (tooMany(req, res, 'edit', 60, 6e4)) return;
      const found = await readMeta(String(q.id || ''));
      if (!found || !found.meta) return res.status(404).json({ error: 'not found' });
      const meta = found.meta;
      if (!b.token || sha(b.token) !== meta.tokenHash) return res.status(403).json({ error: 'not your comic' });

      if (req.method === 'DELETE') {
        await del([found.blob.url, ...meta.panels]);
        return res.status(200).json({ ok: true });
      }
      if (b.title !== undefined) meta.title = clean(b.title, 40) || meta.promptTitle || 'Untitled';
      if (b.by !== undefined) meta.by = clean(b.by, 24);
      if (b.border !== undefined && COLOR.test(b.border)) meta.border = b.border;
      if (b.layout !== undefined) meta.layout = b.layout === 'grid' ? 'grid' : 'vertical';
      await writeMeta(meta, true);
      return res.status(200).json(publicView(meta));
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    const msg = String((e && e.message) || '');
    // say plainly when storage isn't hooked up, since that's the usual setup problem
    const hint = /token|BLOB_READ_WRITE/i.test(msg) ? 'storage is not connected to this project' : msg.slice(0, 160);
    return res.status(500).json({ error: 'server error: ' + hint });
  }
}
