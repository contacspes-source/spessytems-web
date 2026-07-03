/* ============================================================
   SPES UI — helpers compartidos (Admin + Portal)
   window.SpesUI = { toast, createRouter, initSidebar, icon }
   ============================================================ */
(function () {
  'use strict';

  // ---------- Toasts (reemplazan alerts de aviso) ----------
  function toastHost() {
    var h = document.getElementById('spes-toasts');
    if (!h) { h = document.createElement('div'); h.id = 'spes-toasts'; h.className = 'spes-toasts'; document.body.appendChild(h); }
    return h;
  }
  function toast(msg, type) {
    var h = toastHost();
    var t = document.createElement('div');
    t.className = 'spes-toast ' + (type || 'info');
    t.textContent = String(msg == null ? '' : msg);
    h.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    var ms = type === 'error' ? 5200 : 3200;
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 260); }, ms);
  }

  // ---------- Router por hash (sobrevive F5 + recuerda sección) ----------
  // opts: { storageKey, default, onRoute(route) }
  function createRouter(opts) {
    opts = opts || {};
    var key = opts.storageKey || 'spes.route';
    var def = opts.default || '';
    var onRoute = opts.onRoute || function () {};
    function current() { return (location.hash || '').replace(/^#\/?/, ''); }
    function go(route) {
      route = route || def;
      if (current() === route) { handle(); return; }
      location.hash = '#/' + route;   // dispara hashchange
    }
    function handle() {
      var r = current();
      if (!r) {                       // sin hash: última sección o default (NUNCA forzar dashboard)
        try { r = localStorage.getItem(key) || def; } catch (e) { r = def; }
        if (r) { location.replace('#/' + r); return; } // replace -> vuelve a handle sin duplicar historial
      }
      try { if (r) localStorage.setItem(key, r); } catch (e) {}
      onRoute(r || def);
    }
    window.addEventListener('hashchange', handle);
    return { go: go, handle: handle, current: current };
  }

  // ---------- Sidebar: colapsar (escritorio) + abrir (móvil), persistente ----------
  function initSidebar(sidebar, opts) {
    opts = opts || {};
    var key = opts.storageKey || 'spes.sidebar.collapsed';
    var collapseBtn = opts.collapseBtn || null;   // botón en el sidebar (escritorio)
    var menuBtn = opts.menuBtn || null;           // botón hamburguesa (móvil, topbar)
    var backdrop = opts.backdrop || null;
    try { if (localStorage.getItem(key) === '1') sidebar.classList.add('collapsed'); } catch (e) {}
    if (collapseBtn) collapseBtn.addEventListener('click', function () {
      sidebar.classList.toggle('collapsed');
      try { localStorage.setItem(key, sidebar.classList.contains('collapsed') ? '1' : '0'); } catch (e) {}
    });
    function openMobile(v) { sidebar.classList.toggle('open', v); if (backdrop) backdrop.classList.toggle('show', v); }
    if (menuBtn) menuBtn.addEventListener('click', function () { openMobile(!sidebar.classList.contains('open')); });
    if (backdrop) backdrop.addEventListener('click', function () { openMobile(false); });
    return { closeMobile: function () { openMobile(false); } };
  }

  // ---------- Íconos de línea (Feather-like), por nombre ----------
  var ICONS = {
    dashboard: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
    users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 7a4 4 0 1 0 0 .01|M23 21v-2a4 4 0 0 0-3-3.87',
    building: 'M3 21h18|M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16|M9 7h2M9 11h2M9 15h2',
    card: 'M2 5h20v14H2zM2 10h20',
    support: 'M18 6a9 9 0 1 0-12 8l-1 4 4-1a9 9 0 0 0 9-11z',
    box: 'M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z|M3.3 7 12 12l8.7-5|M12 22V12',
    chart: 'M3 3v18h18|M7 13v5M12 8v10M17 11v7',
    server: 'M2 4h20v6H2zM2 14h20v6H2|M6 7h.01M6 17h.01',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1l-.4-2.5H10l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L3.6 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6a7 7 0 0 0 .1-1z',
    tag: 'M20 13.5 11.5 22 2 12.5V3h9.5zM7 8h.01',
    home: 'M3 11 12 3l9 8|M5 10v10h14V10',
    receipt: 'M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1z|M9 8h6M9 12h6',
    bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9|M13.7 21a2 2 0 0 1-3.4 0',
    help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3|M12 17h.01',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    dot: 'M12 12h.01'
  };
  function icon(name) {
    var d = ICONS[name] || ICONS.dot;
    var paths = d.split('|').map(function (p) { return '<path d="' + p + '"/>'; }).join('');
    return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + paths + '</svg>';
  }

  function esc(s){ return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // ---------- Sidebar acordeón reutilizable ----------
  // groups: [{ group?, items:[{id,label,soon}] }]  (grupos sin 'group' = enlaces sueltos arriba)
  // opts: { activeId, itemIcon(id), groupIcon(name), onSelect(id), openKey }
  function renderSidebar(navEl, groups, opts) {
    opts = opts || {};
    var itemIcon = opts.itemIcon || function () { return icon('dot'); };
    var groupIcon = opts.groupIcon || function () { return icon('dot'); };
    var onSelect = opts.onSelect || function () {};
    var activeId = opts.activeId || null;
    var openKey = opts.openKey || 'spes.navopen';

    function itemHtml(it) {
      var soon = !!it.soon, active = it.id === activeId;
      return '<a class="spes-nav-item' + (active ? ' active' : '') + (soon ? ' soon' : '') + '" '
        + (soon ? 'aria-disabled="true"' : 'data-nav="' + it.id + '"')
        + ' title="' + esc(soon ? 'Disponible próximamente' : it.label) + '">'
        + itemIcon(it.id) + '<span class="lbl">' + esc(it.label) + '</span></a>';
    }

    // ¿qué acordeón abierto? el que contiene el activo; si no, el guardado
    var openIdx = -1;
    groups.forEach(function (g, i) { if (g.group && (g.items || []).some(function (it) { return it.id === activeId; })) openIdx = i; });
    if (openIdx < 0) { try { var s = localStorage.getItem(openKey); if (s !== null && s !== '') openIdx = parseInt(s, 10); } catch (e) {} }

    var html = '';
    groups.forEach(function (g, i) {
      if (!g.group) { (g.items || []).forEach(function (it) { html += itemHtml(it); }); return; }
      var open = (i === openIdx);
      html += '<div class="spes-acc' + (open ? ' open' : '') + '" data-acc="' + i + '">'
        + '<button type="button" class="spes-acc-head" data-acc-toggle="' + i + '">'
        + '<span class="ic-slot">' + groupIcon(g.group) + '</span>'
        + '<span class="lbl">' + esc(g.group) + '</span>'
        + '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
        + '</button>'
        + '<div class="spes-acc-body"><div class="spes-acc-inner">'
        + (g.items || []).map(itemHtml).join('')
        + '</div></div></div>';
    });
    navEl.innerHTML = html;

    // solo una abierta
    navEl.querySelectorAll('[data-acc-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = btn.getAttribute('data-acc-toggle');
        var acc = btn.parentNode;
        var willOpen = !acc.classList.contains('open');
        navEl.querySelectorAll('.spes-acc').forEach(function (a) { a.classList.remove('open'); });
        if (willOpen) acc.classList.add('open');
        try { localStorage.setItem(openKey, willOpen ? idx : ''); } catch (e) {}
      });
    });
    // selección de item
    navEl.querySelectorAll('[data-nav]').forEach(function (a) {
      a.addEventListener('click', function () { onSelect(a.getAttribute('data-nav')); });
    });
  }

  window.SpesUI = { toast: toast, createRouter: createRouter, initSidebar: initSidebar, icon: icon, renderSidebar: renderSidebar };
})();
