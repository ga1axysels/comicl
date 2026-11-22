// POST /api/report  { id }
// Hides a comic from the gallery right away. The comic is moved into the hidden/ folder of
// your Blob store (not deleted), so you can look at it in the Vercel dashboard and move it back.
import { put, del, readMeta, readBody, metaPath } from './_store.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
    const { id } = readBody(req);
    const found = await readMeta(String(id || ''));
    if (!found || !found.meta) return res.status(404).json({ error: 'not found' });
    await put('hidden/' + metaPath(found.meta.id), JSON.stringify({ ...found.meta, reported: Date.now() }), {
      access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true,
    });
    await del(found.blob.url);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server error' });
  }
}
