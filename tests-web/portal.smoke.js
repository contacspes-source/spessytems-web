/* Smoke del Portal del cliente: monta portal.html en jsdom con stubs y datos
   falsos, ejecuta CADA sección (espejo del negocio) y verifica que pinte lo
   esperado sin lanzar errores, incluidos los estados vacíos guía.
   Corre desde tests-web/ con `npm test` (lee ../portal.html del repo). */
const fs = require('fs')
const path = require('path')
const { JSDOM } = require('jsdom')

const ROOT = path.join(__dirname, '..')
let html = fs.readFileSync(path.join(ROOT, 'portal.html'), 'utf8')
const spesUi = fs.readFileSync(path.join(ROOT, 'spes-ui.js'), 'utf8')
const spesData = fs.readFileSync(path.join(ROOT, 'spes-data.js'), 'utf8')

// Stub mínimo de supabase-js: cadena de query encadenable que resuelve vacío.
const stub = `
window.__q = () => { const p = Promise.resolve({ data: [], error: null });
  const h = { select(){return h}, eq(){return h}, in(){return h}, gte(){return h},
    order(){return h}, limit(){return h}, maybeSingle(){ return Promise.resolve({data:null,error:null}) },
    insert(){return h}, then(f,r){ return p.then(f,r) } };
  return h; };
window.supabase = { createClient: () => ({
  auth: {
    getSession: async () => ({ data: { session: null } }),
    getUser: async () => ({ error: null }),
    onAuthStateChange: () => {},
    signInWithPassword: async () => ({ error: null }),
    signInWithOAuth: async () => ({ error: null }),
    signOut: async () => {}
  },
  from: () => window.__q(),
  rpc: async () => ({ data: [], error: null }),
  schema: () => ({ from: () => window.__q() })
}) };
`
// Inyectar stubs e inlinear spes-ui (jsdom no descarga recursos externos).
html = html
  .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[^"]*"><\/script>/, '<script>' + stub + '</script>')
  .replace('<script src="/spes-ui.js"></script>', () => '<script>' + spesUi.replace(/<\/script>/g, '<\\/script>') + '</script>')
  .replace('<script src="/spes-data.js"></script>', () => '<script>' + spesData.replace(/<\/script>/g, '<\\/script>') + '</script>')

const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://spessystems.com/portal' })
const w = dom.window
const errors = []
w.addEventListener('error', (e) => errors.push('window.onerror: ' + e.message))

setTimeout(() => {
  try { run(w) } catch (e) { console.error('FALLO DEL ARNÉS:', e); process.exit(1) }
}, 150)

