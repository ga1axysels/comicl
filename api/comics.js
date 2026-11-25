// GET    /api/comics?id=<id>                 one comic
// GET    /api/comics?kind=daily&date=<date>  that day's comics (newest first, 24 at a time, &cursor=…)
// GET    /api/comics?kind=free               freehand comics
// POST   /api/comics                         post a finished comic -> { id, token }
// PUT    /api/comics?id=<id>                 change title / name / border / layout (needs token)
// DELETE /api/comics?id=<id>                 remove your comic (needs token)
import {
  put, list, del, sha, clean, COLOR, DATE, newId, newToken,
  metaPath, readJsonBlob, readMeta, writeMeta, publicView, readBody,
} from './_store.js';

const MAX_PANEL = 700000; // characters of base64 per panel image (~500 KB)
const PAGE = 24;

export default async function handler(req, res) {
  try {
    const q = req.query || {};

    if (req.method === 'GET') {
      if (q.id) {
        const found = await readMeta(String(q.id));
        if (!found || !found.meta) return res.status(404).json({ error: 'not found' });
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(publicView(found.meta));
      }
      let prefix;
      if (q.kind === 'free') prefix = 'meta/free/';
      else if (DATE.test(q.date || '')) prefix = `meta/daily/${q.date}/`;
      else return res.status(400).json({ error: 'need kind=free or a date' });
      const out = await list({ prefix, limit: PAGE, cursor: q.cursor || undefined });
      const items = (await Promise.all(out.blobs.map(b => readJsonBlob(b.url).catch(() => null))))
        .filter(Boolean).map(publicView);
      res.setHeader('Cache-Control', 'no-store'); // removed comics disappear right away
      return res.status(200).json({ items, cursor: out.hasMore ? out.cursor : null });
    }

    if (req.method === 'POST') {
      const b = readBody(req);
      const free = !!b.free;
      const date = String(b.date || '');
      if (!DATE.test(date)) return res.status(400).json({ error: 'bad date' });
      const panels = Array.isArray(b.panels) ? b.panels : [];
      if (panels.length !== 4 || !panels.every(p => typeof p === 'string' && p.startsWith('data:image/jpeg;base64,') && p.length < MAX_PANEL)) {
        return res.status(400).json({ error: 'need four JPEG panels' });
      }
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
