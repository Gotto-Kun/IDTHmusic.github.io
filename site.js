/* ═══════════════════════════════════════════════════════════════
   IDTH — публичная часть сайта.
   Контент берётся из /content.json (через сервер). Если сервер недоступен
   (например, открыли файл локально) — используется снапшот из <script id="site-data">.
   С параметром ?preview=1 страница рисует черновик из localStorage — это живой
   предпросмотр для админ-панели.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const DRAFT_KEY = 'idth.draft';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) =>
    String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
    );
  const reduceMotion =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --------------------------------------------------------- иконки */
  const ICONS = {
    spotify: '<circle cx="12" cy="12" r="9"/><path d="M7.2 9.4c3.2-.9 6.4-.5 9 .9M8 12.4c2.6-.7 5.2-.4 7.3.7M8.7 15.3c2.1-.5 4.2-.3 5.9.6"/>',
    apple: '<path d="M12 7.5c1.6-2 4.4-2.3 5.6-.8M17.8 17.4c-.9 1.6-2 3-3.5 2.9-1 0-1.5-.6-2.6-.6s-1.6.6-2.7.6c-1.5 0-2.7-1.6-3.6-3.2-1.7-3-1.5-7.2 1.2-8.6 1.1-.6 2.4-.5 3.4.3.8.6 1.3.6 2.2.1"/>',
    bandcamp: '<path d="M4 16.5 9.5 7.5H20L14.5 16.5z"/>',
    soundcloud: '<path d="M4 15.5v-4M7 16.5v-6M10 16.5V8M13 16.5v-5.5M16.5 16.5v-4h2.2a2.3 2.3 0 0 0 0-4.6c-1 0-1.7.4-2.2 1"/>',
    youtube: '<rect x="3" y="6.5" width="18" height="11" rx="3.2"/><path d="M10.6 9.8 14.8 12l-4.2 2.2z"/>',
    instagram: '<rect x="4" y="4" width="16" height="16" rx="4.6"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.8" cy="7.3" r=".9" fill="currentColor" stroke="none"/>',
    telegram: '<path d="M20.5 4.5 3.8 11.2l5.1 1.7 1.6 5.6 2.7-3.3 4 3z"/><path d="M8.9 12.9 17 7.4l-5.6 6.3"/>',
    beatport: '<path d="M12 3.5 19.5 8v8L12 20.5 4.5 16V8z"/><path d="M8.4 13.6h1.9l1.2 2.4 1.2-4.6 1.1 2.2h1.6"/>',
    ra: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.6"/><path d="M8 16V8.6h3.2a2 2 0 0 1 0 4H8M12.6 12.6 15.6 16"/>',
    mail: '<rect x="3" y="5.5" width="18" height="13" rx="1.8"/><path d="M3.6 6.6 12 13l8.4-6.4"/>',
    link: '<path d="M10.5 13.5a3.5 3.5 0 0 0 5 0l2.6-2.6a3.54 3.54 0 0 0-5-5L12 7"/><path d="M13.5 10.5a3.5 3.5 0 0 0-5 0L5.9 13.1a3.54 3.54 0 0 0 5 5L12 17"/>',
    sound: '<path d="M4 9.5v5h3.2L12 18.8V5.2L7.2 9.5z"/><path d="M15.4 9a4.2 4.2 0 0 1 0 6M18 6.6a7.6 7.6 0 0 1 0 10.8"/>',
  };
  const icon = (name) =>
    `<svg class="ic" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${
      ICONS[name] || ICONS.link
    }</svg>`;

  const arrow =
    '<svg class="ic-arrow" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

  /* ------------------------------------------------------ загрузка данных */
  const FALLBACK = {
    social: { buttonLabel: 'my social networks', linktree: 'https://linktr.ee/IDTH' },
    hero: { title: 'IDTH' },
    theme: { mode: 'dark', accent: '#CCFF00' },
  };

  const readDraft = () => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (draft && draft.content && draft.content.hero) return draft.content;
    } catch (err) {
      console.warn('[IDTH] черновик не прочитан:', err);
    }
    return null;
  };

  async function loadContent() {
    if (new URLSearchParams(location.search).has('preview')) {
      const draft = readDraft();
      if (draft) return draft;
    }
    if (location.protocol !== 'file:') {
      try {
        const res = await fetch('content.json', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json && json.hero) return json;
        }
      } catch (err) {
        console.info('[IDTH] /content.json недоступен — беру снапшот из HTML');
      }
    }
    // без сервера (file://) админка сохраняет правки в localStorage — показываем их
    const draft = readDraft();
    if (draft) return draft;
    try {
      const node = document.getElementById('site-data');
      const inline = JSON.parse(node ? node.textContent || '{}' : '{}');
      if (inline && inline.hero) return inline;
    } catch (err) {
      console.warn('[IDTH] снапшот повреждён:', err);
    }
    return FALLBACK;
  }

  /* --------------------------------------------------------- оформление */
  function applyTheme(content) {
    const t = content.theme || {};
    const root = document.documentElement;
    root.dataset.mode = t.mode === 'light' ? 'light' : 'dark';
    root.dataset.font = ['industrial', 'mono', 'editorial'].includes(t.font) ? t.font : 'industrial';
    root.style.setProperty('--accent', t.accent || '#CCFF00');
    root.style.setProperty('--radius', `${Number(t.radius ?? 2)}px`);
    root.style.setProperty('--logo-h', `${Number(t.logoSize || 34)}px`);
    document.body.classList.toggle('no-grain', t.grain === false);
    document.body.classList.toggle('solid-type', t.outlineType === false);

    const logo = $('#brandLogo');
    if (logo) logo.src = root.dataset.mode === 'light' ? 'assets/logo-black.png' : 'assets/logo.png';

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = root.dataset.mode === 'light' ? '#f2f1ee' : '#08080a';

    let style = $('#customCss');
    if (!style) {
      style = document.createElement('style');
      style.id = 'customCss';
      document.head.appendChild(style);
    }
    style.textContent = String(t.customCss || '').replace(/<\/style>/gi, '');
  }

  /* -------------------------------------------------------------- шапка */
  function renderNav(content) {
    const sections = content.sections || {};
    const map = [
      ['releases', '#releases', 'Лента'],
      ['links', '#links', 'Ссылки'],
      ['about', '#about', 'О проекте'],
      ['booking', '#booking', 'Букинг'],
    ];
    const items = map
      .filter(([key]) => sections[key] === undefined || sections[key].visible !== false)
      .map(([key, href, dflt]) => {
        const cfg = sections[key] || {};
        return `<a class="nav-link" href="${href}" data-target="${key}">${esc(cfg.nav || cfg.label || dflt)}</a>`;
      });

    $('#mainNav').innerHTML = items.join('');
    $('#mobileNavLinks').innerHTML = items.join('').replace(/class="nav-link"/g, 'class="nav-link nav-link-lg"');
    $('#footNav').innerHTML = items.join('').replace(/class="nav-link"/g, 'class="foot-link"');

    const label = content.social?.buttonLabel || 'my social networks';
    const url = content.social?.linktree || 'https://linktr.ee/IDTH';
    ['#socialButton', '#socialButtonMobile'].forEach((sel) => {
      const btn = $(sel);
      if (!btn) return;
      btn.href = url;
      $('.btn-label', btn).textContent = label;
    });
    ['#linktreeTop', '#footSocial'].forEach((sel) => {
      const a = $(sel);
      if (a) a.href = url;
    });
    $('#brandTag').textContent = content.hero?.eyebrow ? content.hero.eyebrow.split('·')[0].trim() : 'LIVE A/V';
  }

  /* заголовки разделов на странице — из admin-настройки sections.*.label */
  function renderSectionTitles(content) {
    const sections = content.sections || {};
    $$('main section[data-section]').forEach((sec) => {
      const cfg = sections[sec.dataset.section] || {};
      const head = $('[data-title]', sec);
      if (head && cfg.label) head.textContent = cfg.label;
      sec.hidden = cfg.visible === false;
    });
    // не оставляем «дыры» в нумерации 01 / 02 / 03 …
    $$('main section[data-section]:not([hidden])').forEach((sec, i) => {
      const num = $('.band-num', sec);
      if (num) num.textContent = String(i + 1).padStart(2, '0');
    });
  }

  /* --------------------------------------------------------------- hero */
  function renderHero(content) {
    const h = content.hero || {};
    $('#heroEyebrow').textContent = h.eyebrow || '';
    const title = $('#heroTitle');
    title.textContent = h.title || content.meta?.siteName || 'IDTH';
    $('#heroSub').textContent = h.subtitle || '';

    const ctas = [h.ctaPrimary, h.ctaSecondary].filter((c) => c && (c.url || '').trim());
    $('#heroCta').innerHTML = ctas
      .map((c, i) => {
        const external = /^https?:/i.test(c.url);
        const cls = i === 0 ? 'btn btn-solid' : 'btn btn-ghost';
        return `<a class="${cls}" href="${esc(c.url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(
          c.label,
        )}${external ? arrow : ''}</a>`;
      })
      .join('');

    const img = $('#heroImage');
    if (h.image) {
      img.src = h.image;
      img.parentElement.classList.remove('is-empty');
    } else {
      img.parentElement.classList.add('is-empty');
    }

    const marquee = $('#marqueeTrack');
    const text = (h.marquee || '').trim();
    if (!text) {
      $('#marquee').hidden = true;
    } else {
      $('#marquee').hidden = false;
      const cell = `<span class="marquee-cell">${esc(text)}</span>`;
      marquee.innerHTML = cell.repeat(4);
    }
  }

  /* -------------------------------------------------------------- лента */
  const fmtDate = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso || '';
    return d
      .toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })
      .replace('.', '')
      .toUpperCase();
  };

  const placeholder = (post, i) =>
    `<div class="cover cover-ph" data-i="${i % 4}"><span>${esc((post.kind || '').slice(0, 3))}</span><b>${String(i + 1).padStart(
      2,
      '0',
    )}</b></div>`;

  function renderFeed(content) {
    const wrap = $('#feed');
    const posts = (content.posts || []).filter((p) => p.visible !== false);
    const sorted = posts.slice().sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return String(b.date || '').localeCompare(String(a.date || ''));
    });

    $('#feedCount').textContent = sorted.length ? `${sorted.length} записей` : '';

    if (!sorted.length) {
      wrap.innerHTML = '<p class="empty">Записей пока нет — добавьте их в <a href="admin.html">админ-панели</a>.</p>';
      return;
    }

    const kinds = ['Все', ...new Set(sorted.map((p) => p.kind || 'POST'))];
    const filters =
      sorted.length > 3
        ? `<div class="filters" role="tablist">${kinds
            .map(
              (k, i) =>
                `<button class="chip${i === 0 ? ' is-on' : ''}" type="button" role="tab" data-kind="${esc(
                  k,
                )}">${esc(k)}</button>`,
            )
            .join('')}</div>`
        : '';

    const cards = sorted
      .map((p, i) => {
        const cover = p.cover
          ? `<div class="cover"><img src="${esc(p.cover)}" alt="Обложка: ${esc(p.title)}" loading="lazy"></div>`
          : placeholder(p, i);
        const external = /^https?:/i.test(p.url || '');
        return `<article class="card${p.featured ? ' is-featured' : ''}" data-kind="${esc(p.kind || 'POST')}" style="--d:${Math.min(
          i,
          8,
        ) * 60}ms">
          ${cover}
          <div class="card-body">
            <p class="card-meta"><span class="badge">${esc(p.kind || 'POST')}</span><time datetime="${esc(
              p.date,
            )}">${esc(fmtDate(p.date))}</time></p>
            <h3 class="card-title">${esc(p.title)}</h3>
            ${p.body ? `<p class="card-text">${esc(p.body)}</p>` : ''}
            ${
              p.url
                ? `<a class="card-link" href="${esc(p.url)}"${
                    external ? ' target="_blank" rel="noopener noreferrer"' : ''
                  }>${esc(p.urlLabel || 'Открыть')}${external ? arrow : ''}</a>`
                : ''
            }
          </div>
        </article>`;
      })
      .join('');

    wrap.innerHTML = `${filters}<div class="feed-grid">${cards}</div>`;

    $$('.chip', wrap).forEach((chip) =>
      chip.addEventListener('click', () => {
        const kind = chip.dataset.kind;
        $$('.chip', wrap).forEach((c) => c.classList.toggle('is-on', c === chip));
        $$('.card', wrap).forEach((card) => {
          const show = kind === 'Все' || card.dataset.kind === kind;
          card.classList.toggle('is-hidden', !show);
        });
      }),
    );
  }

  /* ------------------------------------------------------- ссылки (grid) */
  const host = (url) => {
    if (!url) return '';
    if (url.startsWith('mailto:')) return url.slice(7);
    if (url.startsWith('tel:')) return url.slice(4);
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url.replace(/^https?:\/\//, '').slice(0, 30);
    }
  };

  function renderLinks(content) {
    const grid = $('#linksGrid');
    const links = (content.links || []).filter((l) => l.visible !== false);
    if (!links.length) {
      grid.innerHTML = '<p class="empty">Ссылки не добавлены.</p>';
      return;
    }
    const groups = new Map();
    links.forEach((l) => {
      const g = l.group || 'Ссылки';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(l);
    });

    grid.innerHTML = Array.from(groups.entries())
      .map(
        ([group, items]) => `<div class="links-group">
          <p class="links-head">${esc(group)}</p>
          <ul class="links-list">
            ${items
              .map(
                (l, i) => `<li style="--d:${i * 40}ms">
              <a class="link-row" href="${esc(l.url || '#')}"${
                  /^https?:/i.test(l.url || '') ? ' target="_blank" rel="noopener noreferrer"' : ''
                }>
                ${icon(l.icon)}
                <span class="link-label">${esc(l.label)}</span>
                <span class="link-host">${esc(host(l.url))}</span>
                ${arrow}
              </a></li>`,
              )
              .join('')}
          </ul>
        </div>`,
      )
      .join('');
  }

  /* ---------------------------------------------------------- о проекте */
  function renderAbout(content) {
    const a = content.about || {};
    $('#aboutText').innerHTML = (a.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join('');
    $('#stats').innerHTML = (a.stats || [])
      .map((s) => `<li><b>${esc(s.value)}</b><span>${esc(s.label)}</span></li>`)
      .join('');
    if (a.image) $('#aboutImage').src = a.image;
    $('#aboutCaption').textContent = content.booking?.city || '';
  }

  /* -------------------------------------------------------------- букинг */
  function renderBooking(content) {
    const b = content.booking || {};
    $('#bookingText').textContent = b.text || '';
    $('#bookingNotes').textContent = b.notes || '';
    const rows = [
      ['Почта', b.email ? `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : '—'],
      ['Базируется', b.city || '—'],
      ['Пресс-кит', content.social?.linktree ? `<a href="${esc(content.social.linktree)}" target="_blank" rel="noopener">скачать ↗</a>` : '—'],
    ];
    $('#bookingDl').innerHTML = rows
      .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`)
      .join('');
  }

  /* --------------------------------------------------------- форма связи */
  function wireForm(content) {
    const form = $('#bookingForm');
    const status = $('#formStatus');
    if (!form) return;
    const mailtoFallback = (data) => {
      const to = (content.booking?.email || '').trim();
      if (!to) return '';
      const body = `${data.message}\n\n— ${data.name}${data.city ? `, ${data.city}` : ''}${
        data.date ? `, ${data.date}` : ''
      }\n${data.email}`;
      return `mailto:${to}?subject=${encodeURIComponent(`Букинг: ${data.name}`)}&body=${encodeURIComponent(body)}`;
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (!form.reportValidity()) return;
      status.textContent = 'Отправляю…';
      status.className = 'form-status';
      $('#bookingSubmit').disabled = true;
      try {
        const res = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Сервер отклонил заявку');
        status.textContent = 'Заявка отправлена — она появится в админке. Отвечу на ' + (data.email || 'вашу почту') + '.';
        status.classList.add('is-ok');
        form.reset();
      } catch (err) {
        const link = mailtoFallback(data);
        status.textContent = link
          ? 'Форма работает через сервер, а он сейчас не запущен — открываю письмо. ' + err.message
          : 'Не удалось отправить: ' + err.message;
        status.classList.add('is-warn');
        if (link) window.location.href = link;
      } finally {
        $('#bookingSubmit').disabled = false;
      }
    });
  }

  /* ------------------------------------------------------ микровзаимодействия */
  function wireInteractions() {
    const head = $('#siteHead');
    const onScroll = () => head.classList.toggle('is-stuck', window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const burger = $('#burger');
    const mobileNav = $('#mobileNav');
    burger.addEventListener('click', () => {
      const open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!open));
      mobileNav.hidden = open;
      head.classList.toggle('nav-open', !open);
    });
    $$('#mobileNavLinks a, #mobileNav .btn').forEach((a) =>
      a.addEventListener('click', () => {
        burger.setAttribute('aria-expanded', 'false');
        mobileNav.hidden = true;
        head.classList.remove('nav-open');
      }),
    );
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !mobileNav.hidden) $('#burger').click();
    });

    // появление блоков при скролле
    const targets = $$('.band, .card, .links-group, .frame');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.06 },
    );
    targets.forEach((el) => io.observe(el));

    // активный пункт меню
    if ('IntersectionObserver' in window) {
      const spy = new IntersectionObserver(
        (entries) =>
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            $$('.nav-link').forEach((l) => l.classList.toggle('is-active', l.dataset.target === entry.target.id));
          }),
        { rootMargin: '-45% 0px -50% 0px' },
      );
      $$('main section[id]').forEach((s) => spy.observe(s));
    }
  }

  /* --------------------------------------------------------------- старт */
  function paint(content) {
    applyTheme(content);
    renderNav(content);
    renderSectionTitles(content);
    renderHero(content);
    renderFeed(content);
    renderLinks(content);
    renderAbout(content);
    renderBooking(content);

    document.title = content.meta?.description
      ? `${content.meta.siteName || 'IDTH'} — ${content.meta.description}`
      : `${content.meta?.siteName || 'IDTH'} — сайт музыканта`;

    $('#footCopy').textContent = `© ${new Date().getFullYear()} ${content.meta?.siteName || 'IDTH'}. Все треки — по ссылкам выше.`;
    document.body.classList.add('is-ready');
  }

  (async function start() {
    const content = await loadContent();
    paint(content);
    wireForm(content);
    wireInteractions();

    // предпросмотр из админки перерисовывается на лету (localStorage → событие storage)
    window.addEventListener('storage', (e) => {
      if (e.key !== DRAFT_KEY) return;
      if (!new URLSearchParams(location.search).has('preview')) return;
      const next = readDraft();
      if (next) paint(next);
    });
  })();
})();