function run(w) {
  const d = w.document
  const now = new Date().toISOString()
  const hoy = now

  // ── Datos falsos de TODOS los dominios del Bloque C ──
  w.eval(`
    const NOW='${now}';
    ST.uid='acc-1'; ST.biz={business_name:'Frutería Prueba'};
    ST.sub={plan:'basico',estado:'activa',vence:new Date(Date.now()+4*86400000).toISOString().slice(0,10),precio_mxn:369};
    ST.PLANES=[{clave:'basico',nombre:'Básico',precio_mxn:369}];
    ST.SALES=[
      {id:'s1',folio:'VAA-000001',total:150,status:'completed',created_at:NOW},
      {id:'s2',folio:'VBB-000001',total:80,status:'completed',created_at:NOW},
      {id:'s3',folio:'VAA-000002',total:50,status:'cancelled',created_at:NOW}
    ];
    ST.MONTH_SALES=[{status:'completed',created_at:NOW,data:{sale:{},items:[{name:'Manzana',quantity:3,line_total:90},{name:'Plátano',quantity:2,line_total:40}]}}];
    ST.PRODUCTS=[{id:'p1',name:'Manzana',sku:'P000001',stock_min:5,price_retail:30,wholesale_discount_pct:10,is_active:1}];
    ST.STOCK={p1:2};
    ST.FLEET=[
      {device_id:'11111111-aaaa',app_version:'0.5.0',platform:'win32',first_seen_at:NOW,last_seen_at:NOW},
      {device_id:'22222222-bbbb',app_version:'0.4.0',platform:'win32',first_seen_at:NOW,last_seen_at:new Date(Date.now()-9*86400000).toISOString()}
    ];
    ST.SUPPLIERS={sup1:'Abarrotes del Norte'};
    ST.PURCHASES=[{id:'po1',folio:'CAA-000001',supplier_id:'sup1',status:'received',total:500,item_count:1,received_at:NOW,created_at:NOW,updated_at:NOW,
      items:[{id:'poi1',name:'Manzana',sku:'P000001',quantity:10,unit_cost:50,line_total:500}]},
      {id:'po2',folio:'CAA-000002',supplier_id:null,status:'draft',total:120,item_count:1,created_at:NOW,updated_at:NOW,items:[]}];
    ST.RETURNS=[{id:'r1',folio:'RAA-000001',sale_folio:'VAA-000001',reason:'Producto dañado',total:25,refund_method:'cash',created_at:NOW,
      items:[{name:'Manzana',quantity:1,unit_price:25,line_total:25,restock:0}]}];
    ST.CASHS=[{id:'cs1',status:'open',opening_float:500,opened_at:new Date(Date.now()-30*3600000).toISOString(),created_at:NOW},
      {id:'cs2',status:'closed',opening_float:500,counted_cash:1450,expected_cash:1500,difference:-50,opened_at:NOW,created_at:NOW}];
    ST.CASHMOVS=[{id:'cm1',type:'out',amount:120,reason:'Pago proveedor',created_at:NOW}];
    ST.EGRESOS=[{id:'e1',concept:'Hielo',method:'cash',amount:120,created_at:NOW}];
    ST.EXPENSES=[{id:'x1',concept:'Renta',kind:'fixed',period:'monthly',amount:3000}];
    ST.EMPLOYEES=[{id:'emp1',full_name:'Ana López',username:'ana',role:'CAJERO',phone:'867',is_active:1},
      {id:'emp2',full_name:'Beto Ruiz',username:'beto',role:'ADMINISTRADOR',is_active:0}];
    ST.CUSTOMERS=[{id:'c1',name:'Cliente Uno',phone:'868',is_active:1}];
    ST.POINTS={c1:42};
    ST.MERMAS=[{product_id:'p1',qty_change:-3,reason:'Caducado',type:'adjust',created_at:NOW}];
    ST.TICKETS=[]; ST.ANUNCIOS=[]; ST.VERSIONES=[]; ST.KB=[]; ST.PAGOS=[];
  `)

  const CASES = [
    ['rInicio', ['Frutería Prueba', 'Alertas', 'bajo mínimo', 'sin conexión', 'abierta', 'pendiente', 'vence en']],
    ['rVentas', ['VAA-000001', 'cancelada', 'Ticket promedio']],
    ['rInventario', ['Manzana', 'Mayoreo', '−10%', 'Bajo mínimo']],
    ['rCompras', ['CAA-000001', 'Abarrotes del Norte', 'recibida', 'borrador', 'Pendientes de recibir']],
    ['rDevoluciones', ['RAA-000001', 'Producto dañado', 'Reembolsado este mes']],
    ['rClientes', ['Cliente Uno', '42', 'Puntos en circulación']],
    ['rCaja', ['abierta', 'cerrada', 'Pago proveedor', 'Hielo', 'Renta', 'nada']],
    ['rEmpleados', ['Ana López', 'cajero', 'inactivo', 'PIN de acceso nunca salen']],
    ['rMermas', ['Manzana', 'Caducado', '-3']],
    ['rReportes', ['Ventas por día', 'Top productos', 'Manzana', 'Compras recibidas']],
    ['rDispositivos', ['0.5.0', 'días sin conexión', 'en línea reciente']]
  ]
  let fails = 0
  for (const [fn, marks] of CASES) {
    const div = d.createElement('div')
    try {
      w.eval(`${fn}(document.__target)`) // eval con target inyectado
    } catch (_) { /* se invoca abajo con el patrón real */ }
    d.__target = div
    try {
      d.body.appendChild(div)
      w.eval(`${fn}(document.__target)`)
      const html = div.innerHTML
      const missing = marks.filter((m) => (m === 'nada' ? false : !html.includes(m)))
      if (missing.length) { fails++; console.log('✗', fn, '— faltan marcas:', missing.join(' | ')) }
      else console.log('✓', fn)
      div.remove()
    } catch (e) { fails++; console.log('✗', fn, '— EXCEPCIÓN:', e.message) }
  }

  // Detalles en modal
  try { w.eval(`poDetail('po1')`); const mh = d.getElementById('modal').innerHTML
    console.log(mh.includes('Compra CAA-000001') && mh.includes('Manzana') ? '✓ poDetail (modal)' : (fails++, '✗ poDetail sin contenido esperado'))
    w.eval('closeModal()')
  } catch (e) { fails++; console.log('✗ poDetail — EXCEPCIÓN:', e.message) }
  try { w.eval(`retDetail('r1')`); const mh = d.getElementById('modal').innerHTML
    console.log(mh.includes('Devolución RAA-000001') && mh.includes('merma') ? '✓ retDetail (modal)' : (fails++, '✗ retDetail sin contenido esperado'))
    w.eval('closeModal()')
  } catch (e) { fails++; console.log('✗ retDetail — EXCEPCIÓN:', e.message) }

  // Estados vacíos: sin datos sincronizados, cada sección explica qué hacer.
  w.eval(`ST.PURCHASES=[];ST.RETURNS=[];ST.CUSTOMERS=[];ST.EMPLOYEES=[];ST.MERMAS=[];ST.CASHS=[];ST.CASHMOVS=[];ST.EGRESOS=[];ST.EXPENSES=[];`)
  for (const fn of ['rCompras', 'rDevoluciones', 'rClientes', 'rEmpleados', 'rMermas', 'rCaja']) {
    const div = d.createElement('div'); d.__target = div; d.body.appendChild(div)
    try {
      w.eval(`${fn}(document.__target)`)
      if (!div.innerHTML.includes('Actualiza tu POS') && !div.innerHTML.includes('sincroniz')) { fails++; console.log('✗ vacío', fn) }
      else console.log('✓ vacío', fn)
    } catch (e) { fails++; console.log('✗ vacío', fn, '— EXCEPCIÓN:', e.message) }
    div.remove()
  }

  if (errors.length) { fails++; console.log('✗ errores de ventana:', errors) }
  console.log(fails === 0 ? '\nSMOKE BLOQUE P: TODO EN VERDE' : `\nSMOKE BLOQUE P: ${fails} FALLA(S)`)
  process.exit(fails === 0 ? 0 : 1)
}
