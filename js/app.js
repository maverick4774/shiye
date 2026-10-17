/* ==========================================================
   拾页 · SHIYE
   A quiet, local-only notebook. No accounts. No tracking.
   ========================================================== */
(function () {
  'use strict';

  const $ = function (selector, root) { return (root || document).querySelector(selector); };
  const $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };
  const DAY = 24 * 60 * 60 * 1000;
  const HOME_ROUTE = '#/';

  const state = {
    screen: 'boot',
    theme: 'light',
    query: '',
    selectMode: false,
    selected: new Set(),
    homeScroll: 0,
    restoreHomeScroll: false,
    focusSearch: false,
    currentNoteId: null,
    draftId: null,
    activeEditor: null,
    confirmCallback: null,
    returningFocus: null
  };

  const els = {
    home: null,
    editor: null,
    modal: null,
    toast: null
  };

  let saveTimer = null;
  let toastTimer = null;
  let isBooting = true;
  let catTimer = null;
  let catBubbleTimer = null;
  let catToken = 0;
  let catLastAction = '';
  let catBubbleNode = null;

  const CAT_ACTIONS = [
    { id: 'blink', className: 'is-blinking', duration: 640, weight: 4 },
    { id: 'look-left', className: 'is-looking-left', duration: 1900, weight: 3, say: '嗯？' },
    { id: 'look-right', className: 'is-looking-right', duration: 1900, weight: 3 },
    { id: 'ear-twitch', className: 'is-ear-twitching', duration: 1000, weight: 3 },
    { id: 'tail-flick', className: 'is-tail-flicking', duration: 1300, weight: 2 },
    { id: 'yawn', className: 'is-yawning', duration: 2300, weight: 1, say: '困了…' },
    { id: 'groom', className: 'is-grooming', duration: 2900, weight: 1, say: '舔毛中' },
    { id: 'sleep', className: 'is-sleeping', duration: 4400, weight: 1, say: '呼…' },
    { id: 'stretch', className: 'is-stretching', duration: 2600, weight: 1, say: '伸个懒腰' }
  ];
  const CAT_ACTION_CLASSES = CAT_ACTIONS.map(function (action) { return action.className; }).concat(['is-petted', 'is-happy']);

  /* ---------- tiny helpers ---------- */

  function icon(name, className) {
    return '<svg class="' + (className || '') + '" aria-hidden="true" focusable="false"><use href="#i-' + name + '"></use></svg>';
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function noteIdFromHash() {
    if (location.hash.indexOf('#/note/') !== 0) return null;
    try { return decodeURIComponent(location.hash.slice('#/note/'.length)); }
    catch (err) { return null; }
  }

  function noteHash(noteId) {
    return '#/note/' + encodeURIComponent(noteId);
  }

  function formatToday() {
    const date = new Date();
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return (date.getMonth() + 1) + '月' + date.getDate() + '日 · ' + weekdays[date.getDay()];
  }

  function greetingForNow() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 10) return '早上好';
    if (hour >= 10 && hour < 12) return '上午好';
    if (hour >= 12 && hour < 14) return '午安';
    if (hour >= 14 && hour < 18) return '下午好';
    if (hour >= 18 && hour < 23) return '晚上好';
    return '夜深了';
  }

  function clockText(timestamp) {
    const date = new Date(timestamp);
    return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  }

  function sameDay(a, b) {
    const left = new Date(a);
    const right = new Date(b);
    return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
  }

  function relativeTime(timestamp) {
    const now = Date.now();
    const diff = Math.max(0, now - timestamp);
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return Math.max(1, Math.floor(diff / 60000)) + ' 分钟前';
    if (sameDay(timestamp, now)) return '今天 ' + clockText(timestamp);
    if (sameDay(timestamp, now - DAY)) return '昨天';
    if (diff < 7 * DAY) return Math.floor(diff / DAY) + ' 天前';
    const date = new Date(timestamp);
    if (date.getFullYear() === new Date().getFullYear()) {
      return (date.getMonth() + 1) + '月' + date.getDate() + '日';
    }
    return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日';
  }

  function fullDate(timestamp) {
    const date = new Date(timestamp);
    return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日';
  }

  function countChars(text) {
    return String(text || '').replace(/\s+/g, '').length;
  }

  function setTheme(theme, save) {
    state.theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', state.theme === 'dark' ? '#151914' : '#f3efe5');
    if (save) Store.setTheme(state.theme);
    /* Keep the native Android system bars in step with the paper/ink theme. */
    try {
      if (window.AndroidHost && typeof window.AndroidHost.setTheme === 'function') {
        window.AndroidHost.setTheme(state.theme);
      }
    } catch (err) { /* browser preview has no native bridge */ }
  }

  function updateThemeButton() {
    const button = $('[data-action="toggle-theme"]', els.home);
    if (!button) return;
    const isDark = state.theme === 'dark';
    button.innerHTML = icon(isDark ? 'sun' : 'moon');
    button.setAttribute('aria-label', isDark ? '切换到纸白外观' : '切换到夜墨外观');
    button.setAttribute('title', isDark ? '纸白外观' : '夜墨外观');
  }

  function brandHTML() {
    return '<div class="brand">' +
      '<span class="brand-mark">' + icon('book') + '</span>' +
      '<span class="brand-words"><strong>拾页</strong><span>SHIYE · NOTES</span></span>' +
      '</div>';
  }

  function showToast(message, kind) {
    if (!els.toast) return;
    els.toast.innerHTML = '';
    const toast = document.createElement('div');
    toast.className = 'toast' + (kind === 'success' ? ' success' : '');
    toast.innerHTML = icon(kind === 'success' ? 'check' : 'spark', 'toast-spark') + '<span>' + escapeHTML(message) + '</span>';
    els.toast.appendChild(toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.add('leaving');
      setTimeout(function () { if (toast.parentNode) toast.remove(); }, 260);
    }, 2600);
  }

  /* ---------- safe rich text ---------- */

  const ALLOWED_TAGS = {
    P: true, DIV: true, BR: true, STRONG: true, B: true, EM: true, I: true,
    U: true, S: true, STRIKE: true, MARK: true, UL: true, OL: true, LI: true,
    BLOCKQUOTE: true, HR: true, H2: true, H3: true, H4: true
  };
  const VOID_TAGS = { BR: true, HR: true };

  function safeBackground(value) {
    if (!value) return false;
    return /^(rgba?|hsla?)\([\d\s.,%/]+\)$/i.test(value) ||
      /^#[0-9a-f]{3,8}$/i.test(value) ||
      /^[a-z]+$/i.test(value);
  }

  function convertHighlights(root) {
    $$('span[style]', root).forEach(function (span) {
      if (span.style && span.style.backgroundColor) {
        const mark = document.createElement('mark');
        while (span.firstChild) mark.appendChild(span.firstChild);
        span.replaceWith(mark);
      } else {
        const fragment = document.createDocumentFragment();
        while (span.firstChild) fragment.appendChild(span.firstChild);
        span.replaceWith(fragment);
      }
    });
  }

  function sanitizeHTML(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');

    function clean(node) {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const tag = node.tagName.toUpperCase();
      if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED)$/.test(tag)) return null;

      if (tag === 'SPAN') {
        const bg = node.style && node.style.backgroundColor;
        const replacement = document.createElement(safeBackground(bg) ? 'mark' : 'span');
        node.childNodes.forEach(function (child) {
          const cleanChild = clean(child);
          if (cleanChild) replacement.appendChild(cleanChild);
        });
        if (replacement.tagName === 'SPAN') {
          const fragment = document.createDocumentFragment();
          while (replacement.firstChild) fragment.appendChild(replacement.firstChild);
          return fragment;
        }
        return replacement;
      }

      if (!ALLOWED_TAGS[tag]) {
        const fragment = document.createDocumentFragment();
        node.childNodes.forEach(function (child) {
          const cleanChild = clean(child);
          if (cleanChild) fragment.appendChild(cleanChild);
        });
        return fragment;
      }

      const element = document.createElement(tag.toLowerCase());
      if (!VOID_TAGS[tag]) {
        node.childNodes.forEach(function (child) {
          const cleanChild = clean(child);
          if (cleanChild) element.appendChild(cleanChild);
        });
      }
      return element;
    }

    const fragment = document.createDocumentFragment();
    Array.prototype.forEach.call(template.content.childNodes, function (node) {
      const cleanNode = clean(node);
      if (cleanNode) fragment.appendChild(cleanNode);
    });
    const wrapper = document.createElement('div');
    wrapper.appendChild(fragment);
    return wrapper.innerHTML;
  }

  function plainTextFromHTML(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    let out = '';
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) { out += node.nodeValue; return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toUpperCase();
      if (tag === 'SCRIPT' || tag === 'STYLE') return;
      if (tag === 'BR') { out += ' '; return; }
      const isBlock = /^(P|DIV|LI|BLOCKQUOTE|H2|H3|H4|UL|OL|HR)$/.test(tag);
      if (isBlock) out += ' ';
      node.childNodes.forEach(walk);
      if (isBlock) out += ' ';
    }
    Array.prototype.forEach.call(template.content.childNodes, walk);
    return out.replace(/\s+/g, ' ').trim();
  }

  function normalizeSearchTerms(query) {
    return String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  function matchesTerms(text, terms) {
    if (!terms.length) return true;
    const lower = String(text || '').toLowerCase();
    return terms.every(function (term) { return lower.indexOf(term) !== -1; });
  }

  function highlightText(text, terms) {
    const source = String(text == null ? '' : text);
    if (!terms || !terms.length) return escapeHTML(source);
    let pattern;
    try {
      pattern = new RegExp(terms.slice().sort(function (a, b) { return b.length - a.length; }).map(escapeRegExp).join('|'), 'gi');
    } catch (err) {
      return escapeHTML(source);
    }
    let out = '';
    let last = 0;
    source.replace(pattern, function (match, offset) {
      out += escapeHTML(source.slice(last, offset)) + '<mark>' + escapeHTML(match) + '</mark>';
      last = offset + match.length;
      return match;
    });
    out += escapeHTML(source.slice(last));
    return out;
  }

  function excerptOf(plain, terms) {
    if (!plain) return '';
    if (plain.length <= 96) return plain;
    let first = -1;
    const lower = plain.toLowerCase();
    (terms || []).forEach(function (term) {
      const index = lower.indexOf(term);
      if (index >= 0 && (first < 0 || index < first)) first = index;
    });
    let start = 0;
    if (first > 62) start = Math.max(0, first - 28);
    let end = Math.min(plain.length, start + 96);
    let excerpt = plain.slice(start, end);
    if (start > 0) excerpt = '…' + excerpt;
    if (end < plain.length) excerpt += '…';
    return excerpt;
  }

  /* ==========================================================
     home
     ========================================================== */

  function filteredNotes() {
    const terms = normalizeSearchTerms(state.query);
    return Store.notes().filter(function (note) {
      if (!terms.length) return true;
      return matchesTerms(note.title + ' ' + plainTextFromHTML(note.html), terms);
    });
  }

  function topbarHTML(noteCount) {
    if (state.selectMode) {
      return '<header class="topbar">' + brandHTML() +
        '<div class="topbar-actions"><button type="button" class="cancel-mode" data-action="exit-select">取消</button></div>' +
      '</header>';
    }
    const disabled = noteCount === 0 ? ' disabled' : '';
    return '<header class="topbar">' + brandHTML() +
      '<div class="topbar-actions">' +
        '<button type="button" class="icon-btn theme-btn" data-action="toggle-theme" aria-label="' + (state.theme === 'dark' ? '切换到纸白外观' : '切换到夜墨外观') + '" title="' + (state.theme === 'dark' ? '纸白外观' : '夜墨外观') + '">' + icon(state.theme === 'dark' ? 'sun' : 'moon') + '</button>' +
        '<button type="button" class="icon-btn is-primary" data-action="add-note" aria-label="写一页新的笔记">' + icon('plus') + '</button>' +
        '<button type="button" class="icon-btn" data-action="enter-select" aria-label="选择并删除笔记"' + disabled + '>' + icon('trash') + '</button>' +
      '</div>' +
    '</header>';
  }

  function catPetHTML() {
    return '<button type="button" class="cat-pet" id="catPet" data-action="pet-cat" aria-label="摸摸这只狸花猫" title="摸摸它">' +
      '<span class="cat-bubble" id="catBubble" aria-hidden="true"></span>' +
      '<span class="cat-stage" aria-hidden="true">' +
        '<span class="cat-visual">' +
          '<img class="cat-img cat-img--base" src="assets/tabby-cat-base.png" alt="" draggable="false" width="764" height="1000" decoding="async">' +
          '<img class="cat-img cat-img--tail" src="assets/tabby-cat-tail.png" alt="" draggable="false" width="764" height="1000" decoding="async">' +
          '<img class="cat-img cat-img--blink" src="assets/tabby-cat-blink.png" alt="" draggable="false" width="764" height="1000" decoding="async">' +
        '</span>' +
        '<span class="cat-zzz"><i>z</i><i>z</i><i>z</i></span>' +
        '<span class="cat-hearts"><i>♥</i><i>♥</i><i>♥</i></span>' +
      '</span>' +
      '<span class="cat-caption" aria-hidden="true">A PAGE A DAY</span>' +
    '</button>';
  }

  function welcomeHTML(noteCount) {
    const sub = noteCount
      ? '翻一翻，或者写下一页新的。'
      : '本子还空着。写下第一件想记住的事吧。';
    return '<section class="welcome">' +
      '<div class="welcome-copy">' +
        '<div class="eyebrow"><span class="dot"></span>' + escapeHTML(formatToday()) + '</div>' +
        '<h1>' + greetingForNow() + '。</h1>' +
        '<p class="welcome-sub">' + sub + '</p>' +
      '</div>' +
      catPetHTML() +
    '</section>';
  }

  /* ---------- the little tabby ---------- */

  function showCatBubble(text, duration) {
    const node = $('#catBubble', els.home);
    if (!node) return;
    clearTimeout(catBubbleTimer);
    node.textContent = text || '';
    node.classList.toggle('is-visible', !!text);
    if (text) {
      catBubbleTimer = setTimeout(function () {
        if (node) node.classList.remove('is-visible');
      }, duration || 1800);
    }
  }

  function clearCatClasses(node) {
    if (!node) return;
    CAT_ACTION_CLASSES.forEach(function (className) { node.classList.remove(className); });
  }

  function stopCatPet() {
    catToken += 1;
    clearTimeout(catTimer);
    catTimer = null;
    clearTimeout(catBubbleTimer);
    catBubbleNode = null;
  }

  function scheduleCatAction(token, delay) {
    clearTimeout(catTimer);
    catTimer = setTimeout(function () {
      performCatAction(token);
    }, delay);
  }

  function performCatAction(token) {
    if (token !== catToken || state.screen !== 'home' || document.hidden) return;
    const node = $('#catPet', els.home);
    if (!node) return;

    const pool = [];
    CAT_ACTIONS.forEach(function (action) {
      if (action.id === catLastAction) return;
      for (let i = 0; i < action.weight; i++) pool.push(action);
    });
    const action = pool[Math.floor(Math.random() * pool.length)] || CAT_ACTIONS[0];
    catLastAction = action.id;
    clearCatClasses(node);
    node.classList.add(action.className);
    if (action.say) showCatBubble(action.say, action.duration - 250);

    catTimer = setTimeout(function () {
      if (token !== catToken) return;
      const current = $('#catPet', els.home);
      if (current) clearCatClasses(current);
      scheduleCatAction(token, 2100 + Math.random() * 2300);
    }, action.duration);
  }

  function startCatPet() {
    stopCatPet();
    if (state.screen !== 'home' || document.hidden) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const token = catToken;
    const node = $('#catPet', els.home);
    if (!node) return;
    clearCatClasses(node);
    showCatBubble('', 0);
    scheduleCatAction(token, 2600 + Math.random() * 1900);
  }

  function petCat() {
    if (state.screen !== 'home') return;
    const node = $('#catPet', els.home);
    if (!node) return;
    clearTimeout(catTimer);
    catToken += 1;
    const token = catToken;
    clearCatClasses(node);
    void node.offsetWidth;
    node.classList.add('is-petted', 'is-happy');
    showCatBubble(['呼噜呼噜…', '喵～', '再摸一下', '喜欢！'][Math.floor(Math.random() * 4)], 1700);
    catTimer = setTimeout(function () {
      if (token !== catToken) return;
      const current = $('#catPet', els.home);
      if (current) clearCatClasses(current);
      showCatBubble('', 0);
      scheduleCatAction(token, 1600 + Math.random() * 2000);
    }, 1750);
  }

  function noteCardHTML(note, index, terms) {
    const plain = plainTextFromHTML(note.html);
    const title = note.title || '无标题的一页';
    const excerpt = excerptOf(plain, terms) || '点开这一页，写下第一行。';
    const chars = countChars(plain);
    const selected = state.selected.has(note.id);
    return '<article class="note-card' + (state.selectMode ? ' is-selectable' : '') + (selected ? ' is-selected' : '') + '" style="--i:' + Math.min(index, 10) + '" data-note-id="' + escapeHTML(note.id) + '" ' +
      (state.selectMode ? 'role="checkbox" aria-checked="' + selected + '"' : 'role="button"') +
      ' tabindex="0" aria-label="' + (state.selectMode ? '选择：' : '打开笔记：') + escapeHTML(title) + '">' +
      (state.selectMode ? '<span class="note-select" aria-hidden="true">' + icon('check') + '</span>' : '') +
      '<div class="note-main">' +
        '<h3 class="note-title">' + highlightText(title, terms) + '</h3>' +
        '<p class="note-excerpt' + (plain ? '' : ' is-placeholder') + '">' + highlightText(excerpt, terms) + '</p>' +
        '<div class="note-meta">' +
          '<span>' + escapeHTML(relativeTime(note.updatedAt)) + '</span>' +
          '<span class="sep"></span>' +
          '<span>' + chars + ' 字</span>' +
        '</div>' +
      '</div>' +
      '<span class="note-arrow" aria-hidden="true">' + icon('chevron-right') + '</span>' +
    '</article>';
  }

  function emptyArtHTML() {
    return '<div class="empty-art" aria-hidden="true"><span class="empty-glow"></span>' +
      '<svg viewBox="0 0 154 126" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="116" cy="26" r="17" fill="var(--accent-wash)" stroke="var(--accent)" stroke-opacity=".38" stroke-width="1"/>' +
        '<path d="M36 103c14-4 28-3 40 3 12-6 26-7 40-3V44c-14-4-28-3-40 3-12-6-26-7-40-3v59Z" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="1.2"/>' +
        '<path d="M76 47v59" stroke="var(--line-strong)" stroke-width="1.2"/>' +
        '<path d="M46 62h20M46 74h20M46 86h12M88 62h20M88 74h13" stroke="var(--ink-faint)" stroke-width="1.5" stroke-linecap="round" opacity=".72"/>' +
        '<path d="M90 86c8-1 14 2 18 9-9 2-16 0-21-6" fill="var(--green-soft)" stroke="var(--green)" stroke-opacity=".5" stroke-width="1"/>' +
        '<path d="M27 50c-7-5-10-11-9-18 7 1 12 5 15 12M126 76c6 3 9 8 9 14-7-1-11-4-13-10" stroke="var(--accent)" stroke-opacity=".44" stroke-width="1.1" stroke-linecap="round"/>' +
        '<path d="M22 110h110" stroke="var(--line)" stroke-width="1" stroke-linecap="round"/>' +
      '</svg></div>';
  }

  function noNotesHTML() {
    return '<div class="empty-state">' +
      emptyArtHTML() +
      '<h3>第一页，等你落笔</h3>' +
      '<p>写下一个单词、一段古文，或一句今天想记住的话。合上之前，它就有了位置。</p>' +
      '<button type="button" class="btn btn-accent" data-action="add-note">' + icon('plus') + '写下第一篇</button>' +
    '</div>';
  }

  function noResultsHTML() {
    return '<div class="empty-state">' +
      '<div class="empty-search-mark">' + icon('search') + '</div>' +
      '<h3>没有找到这一页</h3>' +
      '<p>换个关键词试试。标题和正文，都会一起被找一遍。</p>' +
      '<button type="button" class="btn btn-soft" data-action="clear-search">' + icon('x') + '清空搜索</button>' +
    '</div>';
  }

  function searchSummaryHTML(count) {
    if (!state.query.trim()) return '';
    return '<div class="search-summary"><span>“' + escapeHTML(state.query.trim()) + '”</span> · 找到 ' + count + ' 篇' +
      '<button type="button" data-action="clear-search">清除</button></div>';
  }

  function listRegionHTML(options) {
    options = options || {};
    const notes = filteredNotes();
    const terms = options.terms || normalizeSearchTerms(state.query);
    const query = state.query.trim();
    let html = searchSummaryHTML(notes.length);

    if (!notes.length) {
      html += query ? noResultsHTML() : noNotesHTML();
      return html;
    }

    html += '<div class="note-list' + (options.instant ? ' instant' : '') + '">' +
      notes.map(function (note, index) { return noteCardHTML(note, index, terms); }).join('') +
    '</div>';
    return html;
  }

  function bulkBarHTML() {
    const count = state.selected.size;
    const visible = filteredNotes();
    return '<div class="bulk-bar" role="region" aria-label="批量删除">' +
      '<div class="bulk-summary"><span class="count-badge">' + count + '</span>已选择</div>' +
      '<div class="bulk-actions">' +
        '<button type="button" class="text-btn" data-action="select-all">' + (count === visible.length && count ? '取消全选' : '全选') + '</button>' +
        '<button type="button" class="bulk-delete" data-action="bulk-delete"' + (count ? '' : ' disabled') + '>' + icon('trash') + '删除' + (count ? ' ' + count + ' 篇' : '') + '</button>' +
      '</div>' +
    '</div>';
  }

  function homeHTML() {
    const notes = Store.notes();
    const hasQuery = !!state.query.trim();
    return '<div class="home-frame">' +
      topbarHTML(notes.length) +
      '<div class="search-box" role="search">' +
        icon('search') +
        '<input id="searchInput" type="search" autocomplete="off" spellcheck="false" enterkeyhint="search" placeholder="搜索标题或正文…" aria-label="搜索笔记" value="' + escapeHTML(state.query) + '"' + (state.selectMode ? ' disabled' : '') + '>' +
        '<button type="button" class="search-clear' + (state.query ? ' visible' : '') + '" data-action="clear-search" aria-label="清空搜索">' + icon('x') + '</button>' +
      '</div>' +
      welcomeHTML(notes.length) +
      '<section class="notes-section" aria-label="笔记列表">' +
        '<div class="list-head">' +
          '<div class="list-heading"><h2 id="listHeading">' + (hasQuery ? '搜索结果' : '我的笔记') + '</h2><span class="count" id="visibleCount">' + filteredNotes().length + '</span></div>' +
          '<span class="list-sort">' + (hasQuery ? '标题与正文' : '按最近编辑') + '</span>' +
        '</div>' +
        '<div id="list-region">' + listRegionHTML({ terms: normalizeSearchTerms(state.query) }) + '</div>' +
      '</section>' +
      (state.selectMode ? bulkBarHTML() : '') +
    '</div>';
  }

  function bindHomeEvents() {
    const input = $('#searchInput', els.home);
    if (!input) return;
    input.addEventListener('input', function () {
      state.query = input.value;
      refreshHomeList();
    });
    input.addEventListener('search', function () {
      state.query = input.value;
      refreshHomeList();
    });
  }

  function renderHome(options) {
    options = options || {};
    state.screen = 'home';
    els.home.hidden = false;
    els.editor.hidden = true;
    document.body.classList.remove('modal-open');
    document.body.classList.toggle('select-mode', state.selectMode);
    document.title = '拾页 · 我的背诵笔记本';

    els.home.innerHTML = homeHTML();
    bindHomeEvents();
    startCatPet();

    if (state.focusSearch) {
      state.focusSearch = false;
      requestAnimationFrame(function () {
        const input = $('#searchInput', els.home);
        if (input) {
          input.focus();
          const len = input.value.length;
          try { input.setSelectionRange(len, len); } catch (err) { /* ignore */ }
        }
      });
    }

    if (options.scrollTop) {
      window.scrollTo(0, 0);
    } else if (state.restoreHomeScroll) {
      window.scrollTo(0, state.homeScroll);
      state.restoreHomeScroll = false;
    }
  }

  function refreshHomeList() {
    const region = $('#list-region', els.home);
    if (region) region.innerHTML = listRegionHTML({ instant: true });
    const count = $('#visibleCount');
    if (count) count.textContent = filteredNotes().length;
    const heading = $('#listHeading');
    if (heading) heading.textContent = state.query.trim() ? '搜索结果' : '我的笔记';
    const sort = $('.list-sort', els.home);
    if (sort) sort.textContent = state.query.trim() ? '标题与正文' : '按最近编辑';
    const clear = $('.search-clear', els.home);
    if (clear) clear.classList.toggle('visible', !!state.query);
    const searchInput = $('#searchInput', els.home);
    if (searchInput && searchInput.value !== state.query) searchInput.value = state.query;
  }

  function toggleTheme() {
    setTheme(state.theme === 'dark' ? 'light' : 'dark', true);
    updateThemeButton();
  }

  function setSelectMode(enabled) {
    state.selectMode = enabled;
    state.selected.clear();
    document.body.classList.remove('modal-open');
    renderHome({ scrollTop: false });
  }

  function updateSelectionUI() {
    $$('.note-card', els.home).forEach(function (card) {
      const selected = state.selected.has(card.dataset.noteId);
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-checked', String(selected));
    });
    const bar = $('.bulk-bar', els.home);
    if (bar) {
      const holder = document.createElement('div');
      holder.innerHTML = bulkBarHTML();
      bar.replaceWith(holder.firstElementChild);
    }
  }

  function activateNote(noteId) {
    if (!noteId) return;
    if (state.selectMode) {
      if (state.selected.has(noteId)) state.selected.delete(noteId);
      else state.selected.add(noteId);
      updateSelectionUI();
      return;
    }
    flushActiveEditor({ cleanupDraft: true, silent: true });
    state.homeScroll = window.scrollY;
    state.currentNoteId = noteId;
    history.pushState({ appScreen: 'note', from: 'home' }, '', noteHash(noteId));
    showEditorView(noteId);
  }

  function addNote() {
    if (state.selectMode) return;
    flushActiveEditor({ cleanupDraft: true, silent: true });
    state.query = '';
    state.homeScroll = window.scrollY;
    const note = Store.addNote();
    state.draftId = note.id;
    state.currentNoteId = note.id;
    history.pushState({ appScreen: 'note', from: 'home' }, '', noteHash(note.id));
    showEditorView(note.id, { isNew: true });
  }

  function openBulkDeleteConfirm() {
    if (!state.selected.size) return;
    const count = state.selected.size;
    openConfirm({
      title: '把选中的 ' + count + ' 篇删掉？',
      message: '删除后无法恢复。如果还有想留的内容，可以先取消。',
      confirmText: '确认删除',
      onConfirm: function () {
        const removed = Store.deleteNotes(Array.from(state.selected));
        state.selected.clear();
        state.selectMode = false;
        document.body.classList.remove('select-mode');
        renderHome({ scrollTop: false });
        showToast('已删除 ' + removed + ' 篇笔记');
      }
    });
  }

  /* ==========================================================
     editor
     ========================================================== */

  function editorHTML(note) {
    const plain = plainTextFromHTML(note.html);
    return '<div class="editor-frame">' +
      '<header class="editor-bar">' +
        '<button type="button" class="icon-btn back" data-action="editor-back" aria-label="回到笔记列表">' + icon('arrow-left') + '</button>' +
        '<div class="save-indicator" id="saveIndicator"><span class="save-dot"></span><span class="save-text">' + (note.title || plain ? '已保存在本机' : '新的空白页') + '</span></div>' +
        '<div class="editor-actions">' +
          '<button type="button" class="icon-btn" data-action="delete-note" aria-label="删除这一页">' + icon('trash') + '</button>' +
        '</div>' +
      '</header>' +
      '<article class="paper" aria-label="笔记编辑页">' +
        '<h1 class="note-title-input" id="noteTitle" contenteditable="true" spellcheck="false" role="textbox" aria-multiline="false" aria-label="笔记标题" data-placeholder="给这一页起个名字"></h1>' +
        '<div class="paper-meta">' +
          '<span class="meta-text"><span id="noteDate">' + escapeHTML(fullDate(note.updatedAt)) + '</span><span class="sep"></span><span id="charCount">' + countChars(plain) + ' 字</span></span>' +
        '</div>' +
        '<div class="title-rule" aria-hidden="true"></div>' +
        '<div class="paper-body" id="noteBody" contenteditable="true" spellcheck="false" role="textbox" aria-multiline="true" aria-label="笔记正文" data-placeholder="从这里开始，写下你要记住的内容……"></div>' +
        '<div class="paper-foot"><span>自动保存在本机 · 只自己可见</span><span class="foot-mark">SHIYE · PRIVATE PAGE</span></div>' +
      '</article>' +
    '</div>' +
    '<div class="editor-backdrop-note" aria-hidden="true"></div>' +
    '<div class="format-dock" role="toolbar" aria-label="文字格式">' +
      '<button type="button" class="format-btn" data-action="format" data-format="bold" aria-label="加粗"><span class="fmt-letter">B</span></button>' +
      '<button type="button" class="format-btn" data-action="format" data-format="italic" aria-label="斜体"><span class="fmt-letter italic">I</span></button>' +
      '<button type="button" class="format-btn" data-action="format" data-format="underline" aria-label="下划线"><span class="fmt-letter under">U</span></button>' +
      '<button type="button" class="format-btn mark-btn" data-action="format" data-format="highlight" aria-label="高亮"><span class="fmt-mark">A</span></button>' +
      '<span class="format-sep" aria-hidden="true"></span>' +
      '<button type="button" class="format-btn" data-action="format" data-format="bullet" aria-label="无序列表">' + icon('list') + '</button>' +
      '<button type="button" class="format-btn" data-action="format" data-format="quote" aria-label="引用">' + icon('quote') + '</button>' +
      '<button type="button" class="format-btn" data-action="format" data-format="clear" aria-label="清除格式">' + icon('eraser') + '</button>' +
      '<span class="save-mini">LOCAL</span>' +
    '</div>';
  }

  function showEditorView(noteId, options) {
    options = options || {};
    stopCatPet();
    const note = Store.note(noteId);
    if (!note) {
      history.replaceState({ appScreen: 'home' }, '', HOME_ROUTE);
      showHome();
      return;
    }
    closeConfirm();
    state.screen = 'editor';
    state.currentNoteId = noteId;
    els.home.hidden = true;
    els.editor.hidden = false;
    els.editor.innerHTML = editorHTML(note);
    document.title = (note.title ? note.title + ' · ' : '') + '拾页';

    const title = $('#noteTitle', els.editor);
    const body = $('#noteBody', els.editor);
    title.textContent = note.title || '';
    body.innerHTML = sanitizeHTML(note.html);

    const runtime = { noteId: noteId, titleEl: title, bodyEl: body, dirty: false };
    state.activeEditor = runtime;
    syncEmptyState(runtime);
    updateCharCount(runtime);
    bindEditorEvents(runtime);

    if (options.isNew) {
      setTimeout(function () {
        if (state.screen !== 'editor' || !state.activeEditor) return;
        const heading = $('#noteTitle', els.editor);
        if (!heading) return;
        heading.focus();
        placeCaretAtEnd(heading);
      }, 260);
    }
  }

  function syncEmptyState(runtime) {
    if (!runtime) return;
    const titleText = (runtime.titleEl.innerText || '').trim();
    const bodyText = (runtime.bodyEl.innerText || '').trim();
    runtime.titleEl.classList.toggle('is-empty', !titleText);
    runtime.bodyEl.classList.toggle('is-empty', !bodyText);
  }

  function updateCharCount(runtime) {
    runtime = runtime || state.activeEditor;
    if (!runtime) return;
    const count = $('#charCount', els.editor);
    if (count) count.textContent = countChars(runtime.bodyEl.innerText) + ' 字';
  }

  function setSaveLabel(kind, text) {
    const label = $('.save-indicator', els.editor);
    if (!label) return;
    label.classList.remove('saving', 'error');
    if (kind === 'saving') label.classList.add('saving');
    if (kind === 'error') label.classList.add('error');
    const copy = $('.save-text', label);
    if (copy) copy.textContent = text;
  }

  function captureEditor(runtime) {
    runtime = runtime || state.activeEditor;
    if (!runtime) return null;
    convertHighlights(runtime.bodyEl);
    const title = (runtime.titleEl.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const text = (runtime.bodyEl.innerText || '').trim();
    const html = text ? sanitizeHTML(runtime.bodyEl.innerHTML) : '';
    return { title: title, html: html, text: text };
  }

  function markSaving(runtime) {
    if (!runtime) runtime = state.activeEditor;
    if (!runtime) return;
    runtime.dirty = true;
    setSaveLabel('saving', '正在保存…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { persistEditor(true); }, 450);
  }

  function persistEditor(announce) {
    if (!state.activeEditor) return null;
    clearTimeout(saveTimer);
    saveTimer = null;
    const runtime = state.activeEditor;
    const captured = captureEditor(runtime);
    if (!captured) return null;
    const note = Store.updateNote(runtime.noteId, { title: captured.title, html: captured.html });
    runtime.dirty = false;
    state.currentNoteId = runtime.noteId;
    if (note) {
      if (runtime.noteId === state.draftId && (captured.title || captured.text)) {
        state.draftId = null;
      }
      const dateLabel = $('#noteDate', els.editor);
      if (dateLabel) dateLabel.textContent = fullDate(note.updatedAt);
    }
    if (announce) setSaveLabel('saved', '已保存 · ' + clockText(Date.now()));
    return { captured: captured, note: note };
  }

  function bindEditorEvents(runtime) {
    function onEditorInput() {
      syncEmptyState(runtime);
      updateCharCount(runtime);
      markSaving(runtime);
    }
    runtime.titleEl.addEventListener('input', onEditorInput);
    runtime.bodyEl.addEventListener('input', onEditorInput);

    runtime.titleEl.addEventListener('paste', function (event) {
      event.preventDefault();
      const text = (event.clipboardData || window.clipboardData).getData('text/plain').replace(/\s+/g, ' ');
      document.execCommand('insertText', false, text);
    });
    runtime.bodyEl.addEventListener('paste', function (event) {
      event.preventDefault();
      const text = (event.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
    runtime.titleEl.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        runtime.bodyEl.focus();
        placeCaretAtEnd(runtime.bodyEl);
      }
    });
    $$('.format-btn', els.editor).forEach(function (button) {
      button.addEventListener('mousedown', function (event) { event.preventDefault(); });
    });
  }

  function placeCaretAtEnd(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function flushActiveEditor(options) {
    options = options || {};
    if (!state.activeEditor) return null;
    const runtime = state.activeEditor;
    clearTimeout(saveTimer);
    const result = persistEditor(false);
    if (options.cleanupDraft !== false && state.draftId === runtime.noteId) {
      const captured = result && result.captured;
      if (!captured || (!captured.title && !captured.text)) {
        Store.deleteNote(runtime.noteId);
        state.draftId = null;
        if (!options.silent) showToast('空白的一页已经收起来了');
      }
    }
    state.activeEditor = null;
    clearTimeout(saveTimer);
    saveTimer = null;
    return result;
  }

  function goBackFromEditor() {
    if (!state.activeEditor) return;
    flushActiveEditor({ cleanupDraft: true, silent: false });
    state.draftId = null;
    const navState = history.state || {};
    if (navState.appScreen === 'note' && navState.from === 'home') {
      history.back();
    } else {
      history.replaceState({ appScreen: 'home' }, '', HOME_ROUTE);
      state.restoreHomeScroll = true;
      showHome();
    }
  }

  function deleteCurrentNote() {
    if (!state.currentNoteId) return;
    const note = Store.note(state.currentNoteId);
    if (!note) return;
    openConfirm({
      title: '把「' + (note.title || '无标题的一页') + '」删掉？',
      message: '删除后无法恢复。如果还有想留的内容，可以先返回。',
      confirmText: '删除这一页',
      onConfirm: function () {
        clearTimeout(saveTimer);
        state.activeEditor = null;
        Store.deleteNote(state.currentNoteId);
        state.currentNoteId = null;
        state.draftId = null;
        history.replaceState({ appScreen: 'home' }, '', HOME_ROUTE);
        state.restoreHomeScroll = true;
        showHome();
        showToast('这一页已经删掉了');
      }
    });
  }

  /* ==========================================================
     formatting
     ========================================================== */

  function applyFormat(format) {
    if (!state.activeEditor) return;
    const body = state.activeEditor.bodyEl;
    if (!body) return;
    body.focus();
    try {
      if (format === 'bold') document.execCommand('bold', false);
      else if (format === 'italic') document.execCommand('italic', false);
      else if (format === 'underline') document.execCommand('underline', false);
      else if (format === 'bullet') document.execCommand('insertUnorderedList', false);
      else if (format === 'highlight') document.execCommand('hiliteColor', false, 'rgba(222, 178, 92, .42)');
      else if (format === 'quote') {
        const current = document.queryCommandValue('formatBlock');
        document.execCommand('formatBlock', false, String(current).toLowerCase() === 'blockquote' ? 'p' : 'blockquote');
      } else if (format === 'clear') {
        document.execCommand('removeFormat', false);
        document.execCommand('formatBlock', false, 'p');
      }
    } catch (err) { /* some older WebViews can be picky */ }
    convertHighlights(body);
    syncEmptyState(state.activeEditor);
    updateCharCount(state.activeEditor);
    markSaving(state.activeEditor);
  }

  /* ==========================================================
     confirm modal
     ========================================================== */

  function openConfirm(options) {
    closeConfirm();
    state.confirmCallback = options.onConfirm;
    state.returningFocus = document.activeElement;
    els.modal.innerHTML = '<div class="modal-overlay" id="modalOverlay" role="presentation">' +
      '<div class="confirm-card" tabindex="-1" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle" aria-describedby="confirmDesc">' +
        '<div class="confirm-icon">' + icon('trash') + '</div>' +
        '<h3 id="confirmTitle">' + escapeHTML(options.title) + '</h3>' +
        '<p id="confirmDesc">' + escapeHTML(options.message) + '</p>' +
        '<div class="confirm-actions">' +
          '<button type="button" class="btn btn-soft" data-action="modal-cancel">再想想</button>' +
          '<button type="button" class="btn btn-danger" data-action="modal-confirm">' + escapeHTML(options.confirmText || '确认删除') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
    document.body.classList.add('modal-open');
    const overlay = $('#modalOverlay');
    if (overlay) {
      overlay.addEventListener('mousedown', function (event) {
        if (event.target === overlay) closeConfirm();
      });
    }
    requestAnimationFrame(function () {
      const card = $('.confirm-card', els.modal);
      if (card) card.focus({ preventScroll: true });
    });
  }

  function closeConfirm() {
    if (!els.modal || !els.modal.innerHTML) return;
    els.modal.innerHTML = '';
    state.confirmCallback = null;
    document.body.classList.remove('modal-open');
    if (state.returningFocus && document.contains(state.returningFocus)) {
      try { state.returningFocus.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
    }
    state.returningFocus = null;
  }

  /* ==========================================================
     routing, actions, boot
     ========================================================== */

  function showHome() {
    closeConfirm();
    state.screen = 'home';
    state.currentNoteId = null;
    renderHome();
  }

  function handlePopState() {
    if (state.screen === 'editor') {
      const targetId = noteIdFromHash();
      if (state.activeEditor && state.activeEditor.noteId === targetId) return;
      flushActiveEditor({ cleanupDraft: true, silent: false });
      state.draftId = null;
    }
    const noteId = noteIdFromHash();
    if (noteId) {
      const note = Store.note(noteId);
      if (note) {
        state.restoreHomeScroll = false;
        showEditorView(noteId);
        return;
      }
    }
    state.restoreHomeScroll = true;
    showHome();
  }

  function clearSearch() {
    state.query = '';
    state.focusSearch = true;
    if (state.selectMode) {
      state.selectMode = false;
      state.selected.clear();
    }
    document.body.classList.remove('modal-open');
    renderHome({ scrollTop: false });
  }

  function handleAction(action, element) {
    switch (action) {
      case 'add-note':
        addNote();
        break;
      case 'toggle-theme':
        toggleTheme();
        break;
      case 'pet-cat':
        petCat();
        break;
      case 'enter-select':
        if (!Store.notes().length) {
          showToast('还没有可以删除的笔记');
          return;
        }
        state.query = '';
        setSelectMode(true);
        break;
      case 'exit-select':
        setSelectMode(false);
        break;
      case 'select-all': {
        const visible = filteredNotes();
        if (!visible.length) return;
        if (visible.every(function (note) { return state.selected.has(note.id); })) {
          visible.forEach(function (note) { state.selected.delete(note.id); });
        } else {
          visible.forEach(function (note) { state.selected.add(note.id); });
        }
        updateSelectionUI();
        break;
      }
      case 'bulk-delete':
        openBulkDeleteConfirm();
        break;
      case 'clear-search':
        clearSearch();
        break;
      case 'editor-back':
        goBackFromEditor();
        break;
      case 'delete-note':
        deleteCurrentNote();
        break;
      case 'format':
        applyFormat(element.dataset.format);
        break;
      case 'modal-cancel':
        closeConfirm();
        break;
      case 'modal-confirm': {
        const callback = state.confirmCallback;
        closeConfirm();
        if (callback) callback();
        break;
      }
      default:
        break;
    }
  }

  function bindGlobalEvents() {
    document.addEventListener('click', function (event) {
      const actionElement = event.target.closest('[data-action]');
      if (actionElement) {
        if (actionElement.disabled) return;
        handleAction(actionElement.dataset.action, actionElement);
        return;
      }
      const card = event.target.closest('.note-card');
      if (card && state.screen === 'home' && els.home.contains(card)) {
        activateNote(card.dataset.noteId);
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if (els.modal.querySelector('.modal-overlay')) { closeConfirm(); return; }
        if (state.selectMode) { setSelectMode(false); return; }
        return;
      }

      if (state.screen === 'home' && !els.modal.querySelector('.modal-overlay')) {
        const target = event.target;
        const isTyping = target && (
          /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
          target.isContentEditable
        );
        if (!isTyping && (event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'))) {
          event.preventDefault();
          const input = $('#searchInput', els.home);
          if (input) { input.focus(); input.select(); }
          return;
        }
      }

      if ((event.key === 'Enter' || event.key === ' ') && event.target && event.target.classList && event.target.classList.contains('note-card')) {
        event.preventDefault();
        activateNote(event.target.dataset.noteId);
      }
    });

    window.addEventListener('popstate', handlePopState);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        if (state.activeEditor) persistEditor(false);
        stopCatPet();
      } else if (state.screen === 'home') {
        startCatPet();
      }
    });

    window.addEventListener('pagehide', function () {
      if (state.activeEditor) persistEditor(false);
    });
  }

  function bootApp() {
    els.home = $('#home-screen');
    els.editor = $('#editor-screen');
    els.modal = $('#modal-root');
    els.toast = $('#toast-root');

    setTheme(Store.getTheme(), false);
    const info = Store.boot();
    bindGlobalEvents();

    const noteId = noteIdFromHash();
    if (noteId && Store.note(noteId)) {
      history.replaceState({ appScreen: 'note', from: 'home' }, '', noteHash(noteId));
      showEditorView(noteId);
    } else {
      history.replaceState({ appScreen: 'home' }, '', HOME_ROUTE);
      renderHome({ scrollTop: true });
    }
    isBooting = false;

    if (info.migrated) {
      setTimeout(function () {
        showToast('之前的笔记已经保留下来了', 'success');
      }, 700);
    }
    if (!info.storageOk) {
      setTimeout(function () {
        showToast('浏览器阻止了本地存储，关闭页面后内容会丢失');
      }, 1000);
    }
  }

  function handleNativeBack() {
    if (els.modal && els.modal.querySelector('.modal-overlay')) {
      closeConfirm();
      return 'handled';
    }
    if (state.selectMode) {
      setSelectMode(false);
      return 'handled';
    }
    if (state.screen === 'editor') {
      if (state.activeEditor) goBackFromEditor();
      return 'handled';
    }
    return 'exit';
  }

  window.App = {
    state: state,
    boot: bootApp,
    showHome: showHome,
    openNote: activateNote,
    addNote: addNote,
    toggleTheme: toggleTheme,
    petCat: petCat,
    persistEditor: persistEditor,
    handleNativeBack: handleNativeBack,
    sanitizeHTML: sanitizeHTML,
    plainTextFromHTML: plainTextFromHTML,
    toast: showToast
  };

  function registerOfflineWorker() {
    if (!('serviceWorker' in navigator)) return;
    const isSecure = location.protocol === 'https:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';
    if (!isSecure) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', {
        scope: './',
        updateViaCache: 'none'
      }).catch(function () { /* offline caching is a bonus, not a requirement */ });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
  } else {
    bootApp();
  }
  registerOfflineWorker();
})();
