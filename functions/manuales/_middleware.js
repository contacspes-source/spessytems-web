/**
 * Guardia de los manuales (/manuales/*) — Cloudflare Pages Functions.
 *
 * Los manuales de SPES son SOLO para negocios que usan la app. Este middleware
 * corre ANTES de servir cualquier archivo de /manuales (HTML, imágenes, PDF):
 *
 *   1. Lee la cookie `spes_manual` (el access token de Supabase que el Portal
 *      deja al iniciar sesión; Path=/manuales, Secure, SameSite=Strict).
 *   2. Pregunta a Supabase (PostgREST, con ese token) por la suscripción del
 *      negocio. PostgREST valida la firma del token y RLS solo deja ver la
 *      propia fila → no hay forma de falsificarlo desde el navegador.
 *   3. Deja pasar si la suscripción existe y no está cancelada, o si la cuenta
 *      es administrador de SPES. Si no, responde una página de "acceso".
 *
 * El veredicto se cachea ~5 min en el edge (por hash del token) para no
 * consultar Supabase en cada imagen. Sin secretos: solo la clave publishable.
 */
const SB_URL = 'https://khpecvszzhyygqudeagr.supabase.co'
const SB_KEY = 'sb_publishable_FvWr_E6vuc7Gf3GRkzh62Q_kfzmPVp8'
const COOKIE = 'spes_manual'
const CACHE_TTL = 300 // segundos

export async function onRequest(ctx) {
  const { request, next } = ctx
  const token = readCookie(request.headers.get('Cookie') || '', COOKIE)
  const claims = token ? decodeJwt(token) : null
  const now = Math.floor(Date.now() / 1000)
  if (!claims || !claims.sub || (claims.exp && claims.exp <= now)) return deny('login', request)

  let verdict
  try {
    verdict = await cachedVerdict(ctx, token, claims, now)
  } catch (_) {
    verdict = 'error'
  }
  if (verdict !== 'ok') return deny(verdict, request)

  const res = await next()
  const out = new Response(res.body, res)
  out.headers.set('Cache-Control', 'private, no-store')
  out.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return out
}

async function cachedVerdict(ctx, token, claims, now) {
  const cache = typeof caches !== 'undefined' ? caches.default : null
  const key = new Request(new URL('/__manual_auth/' + (await sha256(token)), ctx.request.url).toString())
  if (cache) {
    const hit = await cache.match(key)
    if (hit) return await hit.text()
  }
  const verdict = await checkAccess(token, claims.sub)
  if (cache && (verdict === 'ok' || verdict === 'nosub')) {
    const ttl = Math.max(1, Math.min(CACHE_TTL, (claims.exp || now + CACHE_TTL) - now))
    ctx.waitUntil(cache.put(key, new Response(verdict, { headers: { 'Cache-Control': 'max-age=' + ttl } })))
  }
  return verdict
}

/** 'ok' | 'login' (token inválido/vencido) | 'nosub' (sin suscripción vigente) | 'error' */
export async function checkAccess(token, uid) {
  const headers = { apikey: SB_KEY, Authorization: 'Bearer ' + token, 'Accept-Profile': 'control' }
  const r = await fetch(SB_URL + '/rest/v1/subscriptions?select=estado&business_id=eq.' + encodeURIComponent(uid), { headers })
  if (r.status === 401 || r.status === 403) return 'login'
  if (!r.ok) return 'error'
  const rows = await r.json()
  if (Array.isArray(rows) && rows.some((s) => s && s.estado && s.estado !== 'cancelada')) return 'ok'
  // Administradores de SPES (soporte) también pueden consultarlos.
  const a = await fetch(SB_URL + '/rest/v1/rpc/is_admin', {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: '{}'
  })
  if (a.ok && (await a.json()) === true) return 'ok'
  return 'nosub'
}

export function readCookie(header, name) {
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

export function decodeJwt(token) {
  try {
    const p = token.split('.')[1]
    if (!p) return null
    const b64 = p.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((p.length + 3) % 4)
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))))
  } catch (_) {
    return null
  }
}

async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function deny(reason, request) {
  const accept = request.headers.get('Accept') || ''
  const status = reason === 'login' ? 401 : reason === 'error' ? 503 : 403
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
  if (!accept.includes('text/html')) return new Response('Acceso restringido', { status, headers })
  const msg = {
    login: ['Inicia sesión para ver los manuales', 'Los manuales de SPES son exclusivos para clientes. Entra al Portal con tu cuenta y ábrelos desde <b>Soporte → Manuales</b>.'],
    nosub: ['Manuales para clientes SPES', 'Tu cuenta no tiene una suscripción vigente. Si ya usas SPES y ves este mensaje, escríbenos a contacspes@gmail.com.'],
    error: ['No pudimos verificar tu acceso', 'Hubo un problema temporal. Vuelve a intentarlo en un momento desde el Portal.']
  }[reason] || ['Acceso restringido', '']
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${msg[0]} — SPES</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0b0c;color:#f4f4f5;font:16px/1.55 Inter,"Segoe UI",system-ui,sans-serif;padding:24px}
.c{max-width:440px;text-align:center}.l{width:56px;height:56px;border-radius:14px;background:#fff;color:#111;font:800 30px/56px Inter,sans-serif;margin:0 auto 18px}
h1{font-size:24px;margin:0 0 10px}p{color:#a1a1aa;margin:0 0 22px}a{display:inline-block;background:#fff;color:#111;text-decoration:none;font-weight:700;border-radius:10px;padding:12px 20px}</style></head>
<body><div class="c"><div class="l">S.</div><h1>${msg[0]}</h1><p>${msg[1]}</p><a href="/portal#/manuales">Ir al Portal</a></div></body></html>`
  return new Response(html, { status, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } })
}
