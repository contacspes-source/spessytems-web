/* ============================================================================
 * SPES · Portal — ESPEJO DEL POS (oct-2026, Fase 2 ampliada · ADR-096)
 *
 * Transacciones, Inventario y artículos, y Caja tal cual se ven en la caja,
 * con los mismos cálculos que el POS. Desde aquí se pueden EDITAR datos del
 * artículo (nombre, precio, costo, categoría, mínimo, activo): la web entra
 * como "una caja más" y empuja un `catalog.upsert` por `sync_push`; la caja lo
 * aplica en su siguiente sincronización (guard por updated_at: la versión
 * más nueva gana). LA EXISTENCIA NUNCA SE EDITA DESDE LA WEB: el inventario
 * solo se mueve con movimientos (ventas, recepciones, ajustes en caja).
 *
 * Uso: PosMirror.transacciones(c, ctx) · PosMirror.inventario(c, ctx) ·
 *      PosMirror.caja(c, ctx, rCajaBase)
 * ctx = { ST, sb, esc, money, modalShell, closeModal }
 * ========================================================================== */
(function () {
  'use strict'

  var PAY = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', mixed: 'Pago mixto', credit: 'Saldo a favor' }
  var MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  var DEVICE_KEY = 'spes.portal.device'
  var TX_MAX = 8000
  var TX_SHOW = 600

  /* ---------------------------- estilos propios ---------------------------- */
  ;(function injectCss() {
    if (document.getElementById('pos-mirror-css')) return
    var s = document.createElement('style')
    s.id = 'pos-mirror-css'
    s.textContent = [
      '.pm-split{display:grid;grid-template-columns:340px 1fr;gap:14px;align-items:start}',
      '@media(max-width:980px){.pm-split{grid-template-columns:1fr}}',
      '.pm-list{max-height:calc(100vh - 230px);overflow:auto;padding:6px}',
      '.pm-day{display:flex;justify-content:space-between;padding:8px 8px 4px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}',
      '.pm-row{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border-radius:var(--radius-sm);border:1px solid transparent;background:transparent;color:var(--text);text-align:left;cursor:pointer;font:inherit}',
      '.pm-row:hover{background:var(--surface-hover)}',
      '.pm-row.on{border-color:var(--primary);background:var(--surface-hover)}',
      '.pm-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}',
      '.pm-grow{flex:1;min-width:0}',
      '.pm-folio{display:block;font-family:var(--mono);font-size:12.5px;font-weight:700}',
      '.pm-meta{display:block;font-size:11.5px;color:var(--muted)}',
      '.pm-amt{font-weight:700;font-size:13px;white-space:nowrap}',
      '.pm-strike{text-decoration:line-through;color:var(--muted)}',
      '.pm-tools{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:center}',
      '.pm-tools input,.pm-tools select{height:36px;width:auto}',
      '.pm-tools .pm-search{flex:1;min-width:200px}',
      '.pm-casc{display:flex;justify-content:space-between;gap:12px;padding:5px 2px;font-size:13.5px}',
      '.pm-casc.ind{padding-left:16px;color:var(--muted)}',
      '.pm-casc.big{font-size:16px;font-weight:800}',
      '.pm-casc .v{font-family:var(--mono);white-space:nowrap}',
      '.pm-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:10px 2px 4px}',
      '.pm-hr{border-top:1px solid var(--border);margin:8px 0}',
      '.pm-item{display:flex;justify-content:space-between;gap:12px;padding:6px 2px 6px 16px}',
      '.pm-item small{display:block;font-family:var(--mono);color:var(--muted);font-size:11.5px}',
      '.pm-item .v{font-family:var(--mono);font-weight:700;white-space:nowrap}',
      '.pm-banner{padding:12px 14px;border-radius:var(--radius);background:var(--warn-bg);color:var(--warn-fg);font-size:13.5px;margin-bottom:14px}',
      '.pm-neg{color:var(--bad-fg);font-weight:800}',
      '.pm-low{color:var(--warn-fg);font-weight:700}',
      '.pm-pager{display:flex;justify-content:space-between;align-items:center;padding:10px 4px;font-size:13px;color:var(--muted)}',
      '.pm-note{font-size:12px;color:var(--muted);margin-top:6px}'
    ].join('\n')
    document.head.appendChild(s)
  })()

  /* ------------------------------- utilidades ------------------------------- */
  /** Minúsculas y SIN acentos: "platano" encuentra "Plátano". */
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  }
  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }
  function dayLabel(d) {
    var t = new Date(); t.setHours(0, 0, 0, 0)
    var x = new Date(d); x.setHours(0, 0, 0, 0)
    var diff = Math.round((t - x) / 86400000)
    if (diff === 0) return 'Hoy'
    if (diff === 1) return 'Ayer'
    return x.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '') + ' ' + x.getDate() + ' ' + MONTHS[x.getMonth()]
  }
  function qty(n) {
    n = Number(n || 0)
    return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  }
  /** Mismo cálculo que el POS (shared/pricing calcMargin): utilidad sobre COSTO. */
  function calcMargin(cost, price) {
    cost = Number(cost || 0); price = Number(price || 0)
    if (cost <= 0) return 0
    return Math.round(((price - cost) / cost) * 10000) / 100
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID()
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    })
  }
  /** Id fijo de "esta caja web" (las cajas ignoran sus propias ops por device_id). */
  function deviceId() {
    var id = null
    try { id = window.localStorage.getItem(DEVICE_KEY) } catch (_) { /* sin storage */ }
    if (!id) {
      id = uuid()
      try { window.localStorage.setItem(DEVICE_KEY, id) } catch (_) { /* sin storage */ }
    }
    return id
  }
  function toast(msg, type) {
    if (window.SpesUI && window.SpesUI.toast) window.SpesUI.toast(msg, type)
  }
  function byId(x) { return document.getElementById(x) }

  /* ============================== TRANSACCIONES ============================== */
  function txState(ST) {
    if (!ST._tx) {
      var now = new Date()
      ST._tx = { from: ymd(new Date(now.getTime() - 6 * 86400000)), to: ymd(now), q: '', pay: 'all', sel: null, rows: [], key: null, loading: false, err: null }
    }
    return ST._tx
  }

  async function loadTx(ctx) {
    var ST = ctx.ST, t = txState(ST)
    var key = t.from + '|' + t.to
    if (t.key === key || t.loading) return
    t.loading = true; t.err = null
    try {
      var fromIso = new Date(t.from + 'T00:00:00').toISOString()
      var toIso = new Date(new Date(t.to + 'T00:00:00').getTime() + 86400000).toISOString()
      t.rows = await window.SpesData.fetchAll(function () {
        return ctx.sb.from('sales').select('id,folio,total,status,created_at,data')
          .eq('account_id', ST.uid).gte('created_at', fromIso).lt('created_at', toIso)
          .order('created_at', { ascending: false }).order('id')
      }, { max: TX_MAX })
    } catch (e) {
      t.rows = []
      t.err = (e && e.message) || 'No se pudieron cargar las ventas'
    }
    t.key = key
    t.loading = false
  }

  function returnsBySale(ST) {
    var m = {}
    ;(ST.RETURNS || []).forEach(function (r) { if (r.sale_id) (m[r.sale_id] = m[r.sale_id] || []).push(r) })
    return m
  }

  function saleOf(s) { return (s.data && s.data.sale) || {} }

  function transacciones(c, ctx) {
    var ST = ctx.ST, esc = ctx.esc, money = ctx.money, t = txState(ST)
    if (t.key !== t.from + '|' + t.to) {
      c.innerHTML = '<h2>Transacciones</h2><p class="sub">Cargando ventas…</p>'
      loadTx(ctx).then(function () { if (ST.tab === 'transacciones' || ST.tab === 'ventas') transacciones(c, ctx) })
      return
    }
    var rets = returnsBySale(ST)
    var q = norm(t.q)
    var rows = t.rows.filter(function (s) {
      if (t.pay !== 'all' && (saleOf(s).payment_method || 'cash') !== t.pay) return false
      if (!q) return true
      if (norm(s.folio).indexOf(q) >= 0) return true
      var items = (s.data && s.data.items) || []
      for (var i = 0; i < items.length; i++) if (norm(items[i].name).indexOf(q) >= 0) return true
      return false
    })
    if (!t.sel || !rows.some(function (s) { return s.id === t.sel })) t.sel = rows[0] ? rows[0].id : null

    var tot = 0, n = 0
    rows.forEach(function (s) { if (s.status !== 'cancelled') { tot += Number(s.total || 0); n++ } })

    var h = '<h2>Transacciones</h2><p class="sub">Cada venta tal cual en la caja: qué se vendió, cómo se pagó y si tuvo devolución.</p>'
    h += '<div class="pm-tools">'
      + '<input class="pm-search" id="pm_q" placeholder="Buscar folio o producto…" value="' + esc(t.q) + '">'
      + '<input type="date" id="pm_from" value="' + esc(t.from) + '"> <span class="muted">a</span> <input type="date" id="pm_to" value="' + esc(t.to) + '">'
      + '<select id="pm_pay">' + [['all', 'Todos los pagos'], ['cash', 'Efectivo'], ['card', 'Tarjeta'], ['transfer', 'Transferencia'], ['mixed', 'Mixto'], ['credit', 'Saldo a favor']].map(function (o) {
        return '<option value="' + o[0] + '"' + (t.pay === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'
      }).join('') + '</select></div>'
    if (t.err) h += '<div class="pm-banner">' + esc(t.err) + '</div>'
    h += '<p class="muted" style="margin:-4px 0 10px;font-size:12.5px">' + n + ' venta(s) · ' + money(tot)
      + (t.rows.length >= TX_MAX ? ' · se cargaron las ' + TX_MAX + ' más recientes del rango; acota las fechas' : '') + '</p>'

    h += '<div class="pm-split"><div class="card pm-list">'
    if (!rows.length) h += '<div class="state">Sin ventas en este rango.</div>'
    var dayTot = {}
    rows.forEach(function (s) { var k = new Date(s.created_at).toDateString(); if (s.status !== 'cancelled') dayTot[k] = (dayTot[k] || 0) + Number(s.total || 0) })
    var lastDay = null
    rows.slice(0, TX_SHOW).forEach(function (s) {
      var d = new Date(s.created_at), k = d.toDateString()
      if (k !== lastDay) { lastDay = k; h += '<div class="pm-day"><span>' + esc(dayLabel(d)) + '</span><span>' + money(dayTot[k] || 0) + '</span></div>' }
      var sale = saleOf(s)
      var r = rets[s.id] || []
      var cancelled = s.status === 'cancelled'
      var cashRet = r.some(function (x) { return x.refund_method !== 'credit' })
      var exch = r.some(function (x) { return x.refund_method === 'credit' })
      var dot = cancelled || cashRet ? 'var(--bad-fg)' : exch ? 'var(--warn-fg)' : 'var(--ok-fg)'
      var time = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
      h += '<button class="pm-row' + (t.sel === s.id ? ' on' : '') + '" data-sale="' + esc(s.id) + '">'
        + '<span class="pm-dot" style="background:' + dot + '"></span>'
        + '<span class="pm-grow"><span class="pm-folio' + (cancelled ? ' pm-strike' : '') + '">' + esc(s.folio || '—') + '</span>'
        + '<span class="pm-meta">' + time + ' · ' + esc(PAY[sale.payment_method] || sale.payment_method || 'Efectivo')
        + (cashRet ? ' · <b style="color:var(--bad-fg)">devuelto</b>' : '') + (exch ? ' · <b style="color:var(--warn-fg)">cambio</b>' : '') + (cancelled ? ' · anulada' : '') + '</span></span>'
        + '<span class="pm-amt' + (cancelled ? ' pm-strike' : '') + '">' + money(s.total) + '</span></button>'
    })
    if (rows.length > TX_SHOW) h += '<p class="pm-note" style="padding:8px">Se muestran ' + TX_SHOW + ' de ' + rows.length + '. Acota las fechas o busca.</p>'
    h += '</div><div class="card" id="pm_detail" style="padding:20px"></div></div>'
    c.innerHTML = h

    renderTxDetail(byId('pm_detail'), rows.find(function (s) { return s.id === t.sel }), rets, ctx)

    var qEl = byId('pm_q'), timer = null
    qEl.oninput = function () {
      clearTimeout(timer)
      timer = setTimeout(function () {
        t.q = qEl.value
        transacciones(c, ctx)
        var e = byId('pm_q'); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length) }
      }, 220)
    }
    byId('pm_from').onchange = function (e) { if (e.target.value) { t.from = e.target.value; transacciones(c, ctx) } }
    byId('pm_to').onchange = function (e) { if (e.target.value) { t.to = e.target.value; transacciones(c, ctx) } }
    byId('pm_pay').onchange = function (e) { t.pay = e.target.value; transacciones(c, ctx) }
    c.querySelectorAll('[data-sale]').forEach(function (b) {
      b.onclick = function () {
        t.sel = b.getAttribute('data-sale')
        c.querySelectorAll('.pm-row.on').forEach(function (x) { x.classList.remove('on') })
        b.classList.add('on')
        renderTxDetail(byId('pm_detail'), rows.find(function (s) { return s.id === t.sel }), rets, ctx)
      }
    })
  }

  /** Detalle con desglose tipo RECIBO (igual que el POS 0.7.0). */
  function renderTxDetail(el, s, rets, ctx) {
    var esc = ctx.esc, money = ctx.money
    if (!el) return
    if (!s) { el.innerHTML = '<div class="state">Elige una venta de la lista.</div>'; return }
    var sale = saleOf(s)
    var items = ((s.data && s.data.items) || []).filter(function (i) { return !i.is_deleted })
    var pays = ((s.data && s.data.payments) || []).filter(function (p) { return !p.is_deleted })
    if (!pays.length) pays = [{ method: sale.payment_method || 'cash', amount: sale.amount_paid || sale.total }]
    var r = rets[s.id] || []
    var cancelled = s.status === 'cancelled'
    var chip = function (txt, fg, bg) { return '<span class="tag" style="color:' + fg + ';background:' + bg + '">● ' + txt + '</span>' }
    var casc = function (k, v, cls) { return '<div class="pm-casc ' + (cls || '') + '"><span>' + k + '</span><span class="v">' + v + '</span></div>' }

    var h = '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center"><h3 style="font-size:18px;font-weight:800">Venta ' + esc(s.folio || '—') + '</h3>'
      + (cancelled ? chip('Cancelada', 'var(--bad-fg)', 'var(--bad-bg)') : chip('Completada', 'var(--ok-fg)', 'var(--ok-bg)'))
      + (r.some(function (x) { return x.refund_method !== 'credit' }) ? chip('Con devolución', 'var(--bad-fg)', 'var(--bad-bg)') : '')
      + (r.some(function (x) { return x.refund_method === 'credit' }) ? chip('Con cambio', 'var(--warn-fg)', 'var(--warn-bg)') : '')
      + '</div><p class="muted" style="font-size:12.5px;margin-top:4px">' + esc(new Date(s.created_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }))
      + (s.data && s.data.employee_name ? ' · Cajero: ' + esc(s.data.employee_name) : '') + '</p>'

    h += '<div class="card" style="margin-top:14px;padding:14px;background:var(--surface-hover)"><div class="pm-sec" style="margin-top:0">Desglose</div>'
    h += '<div class="pm-sec">Se vendió (' + items.length + ' ' + (items.length === 1 ? 'producto' : 'productos') + ')</div>'
    items.forEach(function (it) {
      h += '<div class="pm-item"><span><b>' + esc(it.name || '—') + '</b>' + (it.is_wholesale ? ' <span class="muted" style="font-size:11.5px">(mayoreo)</span>' : '')
        + '<small>' + qty(it.quantity) + ' × ' + money(it.unit_price) + '</small></span><span class="v">' + money(it.line_total) + '</span></div>'
    })
    h += '<div class="pm-hr"></div>'
    h += casc('Ventas brutas', money(sale.subtotal != null ? sale.subtotal : s.total))
    if (Number(sale.discount_total || 0) > 0) h += casc('Descuentos', '- ' + money(sale.discount_total), 'ind')
    h += casc('<b>Ventas netas</b>', '<b>' + money(s.total) + '</b>')
    if (Number(sale.tax_total || 0) > 0) h += casc('IVA incluido', money(sale.tax_total), 'ind')
    h += '<div class="pm-hr"></div><div class="pm-sec">Pagos recibidos</div>'
    pays.forEach(function (p) { h += casc(esc(PAY[p.method] || p.method || '—'), money(p.amount), 'ind') })
    if (Number(sale.change_given || 0) > 0) h += casc('Cambio entregado', money(sale.change_given), 'ind')
    if (sale.card_ref) h += casc('Folio terminal', esc(sale.card_ref), 'ind')
    h += '<div class="pm-hr"></div>' + casc('Total', money(s.total), 'big')
    h += '</div>'

    if (r.length) {
      h += '<div class="pm-sec" style="margin-top:16px">Devoluciones de esta venta</div>'
      r.forEach(function (x) {
        h += '<div class="card" style="padding:10px 12px;margin-top:6px"><div class="pm-casc"><span><b class="mono">' + esc(x.folio || '—') + '</b> · '
          + esc(new Date(x.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }))
          + ' · ' + (x.refund_method === 'credit' ? 'saldo a favor (cambio)' : 'reembolso en efectivo') + '</span><span class="v"><b>- ' + money(x.total) + '</b></span></div>'
          + (x.reason ? '<p class="pm-note">Motivo: ' + esc(x.reason) + '</p>' : '')
          + (x.items || []).map(function (it) {
            return '<div class="pm-item"><span>' + esc(it.name || '—') + '<small>' + qty(it.quantity) + ' × ' + money(it.unit_price) + '</small></span><span class="v">- ' + money(it.line_total) + '</span></div>'
          }).join('')
          + '</div>'
      })
    }
    el.innerHTML = h
  }

  /* ========================= INVENTARIO Y ARTÍCULOS ========================= */
  function invState(ST) {
    if (!ST._inv) ST._inv = { q: '', cat: '', state: 'all', page: 1 }
    return ST._inv
  }
  function stockOf(ST, p) { var s = ST.STOCK[p.id]; return s == null ? 0 : Number(s) }
  function isActive(p) { return Number(p.is_active) !== 0 && Number(p.archived || 0) !== 1 }

  function inventario(c, ctx) {
    var ST = ctx.ST, esc = ctx.esc, money = ctx.money, f = invState(ST)
    var all = (ST.PRODUCTS || []).filter(function (p) { return !p.is_deleted })
    var active = all.filter(isActive)
    var neg = active.filter(function (p) { return stockOf(ST, p) < 0 }).length
    var low = active.filter(function (p) { var s = stockOf(ST, p); return s >= 0 && Number(p.stock_min || 0) > 0 && s <= Number(p.stock_min) }).length
    var costVal = 0, retailVal = 0
    active.forEach(function (p) { var s = stockOf(ST, p); if (s > 0) { costVal += s * Number(p.cost_price || 0); retailVal += s * Number(p.price_retail || 0) } })

    var q = norm(f.q)
    var list = all.filter(function (p) {
      var s = stockOf(ST, p)
      if (f.state === 'inactive') { if (isActive(p)) return false } else if (!isActive(p)) return false
      if (f.state === 'neg' && !(s < 0)) return false
      if (f.state === 'low' && !(s >= 0 && Number(p.stock_min || 0) > 0 && s <= Number(p.stock_min))) return false
      if (f.state === 'zero' && s !== 0) return false
      if (f.cat && (p.category_id || '') !== f.cat) return false
      if (q && norm(p.name).indexOf(q) < 0 && norm(p.sku).indexOf(q) < 0 && norm(p.barcode).indexOf(q) < 0 && norm(p.brand).indexOf(q) < 0) return false
      return true
    }).sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')) })
    var PER = 50, pages = Math.max(1, Math.ceil(list.length / PER))
    if (f.page > pages) f.page = pages
    if (f.page < 1) f.page = 1
    var pageRows = list.slice((f.page - 1) * PER, f.page * PER)

    var cats = Object.keys(ST.CATEGORIES || {}).map(function (id) { return [id, ST.CATEGORIES[id]] }).sort(function (a, b) { return String(a[1]).localeCompare(String(b[1])) })
    var PA = window.PortalAdmin
    var h = '<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><h2>Inventario y artículos</h2><p class="sub" style="margin-bottom:14px">Tus artículos y existencias tal cual en la caja. Da de alta artículos, cambia precios y ajusta existencias: tus cajas lo reciben en ~1 minuto.</p></div>'
      + (PA ? '<button class="btn" id="iv_new" style="margin-bottom:14px">+ Nuevo artículo</button>' : '') + '</div>'
    h += '<div class="cards" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">'
      + '<div class="card"><div class="n">' + active.length + '</div><div class="l">Artículos activos</div></div>'
      + '<div class="card"><div class="n"' + (neg ? ' style="color:var(--bad-fg)"' : '') + '>' + neg + '</div><div class="l">Existencia negativa</div></div>'
      + '<div class="card"><div class="n"' + (low ? ' style="color:var(--warn-fg)"' : '') + '>' + low + '</div><div class="l">Bajo mínimo</div></div>'
      + '<div class="card"><div class="n">' + money(costVal) + '</div><div class="l">Valor en costo · a precio ' + money(retailVal) + '</div></div></div>'
    h += '<div class="pm-tools"><input class="pm-search" id="iv_q" placeholder="Buscar nombre, SKU, código o marca…" value="' + esc(f.q) + '">'
      + '<select id="iv_cat"><option value="">Todas las categorías</option>' + cats.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (f.cat === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>' }).join('') + '</select>'
      + '<select id="iv_state">' + [['all', 'Todos'], ['neg', 'Negativos'], ['low', 'Bajo mínimo'], ['zero', 'Sin existencia'], ['inactive', 'Inactivos']].map(function (o) {
        return '<option value="' + o[0] + '"' + (f.state === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'
      }).join('') + '</select></div>'
    h += '<div class="card" style="padding:6px 12px;overflow-x:auto"><table><thead><tr><th>Artículo</th><th>Categoría</th><th style="text-align:right">Existencia</th><th style="text-align:right">Costo</th><th style="text-align:right">Precio</th><th style="text-align:right">Margen</th><th></th></tr></thead><tbody>'
    if (!pageRows.length) h += '<tr><td colspan="7"><div class="state" style="margin:10px 0">' + (all.length ? 'Sin artículos con ese filtro.' : 'Aún no hay artículos sincronizados.') + '</div></td></tr>'
    pageRows.forEach(function (p) {
      var s = stockOf(ST, p), min = Number(p.stock_min || 0)
      var cls = s < 0 ? 'pm-neg' : min > 0 && s <= min ? 'pm-low' : ''
      var m = calcMargin(p.cost_price, p.price_retail)
      h += '<tr data-prod="' + esc(p.id) + '" style="cursor:pointer"><td><b>' + esc(p.name || '—') + '</b><br><span class="mono muted" style="font-size:11.5px">' + esc(p.sku || '') + (p.barcode ? ' · ' + esc(p.barcode) : '') + '</span></td>'
        + '<td class="muted">' + esc((ST.CATEGORIES || {})[p.category_id] || 'Sin categoría') + '</td>'
        + '<td style="text-align:right" class="' + cls + '">' + qty(s) + '</td>'
        + '<td style="text-align:right" class="muted">' + money(p.cost_price) + '</td>'
        + '<td style="text-align:right"><b>' + money(p.price_retail) + '</b></td>'
        + '<td style="text-align:right;color:' + (m < 0 ? 'var(--bad-fg)' : 'var(--muted)') + '">' + (Number(p.cost_price || 0) > 0 ? m + '%' : '—') + '</td>'
        + '<td style="text-align:right"><button class="btn ghost sm" data-edit="' + esc(p.id) + '">Editar</button></td></tr>'
    })
    h += '</tbody></table><div class="pm-pager"><span>' + list.length + ' artículo(s)</span><span>'
      + '<button class="btn ghost sm" id="iv_prev"' + (f.page <= 1 ? ' disabled' : '') + '>Anterior</button> Página ' + f.page + ' de ' + pages
      + ' <button class="btn ghost sm" id="iv_next"' + (f.page >= pages ? ' disabled' : '') + '>Siguiente</button></span></div></div>'
    c.innerHTML = h

    var redraw = function () { inventario(c, ctx) }
    var qEl = byId('iv_q'), timer = null
    qEl.oninput = function () {
      clearTimeout(timer)
      timer = setTimeout(function () {
        f.q = qEl.value; f.page = 1; redraw()
        var e = byId('iv_q'); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length) }
      }, 220)
    }
    byId('iv_cat').onchange = function (e) { f.cat = e.target.value; f.page = 1; redraw() }
    byId('iv_state').onchange = function (e) { f.state = e.target.value; f.page = 1; redraw() }
    if (byId('iv_new')) byId('iv_new').onclick = function () { window.PortalAdmin.newProduct(ctx, redraw) }
    byId('iv_prev').onclick = function () { f.page--; redraw(); window.scrollTo(0, 0) }
    byId('iv_next').onclick = function () { f.page++; redraw(); window.scrollTo(0, 0) }
    c.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); editProduct(b.getAttribute('data-edit'), ctx, redraw) } })
    c.querySelectorAll('[data-prod]').forEach(function (tr) { tr.onclick = function () { productSheet(tr.getAttribute('data-prod'), ctx, redraw) } })
  }

  /** Ficha del artículo con sus últimos movimientos de inventario. */
  async function productSheet(id, ctx, after) {
    var ST = ctx.ST, esc = ctx.esc, money = ctx.money
    var p = (ST.PRODUCTS || []).find(function (x) { return x.id === id })
    if (!p) return
    var s = stockOf(ST, p)
    var kv = function (k, v) { return '<dt>' + k + '</dt><dd>' + v + '</dd>' }
    ctx.modalShell('<h3>' + esc(p.name || '—') + '</h3><dl class="kv" style="margin-top:12px">'
      + kv('SKU / código', '<span class="mono">' + esc(p.sku || '—') + (p.barcode ? ' · ' + esc(p.barcode) : '') + '</span>')
      + kv('Categoría', esc((ST.CATEGORIES || {})[p.category_id] || 'Sin categoría'))
      + kv('Existencia', '<span class="' + (s < 0 ? 'pm-neg' : '') + '">' + qty(s) + '</span> · mínimo ' + qty(p.stock_min || 0))
      + kv('Costo', money(p.cost_price))
      + kv('Precio', '<b>' + money(p.price_retail) + '</b> · margen ' + (Number(p.cost_price || 0) > 0 ? calcMargin(p.cost_price, p.price_retail) + '%' : '—'))
      + kv('Estado', isActive(p) ? 'Activo' : 'Inactivo')
      + '</dl><div class="pm-sec" style="margin-top:14px">Últimos movimientos</div><div id="pm_moves" class="muted" style="font-size:13px">Cargando…</div>'
      + '<div class="mrow"><button class="btn ghost" id="ps_close">Cerrar</button>' + (window.PortalAdmin ? '<button class="btn ghost" id="ps_adj">Ajustar existencia</button>' : '') + '<button class="btn" id="ps_edit">Editar</button></div>')
    byId('ps_close').onclick = ctx.closeModal
    if (byId('ps_adj')) byId('ps_adj').onclick = function () { ctx.closeModal(); window.PortalAdmin.adjustStock(ctx, id, after) }
    byId('ps_edit').onclick = function () { ctx.closeModal(); editProduct(id, ctx, after) }
    try {
      var res = await ctx.sb.from('sync_log').select('payload,client_created_at').eq('account_id', ST.uid)
        .eq('op_type', 'stock.movement').eq('payload->>product_id', id).order('id', { ascending: false }).limit(15)
      var el = byId('pm_moves')
      if (!el) return
      if (res.error) throw res.error
      var mv = (res.data || []).map(function (r) { return r.payload || {} })
      var TYPE = { sale: 'Venta', receive: 'Recepción', adjust: 'Ajuste', sale_cancel: 'Venta anulada', return: 'Devolución' }
      el.innerHTML = mv.length ? '<table><tbody>' + mv.map(function (m) {
        var d = Number(m.qty_change || 0)
        return '<tr><td>' + esc(new Date(m.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })) + '</td><td>' + esc(TYPE[m.type] || m.type || '—')
          + (m.reason ? ' <span class="muted">· ' + esc(m.reason) + '</span>' : '') + '</td><td style="text-align:right;font-weight:700;color:'
          + (d < 0 ? 'var(--bad-fg)' : 'var(--ok-fg)') + '">' + (d > 0 ? '+' : '') + qty(d) + '</td></tr>'
      }).join('') + '</tbody></table>' : 'Sin movimientos sincronizados.'
    } catch (_) {
      var el2 = byId('pm_moves'); if (el2) el2.textContent = 'No se pudieron cargar los movimientos.'
    }
  }

  /** Campos que se pueden editar desde la web (nunca la existencia). */
  var EDITABLE = ['name', 'cost_price', 'price_retail', 'category_id', 'stock_min', 'is_active', 'price_mode', 'barcode', 'supplier_id']

  /** Arma la op `catalog.upsert` (pura: la usan la UI y las pruebas). */
  function buildProductOp(p, changes, nowIso, dev, opId) {
    var payload = Object.assign({}, p, changes, { updated_at: nowIso })
    delete payload.stock_current
    delete payload._account
    Object.keys(changes).forEach(function (k) { if (EDITABLE.indexOf(k) < 0) throw new Error('Campo no editable desde la web: ' + k) })
    return { op_id: opId || uuid(), device_id: dev || deviceId(), seq: Date.now(), entity: 'products', entity_id: p.id, op_type: 'catalog.upsert', payload: payload, created_at: nowIso }
  }

  /**
   * Edición del artículo desde la web (ADR-096). Empuja la versión completa
   * del registro con updated_at nuevo como `catalog.upsert`; NUNCA la existencia.
   */
  function editProduct(id, ctx, after) {
    var ST = ctx.ST, esc = ctx.esc, money = ctx.money
    var p = (ST.PRODUCTS || []).find(function (x) { return x.id === id })
    if (!p) return
    var cats = Object.keys(ST.CATEGORIES || {}).map(function (cid) { return [cid, ST.CATEGORIES[cid]] }).sort(function (a, b) { return String(a[1]).localeCompare(String(b[1])) })
    var auto = p.price_mode === 'auto'
    ctx.modalShell('<h3>Editar artículo</h3>'
      + '<label class="flbl">Nombre</label><input id="pe_name" maxlength="120" value="' + esc(p.name || '') + '">'
      + '<div class="grid2" style="gap:10px"><div><label class="flbl">Código de barras</label><input id="pe_code" maxlength="40" value="' + esc(p.barcode || '') + '" placeholder="Sin código"></div>'
      + '<div><label class="flbl">Proveedor</label><select id="pe_sup"><option value="">Sin proveedor</option>' + Object.keys(ST.SUPPLIERS || {}).map(function (sid) { return [sid, ST.SUPPLIERS[sid]] }).sort(function (a, b) { return String(a[1]).localeCompare(String(b[1])) }).map(function (x) { return '<option value="' + esc(x[0]) + '"' + (p.supplier_id === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>' }).join('') + '</select></div></div>'
      + '<div class="grid2" style="gap:10px"><div><label class="flbl">Costo</label><input id="pe_cost" type="number" min="0" step="0.01" value="' + esc(p.cost_price != null ? p.cost_price : 0) + '"></div>'
      + '<div><label class="flbl">Precio de venta</label><input id="pe_price" type="number" min="0" step="0.01" value="' + esc(p.price_retail != null ? p.price_retail : 0) + '"></div></div>'
      + '<p class="pm-note" id="pe_margin"></p>'
      + (auto ? '<p class="pm-note" style="color:var(--warn-fg)">Este artículo calcula su precio con una plantilla en la caja. Si cambias el precio aquí, pasa a precio manual.</p>' : '')
      + '<div class="grid2" style="gap:10px"><div><label class="flbl">Categoría</label><select id="pe_cat"><option value="">Sin categoría</option>'
      + cats.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (p.category_id === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>' }).join('') + '</select></div>'
      + '<div><label class="flbl">Existencia mínima (alerta)</label><input id="pe_min" type="number" min="0" step="1" value="' + esc(p.stock_min != null ? p.stock_min : 0) + '"></div></div>'
      + '<label class="flbl">Estado</label><select id="pe_active"><option value="1"' + (isActive(p) ? ' selected' : '') + '>Activo (se vende)</option><option value="0"' + (!isActive(p) ? ' selected' : '') + '>Inactivo</option></select>'
      + '<p class="pm-note">La <b>existencia</b> no se escribe como número: usa <b>Ajustar existencia</b> en la ficha del artículo (entrada, merma o conteo). Viaja como movimiento para que el inventario nunca se descuadre.</p>'
      + '<p id="pe_err" class="msg err"></p>'
      + '<div class="mrow">' + (window.PortalAdmin ? '<button class="btn ghost" id="pe_del" style="margin-right:auto;color:var(--bad-fg)">Eliminar</button>' : '') + '<button class="btn ghost" id="pe_cancel">Cancelar</button><button class="btn" id="pe_save">Guardar y enviar a la caja</button></div>')
    var showMargin = function () {
      var c0 = Number(byId('pe_cost').value || 0), p0 = Number(byId('pe_price').value || 0)
      byId('pe_margin').innerHTML = c0 > 0
        ? 'Margen: <b style="color:' + (p0 < c0 ? 'var(--bad-fg)' : 'var(--ok-fg)') + '">' + calcMargin(c0, p0) + '%</b> (' + money(p0 - c0) + ' por unidad)'
        : 'Captura el costo para ver el margen.'
    }
    byId('pe_cost').oninput = showMargin
    byId('pe_price').oninput = showMargin
    showMargin()
    byId('pe_cancel').onclick = ctx.closeModal
    if (byId('pe_del')) byId('pe_del').onclick = async function () {
      try {
        var r = await window.PortalAdmin.deleteProduct(ctx, id, after)
        if (r) { byId('pe_err').textContent = r === 'Cancelado.' ? '' : r; return }
        ctx.closeModal()
      } catch (e) { byId('pe_err').textContent = 'No se pudo eliminar: ' + ((e && e.message) || 'revisa tu conexión') }
    }
    byId('pe_save').onclick = async function () {
      var name = byId('pe_name').value.trim()
      var cost = Number(byId('pe_cost').value), price = Number(byId('pe_price').value), min = Number(byId('pe_min').value)
      if (!name) { byId('pe_err').textContent = 'El nombre no puede quedar vacío.'; return }
      if (!(cost >= 0) || !(price >= 0) || !(min >= 0)) { byId('pe_err').textContent = 'Costo, precio y mínimo deben ser números de 0 en adelante.'; return }
      var next = {
        name: name,
        cost_price: Math.round(cost * 100) / 100,
        price_retail: Math.round(price * 100) / 100,
        category_id: byId('pe_cat').value || null,
        stock_min: Math.round(min),
        is_active: byId('pe_active').value === '1' ? 1 : 0,
        barcode: byId('pe_code').value.trim() || null,
        supplier_id: byId('pe_sup').value || null
      }
      if (next.barcode && window.PortalAdmin) {
        var owner = window.PortalAdmin.barcodeOwner(ST, next.barcode, p.id)
        if (owner) { byId('pe_err').textContent = 'Ese código de barras ya es de "' + owner + '".'; return }
      }
      // Solo viaja lo que cambió (más el registro completo, como lo exige la caja).
      var changes = {}
      Object.keys(next).forEach(function (k) {
        var before = p[k] == null ? null : p[k]
        if (k === 'name' || k === 'category_id' || k === 'barcode' || k === 'supplier_id' ? before !== next[k] : Number(before) !== Number(next[k])) changes[k] = next[k]
      })
      if (auto && changes.price_retail != null) changes.price_mode = 'manual'
      if (!Object.keys(changes).length) { ctx.closeModal(); return }
      byId('pe_save').disabled = true
      byId('pe_save').textContent = 'Guardando…'
      var now = new Date().toISOString()
      try {
        var op = buildProductOp(p, changes, now)
        var ops = [op]
        // ADR-097: el código primario vive también en product_barcodes (escaneo en caja).
        if ('barcode' in changes && window.PortalAdmin) ops = ops.concat(window.PortalAdmin.barcodeOps(ST, p, changes.barcode, now, p.branch_id || window.PortalAdmin.branchOf(ST)))
        var res = await ctx.sb.rpc('sync_push', { p_ops: ops })
        if (res.error) throw res.error
        if (window.PortalAdmin) ops.slice(1).forEach(function (o) { window.PortalAdmin._applyLocal(ST, o) })
        Object.assign(p, changes, { updated_at: now })
        ctx.closeModal()
        toast('Guardado. La caja lo recibe en su próxima sincronización (~1 min).', 'ok')
        if (after) after()
      } catch (e) {
        byId('pe_save').disabled = false
        byId('pe_save').textContent = 'Guardar y enviar a la caja'
        byId('pe_err').textContent = 'No se pudo guardar: ' + ((e && e.message) || 'revisa tu conexión')
      }
    }
  }

  /* ================================== CAJA ================================== */
  /** Envuelve la vista de caja del portal con el aviso de caja sin corte y el resumen de hoy. */
  function caja(c, ctx, base) {
    var ST = ctx.ST, esc = ctx.esc, money = ctx.money
    base(c)
    var open = (ST.CASHS || []).filter(function (s) { return s.status === 'open' })
    var today = new Date().toDateString()
    var movHoy = (ST.CASHMOVS || []).filter(function (m) { return new Date(m.created_at).toDateString() === today })
    var inHoy = movHoy.filter(function (m) { return m.type === 'in' }).reduce(function (a, m) { return a + Number(m.amount || 0) }, 0)
    var outs = movHoy.filter(function (m) { return m.type !== 'in' })
    var outHoy = outs.reduce(function (a, m) { return a + Number(m.amount || 0) }, 0)
    var egHoy = (ST.EGRESOS || []).filter(function (e) { return new Date(e.created_at).toDateString() === today })
    var h = ''
    open.forEach(function (s) {
      var days = Math.floor((Date.now() - new Date(s.opened_at).getTime()) / 86400000)
      if (days >= 1) {
        h += '<div class="pm-banner"><b>Caja abierta desde el ' + esc(new Date(s.opened_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }))
          + ' (' + days + ' día' + (days === 1 ? '' : 's') + ') sin corte.</b> Haz el corte en la caja al cerrar cada día: así cuadra el efectivo esperado contra el contado y aquí se ve cada turno.</div>'
      }
    })
    h += '<div class="cards" style="margin-top:4px"><div class="card"><div class="n">' + money(inHoy) + '</div><div class="l">Entradas de efectivo hoy</div></div>'
      + '<div class="card"><div class="n">' + money(outHoy) + '</div><div class="l">Salidas de efectivo hoy · ' + outs.length + '</div></div>'
      + '<div class="card"><div class="n">' + money(egHoy.reduce(function (a, e) { return a + Number(e.amount || 0) }, 0)) + '</div><div class="l">Egresos hoy · ' + egHoy.length + '</div></div></div>'
    var sub = c.querySelector('.sub')
    if (sub) sub.insertAdjacentHTML('afterend', h)
    else c.insertAdjacentHTML('afterbegin', h)
  }

  window.PosMirror = {
    transacciones: transacciones,
    inventario: inventario,
    caja: caja,
    // expuestos para pruebas
    _calcMargin: calcMargin,
    _norm: norm,
    _buildProductOp: buildProductOp
  }
})()
