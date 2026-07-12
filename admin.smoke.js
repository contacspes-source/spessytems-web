/* Smoke del Panel Admin: monta admin.html en jsdom con supabase stubeado +
   datos falsos, navega a CADA sección, verifica que renderiza sin error, y
   prueba buscador, paginación, ficha (espejo), plantillas y recibo unificado.
   Corre desde tests-web/ con `npm test` (lee ../admin.html del repo). */
const fs = require('fs')
const path = require('path')
const { JSDOM } = require('jsdom')

const ROOT = path.join(__dirname, '..')
let html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8')
const spesUi = fs.readFileSync(path.join(ROOT, 'spes-ui.js'), 'utf8')
const spesData = fs.readFileSync(path.join(ROOT, 'spes-data.js'), 'utf8')

const stub = `
window.__q = () => { const p = Promise.resolve({ data: [], error: null });
  const h = { select(){return h}, eq(){return h}, in(){return h}, gte(){return h}, order(){return h},
    limit(){return h}, range(){return h}, maybeSingle(){ return Promise.resolve({data:null,error:null}) },
    insert(){return Promise.resolve({data:[{id:'x'}],error:null})}, update(){return h},
    delete(){return Promise.resolve({error:null})}, then(f,r){ return p.then(f,r) } };
  return h; };
window.supabase = { createClient: () => ({
  auth: { getSession: async()=>({data:{session:null}}), getUser: async()=>({error:null}),
    onAuthStateChange: ()=>{}, signInWithPassword: async()=>({error:null}), signOut: async()=>{} },
  from: () => window.__q(),
  rpc: () => window.__q(),
  schema: () => ({ from: () => window.__q() })
}) };
// Image simulada: jsdom no carga recursos; dispara onerror en el siguiente tick
// para que SpesData.imageDataURL resuelva null sin esperar su timeout.
window.Image = function(){ const i={}; setTimeout(()=>{ if(i.onerror) i.onerror(); },0); return i; };
`
const pdfStub = `window.jspdf={jsPDF:function(){return{setFontSize(){},setFont(){},text(){},setTextColor(){},line(){},setDrawColor(){},setLineWidth(){},addImage(){},save(f){window.__pdfSaved=f}}}};`
html = html
  .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase[^"]*"><\/script>/, '<script>' + stub + pdfStub + '</script>')
  .replace('<script src="/spes-ui.js"></script>', () => '<script>' + spesUi.replace(/<\/script>/g, '<\\/script>') + '</script>')
  .replace('<script src="/spes-data.js"></script>', () => '<script>' + spesData.replace(/<\/script>/g, '<\\/script>') + '</script>')

const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://spessystems.com/admin.html' })
const w = dom.window
const errors = []
w.addEventListener('error', (e) => errors.push('window.onerror: ' + (e.message || e)))

setTimeout(() => { try { run(w) } catch (e) { console.error('FALLO DEL ARNÉS:', e); process.exit(1) } }, 200)

