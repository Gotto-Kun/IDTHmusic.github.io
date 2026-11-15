/* ═══════════════════════════════════════════════════════════════
   IDTH — админ-панель.
   Работает с серверным API (/api/*). Если сервер не запущен (открыли
   просто файл), включается демо-режим: всё хранится в localStorage.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const KEY = { token: 'idth.token', draft: 'idth.draft', local: 'idth.content.local', leads: 'idth.leads.local', mode: 'idth.mode' };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) =>
    String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const uid = (p) => p + Math.random().toString(36).slice(2, 8);
  const today = () => new Date().toISOString().slice(0, 10);

  const getPath = (obj, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), obj);
  const setPath = (obj, p, v) => {
    const keys = p.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i += 1) {
      const k = keys[i];
      if (cur[k] == null) cur[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      cur = cur[k];
    }
    cur[keys[keys.length - 1]] = v;
    return obj;
  };

  const state = {
    token: localStorage.getItem(KEY.token) || '',
    mode: localStorage.getItem(KEY.mode) === 'local' ? 'local' : 'server',
    draft: null,
    dirty: false,
    open: new Set(),
    leads: [],
    icons: ['link', 'spotify', 'apple', 'bandcamp', 'soundcloud', 'youtube', 'instagram', 'telegram', 'beatport', 'ra', 'mail', 'sound'],
    groups: ['Музыка', 'Видео', 'Соцсети', 'Проф', 'Туры'],
    kinds: ['RELEASE', 'SINGLE', 'LIVE', 'TOUR', 'NEWS', 'POST'],
  };

  /* ───────────────────────────────────────────────────────── тосты */
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'err' ? ' err' : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
    }, kind === 'err' ? 5200 : 2600);
  }

  /* ─────────────────────────────────────────────────────────── API */
  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const res = await fetch(path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.error || `HTTP ${res.status}`), { status: res.status });
    return json;
  }

  const seed = () => {
    const inline = window.IDTH_SEED;
    if (inline && inline.hero) return clone(inline);
    return {
      meta: { siteName: 'IDTH', language: 'ru', description: '', ogImage: '' },
      social: { buttonLabel: 'my social networks', linktree: 'https://linktr.ee/IDTH' },
      hero: { eyebrow: 'LIVE A/V', title: 'IDTH', subtitle: '', image: '', marquee: '', ctaPrimary: { label: 'Слушать', url: 'https://linktr.ee/IDTH' }, ctaSecondary: { label: 'Букинг', url: '' } },
      about: { heading: 'О проекте', paragraphs: [], image: '', stats: [] },
      booking: { heading: 'Букинг', text: '', email: '', city: '', notes: '' },
      sections: { releases: { label: 'Лента и релизы', visible: true }, links: { label: 'Ссылки', visible: true }, about: { label: 'О проекте', visible: true }, booking: { label: 'Букинг', visible: true } },
      posts: [{ id: uid('p'), kind: 'POST', title: 'Первый пост', date: today(), cover: '', body: '', url: '', urlLabel: 'Открыть', featured: false, visible: true }],
      links: [{ id: uid('l'), label: 'Instagram', url: 'https://linktr.ee/IDTH', icon: 'instagram', group: 'Соцсети', visible: true }],
      theme: { mode: 'dark', accent: '#CCFF00', radius: 2, font: 'industrial', grain: true, outlineType: true, logoSize: 34, customCss: '', note: '' },
    };
  };

  /* ─────────────────────────────────────────────── загрузка/сохранение */
  async function loadContent() {
    if (state.mode === 'local') {
      const raw = localStorage.getItem(KEY.local);
      return raw ? JSON.parse(raw) : seed();
    }
    try {
      return await api('api/content');
    } catch (err) {
      if (err.status === 404 || /Failed to fetch|JSON/i.test(err.message)) {
        console.warn('[IDTH] API недоступен → демо-режим');
        switchToLocal();
        const raw = localStorage.getItem(KEY.local);
        return raw ? JSON.parse(raw) : seed();
      }
      throw err;
    }
  }

  function switchToLocal() {
    state.mode = 'local';
    localStorage.setItem(KEY.mode, 'local');
    localStorage.setItem(KEY.token, 'demo');
    state.token = 'demo';
    localBanner();
  }

  function localBanner() {
    if (state.mode !== 'local' || $('#localNote')) return;
    const note = document.createElement('p');
    note.id = 'localNote';
    note.className = 'note';
    note.style.cssText = 'margin:0 0 1rem;padding:.6rem .8rem;border:1px solid var(--accent);color:var(--accent)';
    note.textContent = 'Демо-режим: сервер не запущен, правки сохраняются только в этом браузере. Запустите `node server.js`, чтобы писать в content.json.';
    $('.pane-host').prepend(note);
  }

  let draftTimer;
  function markDirty() {
    if (!state.dirty) {
      state.dirty = true;
      $('#dirtyFlag').hidden = false;
      $('#saveBtn').classList.add('g-btn-accent');
    }
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY.draft, JSON.stringify({ content: state.draft, at: Date.now() }));
      } catch (err) {
        console.warn('черновик не влез в localStorage', err);
      }
      if ($('#previewRail').hidden === false && !$('#previewFrame').dataset.busy) reloadPreview(false);
    }, 350);
  }

  function markClean() {
    state.dirty = false;
    $('#dirtyFlag').hidden = true;
  }

  async function save() {
    const btn = $('#saveBtn');
    btn.disabled = true;
    btn.textContent = '…';
    try {
      if (state.mode === 'local') {
        localStorage.setItem(KEY.local, JSON.stringify(state.draft));
        localStorage.setItem(KEY.draft, JSON.stringify({ content: state.draft, at: Date.now() }));
        toast('Сохранено в этот браузер (демо-режим)');
      } else {
        await api('api/content', { method: 'POST', body: { content: state.draft } });
        localStorage.setItem(KEY.local, JSON.stringify(state.draft));
        localStorage.setItem(KEY.draft, JSON.stringify({ content: state.draft, at: Date.now() }));
        toast('Опубликовано — content.json обновлён');
      }
      markClean();
      reloadPreview(true);
    } catch (err) {
      toast('Не удалось сохранить: ' + err.message, 'err');
      if (err.status === 401) showGate('Сессия истекла — войдите снова');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Сохранить';
    }
  }

  /* ──────────────────────────────────────────────────────── вход */
  function showGate(msg) {
    $('#app').hidden = true;
    $('#gate').style.display = 'grid';
    if (msg) {
      $('#gateMsg').textContent = msg;
      $('#gateMsg').className = 'gate-msg';
    }
    setTimeout(() => $('#gate-pass').focus(), 60);
  }

  function enterApp() {
    $('#gate').style.display = 'none';
    $('#app').hidden = false;
    localBanner();
  }

  async function login(password) {
    if (state.mode === 'local') {
      if (password !== 'idth-admin') throw new Error('В демо-режиме пароль по умолчанию: idth-admin');
      state.token = 'demo';
      localStorage.setItem(KEY.token, 'demo');
      return true;
    }
    const res = await api('api/login', { method: 'POST', body: { password } });
    state.token = res.token;
    localStorage.setItem(KEY.token, res.token);
    localStorage.setItem(KEY.mode, 'server');
    state.mode = 'server';
    return true;
  }

  /* ─────────────────────────────────────────────────── оформление */
  function applyPreviewTheme(root) {
    const t = state.draft.theme || {};
    root.style.setProperty('--accent', /^#[0-9a-f]{3,8}$/i.test(t.accent || '') ? t.accent : '#CCFF00');
  }

  /* ─────────────────────────────────────────── универсальные поля */
  function bindInputs(scope) {
    $$('[data-bind]', scope).forEach((input) => {
      const path = input.dataset.bind;
      const value = getPath(state.draft, path);
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else if (input.type === 'range') input.value = Number(value ?? 0);
      else input.value = value == null ? '' : value;

      input.addEventListener('input', () => {
        let v;
        if (input.type === 'checkbox') v = input.checked;
        else if (input.type === 'range') v = Number(input.value);
        else v = input.value;
        setPath(state.draft, path, v);
        const out = $(`[data-out="${path}"]`);
        if (out) out.textContent = v;
        // одно поле может быть представлено двумя инпутами (текст + пипетка) — синхронизируем
        $$(`[data-bind="${path}"]`).forEach((other) => {
          if (other === input) return;
          if (other.type === 'checkbox') other.checked = Boolean(v);
          else if (other.value !== String(v)) other.value = v;
        });
        if (path === 'theme.accent') applyPreviewTheme(document.documentElement);
        markDirty();
      });
    });

    $$('[data-bind-array]', scope).forEach((area) => {
      const path = area.dataset.bindArray;
      area.value = (getPath(state.draft, path) || []).join('\n');
      area.addEventListener('input', () => {
        setPath(state.draft, path, area.value.split('\n').map((s) => s.trim()).filter(Boolean));
        markDirty();
      });
    });

    $$('[data-seg]', scope).forEach((seg) => {
      const path = seg.dataset.seg;
      const current = getPath(state.draft, path);
      $$('button', seg).forEach((b) => {
        b.classList.toggle('is-on', b.dataset.val === current);
        b.addEventListener('click', () => {
          setPath(state.draft, path, b.dataset.val);
          $$('button', seg).forEach((x) => x.classList.toggle('is-on', x === b));
          markDirty();
        });
      });
    });
  }

  /* ──────────────────────────────────────────────────── медиа-поля */
  function renderMedia(scope) {
    $$('[data-media]', scope).forEach((host) => {
      const path = host.dataset.media;
      const label = host.dataset.mediaLabel || 'Картинка';
      const value = getPath(state.draft, path) || '';
      host.className = 'media';
      host.innerHTML = `
        <div class="media-thumb">${value ? `<img src="${esc(value)}" alt="">` : '<span>нет</span>'}</div>
        <div>
          <div class="media-head">${esc(label)}</div>
          <input class="g-in" type="text" data-bind="${path}" value="${esc(value)}" placeholder="assets/uploads/… или https://…">
          <div class="media-actions">
            <label class="g-btn g-btn-mini g-btn-file">Загрузить<input type="file" accept="image/*" data-upload="${path}"></label>
            <button class="g-btn g-btn-mini" type="button" data-clear="${path}">Убрать</button>
          </div>
        </div>`;

      const input = $('input[data-bind]', host);
      // только обновляем превью миниатюры — значением в состоянии занимается bindInputs
      input.addEventListener('input', () => {
        const thumb = $('.media-thumb', host);
        thumb.innerHTML = input.value ? `<img src="${esc(input.value)}" alt="">` : '<span>нет</span>';
      });

      $('input[data-upload]', host).addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          const dataUrl = await readAndResize(file);
          let url = dataUrl;
          if (state.mode === 'server') {
            const res = await api('api/media', { method: 'POST', body: { dataUrl, name: file.name } });
            url = res.url;
          }
          setPath(state.draft, path, url);
          input.value = url;
          $('.media-thumb', host).innerHTML = `<img src="${esc(url)}" alt="">`;
          markDirty();
          toast(state.mode === 'server' ? `Файл сохранён: ${url}` : 'Картинка вставлена как data-URL (демо-режим)');
        } catch (err) {
          toast('Загрузка не удалась: ' + err.message, 'err');
        }
        e.target.value = '';
      });

      $('button[data-clear]', host).addEventListener('click', () => {
        setPath(state.draft, path, '');
        input.value = '';
        $('.media-thumb', host).innerHTML = '<span>нет</span>';
        markDirty();
      });
    });
  }

  function readAndResize(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('файл не читается'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('не изображение'));
        img.onload = () => {
          const MAX = 1400;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          if (file.size < 320_000 && scale === 1) return resolve(reader.result);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ─────────────────────────────────────────────────────── посты */
  const postRow = (p, i) => {
    const open = state.open.has(p.id);
    const options = (list, cur) => list.map((v) => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
    return `<article class="item${open ? ' is-open' : ''}${p.visible === false ? ' is-off' : ''}" data-item="${esc(p.id)}">
      <div class="item-head">
        <span class="item-kind">${esc(p.kind || 'POST')}</span>
        <span class="item-title">${esc(p.title || 'без названия')}</span>
        <span class="item-date">${esc(p.date || '')}</span>
        ${p.featured ? '<span class="item-date" style="color:var(--accent)">крупная карточка</span>' : ''}
        ${p.visible === false ? '<span class="item-date" style="color:var(--danger)">черновик</span>' : ''}
        <span class="item-tools">
          <button class="icon-btn" data-act="toggle" data-id="${esc(p.id)}" title="Свернуть/развернуть">${open ? '−' : '✎'}</button>
          <button class="icon-btn" data-act="up" data-id="${esc(p.id)}" title="Выше">↑</button>
          <button class="icon-btn" data-act="down" data-id="${esc(p.id)}" title="Ниже">↓</button>
          <button class="icon-btn" data-act="dup" data-id="${esc(p.id)}" title="Дублировать" style="font-size:8px;letter-spacing:.06em">DUP</button>
          <button class="icon-btn danger" data-act="del" data-id="${esc(p.id)}" title="Удалить">✕</button>
        </span>
      </div>
      <div class="item-body">
        <div class="grid2">
          <label class="g-field"><span>Заголовок</span><input type="text" data-bind="posts.${i}.title" value="${esc(p.title)}"></label>
          <label class="g-field"><span>Тип / метка</span><input type="text" list="kinds-${i}" data-bind="posts.${i}.kind" value="${esc(p.kind)}">
            <datalist id="kinds-${i}">${options(state.kinds)}</datalist></label>
          <label class="g-field"><span>Дата</span><input type="date" data-bind="posts.${i}.date" value="${esc(p.date)}"></label>
          <label class="g-field"><span>Ссылка (url)</span><input type="text" data-bind="posts.${i}.url" value="${esc(p.url)}" placeholder="https://…"></label>
          <label class="g-field"><span>Подпись кнопки</span><input type="text" data-bind="posts.${i}.urlLabel" value="${esc(p.urlLabel)}"></label>
          <label class="g-field"><span>Группа-метка (необязательно)</span><input type="text" data-bind="posts.${i}.group" value="${esc(p.group)}"></label>
        </div>
        <label class="g-field"><span>Текст поста</span><textarea rows="4" data-bind="posts.${i}.body">${esc(p.body)}</textarea></label>
        <div class="switches">
          <label class="sw"><input type="checkbox" data-bind="posts.${i}.visible" ${p.visible !== false ? 'checked' : ''}><span>Опубликован</span></label>
          <label class="sw"><input type="checkbox" data-bind="posts.${i}.featured" ${p.featured ? 'checked' : ''}><span>Крупная карточка</span></label>
        </div>
        <div class="media" data-poster="${i}"></div>
      </div>
    </article>`;
  };

  function renderPosts() {
    const host = $('#postList');
    const posts = state.draft.posts || [];
    host.innerHTML = posts.length
      ? posts.map(postRow).join('')
      : '<p class="note">Пока ни одного поста. Нажмите «+ Добавить пост».</p>';

    // обложка — переиспользуем медиа-компонент
    $$('[data-poster]', host).forEach((slot) => {
      slot.dataset.media = `posts.${slot.dataset.poster}.cover`;
      slot.dataset.mediaLabel = 'Обложка';
    });
    renderMedia(host);
    bindInputs(host);

    $$('[data-act]', host).forEach((btn) =>
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const list = state.draft.posts;
        const idx = list.findIndex((p) => p.id === id);
        if (idx === -1) return;
        const act = btn.dataset.act;
        if (act === 'toggle') {
          state.open.has(id) ? state.open.delete(id) : state.open.add(id);
        } else if (act === 'up' && idx > 0) {
          [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
        } else if (act === 'down' && idx < list.length - 1) {
          [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]];
        } else if (act === 'dup') {
          state.open.add(id);
          list.splice(idx + 1, 0, { ...clone(list[idx]), id: uid('p'), title: list[idx].title + ' (копия)', featured: false, visible: false });
        } else if (act === 'del') {
          if (!confirm(`Удалить «${list[idx].title}»?`)) return;
          list.splice(idx, 1);
        }
        markDirty();
        renderPosts();
      }),
    );
  }

  /* ──────────────────────────────────────────────────── ссылки */
  function renderLinks() {
    const host = $('#linkList');
    const links = state.draft.links || [];
    const opts = (list, cur) => list.map((v) => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');

    host.innerHTML = links
      .map(
        (l, i) => `<div class="table-row${l.visible === false ? ' is-off' : ''}" data-link="${esc(l.id)}">
          <span class="drag">⋮</span>
          <input type="text" data-bind="links.${i}.label" value="${esc(l.label)}" placeholder="Spotify">
          <input type="text" data-bind="links.${i}.url" value="${esc(l.url)}" placeholder="https://…">
          <select data-bind="links.${i}.icon">${opts(state.icons, l.icon)}</select>
          <input type="text" list="groups" data-bind="links.${i}.group" value="${esc(l.group)}" placeholder="Музыка">
          <span class="cell-vis"><input type="checkbox" data-bind="links.${i}.visible" ${l.visible !== false ? 'checked' : ''}></span>
          <span class="cell-tools">
            <button class="icon-btn" data-lact="up" data-id="${esc(l.id)}">↑</button>
            <button class="icon-btn" data-lact="down" data-id="${esc(l.id)}">↓</button>
            <button class="icon-btn danger" data-lact="del" data-id="${esc(l.id)}">✕</button>
          </span>
        </div>`,
      )
      .join('');

    host.insertAdjacentHTML(
      'beforeend',
      `<datalist id="groups">${opts(state.groups)}</datalist>`,
    );

    bindInputs(host);

    $$('[data-lact]', host).forEach((btn) =>
      btn.addEventListener('click', () => {
        const list = state.draft.links;
        const idx = list.findIndex((x) => x.id === btn.dataset.id);
        if (idx === -1) return;
        if (btn.dataset.lact === 'up' && idx > 0) [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
        if (btn.dataset.lact === 'down' && idx < list.length - 1) [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]];
        if (btn.dataset.lact === 'del') {
          if (!confirm(`Удалить ссылку «${list[idx].label}»?`)) return;
          list.splice(idx, 1);
        }
        markDirty();
        renderLinks();
      }),
    );
  }

  /* ─────────────────────────────────────────────────────── цифры */
  function renderStats() {
    const host = $('#statsList');
    const stats = getPath(state.draft, 'about.stats') || [];
    host.innerHTML = stats
      .map(
        (s, i) => `<div class="stack" style="grid-template-columns:1fr 2fr;gap:.4rem;display:grid">
          <input class="g-in" type="text" data-bind="about.stats.${i}.value" value="${esc(s.value)}" placeholder="27">
          <div style="display:flex;gap:.3rem">
            <input class="g-in" type="text" data-bind="about.stats.${i}.label" value="${esc(s.label)}" placeholder="лайвов за год">
            <button class="icon-btn danger" data-sact="del" data-i="${i}">✕</button>
          </div>
        </div>`,
      )
      .join('');
    bindInputs(host);
    $$('[data-sact]', host).forEach((b) =>
      b.addEventListener('click', () => {
        stats.splice(Number(b.dataset.i), 1);
        markDirty();
        renderStats();
      }),
    );
  }

  /* ────────────────────────────────────────────────────── темы */
  const SWATCHES = ['#CCFF00', '#F5F5F2', '#FF3B30', '#00E5FF', '#B38CFF', '#FFD166', '#7CFF9B', '#FF5FA2', '#0A84FF'];
  function renderSwatches() {
    const host = $('#swatches');
    host.innerHTML = SWATCHES.map((c) => `<button class="swatch" type="button" data-hex="${c}" style="background:${c}" title="${c}" aria-label="Акцент ${c}"></button>`).join('');
    $$('[data-hex]', host).forEach((b) =>
      b.addEventListener('click', () => {
        setPath(state.draft, 'theme.accent', b.dataset.hex);
        applyPreviewTheme(document.documentElement);
        $$('[data-bind="theme.accent"]').forEach((inp) => (inp.value = b.dataset.hex));
        markDirty();
        toast('Акцент: ' + b.dataset.hex);
      }),
    );
  }

  /* ───────────────────────────────────────────────────── заявки */
  async function loadLeads() {
    if (state.mode === 'local') {
      try {
        state.leads = JSON.parse(localStorage.getItem(KEY.leads) || '[]');
      } catch {
        state.leads = [];
      }
    } else {
      try {
        state.leads = (await api('api/leads')).leads || [];
      } catch (err) {
        state.leads = [];
        if (err.status === 401) showGate('Сессия истекла — войдите снова');
      }
    }
    renderLeads();
  }

  function renderLeads() {
    const host = $('#leadList');
    const unread = state.leads.filter((l) => !l.read).length;
    const badge = $('#leadsBadge');
    badge.hidden = !unread;
    badge.textContent = String(unread);

    if (!state.leads.length) {
      host.innerHTML = '<p class="note">Заявок пока нет. Форма на сайте шлёт их сюда же, в <code>data/leads.json</code>.</p>';
      return;
    }
    host.innerHTML = state.leads
      .map(
        (l) => `<div class="lead${l.read ? '' : ' is-new'}">
          <div class="lead-top">
            <span class="lead-name">${esc(l.name)}</span>
            <a class="item-date" href="mailto:${esc(l.email)}">${esc(l.email)}</a>
            ${l.city ? `<span class="item-date">${esc(l.city)}</span>` : ''}
            ${l.date ? `<span class="item-date" style="color:var(--accent)">${esc(l.date)}</span>` : ''}
            <span class="lead-when">${esc((l.ts || '').slice(0, 16).replace('T', ' '))}</span>
            <button class="icon-btn" data-leads="del" data-id="${esc(l.id)}" title="Удалить">✕</button>
          </div>
          <p class="lead-msg">${esc(l.message)}</p>
        </div>`,
      )
      .join('');

    $$('[data-leads="del"]', host).forEach((b) =>
      b.addEventListener('click', async () => {
        const id = b.dataset.id;
        state.leads = state.leads.filter((l) => l.id !== id);
        renderLeads();
        if (state.mode === 'server') {
          try {
            await api('api/leads/delete', { method: 'POST', body: { id } });
            toast('Заявка удалена');
          } catch (err) {
            toast(err.message, 'err');
          }
        } else {
          localStorage.setItem(KEY.leads, JSON.stringify(state.leads));
        }
      }),
    );
  }

  /* ─────────────────────────────────────────────── предпросмотр */
  function reloadPreview(force) {
    const frame = $('#previewFrame');
    if (!force && frame.dataset.busy) return;
    try {
      localStorage.setItem(KEY.draft, JSON.stringify({ content: state.draft, at: Date.now() }));
    } catch (err) {
      console.warn(err);
    }
    frame.dataset.busy = '1';
    frame.src = 'index.html?preview=1&t=' + Date.now();
    setTimeout(() => {
      delete frame.dataset.busy;
    }, 700);
  }

  function openPreview() {
    const rail = $('#previewRail');
    const on = rail.hidden;
    rail.hidden = !on;
    $('.app-body').classList.toggle('has-preview', on);
    if (on) reloadPreview(true);
  }

  /* ────────────────────────────────────────────────────── сборка */
  function renderAll() {
    renderPosts();
    renderLinks();
    renderStats();
    renderSwatches();
    // медиа-блоки перерисовываются первыми, чтобы bindInputs подхватил их поля
    renderMedia($('#pane-texts'));
    bindInputs($('#pane-theme'));
    bindInputs($('#pane-texts'));
    bindInputs($('#socialCard'));
  }

  function wire() {
    // табы
    $$('#tabs .tab').forEach((tab) =>
      tab.addEventListener('click', () => {
        $$('#tabs .tab').forEach((t) => t.classList.toggle('is-on', t === tab));
        $$('.pane').forEach((p) => p.classList.toggle('is-on', p.id === 'pane-' + tab.dataset.pane));
        if (tab.dataset.pane === 'leads') loadLeads();
      }),
    );

    $('#saveBtn').addEventListener('click', save);
    $('#previewBtn').addEventListener('click', openPreview);
    $('#previewClose').addEventListener('click', () => {
      $('#previewRail').hidden = true;
      $('.app-body').classList.remove('has-preview');
    });
    $('#previewApply').addEventListener('click', () => {
      reloadPreview(true);
      toast('Предпросмотр обновлён');
    });

    $('[data-add="post"]').addEventListener('click', () => {
      const id = uid('p');
      state.draft.posts = state.draft.posts || [];
      state.draft.posts.unshift({ id, kind: 'RELEASE', title: 'Новый релиз', date: today(), cover: '', body: '', url: state.draft.social.linktree, urlLabel: 'Слушать', featured: state.draft.posts.length === 0, visible: true });
      state.open.add(id);
      markDirty();
      renderPosts();
      $$('#tabs .tab')[0].click();
      toast('Пост добавлен — заполните поля');
    });

    $('[data-add="link"]').addEventListener('click', () => {
      state.draft.links = state.draft.links || [];
      state.draft.links.push({ id: uid('l'), label: 'Новая ссылка', url: 'https://', icon: 'link', group: 'Ссылки', visible: true });
      markDirty();
      renderLinks();
    });

    $('[data-add="stat"]').addEventListener('click', () => {
      const stats = getPath(state.draft, 'about.stats') || setPath(state.draft, 'about.stats', []);
      stats.push({ value: '0', label: 'новый показатель' });
      markDirty();
      renderStats();
    });

    // вход
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pass = $('#gate-pass').value;
      const btn = $('#gateSubmit');
      btn.disabled = true;
      $('#gateMsg').textContent = 'Проверяю…';
      $('#gateMsg').className = 'gate-msg';
      try {
        if (state.mode === 'server') {
          try {
            await login(pass);
          } catch (err) {
            if (/Failed to fetch|JSON|fetch/i.test(err.message)) {
              switchToLocal();
              await login(pass);
            } else {
              throw err;
            }
          }
        } else {
          await login(pass);
        }
        state.draft = await loadContent();
        applyPreviewTheme(document.documentElement);
        renderAll();
        await loadLeads();
        markClean();
        enterApp();
        toast('Готово. Правки вступают в силу после «Сохранить».');
      } catch (err) {
        $('#gateMsg').textContent = err.message || 'Не удалось войти';
        $('#gateMsg').className = 'gate-msg';
      } finally {
        btn.disabled = false;
      }
    });

    $('#logoutBtn').addEventListener('click', async () => {
      if (state.dirty && !confirm('Есть несохранённые правки. Всё равно выйти?')) return;
      if (state.mode === 'server') {
        try {
          await api('api/logout', { method: 'POST' });
        } catch (err) {
          console.warn(err);
        }
      }
      localStorage.removeItem(KEY.token);
      state.token = '';
      showGate('Вы вышли');
    });

    // пароль
    $('#pwSave').addEventListener('click', async () => {
      if (state.mode === 'local') return toast('Смена пароля доступна только с запущенным сервером', 'err');
      try {
        await api('api/password', { method: 'POST', body: { current: $('#pwCurrent').value, next: $('#pwNext').value } });
        toast('Пароль изменён. Войдите заново.');
        localStorage.removeItem(KEY.token);
        setTimeout(() => showGate('Пароль обновлён — войдитесь новым'), 900);
      } catch (err) {
        toast(err.message, 'err');
      }
    });

    // экспорт / импорт / сброс
    $('#exportLink').addEventListener('click', (e) => {
      e.preventDefault();
      const blob = new Blob([JSON.stringify(state.draft, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `idth-content-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      toast('JSON скачан');
    });

    $('#importFile').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result);
          if (!json.hero || !json.theme) throw new Error('в файле нет структуры IDTH');
          state.draft = json;
          renderAll();
          applyPreviewTheme(document.documentElement);
          markDirty();
          toast('Импортировано. Проверьте и нажмите «Сохранить».');
        } catch (err) {
          toast('Импорт не удался: ' + err.message, 'err');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    $('#resetBtn').addEventListener('click', () => {
      if (!confirm('Вернуть исходный (зашитый в проект) контент? Текущие правки будут потеряны.')) return;
      state.draft = seed();
      renderAll();
      markDirty();
      toast('Черновик сброшен — сохраните, чтобы записать');
    });

    $('#refreshLeads').addEventListener('click', () => {
      loadLeads();
      toast('Список обновлён');
    });

    // горячие клавиши + предупреждение о несохранённом
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    });
    window.addEventListener('beforeunload', (e) => {
      if (state.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    window.addEventListener('resize', () => applyPreviewTheme(document.documentElement));
  }

  /* ────────────────────────────────────────────────────── старт */
  (async function boot() {
    wire();
    if (!state.token) return showGate();
    try {
      if (state.mode === 'server') {
        await api('api/session');
        state.draft = await loadContent();
      } else {
        state.draft = await loadContent();
      }
      applyPreviewTheme(document.documentElement);
      renderAll();
      await loadLeads();
      markClean();
      enterApp();
    } catch (err) {
      console.warn('[IDTH] автологин не удался:', err);
      localStorage.removeItem(KEY.token);
      state.token = '';
      showGate(err.status === 401 ? 'Сессия истекла — войдите снова' : '');
    }
  })();
})();
