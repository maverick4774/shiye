/* ==========================================================
   拾页 · local notebook data
   One quiet notebook. Everything lives in localStorage.
   ========================================================== */
(function (global) {
  'use strict';

  const DB_KEY = 'shiye.notebook.v2';
  const LEGACY_DB_KEY = 'shiye.notebook.db.v1';
  const THEME_KEY = 'shiye.notebook.theme';
  const VERSION = 2;

  let state = null;
  let bootInfo = null;

  const storage = {
    ok: true,
    read: function (key) {
      try { return global.localStorage.getItem(key); }
      catch (err) {
        this.ok = false;
        return null;
      }
    },
    write: function (key, value) {
      try { global.localStorage.setItem(key, value); return true; }
      catch (err) {
        this.ok = false;
        return false;
      }
    }
  };

  function uid(prefix) {
    return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function emptyState() {
    return {
      version: VERSION,
      createdAt: Date.now(),
      notes: []
    };
  }

  function normalizeNote(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = String(raw.title || '').slice(0, 200);
    const html = String(raw.html || '');
    if (!title.trim() && !html.trim()) return null;
    return {
      id: typeof raw.id === 'string' ? raw.id : uid('n_'),
      title: title,
      html: html,
      createdAt: Number(raw.createdAt) || Date.now(),
      updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || Date.now()
    };
  }

  function normalize(raw) {
    const next = emptyState();
    if (!raw || typeof raw !== 'object') return next;
    next.createdAt = Number(raw.createdAt) || Date.now();
    const list = Array.isArray(raw.notes) ? raw.notes : [];
    next.notes = list.map(normalizeNote).filter(Boolean);
    return next;
  }

  function migrateFromLegacy() {
    const raw = storage.read(LEGACY_DB_KEY);
    if (!raw) return { notes: [], migrated: false };
    try {
      const legacy = JSON.parse(raw);
      const users = Array.isArray(legacy.users) ? legacy.users : [];
      if (!users.length) return { notes: [], migrated: false };
      const active = users.find(function (u) { return u.id === legacy.session; }) || users[0];
      const oldNotes = legacy.notes && Array.isArray(legacy.notes[active.id]) ? legacy.notes[active.id] : [];
      const notes = oldNotes.map(function (note) {
        return normalizeNote({
          id: typeof note.id === 'string' ? note.id : uid('n_'),
          title: note.title,
          html: note.html,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt
        });
      }).filter(Boolean);
      return { notes: notes, migrated: notes.length > 0 };
    } catch (err) {
      return { notes: [], migrated: false };
    }
  }

  function persist() {
    if (!storage.ok) return true;
    return storage.write(DB_KEY, JSON.stringify(state));
  }

  function boot() {
    if (state) return bootInfo;

    const raw = storage.read(DB_KEY);
    let migrated = false;

    if (raw) {
      try {
        state = normalize(JSON.parse(raw));
      } catch (err) {
        state = emptyState();
      }
    } else {
      const legacy = migrateFromLegacy();
      state = emptyState();
      state.notes = legacy.notes;
      migrated = legacy.migrated;
      persist();
    }

    if (!storage.ok) {
      console.warn('拾页：本地存储不可用，内容只能保留在当前页面。');
    }

    bootInfo = {
      storageOk: storage.ok,
      migrated: migrated,
      count: state.notes.length
    };
    return bootInfo;
  }

  function sortedNotes() {
    boot();
    return state.notes.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  }

  function getNote(noteId) {
    boot();
    const note = state.notes.find(function (n) { return n.id === noteId; });
    return note ? JSON.parse(JSON.stringify(note)) : null;
  }

  function addNote(data) {
    boot();
    const now = Date.now();
    const note = {
      id: uid('n_'),
      title: String(data && data.title || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      html: String(data && data.html || ''),
      createdAt: now,
      updatedAt: now
    };
    state.notes.push(note);
    persist();
    return JSON.parse(JSON.stringify(note));
  }

  function updateNote(noteId, patch) {
    boot();
    const note = state.notes.find(function (n) { return n.id === noteId; });
    if (!note) return null;
    patch = patch || {};
    let changed = false;

    if (Object.prototype.hasOwnProperty.call(patch, 'title')) {
      const title = String(patch.title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      if (title !== note.title) { note.title = title; changed = true; }
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'html')) {
      const html = String(patch.html || '');
      if (html !== note.html) { note.html = html; changed = true; }
    }
    if (changed) {
      note.updatedAt = Date.now();
      persist();
    }
    return JSON.parse(JSON.stringify(note));
  }

  function deleteNote(noteId) {
    boot();
    const before = state.notes.length;
    state.notes = state.notes.filter(function (n) { return n.id !== noteId; });
    if (state.notes.length === before) return false;
    persist();
    return true;
  }

  function deleteNotes(ids) {
    boot();
    const set = new Set(Array.isArray(ids) ? ids : []);
    const before = state.notes.length;
    state.notes = state.notes.filter(function (n) { return !set.has(n.id); });
    const removed = before - state.notes.length;
    if (removed) persist();
    return removed;
  }

  function getTheme() {
    const value = storage.read(THEME_KEY);
    return value === 'dark' ? 'dark' : 'light';
  }

  function setTheme(theme) {
    const value = theme === 'dark' ? 'dark' : 'light';
    storage.write(THEME_KEY, value);
    return value;
  }

  global.Store = {
    boot: boot,
    notes: sortedNotes,
    note: getNote,
    addNote: addNote,
    updateNote: updateNote,
    deleteNote: deleteNote,
    deleteNotes: deleteNotes,
    getTheme: getTheme,
    setTheme: setTheme,
    storageOk: function () { return storage.ok; },
    DB_KEY: DB_KEY
  };
})(window);