function run(w) {
  const d = w.document
  const NOW = new Date().toISOString()
  const older = new Date(Date.now() - 40 * 86400000).toISOString()

  // Datos falsos: 60 negocios (para probar paginación >25), pagos, leads, tickets, etc.
  const negocios = []
  for (let i = 0; i < 60; i++) {
    negocios.push({
      id: 'b' + i, business_name: (i % 2 ? 'Abarrotes ' : 'Frutería ') + i,
      owner_nombre: 'Dueño ' + i, owner_email: 'd' + i + '@x.mx', ciudad: i % 3 ? 'Matamoros' : 'Reynosa',
      created_at: NOW, archivado: i >= 55,
      subscriptions: [{ business_id: 'b' + i, plan: i % 2 ? 'pro' : 'basico', estado: i % 5 ? 'activa' : 'prueba', vence: new Date(Date.now() + (i - 30) * 86400000).toISOString().slice(0, 10), precio_mxn: null }]
    })
  }
  w.eval(`
    ST.email='admin@spes.mx'; ST.uid='u1'; ST.isPrincipal=true;
    ST.PLANES=[{clave:'basico',nombre:'Básico',precio_mxn:349,periodo:'mes',activo:1},{clave:'pro',nombre:'Pro',precio_mxn:599,periodo:'mes',activo:1}];
    ST.NEGOCIOS=${JSON.stringify(negocios)};
    ST.PAGOS=Array.from({length:40},(_,i)=>({id:'p'+i,business_id:'b'+i,monto:349,metodo:i%2?'efectivo':'transferencia',nota:'mes',cubre_hasta:'${NOW}'.slice(0,10),created_at:'${NOW}'}));
    ST.LEADS=Array.from({length:35},(_,i)=>({id:'l'+i,nombre:'Lead '+i,correo:i===0?'d0@x.mx':'l'+i+'@x.mx',negocio:'Negocio '+i,ciudad:'Matamoros',industria:'abarrotes',estado:i%2?'nuevo':'en proceso',responsable:'Jorge',mensaje:'Quiero info',created_at:'${NOW}'}));
    ST.TICKETS=Array.from({length:30},(_,i)=>({id:'t'+i,asunto:'Ticket '+i,business_id:'b'+i,estado:i%2?'abierto':'resuelto',prioridad:i%3?'media':'urgente',asignado:'Jorge',created_at:'${NOW}',updated_at:'${NOW}'}));
    ST.ADMINS=[{user_id:'u1',es_principal:1},{user_id:'u2',es_principal:0}];
    ST.VERSIONES=[{id:'v1',version:'1.2.0',titulo:'x',cambios:'a\\nb',created_at:'${NOW}',publicada:true,obligatoria:false}];
    ST.ANUNCIOS=[{id:'a1',titulo:'Aviso',cuerpo:'hola',created_at:'${NOW}'}];
    ST.KB=[{id:'k1',titulo:'Guía',categoria:'General',contenido:'texto',created_at:'${NOW}'}];
    ST.NOTAS=[{id:'n1',business_id:'b0',texto:'nota',created_at:'${NOW}'}];
    ST.CONFIG={empresa_nombre:'SPES Systems',color_acento:'#18181b',recibo_pie:'Gracias por su preferencia'}; ST.FLEET=[{account_id:'b0',device_id:'dddd1234',app_version:'0.5.0',platform:'win32',last_seen_at:'${NOW}'}];
    ST.PLANTILLAS=[{id:'tp1',clave:'bienvenida',nombre:'Bienvenida',asunto:'Bienvenido {nombre}',cuerpo:'Hola {nombre} de {negocio}',updated_at:'${NOW}'},{id:'tp2',clave:'recordatorio_pago',nombre:'Recordatorio de pago',asunto:'Vence {vence}',cuerpo:'Plan {plan}, {monto}',updated_at:'${NOW}'}];
  `)

  const SECTIONS = [
    ['dashboard', ['MRR', 'Actividad reciente']],
    ['clientes', ['Clientes activos', 'Buscar cliente', 'Página 1 de']], // 55 activos → pagina
    ['mensajes', ['Buscar por nombre', 'Lead 0', 'Página 1 de']],        // 35 leads → pagina
    ['pagos', ['Buscar por negocio', 'Recibo PDF', 'Página 1 de']],       // 40 pagos → pagina
    ['renovaciones', ['Negocio']],
    ['planes', ['Básico', 'Pro']],
    ['facturacion', ['Razón social', 'RFC']],
    ['tickets', ['Tickets de soporte', 'Ticket 0', 'Página 1 de']],       // 30 tickets → pagina
    ['anuncios', ['Aviso']],
    ['kb', ['Guía']],
    ['actualizaciones', ['1.2.0']],
    ['licencias', ['']],
    ['flota', ['flota']], // async: pinta "Cargando flota…" y luego hace su propio fetch
    ['roles', ['principal', 'operador']],
    ['permisos', ['Operador']],
    ['cfg_empresa', ['SPES Systems']],
    ['cfg_branding', ['Color de acento', 'Pie de recibo', 'Gracias por su preferencia']],
    ['cfg_correos', ['Nueva plantilla', 'Bienvenida', 'Recordatorio de pago', '{negocio}']],
    ['cuenta', ['admin@spes.mx']],
    ['an_ventas', ['Ventas de la flota', 'Cargando ventas de la flota']], // async: el stub luego pinta el estado vacío
    ['an_ingresos', ['Cobrado este mes', 'Por método', 'Pago promedio']],
    ['an_conv', ['Tasa de conversión', 'Embudo', 'En seguimiento']],
    ['an_uso', ['Cuentas con POS', 'Versiones instaladas', 'Plataformas']],
    ['an_churn', ['próximamente']], // sigue soon (requiere eventos)
    ['inf_estado', ['próximamente']]
  ]

  let fails = 0
  for (const [view, marks] of SECTIONS) {
    try {
      w.eval(`ST.view='${view}'; ST.param=null; render();`)
      const html = d.getElementById('content').innerHTML
      const missing = marks.filter((m) => m && !html.includes(m))
      if (missing.length) { fails++; console.log('✗', view, '— faltan:', missing.join(' | ')) }
      else console.log('✓', view)
    } catch (e) { fails++; console.log('✗', view, '— EXCEPCIÓN:', e.message) }
  }

  // Verificar que renderAdmins ya NO existe (código muerto eliminado).
  const stillHasDead = w.eval(`typeof renderAdmins !== 'undefined'`)
  if (stillHasDead) { fails++; console.log('✗ código muerto: renderAdmins sigue definido') }
  else console.log('✓ código muerto eliminado (renderAdmins)')

  // Buscador: filtrar clientes por "Reynosa" reduce el conteo.
  try {
    w.eval(`ST.view='clientes'; render();`)
    const input = d.getElementById('ls_clientes')
    const before = d.getElementById('lc_clientes').textContent
    input.value = 'Reynosa'; input.dispatchEvent(new w.Event('input'))
    const after = d.getElementById('lc_clientes').textContent
    const nBefore = parseInt(before), nAfter = parseInt(after)
    if (nAfter > 0 && nAfter < nBefore) console.log('✓ buscador filtra (' + nBefore + ' → ' + nAfter + ')')
    else { fails++; console.log('✗ buscador no filtró (' + before + ' → ' + after + ')') }
  } catch (e) { fails++; console.log('✗ buscador — EXCEPCIÓN:', e.message) }

  // Paginación: siguiente página cambia el contenido de la tabla.
  try {
    w.eval(`delete LISTUI.clientes; delete LISTUI.clientes_arch; ST.view='clientes'; render();`) // reset búsqueda
    const firstRow = () => (d.querySelector('#lb_clientes tr strong') || {}).textContent
    const p1 = firstRow()
    const next = d.getElementById('pn_clientes')
    next.dispatchEvent(new w.Event('click'))
    const p2 = firstRow()
    if (p1 && p2 && p1 !== p2) console.log('✓ paginación avanza (' + p1 + ' → ' + p2 + ')')
    else { fails++; console.log('✗ paginación no cambió (' + p1 + ' / ' + p2 + ')') }
  } catch (e) { fails++; console.log('✗ paginación — EXCEPCIÓN:', e.message) }

  // Skeleton existe.
  try {
    w.eval('showSkeleton()')
    if (d.getElementById('content').querySelector('.sk')) console.log('✓ skeleton de carga')
    else { fails++; console.log('✗ skeleton no se pintó') }
  } catch (e) { fails++; console.log('✗ skeleton — EXCEPCIÓN:', e.message) }

  // Ficha de cliente (Bloque B): mensajes enlazados + espejo del negocio.
  w.eval(`ST.view='cliente'; ST.clienteId='b0'; render();`)
  const fichaHtml = () => d.getElementById('content').innerHTML
  const sync1 = ['Mensajes del cliente (1)', 'Lead 0', 'Negocio del cliente', 'Cargando datos del negocio']
  const missF = sync1.filter((m) => !fichaHtml().includes(m))
  if (missF.length) { fails++; console.log('✗ ficha (sincrónico) — faltan:', missF.join(' | ')) }
  else console.log('✓ ficha: mensajes enlazados + contenedor del espejo')

  // El espejo carga async (stub resuelve con datos vacíos; FLEET tiene 1 device de b0).
  setTimeout(() => {
    const marks2 = ['Ventas del mes', 'Productos en catálogo', 'Dispositivos', 'dddd1234', 'Última sincronización']
    const miss2 = marks2.filter((m) => !fichaHtml().includes(m))
    if (miss2.length) { fails++; console.log('✗ ficha (espejo async) — faltan:', miss2.join(' | ')) }
    else console.log('✓ ficha: espejo del negocio pintó KPIs + dispositivos')

    // Recibo unificado (Fase 4): SpesData.recibo genera y guarda el PDF con branding.
    w.eval(`window.__pdfSaved=null; genRecibo('p0')`)
    setTimeout(() => {
      if (String(w.eval('window.__pdfSaved')||'').startsWith('REC-')) console.log('✓ recibo unificado (SpesData.recibo) guardó PDF')
      else { fails++; console.log('✗ recibo unificado no guardó PDF:', w.eval('window.__pdfSaved')) }
    }, 60)

    // Plantillas: fillPlantilla sustituye variables con datos reales del negocio.
    try {
      const filled = w.eval(`JSON.stringify(fillPlantilla(ST.PLANTILLAS[0], ST.NEGOCIOS[0]))`)
      if (filled.includes('Dueño 0') && filled.includes('Frutería 0') && !filled.includes('{nombre}'))
        console.log('✓ plantillas: variables sustituidas ({nombre} → Dueño 0)')
      else { fails++; console.log('✗ plantillas: sustitución falló:', filled) }
    } catch (e) { fails++; console.log('✗ plantillas — EXCEPCIÓN:', e.message) }

    // Estado vacío: b1 no tiene devices ni datos → mensaje "aún no sincroniza".
    w.eval(`ST.view='cliente'; ST.clienteId='b1'; render();`)
    setTimeout(() => {
      if (fichaHtml().includes('aún no sincroniza')) console.log('✓ ficha: estado vacío (cliente sin sync)')
      else { fails++; console.log('✗ ficha: no pintó el estado vacío') }

      // Analíticas de ventas: el stub del RPC regresa [] → estado vacío honesto (async).
      w.eval(`ST.view='an_ventas'; render();`)
      setTimeout(() => {
        if (fichaHtml().includes('Aún ningún cliente sube ventas')) console.log('✓ an_ventas: estado vacío async (RPC sin datos)')
        else { fails++; console.log('✗ an_ventas: no pintó el estado vacío del RPC') }

        if (errors.length) { fails++; console.log('✗ errores de ventana:', errors.slice(0, 3)) }
        console.log(fails === 0 ? '\nSMOKE PANEL (Bloques A+B+C+D): TODO EN VERDE' : `\nSMOKE PANEL: ${fails} FALLA(S)`)
        process.exit(fails === 0 ? 0 : 1)
      }, 150)
    }, 150)
  }, 150)
}
