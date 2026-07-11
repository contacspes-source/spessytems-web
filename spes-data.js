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

  /* ---------- Recibo PDF ÚNICO (admin y portal) ----------
     pago:    { id, monto, metodo, nota, cubre_hasta, created_at }
     negocio: { business_name, razon_social?, rfc? }
     config:  { empresa_nombre?, color_acento?, recibo_pie? } | null
     Lanza en error (el llamador decide cómo notificar). */
  async function recibo(pago, negocio, config){
    const JS=await ensureJsPDF();
    const p=pago||{}, b=negocio||{}, emp=config||{};
    const doc=new JS();
    const hx=String(emp.color_acento||'').replace('#','');
    const rgb=/^[0-9a-fA-F]{6}$/.test(hx)?[parseInt(hx.slice(0,2),16),parseInt(hx.slice(2,4),16),parseInt(hx.slice(4,6),16)]:[0,0,0];
    doc.setFontSize(20); doc.setTextColor(rgb[0],rgb[1],rgb[2]); doc.text(emp.empresa_nombre||'SPES Systems',20,22); doc.setTextColor(0);
    doc.setFontSize(10); doc.setTextColor(120); doc.text('spessystems.com · Recibo de pago',20,28); doc.setTextColor(0);
    const folio='REC-'+String(p.id).slice(0,8).toUpperCase();
    let y=46; doc.setFontSize(11);
    const line=(k,v)=>{ doc.setTextColor(120); doc.text(k,20,y); doc.setTextColor(0); doc.text(String(v||'—'),75,y); y+=8; };
    line('Folio',folio); line('Fecha',fdate(p.created_at)); line('Cliente',b.business_name||'—');
    if(b.razon_social) line('Razón social',b.razon_social);
    if(b.rfc) line('RFC',b.rfc);
    line('Concepto',p.nota||'Suscripción SPES'); line('Método',p.metodo||'—');
    line('Cubre hasta',p.cubre_hasta?fdate(p.cubre_hasta):'—');
    y+=4; doc.setDrawColor(220); doc.line(20,y,190,y); y+=12;
    doc.setFontSize(15); doc.text('Total: '+money(p.monto),20,y);
    y+=18; doc.setFontSize(9); doc.setTextColor(140);
    doc.text('Comprobante de pago, no es una factura fiscal (CFDI).',20,y);
    if(emp.recibo_pie){ y+=6; doc.text(String(emp.recibo_pie).slice(0,120),20,y); }
    doc.save(folio+'.pdf');
    return folio;
  }

  window.SpesData={ safeStorage, esc, money, daysLeft, fdate, fdatetime, client, ensureJsPDF, recibo };
})();
