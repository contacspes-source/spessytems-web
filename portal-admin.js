/* ============================================================================
 * SPES · Portal — ADMINISTRACIÓN DEL NEGOCIO DESDE LA WEB (nov-2026 · ADR-097)
 *
 * Amplía ADR-096 ("el portal es una caja más"): además de editar artículos,
 * desde la web ahora se puede dar de alta artículos, ajustar existencias
 * (entradas, mermas, conteo físico), administrar categorías, proveedores y
 * clientes (con puntos), editar empleados y los datos del negocio.
 *
 * Cómo viaja cada cambio — SIN tocar el servidor ni el POS:
 *   · Catálogos (products, product_barcodes, categories, suppliers, customers,
 *     employees) → op `catalog.upsert` con el registro COMPLETO y updated_at
 *     nuevo. sync_push lo materializa en `records` y cada caja lo aplica en su
 *     siguiente pull (~1 min) con su guarda LWW (applyRemoteCatalog).
 *   · Existencias → op `stock.movement` (entrada `receive` o ajuste `adjust`).
 *     La existencia JAMÁS se escribe como número: viaja el movimiento y cada
 *     caja lo SUMA (regla permanente de ADR-096). El servidor la recalcula con
 *     sync_stock_levels().
 *   · Puntos de lealtad → op `loyalty.movement` (contrato C1: entity_id =
 *     customer_id, payload.points_change ±). sync_loyalty_levels() lo suma.
 *   · Datos del negocio → UPDATE directo a control.businesses (RLS: solo la
 *     fila propia).
 *
 * Límites deliberados (soberanía de la caja): no se crean empleados (el PIN
 * nunca sale de la caja, un empleado nuevo desde la web no podría entrar), no
 * se tocan ventas ni caja, y los SKU web llevan prefijo "W" para no chocar con
 * la numeración P###### de la caja (el INSERT OR REPLACE del POS borraría al
 * artículo que tuviera el mismo SKU).
 *
 * Uso: PortalAdmin.* (ver al final). ctx = { ST, sb, sbc, esc, money, modalShell, closeModal }
 * ========================================================================== */
