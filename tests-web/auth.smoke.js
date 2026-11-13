/* Smoke de ACCESO (nov-2026):
   1) El panel admin solo se abre si el servidor confirma is_admin(); una cuenta
      que no es admin queda fuera al instante (se cierra su sesión y no se pinta
      nada del panel).
   2) Admin y portal guardan su sesión con llaves DISTINTAS (pueden convivir en
      el mismo navegador con cuentas diferentes) y cerrar una no cierra la otra.
   Corre desde tests-web/ con `npm test`. */
const fs = require('fs')
const path = require('path')
const { JSDOM } = require('jsdom')

const ROOT = path.join(__dirname, '..')
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8')
const spesUi = read('spes-ui.js'), spesData = read('spes-data.js')
let fails = 0
const ok = (cond, msg) => { if (cond) console.log('✓', msg); else { fails++; console.log('✗', msg) } }

function stub(isAdmin) {
  return `
  window.__opts=[]; window.__signedOut=0; window.__rpcs=[];
  window.__q = () => { const p = Promise.resolve({ data: [], error: null });
    const h = { select(){return h}, eq(){return h}, in(){return h}, gte(){return h}, order(){return h}, limit(){return h}, range(){return h},
      maybeSingle(){ return Promise.resolve({data:null,error:null}) }, then(f,r){ return p.then(f,r) } }; return h; };
  window.supabase = { createClient: (u,k,o) => { window.__opts.push(o); return {
    auth: { getSession: async()=>({data:{session:{user:{id:'u1',email:'amigo@x.mx'}}}}), getUser: async()=>({error:null}),
      onAuthStateChange: ()=>{}, signInWithPassword: async()=>({error:null}), signInWithOAuth: async()=>({error:null}),
      signOut: async()=>{ window.__signedOut++ } },
    from: () => window.__q(),
    rpc: (fn) => { window.__rpcs.push(fn); if (fn==='is_admin') return Promise.resolve({ data:${isAdmin}, error:null }); if (fn==='is_principal_admin') return Promise.resolve({data:false,error:null}); return window.__q() },
    schema: () => ({ from: () => window.__q() })
  } } };
  window.scrollTo=function(){};
  window.Image = function(){ const i={}; setTimeout(()=>{ if(i.onerror) i.onerror(); },0); return i; };`
}
function mount(file, isAdmin, preset) {
  let html = read(file)
    .replace(/<script src="\/assets\/vendor\/supabase-js[^"]*"[^>]*><\/script>/, () => '<script>' + stub(isAdmin) + (preset || '') + '</script>')
    .replace('<script src="/spes-captcha.js"></script>', '<script>window.SpesCaptcha={mount:function(){return{token:function(){return "t"},reset:function(){}}}};</script>')
    .replace('<script src="/spes-ui.js"></script>', () => '<script>' + spesUi + '</script>')
    .replace('<script src="/spes-data.js"></script>', () => '<script>' + spesData + '</script>')
    .replace('<script src="/portal-pos.js"></script>', () => '<script>' + read('portal-pos.js') + '</script>')
    .replace('<script src="/portal-admin.js"></script>', () => '<script>' + read('portal-admin.js') + '</script>')
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://spessystems.com/' + file.replace('.html', '') })
  return dom.window
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  // 1) Cuenta NO admin con sesión guardada → fuera.
  let w = mount('admin.html', false, "localStorage.setItem('spes-portal-auth','{\"portal\":1}');")
  await wait(250)
  let d = w.document
  ok(w.__opts[0] && w.__opts[0].auth.storageKey === 'spes-admin-auth', 'admin usa su propia llave de sesión (spes-admin-auth)')
  ok(w.__rpcs.includes('is_admin'), 'admin pregunta al servidor is_admin()')
  ok(w.__signedOut >= 1, 'cuenta no admin: se cierra su sesión al instante')
  ok(!d.getElementById('login').classList.contains('hidden') && d.getElementById('app').classList.contains('hidden'), 'cuenta no admin: se queda en el login')
  ok(/no tiene acceso al panel/.test(d.getElementById('loginMsg').textContent), 'cuenta no admin: mensaje claro en el login')
  ok(d.getElementById('content').innerHTML === '', 'cuenta no admin: no se pinta nada del panel')
  ok(!w.__rpcs.includes('is_principal_admin'), 'cuenta no admin: no se consulta nada más')
  ok(w.localStorage.getItem('spes-portal-auth') === '{"portal":1}', 'cerrar la sesión del panel NO toca la del portal')

  // 2) Cuenta admin → entra.
  w = mount('admin.html', true)
  await wait(250)
  d = w.document
  ok(d.getElementById('login').classList.contains('hidden') && !d.getElementById('app').classList.contains('hidden'), 'cuenta admin: entra al panel')
  ok(w.__signedOut === 0, 'cuenta admin: su sesión sigue abierta')

  // 3) Portal: llave propia y cerrar sesión no toca la del admin.
  w = mount('portal.html', false, "localStorage.setItem('spes-admin-auth','{\"admin\":1}');")
  await wait(250)
  d = w.document
  ok(w.__opts[0] && w.__opts[0].auth.storageKey === 'spes-portal-auth', 'portal usa su propia llave de sesión (spes-portal-auth)')
  ok(!d.getElementById('app').classList.contains('hidden'), 'portal entra con la cuenta del cliente')
  w.eval('cerrarSesion()'); await wait(50)
  ok(w.localStorage.getItem('spes-admin-auth') === '{"admin":1}', 'cerrar sesión en el portal NO cierra el panel admin')
  ok(w.eval('ST.uid===null && ST.PRODUCTS.length===0'), 'al salir del portal se vacían los datos en memoria')

  console.log(fails === 0 ? '\nSMOKE ACCESO: TODO EN VERDE' : `\nSMOKE ACCESO: ${fails} FALLA(S)`)
  process.exit(fails === 0 ? 0 : 1)
})()
