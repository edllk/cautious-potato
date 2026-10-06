// Block Lending: a tiny lending app for up to ten neighbours.
// No dependencies: Node's http + built-in SQLite. See PLAN.md.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const KINDS = require('./public/kinds.js');

const PORT = process.env.PORT || 3003;
const JOIN_CODE = process.env.JOIN_CODE || 'block123';
const MAX_MEMBERS = 10;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- database ----------
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
const db = new DatabaseSync(path.join(__dirname, 'data', 'lending.db'));
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    unit TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'other',
    title TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'available'
      CHECK (status IN ('available', 'requested', 'lent')),
    borrower_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
// Databases made before item kinds existed: add the column (old items become "Others").
if (!db.prepare('PRAGMA table_info(items)').all().some(col => col.name === 'kind')) {
  db.exec("ALTER TABLE items ADD COLUMN kind TEXT NOT NULL DEFAULT 'other'");
}
// An "Others" item named exactly like a listed kind (e.g. an old "Ladder") gets that kind's icon.
for (const kind of KINDS) {
  db.prepare("UPDATE items SET kind = ? WHERE kind = 'other' AND title = ? COLLATE NOCASE").run(kind.id, kind.label);
}

// ---------- auth helpers ----------
const SESSION_DAYS = 30;
const failedLogins = new Map(); // lowercased name -> { count, until }

function hashPin(pin, salt) {
  return crypto.scryptSync(pin, salt, 32).toString('hex');
}

function pinMatches(pin, user) {
  const a = Buffer.from(hashPin(pin, user.salt), 'hex');
  const b = Buffer.from(user.pin_hash, 'hex');
  return crypto.timingSafeEqual(a, b);
}

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  res.setHeader('Set-Cookie',
    `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`);
}

function currentUser(req) {
  const match = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  if (!match) return null;
  return db.prepare(`
    SELECT u.id, u.name, u.unit FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.created_at > datetime('now', ?)
  `).get(match[1], `-${SESSION_DAYS} days`) || null;
}

// ---------- http helpers ----------
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json/.test(req.headers['content-type'] || '')) {
      return reject(Object.assign(new Error('Expected JSON'), { status: 415 }));
    }
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 10_000) req.destroy();
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(Object.assign(new Error('Bad JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

function serveStatic(req, res) {
  const urlPath = req.url.split('?')[0];
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, { error: 'Not found' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': (MIME[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(data);
  });
}

// ---------- items ----------
const ITEM_SELECT = `
  SELECT i.id, i.kind, i.title, i.note, i.status, i.updated_at,
         i.owner_id, o.name AS owner_name, o.unit AS owner_unit,
         i.borrower_id, b.name AS borrower_name, b.unit AS borrower_unit
  FROM items i
  JOIN users o ON o.id = i.owner_id
  LEFT JOIN users b ON b.id = i.borrower_id`;

function getItem(id) {
  return db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).get(id);
}

function setStatus(id, status, borrowerId) {
  db.prepare(`UPDATE items SET status = ?, borrower_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(status, borrowerId, id);
}

// The one rule: everyone sees everything; only the owner changes their item,
// and only the requester can cancel their own request.
function applyAction(item, user, body) {
  const isOwner = item.owner_id === user.id;
  const isBorrower = item.borrower_id === user.id;
  switch (body.action) {
    case 'request':
      if (isOwner) return [403, 'You own this item'];
      if (item.status !== 'available') return [409, 'Not available right now'];
      setStatus(item.id, 'requested', user.id);
      return null;
    case 'cancel':
      if (!isBorrower || item.status !== 'requested') return [403, 'Only the requester can cancel'];
      setStatus(item.id, 'available', null);
      return null;
    case 'lend':
      if (!isOwner) return [403, 'Only the owner can lend this'];
      if (item.status !== 'requested') return [409, 'No pending request'];
      setStatus(item.id, 'lent', item.borrower_id);
      return null;
    case 'decline':
      if (!isOwner) return [403, 'Only the owner can decline'];
      if (item.status !== 'requested') return [409, 'No pending request'];
      setStatus(item.id, 'available', null);
      return null;
    case 'returned':
      if (!isOwner) return [403, 'Only the owner can mark it returned'];
      if (item.status !== 'lent') return [409, 'Item is not lent out'];
      setStatus(item.id, 'available', null);
      return null;
    case 'edit': {
      if (!isOwner) return [403, 'Only the owner can edit this'];
      const title = clean(body.title, 80);
      if (!title) return [400, 'Title is required'];
      db.prepare(`UPDATE items SET title = ?, note = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(title, clean(body.note, 300), item.id);
      return null;
    }
    default:
      return [400, 'Unknown action'];
  }
}

