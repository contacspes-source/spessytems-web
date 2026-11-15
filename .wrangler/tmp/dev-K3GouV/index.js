var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/index.js
var SB_URL = "https://khpecvszzhyygqudeagr.supabase.co";
var SB_KEY = "sb_publishable_FvWr_E6vuc7Gf3GRkzh62Q_kfzmPVp8";
var COOKIE = "spes_manual";
var CACHE_TTL = 300;
var worker_default = {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === "/manuales" || path.startsWith("/manuales/")) {
      return guard({ request, waitUntil: /* @__PURE__ */ __name((p) => ctx.waitUntil(p), "waitUntil"), next: /* @__PURE__ */ __name(() => env.ASSETS.fetch(request), "next") });
    }
    return env.ASSETS.fetch(request);
  }
};
async function guard(ctx) {
  const { request, next } = ctx;
  const token = readCookie(request.headers.get("Cookie") || "", COOKIE);
  const claims = token ? decodeJwt(token) : null;
  const now = Math.floor(Date.now() / 1e3);
  if (!claims || !claims.sub || claims.exp && claims.exp <= now) return deny("login", request);
  let verdict;
  try {
    verdict = await cachedVerdict(ctx, token, claims, now);
  } catch (_) {
    verdict = "error";
  }
  if (verdict !== "ok") return deny(verdict, request);
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "private, no-store");
  out.headers.set("X-Robots-Tag", "noindex, nofollow");
  return out;
}
__name(guard, "guard");
async function cachedVerdict(ctx, token, claims, now) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const key = new Request(new URL("/__manual_auth/" + await sha256(token), ctx.request.url).toString());
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return await hit.text();
  }
  const verdict = await checkAccess(token, claims.sub);
  if (cache && (verdict === "ok" || verdict === "nosub")) {
    const ttl = Math.max(1, Math.min(CACHE_TTL, (claims.exp || now + CACHE_TTL) - now));
    ctx.waitUntil(cache.put(key, new Response(verdict, { headers: { "Cache-Control": "max-age=" + ttl } })));
  }
  return verdict;
}
__name(cachedVerdict, "cachedVerdict");
async function checkAccess(token, uid) {
  const headers = { apikey: SB_KEY, Authorization: "Bearer " + token, "Accept-Profile": "control" };
  const r = await fetch(SB_URL + "/rest/v1/subscriptions?select=estado&business_id=eq." + encodeURIComponent(uid), { headers });
  if (r.status === 401 || r.status === 403) return "login";
  if (!r.ok) return "error";
  const rows = await r.json();
  if (Array.isArray(rows) && rows.some((s) => s && s.estado && s.estado !== "cancelada")) return "ok";
  const a = await fetch(SB_URL + "/rest/v1/rpc/is_admin", {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: "{}"
  });
  if (a.ok && await a.json() === true) return "ok";
  return "nosub";
}
__name(checkAccess, "checkAccess");
function readCookie(header, name) {
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
__name(readCookie, "readCookie");
function decodeJwt(token) {
  try {
    const p = token.split(".")[1];
    if (!p) return null;
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p.length + 3) % 4);
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
  } catch (_) {
    return null;
  }
}
__name(decodeJwt, "decodeJwt");
async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
function deny(reason, request) {
  const accept = request.headers.get("Accept") || "";
  const status = reason === "login" ? 401 : reason === "error" ? 503 : 403;
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (!accept.includes("text/html")) return new Response("Acceso restringido", { status, headers });
  const msg = {
    login: ["Inicia sesi\xF3n para ver los manuales", "Los manuales de SPES son exclusivos para clientes. Entra al Portal con tu cuenta y \xE1brelos desde <b>Soporte \u2192 Manuales</b>."],
    nosub: ["Manuales para clientes SPES", "Tu cuenta no tiene una suscripci\xF3n vigente. Si ya usas SPES y ves este mensaje, escr\xEDbenos a contacspes@gmail.com."],
    error: ["No pudimos verificar tu acceso", "Hubo un problema temporal. Vuelve a intentarlo en un momento desde el Portal."]
  }[reason] || ["Acceso restringido", ""];
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${msg[0]} \u2014 SPES</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0b0c;color:#f4f4f5;font:16px/1.55 Inter,"Segoe UI",system-ui,sans-serif;padding:24px}
.c{max-width:440px;text-align:center}.l{width:56px;height:56px;border-radius:14px;background:#fff;color:#111;font:800 30px/56px Inter,sans-serif;margin:0 auto 18px}
h1{font-size:24px;margin:0 0 10px}p{color:#a1a1aa;margin:0 0 22px}a{display:inline-block;background:#fff;color:#111;text-decoration:none;font-weight:700;border-radius:10px;padding:12px 20px}</style></head>
<body><div class="c"><div class="l">S.</div><h1>${msg[0]}</h1><p>${msg[1]}</p><a href="/portal#/manuales">Ir al Portal</a></div></body></html>`;
  return new Response(html, { status, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}
__name(deny, "deny");

// ../.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-YHOJPq/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-YHOJPq/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  checkAccess,
  decodeJwt,
  middleware_loader_entry_default as default,
  guard,
  readCookie
};
//# sourceMappingURL=index.js.map
