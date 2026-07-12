/* ============================================================
   SPES Data — núcleo compartido Admin ↔ Portal (Fase 4, Bloque A)
   Helpers de dinero/fechas/escape, storage seguro, cliente de
   Supabase y el generador ÚNICO de recibos PDF (con branding).
   Sin build step: <script src="/spes-data.js"> ANTES del script
   de cada app. Expone window.SpesData. Salda la deuda #5.
   ============================================================ */
(function(){
  'use strict';

  /* ---------- Storage seguro (localStorage puede fallar en privado/iframes) ---------- */
  const memStore={};
  const safeStorage={
    getItem:k=>{ try{ return window.localStorage.getItem(k); }catch(_){ return (k in memStore)?memStore[k]:null; } },
    setItem:(k,v)=>{ try{ window.localStorage.setItem(k,v); }catch(_){ memStore[k]=String(v); } },
    removeItem:k=>{ try{ window.localStorage.removeItem(k); }catch(_){ delete memStore[k]; } }
  };

  /* ---------- Helpers base ---------- */
  const esc=s=>(s==null?'':String(s)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>'$'+(Math.round(Number(n)||0)).toLocaleString('es-MX');
  function daysLeft(v){ if(!v) return null; return Math.ceil((new Date(v+'T00:00:00')-new Date(new Date().toDateString()))/86400000); }
  function fdate(s){ try{ return new Date(s).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'2-digit'}); }catch(e){ return s||'—'; } }
  function fdatetime(s){ try{ return new Date(s).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }catch(e){ return s||'—'; } }

  /* ---------- fetchAll: pagina consultas (PostgREST corta en 1000 filas) ----------
     Fix 12-jul-2026: el portal mostraba 1,000 productos de 1,200+ porque las
     consultas sin paginar se topan con el límite del servidor.
     build: función que devuelve un builder NUEVO de supabase-js por página
            (los builders no se reutilizan). La consulta debe llevar .order()
            estable para que las páginas no se traslapen.
     opts:  { pageSize?:1000, max?:20000 }. Lanza en error. */
  async function fetchAll(build,opts){
    const o=opts||{}, size=o.pageSize||1000, max=o.max||20000, out=[];
    for(let from=0; out.length<max; from+=size){
      const { data, error }=await build().range(from,from+size-1);
      if(error) throw error;
      out.push.apply(out,data||[]);
      if(!data||data.length<size) break;
    }
    return out;
  }

  /* ---------- Cliente Supabase (control plane via schema 'control') ----------
     opts: { detectSessionInUrl?:bool, flowType?:'pkce' }  (portal usa ambos) */
  function client(url,key,opts){
    const o=opts||{};
    const auth={ persistSession:true, autoRefreshToken:true, detectSessionInUrl:!!o.detectSessionInUrl, storage:safeStorage };
    if(o.flowType) auth.flowType=o.flowType;
    const sb=window.supabase.createClient(url,key,{ auth });
    return { sb, sbc: sb.schema('control') };
  }

  /* ---------- jsPDF bajo demanda (no se carga hasta el primer recibo) ---------- */
  let _jspdfReady=null;
  function ensureJsPDF(){
    const get=()=>(window.jspdf&&window.jspdf.jsPDF)||window.jsPDF||null;
    if(get()) return Promise.resolve(get());
    if(_jspdfReady) return _jspdfReady;
    _jspdfReady=new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
      s.onload=()=>{ const g=get(); g?res(g):rej(new Error('jsPDF cargó pero no expuso el módulo')); };
      s.onerror=()=>rej(new Error('No se pudo descargar jsPDF (¿bloqueado por CSP o sin red?)'));
      document.head.appendChild(s);
    });
    return _jspdfReady;
  }

  /* ---------- Imagen → dataURL (para el logo del recibo) ----------
     Resuelve null si no carga (sin red, CORS, jsdom); nunca rechaza. */
  function imageDataURL(src){
    return new Promise(res=>{
      let done=false; const fin=v=>{ if(!done){ done=true; res(v); } };
      const t=setTimeout(()=>fin(null),4000);
      try{
        const img=new Image(); img.crossOrigin='anonymous';
        img.onload=()=>{ clearTimeout(t); try{
          const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight;
          const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); x.drawImage(img,0,0);
          fin({ url:c.toDataURL('image/jpeg',0.92), w:img.naturalWidth||1, h:img.naturalHeight||1 });
        }catch(_){ fin(null); } };
        img.onerror=()=>{ clearTimeout(t); fin(null); };
        img.src=src;
      }catch(_){ clearTimeout(t); fin(null); }
    });
  }

  /* ---------- Recibo PDF ÚNICO (admin y portal) — formato de marca SPES ----------
     pago:    { id, monto, metodo, nota, cubre_hasta, created_at }
     negocio: { business_name, razon_social?, rfc? }
     config:  { empresa_nombre?, logo_url?, color_acento?, recibo_pie? } | null
     Usa el logo del branding (o el oficial del sitio); si la imagen no carga,
     el recibo sale igual, solo con texto. Lanza en error (el llamador notifica). */
  async function recibo(pago, negocio, config){
    const JS=await ensureJsPDF();
    const p=pago||{}, b=negocio||{}, emp=config||{};
    const doc=new JS(); // A4 vertical, unidades en mm
    const hx=String(emp.color_acento||'').replace('#','');
    const acc=/^[0-9a-fA-F]{6}$/.test(hx)?[parseInt(hx.slice(0,2),16),parseInt(hx.slice(2,4),16),parseInt(hx.slice(4,6),16)]:[17,17,17];
    const folio='REC-'+String(p.id).slice(0,8).toUpperCase();

    // Encabezado: logo + marca a la izquierda; folio y fecha a la derecha.
    const logo=await imageDataURL(emp.logo_url||'/assets/spes-logo.jpeg');
    let x=20;
    if(logo){ const h=14, w=Math.min(40,h*(logo.w/logo.h)); try{ doc.addImage(logo.url,'JPEG',20,12,w,h); x=20+w+6; }catch(_){ } }
    doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(17);
    doc.text(emp.empresa_nombre||'SPES Systems',x,19);
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(120);
    doc.text('spessystems.com · Control inteligente para tu empresa',x,24.5);
    doc.setFontSize(9); doc.setTextColor(120); doc.text('RECIBO DE PAGO',190,15,{align:'right'});
    doc.setFont('helvetica','bold'); doc.setFontSize(12); doc.setTextColor(17); doc.text(folio,190,21,{align:'right'});
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(120); doc.text(fdate(p.created_at),190,26,{align:'right'});

    // Regla de acento bajo el encabezado.
    doc.setDrawColor(acc[0],acc[1],acc[2]); doc.setLineWidth(0.8); doc.line(20,32,190,32);

    let y=45;
    const line=(k,v)=>{ doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(120); doc.text(k,20,y); doc.setTextColor(17); doc.text(String(v||'—'),75,y); y+=8; };
    line('Cliente',b.business_name||'—');
    if(b.razon_social) line('Razón social',b.razon_social);
    if(b.rfc) line('RFC',b.rfc);
    line('Concepto',p.nota||'Suscripción SPES');
    line('Método de pago',p.metodo||'—');
    line('Cubre hasta',p.cubre_hasta?fdate(p.cubre_hasta):'—');

    // Total: bloque protagonista, alineado a la derecha.
    y+=4; doc.setDrawColor(225); doc.setLineWidth(0.3); doc.line(20,y,190,y); y+=14;
    doc.setFontSize(10); doc.setTextColor(120); doc.text('TOTAL PAGADO',20,y);
    doc.setFont('helvetica','bold'); doc.setFontSize(22); doc.setTextColor(17);
    doc.text(money(p.monto)+' MXN',190,y+1,{align:'right'});
    doc.setFont('helvetica','normal');

    // Pie legal + pie configurable del branding.
    let fy=272; doc.setDrawColor(225); doc.setLineWidth(0.3); doc.line(20,fy,190,fy); fy+=6;
    doc.setFontSize(8); doc.setTextColor(140);
    doc.text('Comprobante de pago. No es una factura fiscal (CFDI).',20,fy);
    if(emp.recibo_pie){ fy+=5; doc.text(String(emp.recibo_pie).slice(0,140),20,fy); }
    doc.save(folio+'.pdf');
    return folio;
  }

  window.SpesData={ safeStorage, esc, money, daysLeft, fdate, fdatetime, fetchAll, client, ensureJsPDF, recibo };
})();