(function () {
  'use strict'

  var DEVICE_KEY = 'spes.portal.device' // mismo "dispositivo web" que portal-pos.js
  var DEFAULT_BRANCH = '00000000-0000-4000-8000-000000000001'
  var ROLES = [['ADMINISTRADOR', 'Administrador'], ['CAJERO', 'Cajero']]
  /** Campos que JAMÁS viajan desde la web (soberanía de la caja). */
  var NEVER = ['stock_current', 'loyalty_points', 'pin_hash', 'must_change_pin', '_account', 'synced_at']

  /* ------------------------------- utilidades ------------------------------- */
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID()
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    })
  }
  function deviceId() {
    var id = null
    try { id = window.localStorage.getItem(DEVICE_KEY) } catch (_) { /* sin storage */ }
    if (!id) {
      id = uuid()
      try { window.localStorage.setItem(DEVICE_KEY, id) } catch (_) { /* sin storage */ }
    }
    return id
  }
  function byId(x) { return document.getElementById(x) }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim() }
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100 }
  function r3(n) { return Math.round((Number(n) || 0) * 1000) / 1000 }
  function clean(v) { return v == null || v === 'null' || v === 'undefined' ? '' : String(v) }
  function orNull(v) { v = String(v == null ? '' : v).trim(); return v ? v : null }
  function toast(msg, type) { if (window.SpesUI && window.SpesUI.toast) window.SpesUI.toast(msg, type || 'ok') }
  var seqBase = Date.now()
  function nextSeq() { seqBase = Math.max(seqBase + 1, Date.now()); return seqBase }

  /** Sucursal de los registros (la que más usan los artículos de la cuenta). */
  function branchOf(ST) {
    var n = {}
    ;(ST.PRODUCTS || []).forEach(function (p) { if (p.branch_id) n[p.branch_id] = (n[p.branch_id] || 0) + 1 })
    var best = null
    Object.keys(n).forEach(function (k) { if (!best || n[k] > n[best]) best = k })
    return best || DEFAULT_BRANCH
  }

  /* ------------------------- constructores de ops (puros) ------------------------- */
  /**
   * catalog.upsert con el registro COMPLETO (la caja hace INSERT OR REPLACE).
   * Quita lo que nunca debe viajar y pone updated_at nuevo (gana LWW).
   */
  function catalogOp(entity, base, changes, nowIso, dev, opId) {
    var payload = Object.assign({}, base || {}, changes || {}, { updated_at: nowIso })
    NEVER.forEach(function (k) { delete payload[k] })
    if (!payload.id) throw new Error('El registro no tiene id')
    if (payload.is_deleted == null) payload.is_deleted = 0
    return { op_id: opId || uuid(), device_id: dev || deviceId(), seq: nextSeq(), entity: entity, entity_id: String(payload.id), op_type: 'catalog.upsert', payload: payload, created_at: nowIso }
  }

  /** stock.movement: la caja SUMA qty_change a su existencia local. */
  function stockOp(o, nowIso, dev, opId) {
    var change = r3(o.qtyChange)
    if (!change) throw new Error('El movimiento no cambia la existencia')
    if (o.type !== 'receive' && o.type !== 'adjust') throw new Error('Tipo de movimiento inválido')
    var before = r3(o.before)
    var mid = uuid()
    var payload = {
      id: mid, branch_id: o.branchId || DEFAULT_BRANCH, product_id: o.productId, type: o.type,
      qty_change: change, qty_before: before, qty_after: r3(before + change),
      cost: o.cost == null || o.cost === '' ? null : r2(o.cost), reason: orNull(o.reason),
      employee_id: null, sale_id: null, created_at: nowIso, updated_at: nowIso, is_deleted: 0
    }
    return { op_id: opId || uuid(), device_id: dev || deviceId(), seq: nextSeq(), entity: 'stock_movement', entity_id: mid, op_type: 'stock.movement', payload: payload, created_at: nowIso }
  }

  /** loyalty.movement (contrato C1: entity_id = customer_id). */
  function loyaltyOp(o, nowIso, dev, opId) {
    var change = Math.round(Number(o.pointsChange) || 0)
    if (!change) throw new Error('El movimiento no cambia los puntos')
    var payload = {
      id: uuid(), branch_id: o.branchId || DEFAULT_BRANCH, customer_id: o.customerId, points_change: change,
      reason: orNull(o.reason), sale_id: null, employee_id: null, created_at: nowIso, updated_at: nowIso, is_deleted: 0
    }
    return { op_id: opId || uuid(), device_id: dev || deviceId(), seq: nextSeq(), entity: 'loyalty_movement', entity_id: o.customerId, op_type: 'loyalty.movement', payload: payload, created_at: nowIso }
  }

  /** Artículo NUEVO con todas las columnas que exige la caja (NOT NULL incluidas). */
  function newProductRecord(f, branchId, nowIso) {
    return {
      id: uuid(), branch_id: branchId, sku: f.sku, barcode: orNull(f.barcode), name: String(f.name).trim(),
      description: null, category_id: orNull(f.category_id), brand: null, supplier_id: orNull(f.supplier_id),
      image_path: null, unit_id: f.unit_id || 'unit_pieza', secondary_unit_id: null, secondary_factor: null,
      is_weighed: f.is_weighed ? 1 : 0, cost_price: r2(f.cost_price), price_retail: r2(f.price_retail),
      wholesale_discount_pct: 0, stock_min: Number(f.stock_min) || 0, is_active: 1, expiry_date: null, tax_rate: 0,
      tier_template_id: null, price_template_id: null, price_mode: 'manual', sellable: 1, stockable: 1,
      archived: 0, age_restricted: 0, reporting_category_id: null, package_price: null,
      created_at: nowIso, updated_at: nowIso, is_deleted: 0
    }
  }
  /** SKU web: prefijo W + base36 del reloj (no choca con P###### de la caja). */
  function webSku(ST) {
    var used = {}
    ;(ST.PRODUCTS || []).forEach(function (p) { used[String(p.sku || '').toUpperCase()] = 1 })
    var s
    do { s = 'W' + Date.now().toString(36).toUpperCase().slice(-6) + Math.floor(Math.random() * 36).toString(36).toUpperCase() } while (used[s])
    return s
  }
  /** ¿Ese código de barras ya lo usa OTRO artículo vivo? Devuelve su nombre. */
  function barcodeOwner(ST, code, exceptProductId) {
    code = String(code || '').trim(); if (!code) return null
    var hit = null
    ;(ST.PRODUCTS || []).forEach(function (p) { if (!hit && !p.is_deleted && p.id !== exceptProductId && String(p.barcode || '') === code) hit = p })
    if (!hit) {
      ;(ST.BARCODES || []).forEach(function (b) {
        if (!hit && !Number(b.is_deleted) && b.product_id !== exceptProductId && String(b.barcode) === code) {
          hit = (ST.PRODUCTS || []).filter(function (p) { return p.id === b.product_id })[0] || { name: 'otro artículo' }
        }
      })
    }
    return hit ? (hit.name || 'otro artículo') : null
  }
  /** Ops para fijar/cambiar/quitar el código PRIMARIO de un artículo. */
  function barcodeOps(ST, product, code, nowIso, branchId) {
    code = String(code || '').trim()
    var prim = (ST.BARCODES || []).filter(function (b) { return b.product_id === product.id && Number(b.is_primary) === 1 && !Number(b.is_deleted) })[0]
    if (!code) return prim ? [catalogOp('product_barcodes', prim, { is_deleted: 1 }, nowIso)] : []
    if (prim) return String(prim.barcode) === code ? [] : [catalogOp('product_barcodes', prim, { barcode: code }, nowIso)]
    return [catalogOp('product_barcodes', {
      id: uuid(), branch_id: branchId, product_id: product.id, barcode: code, is_primary: 1, sells_as: 'base', created_at: nowIso, is_deleted: 0
    }, {}, nowIso)]
  }

  /* --------------------------- envío + estado local --------------------------- */
  async function push(ctx, ops) {
    if (!ops.length) return
    var res = await ctx.sb.rpc('sync_push', { p_ops: ops })
    if (res.error) throw res.error
    ops.forEach(function (op) { applyLocal(ctx.ST, op) })
  }
  /** Refleja en memoria lo que se acaba de enviar (sin volver a descargar). */
  function applyLocal(ST, op) {
    var p = op.payload
    if (op.op_type === 'stock.movement') { ST.STOCK[p.product_id] = r3((Number(ST.STOCK[p.product_id]) || 0) + p.qty_change); return }
    if (op.op_type === 'loyalty.movement') { ST.POINTS[p.customer_id] = (Number(ST.POINTS[p.customer_id]) || 0) + p.points_change; return }
    var dead = Number(p.is_deleted) === 1
    var put = function (key) {
      var arr = ST[key] = ST[key] || []
      var i = arr.findIndex(function (x) { return x.id === p.id })
      if (dead) { if (i >= 0) arr.splice(i, 1); return }
      if (i >= 0) arr[i] = Object.assign({}, arr[i], p); else arr.push(Object.assign({}, p))
    }
    switch (op.entity) {
      case 'products': put('PRODUCTS'); break
      case 'product_barcodes': put('BARCODES'); break
      case 'customers': put('CUSTOMERS'); break
      case 'employees': put('EMPLOYEES'); break
      case 'categories': put('CATS_ROWS'); ST.CATEGORIES = ST.CATEGORIES || {}; if (dead) delete ST.CATEGORIES[p.id]; else ST.CATEGORIES[p.id] = p.name; break
      case 'suppliers': put('SUPPLIERS_ROWS'); ST.SUPPLIERS = ST.SUPPLIERS || {}; if (dead) delete ST.SUPPLIERS[p.id]; else ST.SUPPLIERS[p.id] = p.name; break
    }
  }
  function errMsg(e) { return 'No se pudo guardar: ' + ((e && e.message) || 'revisa tu conexión') }

  /* ------------------------------ formulario genérico ------------------------------ */
  /**
   * fields: [{ key, label, type:'text'|'number'|'select'|'textarea'|'check', value,
   *            options:[[v,l]], required, min, step, help, placeholder, maxlength, half }]
   * onSubmit(vals) → Promise<string|null> (texto de error o null = OK, cierra).
   */
  function form(ctx, o) {
    var esc = ctx.esc, h = '<h3>' + esc(o.title) + '</h3>' + (o.subtitle ? '<p class="muted" style="margin-top:4px">' + o.subtitle + '</p>' : '')
    var open = false
    o.fields.forEach(function (f, i) {
      var next = o.fields[i + 1]
      if (f.half && !open) { h += '<div class="grid2" style="gap:10px">'; open = true }
      h += f.half ? '<div>' : ''
      if (f.type === 'check') {
        h += '<label style="display:flex;align-items:center;gap:8px;margin-top:14px;font-size:13.5px;cursor:pointer"><input type="checkbox" id="pa_' + f.key + '" style="width:auto;height:auto"' + (f.value ? ' checked' : '') + '> ' + esc(f.label) + '</label>'
      } else {
        h += '<label class="flbl" for="pa_' + f.key + '">' + esc(f.label) + (f.required ? ' *' : '') + '</label>'
        if (f.type === 'select') {
          h += '<select id="pa_' + f.key + '">' + f.options.map(function (op) { return '<option value="' + esc(op[0]) + '"' + (String(f.value == null ? '' : f.value) === String(op[0]) ? ' selected' : '') + '>' + esc(op[1]) + '</option>' }).join('') + '</select>'
        } else if (f.type === 'textarea') {
          h += '<textarea id="pa_' + f.key + '" rows="' + (f.rows || 3) + '">' + esc(f.value || '') + '</textarea>'
        } else {
          h += '<input id="pa_' + f.key + '" type="' + (f.type || 'text') + '"' + (f.min != null ? ' min="' + f.min + '"' : '') + (f.step ? ' step="' + f.step + '"' : '')
            + (f.maxlength ? ' maxlength="' + f.maxlength + '"' : '') + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + ' value="' + esc(f.value == null ? '' : f.value) + '">'
        }
      }
      if (f.help) h += '<p class="muted" style="font-size:12px;margin-top:4px">' + f.help + '</p>'
      h += f.half ? '</div>' : ''
      if (open && (!next || !next.half)) { h += '</div>'; open = false }
    })
    h += (o.extraHtml || '') + '<p id="pa_err" class="msg err"></p><div class="mrow">'
      + (o.dangerLabel ? '<button class="btn ghost" id="pa_danger" style="margin-right:auto;color:var(--bad-fg)">' + esc(o.dangerLabel) + '</button>' : '')
      + '<button class="btn ghost" id="pa_cancel">Cancelar</button><button class="btn" id="pa_save">' + esc(o.submitLabel || 'Guardar') + '</button></div>'
    ctx.modalShell(h)
    if (o.onRender) o.onRender()
    var first = o.fields.filter(function (f) { return f.type !== 'select' && f.type !== 'check' })[0]
    if (first && byId('pa_' + first.key)) { try { byId('pa_' + first.key).focus() } catch (_) {} }
    byId('pa_cancel').onclick = ctx.closeModal
    var busy = false
    var run = async function (fn, label) {
      if (busy) return
      busy = true
      var btn = byId(label === 'danger' ? 'pa_danger' : 'pa_save'), txt = btn.textContent
      btn.disabled = true; btn.textContent = 'Guardando…'; byId('pa_err').textContent = ''
      var err = null
      try { err = await fn() } catch (e) { err = errMsg(e) }
      busy = false
      if (err) { btn.disabled = false; btn.textContent = txt; byId('pa_err').textContent = err; return }
      ctx.closeModal()
    }
    byId('pa_save').onclick = function () {
      var vals = {}
      for (var i = 0; i < o.fields.length; i++) {
        var f = o.fields[i], el = byId('pa_' + f.key)
        vals[f.key] = f.type === 'check' ? el.checked : el.value
        if (f.required && !String(vals[f.key]).trim()) { byId('pa_err').textContent = 'Completa: ' + f.label; return }
        if (f.type === 'number' && String(vals[f.key]).trim() !== '') {
          var n = Number(vals[f.key])
          if (!isFinite(n) || (f.min != null && n < f.min)) { byId('pa_err').textContent = f.label + ': captura un número' + (f.min != null ? ' de ' + f.min + ' en adelante' : '') + '.'; return }
        }
      }
      run(function () { return o.onSubmit(vals) })
    }
    if (o.dangerLabel) byId('pa_danger').onclick = function () { run(o.onDanger, 'danger') }
  }

  function catOptions(ST, none) {
    return [['', none || 'Sin categoría']].concat(Object.keys(ST.CATEGORIES || {}).map(function (id) { return [id, ST.CATEGORIES[id]] }).sort(function (a, b) { return String(a[1]).localeCompare(String(b[1])) }))
  }
  function supOptions(ST) {
    return [['', 'Sin proveedor']].concat(Object.keys(ST.SUPPLIERS || {}).map(function (id) { return [id, ST.SUPPLIERS[id]] }).sort(function (a, b) { return String(a[1]).localeCompare(String(b[1])) }))
  }
  function unitOptions(ST) {
    var u = (ST.UNITS || []).filter(function (x) { return !Number(x.is_deleted) && Number(x.is_active) !== 0 })
    if (!u.length) u = [{ id: 'unit_pieza', name: 'Pieza' }, { id: 'unit_kilo', name: 'Kilo' }]
    return u.map(function (x) { return [x.id, x.name + (x.abbreviation ? ' (' + x.abbreviation + ')' : '')] }).sort(function (a, b) { return a[0] === 'unit_pieza' ? -1 : b[0] === 'unit_pieza' ? 1 : String(a[1]).localeCompare(String(b[1])) })
  }
  var SYNC_NOTE = 'Tus cajas lo reciben en ~1 minuto (necesitan internet).'

  /* ================================ ARTÍCULOS ================================ */
  function newProduct(ctx, after) {
    var ST = ctx.ST
    form(ctx, {
      title: 'Nuevo artículo', subtitle: 'Se da de alta en todas tus cajas. ' + SYNC_NOTE, submitLabel: 'Crear y enviar a la caja',
      fields: [
        { key: 'name', label: 'Nombre', required: true, maxlength: 120, placeholder: 'Ej. Refresco de cola 600 ml' },
        { key: 'barcode', label: 'Código de barras', maxlength: 40, placeholder: 'Escanéalo o tecléalo (opcional)', half: true },
        { key: 'category_id', label: 'Categoría', type: 'select', options: catOptions(ST), half: true },
        { key: 'unit_id', label: 'Unidad', type: 'select', options: unitOptions(ST), value: 'unit_pieza', half: true },
        { key: 'supplier_id', label: 'Proveedor', type: 'select', options: supOptions(ST), half: true },
        { key: 'is_weighed', label: 'Se vende a granel (se pesa en báscula, precio por kg)', type: 'check' },
        { key: 'cost_price', label: 'Costo', type: 'number', min: 0, step: '0.01', value: '', half: true },
        { key: 'price_retail', label: 'Precio de venta', type: 'number', min: 0, step: '0.01', required: true, half: true },
        { key: 'stock_min', label: 'Existencia mínima (alerta)', type: 'number', min: 0, step: '1', value: 0, half: true },
        { key: 'stock', label: 'Existencia inicial', type: 'number', min: 0, step: 'any', value: 0, half: true, help: 'Entra como movimiento "Inventario inicial".' }
      ],
      onRender: function () {
        var u = byId('pa_unit_id'), w = byId('pa_is_weighed')
        u.onchange = function () { if (/kilo|gramo/.test(u.value)) w.checked = true }
      },
      onSubmit: async function (v) {
        var name = String(v.name).trim()
        var dup = (ST.PRODUCTS || []).filter(function (p) { return !p.is_deleted && norm(p.name) === norm(name) })[0]
        if (dup && !v._dupOk) {
          var ok = window.confirm('Ya existe un artículo llamado "' + dup.name + '" (' + (dup.sku || '') + '). ¿Crear otro con el mismo nombre?')
          if (!ok) return 'Cambia el nombre o edita el artículo existente.'
        }
        var owner = barcodeOwner(ST, v.barcode, null)
        if (owner) return 'Ese código de barras ya es de "' + owner + '".'
        var now = new Date().toISOString(), br = branchOf(ST)
        var rec = newProductRecord({
          sku: webSku(ST), name: name, barcode: v.barcode, category_id: v.category_id, supplier_id: v.supplier_id,
          unit_id: v.unit_id, is_weighed: v.is_weighed, cost_price: v.cost_price || 0, price_retail: v.price_retail, stock_min: v.stock_min || 0
        }, br, now)
        var ops = [catalogOp('products', rec, {}, now)]
        ops = ops.concat(barcodeOps(ST, rec, v.barcode, now, br))
        var st = r3(v.stock)
        if (st > 0) ops.push(stockOp({ productId: rec.id, branchId: br, type: 'adjust', qtyChange: st, before: 0, reason: 'Inventario inicial', cost: v.cost_price || null }, now))
        await push(ctx, ops)
        toast('Artículo creado (' + rec.sku + '). ' + SYNC_NOTE)
        if (after) after()
        return null
      }
    })
  }

  /** Entradas, mermas y conteo físico: SIEMPRE como movimiento (nunca un número fijo). */
  function adjustStock(ctx, pid, after) {
    var ST = ctx.ST, esc = ctx.esc
    var p = (ST.PRODUCTS || []).filter(function (x) { return x.id === pid })[0]
    if (!p) return
    var cur = r3(ST.STOCK[p.id] || 0), unit = Number(p.is_weighed) === 1 ? ' kg' : ''
    form(ctx, {
      title: 'Ajustar existencia', subtitle: '<b>' + esc(p.name) + '</b> · existencia actual en la nube: <b>' + cur + unit + '</b>',
      submitLabel: 'Registrar y enviar a la caja',
      fields: [
        { key: 'kind', label: 'Tipo de movimiento', type: 'select', value: 'in', options: [['in', 'Entrada de mercancía (+)'], ['out', 'Merma o salida (−)'], ['count', 'Conteo físico (fijar la existencia)']] },
        { key: 'qty', label: 'Cantidad', type: 'number', min: 0, step: 'any', required: true, half: true },
        { key: 'cost', label: 'Costo unitario (entradas)', type: 'number', min: 0, step: '0.01', value: p.cost_price != null ? p.cost_price : '', half: true },
        { key: 'reason', label: 'Motivo', maxlength: 120, placeholder: 'Ej. Compra a proveedor, producto caducado, conteo del lunes…' }
      ],
      extraHtml: '<p class="muted" id="pa_prev" style="font-size:12.5px;margin-top:10px"></p><p class="muted" style="font-size:12px;margin-top:6px">Las ventas que tu caja aún no sincroniza pueden mover este número unos segundos. El ajuste viaja como movimiento y cada caja lo suma: así nunca se descuadra.</p>',
      onRender: function () {
        var k = byId('pa_kind'), q = byId('pa_qty'), prev = byId('pa_prev'), cost = byId('pa_cost')
        var upd = function () {
          var n = Number(q.value || 0), d = k.value === 'in' ? n : k.value === 'out' ? -n : n - cur
          prev.innerHTML = q.value === '' ? '' : 'Quedará en <b>' + r3(cur + d) + unit + '</b> (' + (d >= 0 ? '+' : '') + r3(d) + unit + ')'
          cost.disabled = k.value !== 'in'
        }
        k.onchange = upd; q.oninput = upd; upd()
      },
      onSubmit: async function (v) {
        var n = Number(v.qty)
        var d = v.kind === 'in' ? n : v.kind === 'out' ? -n : n - cur
        if (!r3(d)) return v.kind === 'count' ? 'La existencia ya es ' + cur + unit + ': no hay nada que ajustar.' : 'Captura una cantidad mayor a 0.'
        var reason = orNull(v.reason) || (v.kind === 'in' ? 'Entrada desde el portal' : v.kind === 'out' ? 'Salida: Merma' : 'Conteo físico desde el portal')
        if (v.kind === 'out' && !/^salida/i.test(reason)) reason = 'Salida: ' + reason
        var now = new Date().toISOString()
        await push(ctx, [stockOp({ productId: p.id, branchId: p.branch_id || branchOf(ST), type: v.kind === 'in' ? 'receive' : 'adjust', qtyChange: d, before: cur, reason: reason, cost: v.kind === 'in' ? v.cost : null }, now)])
        if (v.kind === 'out') (ST.MERMAS = ST.MERMAS || []).unshift({ product_id: p.id, qty_change: r3(d), reason: reason, created_at: now, type: 'adjust' })
        toast('Existencia ajustada. ' + SYNC_NOTE)
        if (after) after()
        return null
      }
    })
  }

  function deleteProduct(ctx, pid, after) {
    var ST = ctx.ST
    var p = (ST.PRODUCTS || []).filter(function (x) { return x.id === pid })[0]
    if (!p) return Promise.resolve(null)
    if (!window.confirm('¿Eliminar "' + p.name + '" de todas tus cajas? Las ventas pasadas lo conservan en su historial. Si solo quieres dejar de venderlo, márcalo como Inactivo.')) return Promise.resolve('Cancelado.')
    var now = new Date().toISOString()
    var ops = [catalogOp('products', p, { is_deleted: 1, is_active: 0 }, now)]
    ;(ST.BARCODES || []).filter(function (b) { return b.product_id === p.id && !Number(b.is_deleted) }).forEach(function (b) { ops.push(catalogOp('product_barcodes', b, { is_deleted: 1 }, now)) })
    return push(ctx, ops).then(function () { toast('Artículo eliminado. ' + SYNC_NOTE); if (after) after(); return null })
  }

  /* ================================ CATEGORÍAS ================================ */
  function categorias(c, ctx) {
    var ST = ctx.ST, esc = ctx.esc
    var rows = (ST.CATS_ROWS || []).filter(function (x) { return !Number(x.is_deleted) })
    var count = {}
    ;(ST.PRODUCTS || []).forEach(function (p) { if (!p.is_deleted && p.category_id) count[p.category_id] = (count[p.category_id] || 0) + 1 })
    var name = function (id) { return (ST.CATEGORIES || {})[id] || '' }
    rows.sort(function (a, b) { return (name(a.parent_id) + ' ' + a.name).localeCompare(name(b.parent_id) + ' ' + b.name) })
    var h = '<div class="sechead" style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><h2>Categorías</h2><p class="sub" style="margin-bottom:0">Organiza tus artículos. ' + SYNC_NOTE + '</p></div><button class="btn" id="cat_new">+ Nueva categoría</button></div>'
    h += '<div class="card" style="margin-top:16px;padding:6px 12px;overflow-x:auto"><table><thead><tr><th>Categoría</th><th>Dentro de</th><th style="text-align:right">Artículos</th><th></th></tr></thead><tbody>'
    if (!rows.length) h += '<tr><td colspan="4"><div class="state" style="margin:10px 0">Aún no tienes categorías. Crea la primera.</div></td></tr>'
    rows.forEach(function (r) {
      h += '<tr><td><b>' + esc(r.name) + '</b></td><td class="muted">' + esc(name(r.parent_id) || '—') + '</td><td style="text-align:right">' + (count[r.id] || 0) + '</td><td style="text-align:right"><button class="btn ghost sm" data-cat="' + esc(r.id) + '">Editar</button></td></tr>'
    })
    c.innerHTML = h + '</tbody></table></div>'
    var redraw = function () { categorias(c, ctx) }
    byId('cat_new').onclick = function () { catForm(ctx, null, redraw) }
    c.querySelectorAll('[data-cat]').forEach(function (b) { b.onclick = function () { catForm(ctx, b.getAttribute('data-cat'), redraw) } })
  }
  function catForm(ctx, id, after) {
    var ST = ctx.ST
    var cur = id ? (ST.CATS_ROWS || []).filter(function (x) { return x.id === id })[0] : null
    var used = (ST.PRODUCTS || []).filter(function (p) { return !p.is_deleted && p.category_id === id }).length
    var kids = (ST.CATS_ROWS || []).filter(function (x) { return !Number(x.is_deleted) && x.parent_id === id }).length
    form(ctx, {
      title: cur ? 'Editar categoría' : 'Nueva categoría', submitLabel: cur ? 'Guardar y enviar' : 'Crear y enviar',
      fields: [
        { key: 'name', label: 'Nombre', required: true, maxlength: 60, value: cur ? cur.name : '' },
        { key: 'parent_id', label: 'Dentro de (subcategoría)', type: 'select', value: cur ? cur.parent_id || '' : '', options: catOptions(ST, 'Ninguna (categoría principal)').filter(function (o) { return o[0] !== id }) }
      ],
      dangerLabel: cur ? 'Eliminar' : null,
      onDanger: async function () {
        if (used) return 'No se puede eliminar: ' + used + ' artículo(s) la usan. Muévelos a otra categoría primero.'
        if (kids) return 'No se puede eliminar: tiene ' + kids + ' subcategoría(s).'
        if (!window.confirm('¿Eliminar la categoría "' + cur.name + '"?')) return 'Cancelado.'
        await push(ctx, [catalogOp('categories', cur, { is_deleted: 1 }, new Date().toISOString())])
        toast('Categoría eliminada.'); if (after) after(); return null
      },
      onSubmit: async function (v) {
        var nm = String(v.name).trim()
        var clash = (ST.CATS_ROWS || []).filter(function (x) { return !Number(x.is_deleted) && x.id !== id && norm(x.name) === norm(nm) })[0]
        if (clash) return 'Ya existe una categoría "' + clash.name + '".'
        var now = new Date().toISOString()
        var base = cur || { id: uuid(), branch_id: branchOf(ST), created_at: now, is_deleted: 0 }
        await push(ctx, [catalogOp('categories', base, { name: nm, parent_id: orNull(v.parent_id) }, now)])
        toast(cur ? 'Categoría actualizada.' : 'Categoría creada.'); if (after) after(); return null
      }
    })
  }

  /* ================================ PROVEEDORES ================================ */
  function proveedores(c, ctx) {
    var ST = ctx.ST, esc = ctx.esc
    var rows = (ST.SUPPLIERS_ROWS || []).filter(function (x) { return !Number(x.is_deleted) }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)) })
    var compras = {}
    ;(ST.PURCHASES || []).forEach(function (p) { if (p.supplier_id) compras[p.supplier_id] = (compras[p.supplier_id] || 0) + 1 })
    var h = '<div class="sechead" style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><h2>Proveedores</h2><p class="sub" style="margin-bottom:0">A quién le compras. ' + SYNC_NOTE + '</p></div><button class="btn" id="sup_new">+ Nuevo proveedor</button></div>'
    h += '<div class="card" style="margin-top:16px;padding:6px 12px;overflow-x:auto"><table><thead><tr><th>Proveedor</th><th>Giro</th><th>Teléfono</th><th>Correo</th><th style="text-align:right">Compras</th><th>Estado</th><th></th></tr></thead><tbody>'
    if (!rows.length) h += '<tr><td colspan="7"><div class="state" style="margin:10px 0">Aún no tienes proveedores. Da de alta el primero.</div></td></tr>'
    rows.forEach(function (r) {
      h += '<tr><td><b>' + esc(r.name) + '</b>' + (clean(r.rfc) ? '<br><span class="mono muted" style="font-size:11.5px">' + esc(r.rfc) + '</span>' : '') + '</td><td class="muted">' + esc(clean(r.giro) || '—') + '</td><td class="mono muted">' + esc(clean(r.phone) || '—') + '</td><td class="muted">' + esc(clean(r.email) || '—') + '</td><td style="text-align:right">' + (compras[r.id] || 0) + '</td><td>'
        + (Number(r.is_active) === 0 ? '<span class="tag t-neutral">inactivo</span>' : '<span class="tag t-ok">activo</span>') + '</td><td style="text-align:right"><button class="btn ghost sm" data-sup="' + esc(r.id) + '">Editar</button></td></tr>'
    })
    c.innerHTML = h + '</tbody></table></div>'
    var redraw = function () { proveedores(c, ctx) }
    byId('sup_new').onclick = function () { supForm(ctx, null, redraw) }
    c.querySelectorAll('[data-sup]').forEach(function (b) { b.onclick = function () { supForm(ctx, b.getAttribute('data-sup'), redraw) } })
  }
  function supForm(ctx, id, after) {
    var ST = ctx.ST
    var cur = id ? (ST.SUPPLIERS_ROWS || []).filter(function (x) { return x.id === id })[0] : null
    form(ctx, {
      title: cur ? 'Editar proveedor' : 'Nuevo proveedor', submitLabel: cur ? 'Guardar y enviar' : 'Crear y enviar',
      fields: [
        { key: 'name', label: 'Nombre', required: true, maxlength: 80, value: cur ? cur.name : '' },
        { key: 'giro', label: 'Giro', maxlength: 60, value: cur ? clean(cur.giro) : '', placeholder: 'Ej. Abarrotes, refrescos, frutas…', half: true },
        { key: 'rfc', label: 'RFC', maxlength: 13, value: cur ? clean(cur.rfc) : '', half: true },
        { key: 'phone', label: 'Teléfono', maxlength: 20, value: cur ? clean(cur.phone) : '', half: true },
        { key: 'email', label: 'Correo', type: 'email', maxlength: 80, value: cur ? clean(cur.email) : '', half: true },
        { key: 'is_active', label: 'Activo', type: 'check', value: cur ? Number(cur.is_active) !== 0 : true }
      ],
      dangerLabel: cur ? 'Eliminar' : null,
      onDanger: async function () {
        var used = (ST.PRODUCTS || []).filter(function (p) { return !p.is_deleted && p.supplier_id === id }).length
        if (used) return 'No se puede eliminar: ' + used + ' artículo(s) lo tienen como proveedor. Márcalo como inactivo.'
        if (!window.confirm('¿Eliminar al proveedor "' + cur.name + '"? Sus compras pasadas se conservan.')) return 'Cancelado.'
        await push(ctx, [catalogOp('suppliers', cur, { is_deleted: 1 }, new Date().toISOString())])
        toast('Proveedor eliminado.'); if (after) after(); return null
      },
      onSubmit: async function (v) {
        var now = new Date().toISOString()
        var base = cur || { id: uuid(), branch_id: branchOf(ST), created_at: now, is_deleted: 0 }
        await push(ctx, [catalogOp('suppliers', base, {
          name: String(v.name).trim(), giro: orNull(v.giro), rfc: orNull(String(v.rfc || '').toUpperCase()), phone: orNull(v.phone), email: orNull(v.email), is_active: v.is_active ? 1 : 0
        }, now)])
        toast(cur ? 'Proveedor actualizado.' : 'Proveedor creado.'); if (after) after(); return null
      }
    })
  }

  /* ================================= CLIENTES ================================= */
  function clientes(c, ctx) {
    var ST = ctx.ST, esc = ctx.esc
    if (!ST._cli) ST._cli = { q: '' }
    var f = ST._cli, q = norm(f.q)
    var all = (ST.CUSTOMERS || []).filter(function (x) { return !Number(x.is_deleted) })
    var act = all.filter(function (x) { return Number(x.is_active) !== 0 })
    var pts = function (x) { return Number((ST.POINTS || {})[x.id] || 0) }
    var list = all.filter(function (x) { return !q || norm(x.name).indexOf(q) >= 0 || norm(x.phone).indexOf(q) >= 0 }).sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')) })
    var h = '<div class="sechead" style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><h2>Clientes</h2><p class="sub" style="margin-bottom:0">Tu directorio y los puntos de lealtad. ' + SYNC_NOTE + '</p></div><button class="btn" id="cli_new">+ Nuevo cliente</button></div>'
    h += '<div class="cards" style="margin-top:16px"><div class="card"><div class="n">' + act.length + '</div><div class="l">Clientes activos</div></div>'
      + '<div class="card"><div class="n">' + act.filter(function (x) { return pts(x) > 0 }).length + '</div><div class="l">Con puntos</div></div>'
      + '<div class="card"><div class="n">' + act.reduce(function (a, x) { return a + pts(x) }, 0).toLocaleString('es-MX') + '</div><div class="l">Puntos en circulación</div></div></div>'
    h += '<div class="pm-tools"><input class="pm-search" id="cli_q" placeholder="Buscar por nombre o teléfono…" value="' + esc(f.q) + '"></div>'
    h += '<div class="card" style="padding:6px 12px;overflow-x:auto"><table><thead><tr><th>Cliente</th><th>Teléfono</th><th style="text-align:right">Puntos</th><th>Estado</th><th></th></tr></thead><tbody>'
    if (!list.length) h += '<tr><td colspan="5"><div class="state" style="margin:10px 0">' + (all.length ? 'Sin clientes con esa búsqueda.' : 'Aún no tienes clientes. Da de alta el primero o regístralos desde la caja.') + '</div></td></tr>'
    list.slice(0, 300).forEach(function (x) {
      h += '<tr><td><b>' + esc(x.name || '—') + '</b>' + (clean(x.email) ? '<br><span class="muted" style="font-size:12px">' + esc(x.email) + '</span>' : '') + '</td><td class="mono muted">' + esc(clean(x.phone) || '—') + '</td><td style="text-align:right"><b>' + pts(x).toLocaleString('es-MX') + '</b></td><td>'
        + (Number(x.is_active) === 0 ? '<span class="tag t-neutral">inactivo</span>' : '<span class="tag t-ok">activo</span>') + '</td><td style="text-align:right;white-space:nowrap"><button class="btn ghost sm" data-pts="' + esc(x.id) + '">Puntos</button> <button class="btn ghost sm" data-cli="' + esc(x.id) + '">Editar</button></td></tr>'
    })
    c.innerHTML = h + '</tbody></table></div><p class="muted" style="margin-top:8px">Los puntos se calculan en el servidor sumando cada movimiento de lealtad de todas tus cajas.</p>'
    var redraw = function () { clientes(c, ctx) }
    byId('cli_new').onclick = function () { cliForm(ctx, null, redraw) }
    var qEl = byId('cli_q'), t = null
    qEl.oninput = function () { clearTimeout(t); t = setTimeout(function () { f.q = qEl.value; redraw(); var e = byId('cli_q'); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length) } }, 200) }
    c.querySelectorAll('[data-cli]').forEach(function (b) { b.onclick = function () { cliForm(ctx, b.getAttribute('data-cli'), redraw) } })
    c.querySelectorAll('[data-pts]').forEach(function (b) { b.onclick = function () { ptsForm(ctx, b.getAttribute('data-pts'), redraw) } })
  }
  function cliForm(ctx, id, after) {
    var ST = ctx.ST
    var cur = id ? (ST.CUSTOMERS || []).filter(function (x) { return x.id === id })[0] : null
    form(ctx, {
      title: cur ? 'Editar cliente' : 'Nuevo cliente', submitLabel: cur ? 'Guardar y enviar' : 'Crear y enviar',
      fields: [
        { key: 'name', label: 'Nombre', required: true, maxlength: 80, value: cur ? cur.name : '' },
        { key: 'phone', label: 'Teléfono', maxlength: 20, value: cur ? clean(cur.phone) : '', half: true },
        { key: 'email', label: 'Correo', type: 'email', maxlength: 80, value: cur ? clean(cur.email) : '', half: true },
        { key: 'address', label: 'Dirección', maxlength: 160, value: cur ? clean(cur.address) : '' },
        { key: 'notes', label: 'Notas', type: 'textarea', rows: 2, value: cur ? clean(cur.notes) : '' },
        { key: 'is_active', label: 'Activo', type: 'check', value: cur ? Number(cur.is_active) !== 0 : true }
      ],
      onSubmit: async function (v) {
        var now = new Date().toISOString()
        var base = cur || { id: uuid(), branch_id: branchOf(ST), created_at: now, is_deleted: 0 }
        await push(ctx, [catalogOp('customers', base, {
          name: String(v.name).trim(), phone: orNull(v.phone), email: orNull(v.email), address: orNull(v.address), notes: orNull(v.notes), is_active: v.is_active ? 1 : 0
        }, now)])
        toast(cur ? 'Cliente actualizado.' : 'Cliente creado.'); if (after) after(); return null
      }
    })
  }
  function ptsForm(ctx, id, after) {
    var ST = ctx.ST, esc = ctx.esc
    var cur = (ST.CUSTOMERS || []).filter(function (x) { return x.id === id })[0]
    if (!cur) return
    var have = Number((ST.POINTS || {})[id] || 0)
    form(ctx, {
      title: 'Puntos de ' + cur.name, subtitle: 'Saldo actual: <b>' + have.toLocaleString('es-MX') + '</b> puntos.', submitLabel: 'Registrar y enviar',
      fields: [
        { key: 'kind', label: 'Movimiento', type: 'select', value: 'add', options: [['add', 'Regalar / sumar puntos (+)'], ['sub', 'Quitar / canjear puntos (−)']] },
        { key: 'pts', label: 'Puntos', type: 'number', min: 1, step: '1', required: true },
        { key: 'reason', label: 'Motivo', maxlength: 120, placeholder: 'Ej. Cortesía, corrección, canje por producto…' }
      ],
      onSubmit: async function (v) {
        var n = Math.round(Number(v.pts) || 0)
        if (n <= 0) return 'Captura cuántos puntos.'
        var d = v.kind === 'add' ? n : -n
        if (have + d < 0) return 'No le alcanza: tiene ' + have + ' puntos.'
        await push(ctx, [loyaltyOp({ customerId: id, branchId: cur.branch_id || branchOf(ST), pointsChange: d, reason: orNull(v.reason) || 'Ajuste desde el portal' }, new Date().toISOString())])
        toast('Puntos ' + (d > 0 ? 'sumados' : 'descontados') + '. ' + SYNC_NOTE); if (after) after(); return null
      }
    })
  }

  /* ================================= EMPLEADOS ================================= */
  function empleados(c, ctx) {
    var ST = ctx.ST, esc = ctx.esc
    var all = (ST.EMPLOYEES || []).filter(function (x) { return !Number(x.is_deleted) })
    var act = all.filter(function (x) { return Number(x.is_active) !== 0 })
    var h = '<h2>Empleados</h2><p class="sub">Tu equipo, tal como está dado de alta en el POS. Puedes editar sus datos, rol y sueldo, o desactivarlos. ' + SYNC_NOTE + '</p>'
    h += '<div class="cards"><div class="card"><div class="n">' + act.length + '</div><div class="l">Activos</div></div><div class="card"><div class="n">' + all.length + '</div><div class="l">Total</div></div><div class="card"><div class="n">' + (ST.FLEET || []).length + '</div><div class="l">Cajas conectadas</div></div></div>'
    if (!all.length) { c.innerHTML = h + '<div class="state" style="margin-top:16px">Aún no hay empleados sincronizados. Actualiza tu POS a la versión más reciente y aparecerán aquí solos.</div>'; return }
    h += '<div class="card" style="margin-top:16px;padding:6px 12px;overflow-x:auto"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Puesto</th><th style="text-align:right">$/hora</th><th>Estado</th><th></th></tr></thead><tbody>'
    all.sort(function (a, b) { return String(a.full_name || '').localeCompare(String(b.full_name || '')) }).forEach(function (e) {
      h += '<tr><td><b>' + esc(e.full_name || '—') + '</b>' + (clean(e.phone) ? '<br><span class="mono muted" style="font-size:11.5px">' + esc(e.phone) + '</span>' : '') + '</td><td class="mono muted">' + esc(e.username || '—') + '</td><td>' + esc(String(e.role || '—').toLowerCase()) + '</td><td class="muted">' + esc(clean(e.position) || '—') + '</td><td style="text-align:right">' + (e.hourly_rate != null && clean(e.hourly_rate) ? ctx.money(e.hourly_rate) : '—') + '</td><td>'
        + (Number(e.is_active) === 0 ? '<span class="tag t-neutral">inactivo</span>' : '<span class="tag t-ok">activo</span>') + '</td><td style="text-align:right"><button class="btn ghost sm" data-emp="' + esc(e.id) + '">Editar</button></td></tr>'
    })
    c.innerHTML = h + '</tbody></table></div><p class="muted" style="margin-top:8px">Por seguridad, los PIN de acceso nunca salen de cada caja: los empleados nuevos y los cambios de PIN se hacen en la caja.</p>'
    var redraw = function () { empleados(c, ctx) }
    c.querySelectorAll('[data-emp]').forEach(function (b) { b.onclick = function () { empForm(ctx, b.getAttribute('data-emp'), redraw) } })
  }
  function empForm(ctx, id, after) {
    var ST = ctx.ST
    var cur = (ST.EMPLOYEES || []).filter(function (x) { return x.id === id })[0]
    if (!cur) return
    var roles = ROLES.slice()
    if (cur.role && !roles.some(function (r) { return r[0] === cur.role })) roles.push([cur.role, String(cur.role).toLowerCase()])
    form(ctx, {
      title: 'Editar empleado', subtitle: 'Usuario en la caja: <b class="mono">' + ctx.esc(cur.username || '—') + '</b>', submitLabel: 'Guardar y enviar',
      fields: [
        { key: 'full_name', label: 'Nombre completo', required: true, maxlength: 80, value: cur.full_name || '' },
        { key: 'role', label: 'Rol en la caja', type: 'select', value: cur.role || 'CAJERO', options: roles, half: true },
        { key: 'position', label: 'Puesto', maxlength: 40, value: clean(cur.position), half: true },
        { key: 'phone', label: 'Teléfono', maxlength: 20, value: clean(cur.phone), half: true },
        { key: 'hourly_rate', label: 'Sueldo por hora', type: 'number', min: 0, step: '0.5', value: clean(cur.hourly_rate), half: true },
        { key: 'is_active', label: 'Activo (puede entrar a la caja)', type: 'check', value: Number(cur.is_active) !== 0 }
      ],
      onSubmit: async function (v) {
        if (v.role !== cur.role && v.role === 'ADMINISTRADOR' && !window.confirm('Un Administrador puede cambiar precios, ver reportes y configurar la caja. ¿Dar ese rol a ' + v.full_name + '?')) return 'Cancelado.'
        await push(ctx, [catalogOp('employees', cur, {
          full_name: String(v.full_name).trim(), role: v.role, position: orNull(v.position), phone: orNull(v.phone),
          hourly_rate: String(v.hourly_rate).trim() === '' ? null : r2(v.hourly_rate), is_active: v.is_active ? 1 : 0
        }, new Date().toISOString())])
        toast('Empleado actualizado. ' + SYNC_NOTE); if (after) after(); return null
      }
    })
  }

  /* ============================= DATOS DEL NEGOCIO ============================= */
  /** Tarjeta para Configuración: datos del negocio y fiscales (control.businesses, fila propia). */
  function negocioCard(ctx) {
    var b = ctx.ST.biz || {}, esc = ctx.esc
    var kv = function (k, v) { return '<dt>' + k + '</dt><dd>' + (clean(v) ? esc(v) : '<span class="muted">—</span>') + '</dd>' }
    return '<div class="card" style="max-width:560px;margin-bottom:14px"><div class="sechead" style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-size:14px;font-weight:800">Datos del negocio</h3><button class="btn ghost sm" id="biz_edit">Editar</button></div>'
      + '<dl class="kv" style="margin-top:8px">' + kv('Negocio', b.business_name) + kv('Responsable', b.owner_nombre) + kv('Teléfono', b.owner_telefono) + kv('Ciudad', b.ciudad)
      + kv('Razón social', b.razon_social) + kv('RFC', b.rfc) + kv('Régimen fiscal', b.regimen_fiscal) + kv('C.P. fiscal', b.cp_fiscal) + '</dl>'
      + '<p class="muted" style="font-size:12px;margin-top:10px">Los datos fiscales se usan para tus recibos y, cuando lo actives, tu factura.</p></div>'
  }
  function bindNegocio(ctx, after) {
    var btn = byId('biz_edit'); if (!btn) return
    btn.onclick = function () {
      var b = ctx.ST.biz || {}
      form(ctx, {
        title: 'Datos del negocio', submitLabel: 'Guardar',
        fields: [
          { key: 'business_name', label: 'Nombre del negocio', required: true, maxlength: 80, value: clean(b.business_name) },
          { key: 'owner_nombre', label: 'Responsable', maxlength: 80, value: clean(b.owner_nombre), half: true },
          { key: 'owner_telefono', label: 'Teléfono', maxlength: 20, value: clean(b.owner_telefono), half: true },
          { key: 'ciudad', label: 'Ciudad', maxlength: 60, value: clean(b.ciudad) },
          { key: 'razon_social', label: 'Razón social', maxlength: 120, value: clean(b.razon_social) },
          { key: 'rfc', label: 'RFC', maxlength: 13, value: clean(b.rfc), half: true },
          { key: 'cp_fiscal', label: 'C.P. fiscal', maxlength: 5, value: clean(b.cp_fiscal), half: true },
          { key: 'regimen_fiscal', label: 'Régimen fiscal', maxlength: 80, value: clean(b.regimen_fiscal), placeholder: 'Ej. 626 RESICO' },
          { key: 'direccion_fiscal', label: 'Dirección fiscal', maxlength: 200, value: clean(b.direccion_fiscal) }
        ],
        onSubmit: async function (v) {
          var rfc = String(v.rfc || '').trim().toUpperCase()
          if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) return 'El RFC no tiene un formato válido (12 o 13 caracteres).'
          if (v.cp_fiscal && !/^\d{5}$/.test(String(v.cp_fiscal).trim())) return 'El C.P. debe tener 5 dígitos.'
          var upd = {
            business_name: String(v.business_name).trim(), owner_nombre: orNull(v.owner_nombre), owner_telefono: orNull(v.owner_telefono), ciudad: orNull(v.ciudad),
            razon_social: orNull(v.razon_social), rfc: orNull(rfc), cp_fiscal: orNull(v.cp_fiscal), regimen_fiscal: orNull(v.regimen_fiscal), direccion_fiscal: orNull(v.direccion_fiscal)
          }
          var res = await ctx.sbc.from('businesses').update(upd).eq('id', ctx.ST.uid).select().maybeSingle()
          if (res.error) throw res.error
          if (!res.data) return 'No se encontró la ficha de tu negocio. Escríbenos a soporte.'
          ctx.ST.biz = Object.assign({}, ctx.ST.biz || {}, res.data)
          toast('Datos del negocio guardados.'); if (after) after(); return null
        }
      })
    }
  }

  window.PortalAdmin = {
    newProduct: newProduct, adjustStock: adjustStock, deleteProduct: deleteProduct, barcodeOps: barcodeOps, barcodeOwner: barcodeOwner,
    categorias: categorias, proveedores: proveedores, clientes: clientes, empleados: empleados,
    negocioCard: negocioCard, bindNegocio: bindNegocio, push: push, branchOf: branchOf,
    // expuestos para pruebas
    _catalogOp: catalogOp, _stockOp: stockOp, _loyaltyOp: loyaltyOp, _newProductRecord: newProductRecord, _webSku: webSku, _applyLocal: applyLocal
  }
})()
