#!/usr/bin/env node
/*
 * IDTH — музыкантский сайт + админка.
 * Zero-dependency Node.js сервер: статика + маленький JSON API для админ-панели.
 *
 *   node server.js            → http://localhost:4173
 *
 * Данные контента лежат в content.json (рядом с этим файлом) — их можно коммитить в git.
 * Запросы из формы букинга — в data/leads.json.
 * Пароль админа по умолчанию: idth-admin (меняется в админке, хэш лежит в data/config.json).
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'assets', 'uploads');
const CONTENT_FILE = path.join(ROOT, 'content.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';
const DEFAULT_PASSWORD = process.env.IDTH_ADMIN_PASSWORD || 'idth-admin';
const MAX_BODY = 12 * 1024 * 1024;
const SESSION_TTL = 1000 * 60 * 60 * 24 * 30;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
};

/* ------------------------------------------------------------------ utils */

const ensureDirs = () => {
  for (const dir of [DATA_DIR, UPLOAD_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
};

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

const writeJson = async (file, value) => {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fsp.rename(tmp, file);
};

const send = (res, status, body, headers = {}) => {
  const isJson = typeof body === 'object' && body !== null && !Buffer.isBuffer(body);
  const payload = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : headers['Content-Type'] || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
    ...(isJson ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
  });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(Object.assign(new Error('bad json'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });

/* ------------------------------------------------------------------- auth */

const hashPassword = (password, salt) =>
  crypto.scryptSync(String(password), String(salt), 32).toString('hex');

const getConfig = () => {
  let cfg = readJson(CONFIG_FILE, null);
  if (!cfg || !cfg.salt || !cfg.hash) {
    const salt = crypto.randomBytes(16).toString('hex');
    cfg = { salt, hash: hashPassword(DEFAULT_PASSWORD, salt), createdAt: new Date().toISOString() };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    console.log(`[IDTH] создан пароль админа по умолчанию: ${DEFAULT_PASSWORD}  (смените его в /admin → Настройки)`);
  }
  return cfg;
};

const verifyPassword = (password) => {
  const cfg = getConfig();
  const candidate = Buffer.from(hashPassword(password, cfg.salt), 'hex');
  const actual = Buffer.from(cfg.hash, 'hex');
  return candidate.length === actual.length && crypto.timingSafeEqual(candidate, actual);
};

const sessions = () => {
  const store = readJson(SESSIONS_FILE, {});
  const now = Date.now();
  const fresh = {};
  for (const [token, exp] of Object.entries(store)) if (exp > now) fresh[token] = exp;
  return fresh;
};

const createSession = async () => {
  const store = sessions();
  const token = crypto.randomBytes(24).toString('hex');
  store[token] = Date.now() + SESSION_TTL;
  await writeJson(SESSIONS_FILE, store);
  return token;
};

const destroySession = async (token) => {
  const store = sessions();
  delete store[token];
  await writeJson(SESSIONS_FILE, store);
};

const isAuthed = (req) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.headers['x-idth-token'] || '';
  if (!token) return false;
  const store = sessions();
  return Boolean(store[token] && store[token] > Date.now());
};

/* ------------------------------------------------------- rate limiting (login) */

const attempts = new Map();
const rateLimited = (ip) => {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 60_000);
  if (list.length >= 8) return true;
  list.push(now);
  attempts.set(ip, list);
  return false;
};

/* ------------------------------------------------------ content validation */

const slug = (str, allowCyrillic = true) =>
  String(str)
    .toLowerCase()
    .replace(allowCyrillic ? /[^a-z0-9\u0400-\u04ff]+/g : /[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'item';

const clampStr = (v, max = 4000) => (v === undefined || v === null ? '' : String(v)).slice(0, max);
const clampBool = (v, dflt = true) => (typeof v === 'boolean' ? v : dflt);

const sanitizeContent = (raw) => {
  if (!raw || typeof raw !== 'object') throw Object.assign(new Error('empty content'), { status: 400 });
  const out = {};

  out.meta = {
    siteName: clampStr(raw.meta?.siteName, 60) || 'IDTH',
    language: clampStr(raw.meta?.language, 8) || 'ru',
    description: clampStr(raw.meta?.description, 400),
    ogImage: clampStr(raw.meta?.ogImage, 300),
  };

  out.social = {
    buttonLabel: clampStr(raw.social?.buttonLabel, 60) || 'my social networks',
    linktree: clampStr(raw.social?.linktree, 300) || 'https://linktr.ee/IDTH',
  };

  const cta = (c, dflt) => ({
    label: clampStr(c?.label, 60) || dflt.label,
    url: clampStr(c?.url, 300) || dflt.url,
  });

  out.hero = {
    eyebrow: clampStr(raw.hero?.eyebrow, 120),
    title: clampStr(raw.hero?.title, 60) || out.meta.siteName,
    subtitle: clampStr(raw.hero?.subtitle, 400),
    image: clampStr(raw.hero?.image, 300),
    marquee: clampStr(raw.hero?.marquee, 600),
    ctaPrimary: cta(raw.hero?.ctaPrimary, { label: 'Слушать', url: out.social.linktree }),
    ctaSecondary: cta(raw.hero?.ctaSecondary, { label: 'Букинг', url: '' }),
  };

  out.about = {
    paragraphs: (Array.isArray(raw.about?.paragraphs) ? raw.about.paragraphs : [])
      .map((p) => clampStr(p, 2000))
      .filter(Boolean)
      .slice(0, 12),
    image: clampStr(raw.about?.image, 300),
    stats: (Array.isArray(raw.about?.stats) ? raw.about.stats : [])
      .map((s) => ({ value: clampStr(s?.value, 24), label: clampStr(s?.label, 60) }))
      .filter((s) => s.value || s.label)
      .slice(0, 6),
  };

  out.booking = {
    heading: clampStr(raw.booking?.heading, 120) || 'Букинг',
    text: clampStr(raw.booking?.text, 1200),
    email: clampStr(raw.booking?.email, 160),
    city: clampStr(raw.booking?.city, 120),
    notes: clampStr(raw.booking?.notes, 2000),
  };

  out.sections = {};
  for (const key of ['releases', 'links', 'about', 'booking']) {
    const src = raw.sections?.[key] ?? {};
    out.sections[key] = {
      label: clampStr(src.label, 60) || key,
      nav: clampStr(src.nav, 24) || clampStr(src.label, 24) || key,
      visible: clampBool(src.visible, true),
    };
  }

  const safeUrl = (u) => {
    const s = clampStr(u, 300).trim();
    if (!s) return '';
    if (/^(https?:|mailto:|tel:|\/|#)/i.test(s)) return s.replace(/["'\s<>]/g, '');
    if (/^data:/i.test(s)) return '';
    return `https://${s}`;
  };

  out.posts = (Array.isArray(raw.posts) ? raw.posts : []).slice(0, 120).map((p, i) => ({
    id: clampStr(p?.id, 60) || `${slug(p?.title || 'post')}-${i}`,
    kind: clampStr(p?.kind, 20).toUpperCase() || 'POST',
    title: clampStr(p?.title, 160) || 'Без названия',
    date: clampStr(p?.date, 40),
    cover: clampStr(p?.cover, 300),
    body: clampStr(p?.body, 3000),
    url: safeUrl(p?.url),
    urlLabel: clampStr(p?.urlLabel, 40) || 'Открыть',
    featured: clampBool(p?.featured, false),
    visible: clampBool(p?.visible, true),
  }));

  out.links = (Array.isArray(raw.links) ? raw.links : []).slice(0, 60).map((l, i) => ({
    id: clampStr(l?.id, 60) || `link-${i}`,
    label: clampStr(l?.label, 60) || 'Ссылка',
    url: safeUrl(l?.url),
    icon: clampStr(l?.icon, 24) || 'link',
    group: clampStr(l?.group, 40),
    visible: clampBool(l?.visible, true),
  }));

  const accent = clampStr(raw.theme?.accent, 20).trim();
  out.theme = {
    mode: ['dark', 'light'].includes(raw.theme?.mode) ? raw.theme.mode : 'dark',
    accent: /^#[0-9a-f]{3,8}$/i.test(accent) ? accent : '#CCFF00',
    radius: Math.max(0, Math.min(28, Number(raw.theme?.radius ?? 2) || 0)),
    font: ['industrial', 'mono', 'editorial'].includes(raw.theme?.font) ? raw.theme.font : 'industrial',
    grain: clampBool(raw.theme?.grain, true),
    outlineType: clampBool(raw.theme?.outlineType, true),
    logoSize: Math.max(18, Math.min(72, Number(raw.theme?.logoSize ?? 34) || 34)),
    customCss: clampStr(raw.theme?.customCss, 8000),
    note: clampStr(raw.theme?.note, 200),
  };

  return out;
};

/* --------------------------------------------------------- html snapshot */

const DATA_START = '<!-- IDTH:DATA:START -->';
const DATA_END = '<!-- IDTH:DATA:END -->';

const injectContent = (html, content) => {
  const start = html.indexOf(DATA_START);
  const end = html.indexOf(DATA_END);
  if (start === -1 || end === -1 || end < start) return html;
  const json = JSON.stringify(content).replace(/</g, '\\u003c');
  const block = `${DATA_START}\n  <script type="application/json" id="site-data">${json}</script>\n  ${DATA_END}`;
  return html.slice(0, start) + block + html.slice(end + DATA_END.length);
};

const refreshSnapshot = async (content) => {
  const file = path.join(PUBLIC_DIR, 'index.html');
  try {
    const html = await fsp.readFile(file, 'utf8');
    const next = injectContent(html, content);
    if (next !== html) await fsp.writeFile(file, next, 'utf8');
  } catch (err) {
    console.warn('[IDTH] не удалось обновить снапшот в index.html:', err.message);
  }
  // тот же снимок — для админки, открытой без сервера
  try {
    const banner =
      '/* Автосгенерировано: снимок content.json — запасной вариант для админки,\n   когда сайт открыли без сервера (file://). Обновляется при каждом сохранении. */\n';
    await fsp.writeFile(
      path.join(PUBLIC_DIR, 'js', 'seed.js'),
      `${banner}window.IDTH_SEED = ${JSON.stringify(content, null, 2)};\n`,
      'utf8',
    );
  } catch (err) {
    console.warn('[IDTH] не удалось обновить js/seed.js:', err.message);
  }
};

/* ------------------------------------------------------------------- api */

const handleApi = async (req, res, url) => {
  const ip = req.socket.remoteAddress || '?';
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /api/health') {
    return send(res, 200, { ok: true, service: 'idth-site', time: new Date().toISOString() });
  }

  if (route === 'GET /api/content') {
    return send(res, 200, readJson(CONTENT_FILE, {}));
  }

  if (route === 'POST /api/login') {
    if (rateLimited(ip)) return send(res, 429, { error: 'Слишком много попыток. Подождите минуту.' });
    const body = await readBody(req);
    if (!verifyPassword(body.password || '')) {
      attempts.set(ip, [...(attempts.get(ip) || []), Date.now(), Date.now()]);
      return send(res, 401, { error: 'Неверный пароль' });
    }
    const token = await createSession();
    return send(res, 200, { token, expires: '30 дней' });
  }

  if (route === 'POST /api/logout') {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) await destroySession(header.slice(7));
    return send(res, 200, { ok: true });
  }

  if (route === 'POST /api/leads') {
    if (rateLimited(ip)) return send(res, 429, { error: 'Слишком часто. Попробуйте через минуту.' });
    const body = await readBody(req);
    const lead = {
      id: crypto.randomBytes(6).toString('hex'),
      ts: new Date().toISOString(),
      name: clampStr(body.name, 120).trim(),
      email: clampStr(body.email, 160).trim(),
      city: clampStr(body.city, 120).trim(),
      date: clampStr(body.date, 40).trim(),
      message: clampStr(body.message, 2000).trim(),
      read: false,
    };
    if (lead.name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(lead.email) || lead.message.length < 4) {
      return send(res, 422, { error: 'Заполните имя, корректный e-mail и сообщение' });
    }
    const leads = readJson(LEADS_FILE, []);
    leads.unshift(lead);
    await writeJson(LEADS_FILE, leads.slice(0, 500));
    return send(res, 200, { ok: true });
  }

  /* --- дальше всё требует авторизации --- */
  const authed = isAuthed(req);
  if (!authed) return send(res, 401, { error: 'Требуется вход в админку' });

  if (route === 'GET /api/session') return send(res, 200, { ok: true });

  if (route === 'POST /api/content') {
    const body = await readBody(req);
    let content;
    try {
      content = sanitizeContent(body.content ?? body);
    } catch (err) {
      return send(res, err.status || 422, { error: err.message || 'Некорректный контент' });
    }
    await writeJson(CONTENT_FILE, content);
    await refreshSnapshot(content);
    return send(res, 200, { ok: true, content });
  }

  if (route === 'POST /api/media') {
    const body = await readBody(req);
    const match = /^data:(image\/(png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(body.dataUrl || '');
    if (!match) return send(res, 400, { error: 'Ожидается data-URL изображения (png/jpg/webp/gif)' });
    const buf = Buffer.from(match[3], 'base64');
    if (buf.length > 5 * 1024 * 1024) return send(res, 413, { error: 'Файл больше 5 МБ' });
    const ext = match[2].replace('jpeg', 'jpg');
    const name = `${Date.now().toString(36)}-${slug(body.name || 'image', false)}.${ext}`;
    await fsp.writeFile(path.join(UPLOAD_DIR, name), buf);
    return send(res, 200, { ok: true, url: `assets/uploads/${name}`, bytes: buf.length });
  }

  if (route === 'GET /api/leads') {
    return send(res, 200, { leads: readJson(LEADS_FILE, []) });
  }

  if (route === 'POST /api/leads/delete') {
    const body = await readBody(req);
    const leads = readJson(LEADS_FILE, []).filter((l) => l.id !== body.id);
    await writeJson(LEADS_FILE, leads);
    return send(res, 200, { ok: true, leads });
  }

  if (route === 'POST /api/password') {
    const body = await readBody(req);
    if (!verifyPassword(body.current || '')) return send(res, 403, { error: 'Текущий пароль неверный' });
    const next = String(body.next || '');
    if (next.length < 6) return send(res, 400, { error: 'Новый пароль короче 6 символов' });
    const salt = crypto.randomBytes(16).toString('hex');
    await writeJson(CONFIG_FILE, { salt, hash: hashPassword(next, salt), updatedAt: new Date().toISOString() });
    await writeJson(SESSIONS_FILE, {});
    return send(res, 200, { ok: true, note: 'Пароль изменён, все сессии сброшены' });
  }

  if (route === 'GET /api/export') {
    const json = JSON.stringify(readJson(CONTENT_FILE, {}), null, 2);
    return send(res, 200, json, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="idth-content-${new Date().toISOString().slice(0, 10)}.json"`,
    });
  }

  return send(res, 404, { error: 'Нет такого API-метода' });
};

/* ------------------------------------------------------------------ http */

const serveStatic = async (req, res, url) => {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin' || pathname === '/admin/') pathname = '/admin.html';

  const filePath = path.join(PUBLIC_DIR, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');

  try {
    let stat = await fsp.stat(filePath);
    if (stat.isDirectory()) throw new Error('dir');

    if (filePath.endsWith(path.join('public', 'index.html'))) {
      const html = await fsp.readFile(filePath, 'utf8');
      return send(res, 200, injectContent(html, readJson(CONTENT_FILE, {})), {
        'Content-Type': 'text/html; charset=utf-8',
      });
    }

    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const etag = `W/"${stat.size}-${Number(stat.mtimeMs).toString(36)}"`;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag });
      return res.end();
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      ETag: etag,
      'Cache-Control': pathname.includes('uploads') || pathname.endsWith('.html') || pathname === '/content.json'
        ? 'no-cache'
        : 'public, max-age=3600',
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    send(res, 404, 'Not found');
  }
};

ensureDirs();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    if (url.pathname === '/content.json') {
      // корневой content.json (а не из public/) — источник данных для публичной страницы
      return send(res, 200, readJson(CONTENT_FILE, {}));
    }
    await serveStatic(req, res, url);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[IDTH]', err);
    send(res, status, { error: err.message || 'Ошибка сервера' });
  }
});

server.listen(PORT, HOST, () => {
  getConfig();
  console.log(`[IDTH] сайт:      http://localhost:${PORT}/`);
  console.log(`[IDTH] админка:   http://localhost:${PORT}/admin`);
});
