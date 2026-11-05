/* =====================================================================
   SpesCaptcha — Cloudflare Turnstile para los inicios de sesión
   (admin.html y portal.html). Ver 05. Documentacion/Reportes/
   SEGURIDAD_WEB_2026-11.md §8.

   El token se manda a Supabase Auth como `options.captchaToken`; quien
   lo VALIDA es Supabase (Authentication → Attack Protection → Captcha),
   no este archivo. Sin ese interruptor encendido, el widget es solo
   cosmético; con él encendido, nadie entra sin resolverlo, ni siquiera
   llamando a la API directo.

   Uso:
     const cap = SpesCaptcha.mount(document.getElementById('captcha'), { theme:'dark' });
     const tk = cap.token();      // '' si aún no se resuelve
     cap.reset();                 // después de cada intento (el token es de un solo uso)
   ===================================================================== */
(function () {
  'use strict';
  var SITEKEY = '0x4AAAAAADkGkS8LBw02W1fz';
  var SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  var loading = null;

  function load() {
    if (window.turnstile) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = SRC;
      s.async = true;
      s.onload = function () { res(); };
      s.onerror = function () { loading = null; rej(new Error('captcha_load')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function mount(el, opts) {
    opts = opts || {};
    var st = { id: null, failed: false };
    load().then(function () {
      st.id = window.turnstile.render(el, {
        sitekey: SITEKEY,
        theme: opts.theme || 'auto',
        action: opts.action || 'login',
        language: 'es',
        'refresh-expired': 'auto',
        'error-callback': function () { st.failed = true; },
        callback: function () { st.failed = false; if (opts.onSolved) opts.onSolved(); }
      });
    }).catch(function () {
      st.failed = true;
      el.textContent = 'No se pudo cargar la verificación de seguridad. Revisa tu conexión y recarga la página.';
    });
    return {
      token: function () {
        try { return st.id !== null ? (window.turnstile.getResponse(st.id) || '') : ''; } catch (_) { return ''; }
      },
      reset: function () {
        try { if (st.id !== null) window.turnstile.reset(st.id); } catch (_) { /* nada */ }
      },
      failed: function () { return st.failed; }
    };
  }

  /** Mensaje en español para errores de captcha que devuelve Supabase. */
  function isCaptchaError(msg) {
    return /captcha/i.test(String(msg || ''));
  }

  window.SpesCaptcha = { mount: mount, isCaptchaError: isCaptchaError, SITEKEY: SITEKEY };
})();