// ---------- routes ----------
async function handleApi(req, res) {
  const url = req.url.split('?')[0];
  const { method } = req;

  if (method === 'POST' && url === '/api/join') {
    const body = await readJson(req);
    const name = clean(body.name, 30);
    const unit = clean(body.unit, 12);
    const pin = String(body.pin ?? '');
    if (String(body.code ?? '') !== JOIN_CODE) return send(res, 403, { error: 'Wrong join code' });
    if (!name || !unit) return send(res, 400, { error: 'Name and unit are required' });
    if (!/^\d{4}$/.test(pin)) return send(res, 400, { error: 'PIN must be 4 digits' });
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
    if (n >= MAX_MEMBERS) return send(res, 403, { error: `The block is full (${MAX_MEMBERS} members)` });
    if (db.prepare('SELECT 1 FROM users WHERE name = ?').get(name)) {
      return send(res, 409, { error: 'That name is taken. Try adding an initial.' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const { lastInsertRowid } = db.prepare('INSERT INTO users (name, unit, pin_hash, salt) VALUES (?, ?, ?, ?)')
      .run(name, unit, hashPin(pin, salt), salt);
    startSession(res, Number(lastInsertRowid));
    return send(res, 201, { id: Number(lastInsertRowid), name, unit });
  }

  if (method === 'POST' && url === '/api/login') {
    const body = await readJson(req);
    const name = clean(body.name, 30);
    const key = name.toLowerCase();
    const lock = failedLogins.get(key);
    if (lock && lock.until > Date.now()) {
      return send(res, 429, { error: 'Too many wrong PINs. Try again in a few minutes.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
    if (!user || !pinMatches(String(body.pin ?? ''), user)) {
      // 5 wrong PINs in a row locks that name for 5 minutes
      const count = (lock?.count || 0) + 1;
      failedLogins.set(key, count >= 5
        ? { count: 0, until: Date.now() + 5 * 60_000 }
        : { count, until: 0 });
      return send(res, 401, { error: 'Name or PIN is wrong' });
    }
    failedLogins.delete(key);
    startSession(res, user.id);
    return send(res, 200, { id: user.id, name: user.name, unit: user.unit });
  }

  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'Please log in' });

  if (method === 'POST' && url === '/api/logout') {
    const token = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '')[1];
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return send(res, 200, { ok: true });
  }

  if (method === 'GET' && url === '/api/me') {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
    return send(res, 200, { ...user, members: n, maxMembers: MAX_MEMBERS });
  }

  if (method === 'GET' && url === '/api/items') {
    return send(res, 200, db.prepare(`${ITEM_SELECT} ORDER BY i.updated_at DESC, i.id DESC`).all());
  }

  if (method === 'POST' && url === '/api/items') {
    const body = await readJson(req);
    const picked = KINDS.find(k => k.id === body.kind);
    if (!picked) return send(res, 400, { error: 'Pick what you are lending' });
    // "Others" typed as a listed name ("ladder") counts as that kind.
    const kind = picked.id === 'other'
      && KINDS.find(k => k.label.toLowerCase() === clean(body.title, 80).toLowerCase()) || picked;
    // Picked from the list: the label is the title. "Others": the neighbour types it.
    const title = kind.id === 'other' ? clean(body.title, 80) : kind.label;
    if (!title) return send(res, 400, { error: 'Say what the item is' });
    const { lastInsertRowid } = db.prepare('INSERT INTO items (owner_id, kind, title, note) VALUES (?, ?, ?, ?)')
      .run(user.id, kind.id, title, clean(body.note, 300));
    return send(res, 201, getItem(lastInsertRowid));
  }

  const itemMatch = /^\/api\/items\/(\d+)$/.exec(url);
  if (itemMatch) {
    const item = getItem(Number(itemMatch[1]));
    if (!item) return send(res, 404, { error: 'Item not found' });

    if (method === 'PATCH') {
      const failure = applyAction(item, user, await readJson(req));
      if (failure) return send(res, failure[0], { error: failure[1] });
      return send(res, 200, getItem(item.id));
    }
    if (method === 'DELETE') {
      if (item.owner_id !== user.id) return send(res, 403, { error: 'Only the owner can delete this' });
      if (item.status === 'lent') return send(res, 409, { error: 'Mark it returned first' });
      db.prepare('DELETE FROM items WHERE id = ?').run(item.id);
      return send(res, 200, { ok: true });
    }
  }

  return send(res, 404, { error: 'Not found' });
}

http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) await handleApi(req, res);
    else if (req.method === 'GET') serveStatic(req, res);
    else send(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    if (!err.status) console.error(err);
    if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'Server error' });
  }
}).listen(PORT, () => {
  console.log(`Block Lending on http://localhost:${PORT}  (join code: ${JOIN_CODE})`);
});
