import { Router } from 'express';
import { randomUUID } from 'crypto';
import { PKS, REL, DEFAULTS } from './relationships.js';

// ── helpers ────────────────────────────────────────────────────────────────

// Split a comma list at top level, respecting nested parentheses.
function splitTop(str) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(') { depth++; cur += ch; }
    else if (ch === ')') { depth--; cur += ch; }
    else if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

// Parse a PostgREST `select` string into columns + embeds.
// e.g. "*,alias:table!fk(inner),plaincol" or "code,name"
function parseSelect(sel) {
  const columns = [];
  const embeds = [];
  for (let part of splitTop(sel)) {
    part = part.trim();
    if (!part) continue;
    const paren = part.indexOf('(');
    if (paren === -1) { columns.push(part); continue; }
    const inner = part.slice(paren + 1, part.lastIndexOf(')'));
    let head = part.slice(0, paren);          // [alias:]table[!fkhint]
    let alias = null, table = head;
    if (head.includes(':')) { const i = head.indexOf(':'); alias = head.slice(0, i); table = head.slice(i + 1); }
    if (table.includes('!')) table = table.split('!')[0];
    table = table.trim();
    embeds.push({ alias: (alias || table).trim(), table, select: inner });
  }
  return { columns, embeds };
}

function coerce(s) {
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  return s;
}

// Turn leftover query params into a Mongo filter.
// Supports: col=eq.val, col=neq.val, col=in.(a,b,c)
function buildFilter(query) {
  const f = {};
  for (const [k, raw] of Object.entries(query)) {
    const v = Array.isArray(raw) ? raw[0] : raw;
    const dot = v.indexOf('.');
    if (dot === -1) { f[k] = coerce(v); continue; }
    const op = v.slice(0, dot);
    const rhs = v.slice(dot + 1);
    if (op === 'eq') f[k] = coerce(rhs);
    else if (op === 'neq') f[k] = { $ne: coerce(rhs) };
    else if (op === 'in') {
      const list = rhs.replace(/^\(/, '').replace(/\)$/, '').split(',').map(s => coerce(s.trim())).filter(s => s !== '');
      f[k] = { $in: list };
    } else f[k] = coerce(v);
  }
  return f;
}

export function createRestRouter(db) {
  const router = Router();

  // Shape one document per the requested columns + resolve its embeds.
  async function project(doc, columns, embeds, base) {
    const hasStar = columns.length === 0 || columns.includes('*');
    let out;
    if (hasStar) out = { ...doc };
    else { out = {}; for (const c of columns) out[c.trim()] = doc[c.trim()]; }
    delete out._id;
    for (const emb of embeds) out[emb.alias] = await resolveEmbed(doc, emb, base);
    return out;
  }

  async function resolveEmbed(parentDoc, emb, base) {
    const rel = REL[`${base}.${emb.table}`];
    if (!rel) return emb.many ? [] : null;      // unknown relationship
    const val = parentDoc[rel.local];
    const inner = parseSelect(emb.select);
    if (rel.many) {
      if (val == null) return [];
      const docs = await db.collection(emb.table).find({ [rel.foreign]: val }).toArray();
      return Promise.all(docs.map(d => project(d, inner.columns, inner.embeds, emb.table)));
    }
    if (val == null) return null;
    const d = await db.collection(emb.table).findOne({ [rel.foreign]: val });
    if (!d) return null;
    return project(d, inner.columns, inner.embeds, emb.table);
  }

  function applyDefaults(table, doc) {
    const d = DEFAULTS[table];
    if (!d) return;
    const now = new Date().toISOString();
    for (const [k, kind] of Object.entries(d)) {
      if (doc[k] === undefined || doc[k] === null) {
        doc[k] = kind === 'ts' ? now : coerce(kind);
      }
    }
  }

  // ── GET /rest/v1/:table ──────────────────────────────────────────────────
  router.get('/:table', async (req, res) => {
    try {
      const { table } = req.params;
      const q = { ...req.query };
      const selectStr = q.select; delete q.select;
      const orderStr = q.order; delete q.order;
      const limitVal = q.limit; delete q.limit;
      delete q.offset;

      let cursor = db.collection(table).find(buildFilter(q));
      if (orderStr) {
        const [col, dir] = String(orderStr).split('.');
        cursor = cursor.sort({ [col]: dir === 'desc' ? -1 : 1 });
      }
      if (limitVal) cursor = cursor.limit(parseInt(limitVal, 10));

      const docs = await cursor.toArray();
      const { columns, embeds } = selectStr ? parseSelect(String(selectStr)) : { columns: ['*'], embeds: [] };
      const out = await Promise.all(docs.map(d => project(d, columns, embeds, table)));
      res.json(out);
    } catch (e) {
      console.error('GET error', e);
      res.status(400).json({ error: 'query_error', message: String(e?.message || e) });
    }
  });

  // ── POST /rest/v1/:table ─────────────────────────────────────────────────
  router.post('/:table', async (req, res) => {
    try {
      const { table } = req.params;
      const arr = Array.isArray(req.body) ? req.body : [req.body];
      const pk = PKS[table];
      for (const doc of arr) {
        if (pk && (doc[pk] === undefined || doc[pk] === null)) doc[pk] = randomUUID();
        applyDefaults(table, doc);
      }
      if (arr.length) await db.collection(table).insertMany(arr);
      const out = arr.map(d => { const c = { ...d }; delete c._id; return c; });
      res.status(201).json(out);
    } catch (e) {
      console.error('POST error', e);
      res.status(400).json({ error: 'insert_error', message: String(e?.message || e) });
    }
  });

  // ── PATCH /rest/v1/:table?filter ─────────────────────────────────────────
  const patchHandler = async (req, res) => {
    try {
      const { table } = req.params;
      const q = { ...req.query }; delete q.select;
      const filter = buildFilter(q);
      const update = { ...req.body };
      delete update._id;
      if (Object.keys(update).length) await db.collection(table).updateMany(filter, { $set: update });
      const docs = await db.collection(table).find(filter).toArray();
      res.json(docs.map(d => { delete d._id; return d; }));
    } catch (e) {
      console.error('PATCH error', e);
      res.status(400).json({ error: 'update_error', message: String(e?.message || e) });
    }
  };
  router.patch('/:table', patchHandler);
  router.put('/:table', patchHandler);

  // ── DELETE /rest/v1/:table?filter ────────────────────────────────────────
  router.delete('/:table', async (req, res) => {
    try {
      const { table } = req.params;
      const q = { ...req.query }; delete q.select;
      await db.collection(table).deleteMany(buildFilter(q));
      res.status(204).end();
    } catch (e) {
      console.error('DELETE error', e);
      res.status(400).json({ error: 'delete_error', message: String(e?.message || e) });
    }
  });

  return router;
}
