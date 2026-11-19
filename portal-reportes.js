/* ============================================================================
 * SPES · Portal — REPORTES (gráficas, calendario y exportaciones)
 *
 * Separado de portal.html en nov-2026 para que el archivo principal sea más
 * fácil de leer. El código es EL MISMO que estaba dentro de portal.html: se
 * movió tal cual, sin cambiar lo que hace.
 *
 * Cómo funciona: es un <script> normal (no módulo), así que sus funciones
 * quedan globales y portal.html las llama igual que antes (rReportes,
 * ensureSalesRange, repExcel...). A su vez, estas funciones usan cosas que
 * declara portal.html (ST, sb, esc, money, render, notify...) — eso funciona
 * porque solo se llaman DESPUÉS de que todo cargó.
 *
 * Orden de carga: portal.html incluye este archivo ANTES de su script
 * principal. Aquí solo hay declaraciones; nada se ejecuta al cargar.
 * ========================================================================== */
// ===== REPORTES (v5: chart animado por transiciones + calendario persistente) =====
const PAY_LBL={ cash:'Efectivo', card:'Tarjeta', transfer:'Transferencia', credit:'Saldo a favor' };
function repBars(rows){
  if(!rows.length) return '<div class="state">Sin datos en este periodo.</div>';
  const max=Math.max(1,...rows.map(r=>r.total));
  return '<div class="card" style="padding:12px">'+rows.map(r=>`
    <div style="display:flex;align-items:center;gap:10px;padding:3px 0">
      <span class="muted" style="width:110px;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.label)}</span>
      <span style="flex:1;height:8px;border-radius:4px;background:var(--neutral-bg);overflow:hidden"><span style="display:block;height:100%;width:${Math.round(r.total/max*100)}%;background:var(--primary);border-radius:4px"></span></span>
      <span style="width:90px;text-align:right;font-size:12px;font-weight:700">${money(r.total)}</span>
    </div>`).join('')+'</div>';
}
function fmtK(v){ return v>=1000?('$'+(Math.round(v/100)/10)+'k'):('$'+Math.round(v)); }
function smoothPath(pts){
  if(pts.length<2) return '';
  let d='M'+pts[0][0]+','+pts[0][1];
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
    d+='C'+(p1[0]+(p2[0]-p0[0])/6)+','+(p1[1]+(p2[1]-p0[1])/6)+' '+(p2[0]-(p3[0]-p1[0])/6)+','+(p2[1]-(p3[1]-p1[1])/6)+' '+p2[0]+','+p2[1];
  }
  return d;
}
// Grafica: todas las series se pintan SIEMPRE (visibles u ocultas por opacidad)
// para que al prender/apagar la forma se re-escale con transicion CSS (style.d).
function repLine(labels,series){
  const W=720,H=280,L=54,Rr=16,T=16,B=30;
  const n=Math.max(2,labels.length);
  const x=i=>L+(W-L-Rr)*i/(n-1);
  const vis=series.filter(s=>s.on);
  const max=Math.max(1,...(vis.length?vis:series).flatMap(s=>s.vals));
  const y=v=>T+(H-T-B)*(1-v/max);
  const gy=f=>T+(H-T-B)*(1-f);
  ST._chart={W,H,L,Rr,T,B,n,labels,series,max};
  const grid=[0,.25,.5,.75,1].map(f=>'<line x1="'+L+'" y1="'+gy(f)+'" x2="'+(W-Rr)+'" y2="'+gy(f)+'" stroke="var(--border)" stroke-width="1"/><text class="ryl" data-f="'+f+'" x="'+(L-8)+'" y="'+(gy(f)+3.5)+'" text-anchor="end" font-size="10" fill="var(--muted)">'+fmtK(max*f)+'</text>').join('');
  const step=Math.max(1,Math.ceil(n/8));
  const xlab=labels.map((lb,i)=>(i%step===0||i===n-1)?('<text x="'+x(i)+'" y="'+(H-8)+'" text-anchor="middle" font-size="10" fill="var(--muted)">'+esc(lb)+'</text>'):'').join('');
  const defs='<defs><filter id="rglow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'+series.map((s,si)=>'<linearGradient id="rg'+si+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="'+s.color+'" stop-opacity=".26"/><stop offset="100%" stop-color="'+s.color+'" stop-opacity="0"/></linearGradient>').join('')+'</defs>';
  const layers=series.map((s,si)=>{
    const pts=s.vals.map((v,i)=>[x(i),y(v)]);
    const d=smoothPath(pts);
    const area=d+' L'+x(n-1)+','+(H-B)+' L'+x(0)+','+(H-B)+' Z';
    const dots=(n<=40)?s.vals.map((v,i)=>'<circle class="rdot" data-i="'+i+'" cx="'+x(i)+'" cy="'+y(v)+'" r="3.4" fill="var(--bg)" stroke="'+s.color+'" stroke-width="2"/>').join(''):'';
    const op=s.on?'1':'0';
    return '<path class="rarea" id="ra-'+s.key+'" d="'+area+'" fill="url(#rg'+si+')" style="opacity:'+op+'"/><path class="rline" id="rl-'+s.key+'" d="'+d+'" fill="none" stroke="'+s.color+'" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" filter="url(#rglow)" style="opacity:'+op+'"/><g class="rdg" id="rd-'+s.key+'" style="opacity:'+op+'">'+dots+'</g>';
  }).join('');
  const guide='<line id="rGuide" x1="0" x2="0" y1="'+T+'" y2="'+(H-B)+'" stroke="var(--focus)" stroke-width="1" stroke-dasharray="4 4" opacity="0"/>';
  return '<div class="card" id="chartBox" style="padding:16px 10px 6px;position:relative"><svg id="repSvg" viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">'+defs+grid+guide+layers+xlab+'</svg></div><div class="rtip" id="rTip"></div>';
}
// Re-escala y muestra/oculta series SIN redibujar: transiciones CSS hacen el morph.
function chartUpdate(c){
  const M=ST._chart; if(!M) return;
  M.series.forEach(s=>{ s.on=!!ST.repSeries[s.key]&&s.avail; });
  const vis=M.series.filter(s=>s.on);
  M.max=Math.max(1,...(vis.length?vis:M.series).flatMap(s=>s.vals));
  const x=i=>M.L+(M.W-M.L-M.Rr)*i/(M.n-1);
  const y=v=>M.T+(M.H-M.T-M.B)*(1-v/M.max);
  M.series.forEach(s=>{
    const pts=s.vals.map((v,i)=>[x(i),y(v)]);
    const d=smoothPath(pts);
    const area=d+' L'+x(M.n-1)+','+(M.H-M.B)+' L'+x(0)+','+(M.H-M.B)+' Z';
    const ln=c.querySelector('#rl-'+s.key), ar=c.querySelector('#ra-'+s.key), dg=c.querySelector('#rd-'+s.key);
    if(ln){ ln.style.d='path("'+d+'")'; ln.style.opacity=s.on?'1':'0'; }
    if(ar){ ar.style.d='path("'+area+'")'; ar.style.opacity=s.on?'1':'0'; }
    if(dg){ dg.style.opacity=s.on?'1':'0'; dg.querySelectorAll('.rdot').forEach(dot=>{ const i=Number(dot.dataset.i); dot.style.cy=y(s.vals[i]||0)+'px'; }); }
  });
  c.querySelectorAll('.ryl').forEach(t=>{ t.textContent=fmtK(M.max*Number(t.dataset.f)); });
  c.querySelectorAll('[data-serie]').forEach(b=>{ const s=M.series.find(z=>z.key===b.dataset.serie); b.style.opacity=(s&&s.on)?'1':'.35'; });
}
async function ensureSalesRange(fromIso){
  if(ST._salesFrom && fromIso>=ST._salesFrom) return;
  const upto=ST._salesFrom||new Date(Date.now()+86400000).toISOString();
  try{
    const older=await SpesData.fetchAll(()=>sb.from('sales').select('status,created_at,data').eq('account_id',ST.uid).gte('created_at',fromIso).lt('created_at',upto).order('created_at',{ascending:false}).order('id'),{max:8000});
    ST.MONTH_SALES=ST.MONTH_SALES.concat(older||[]);
    ST._salesFrom=fromIso;
  }catch(e){
    // Sin reintentos en bucle: se marca el rango y se avisa (botón Reintentar).
    if(!ST._salesFrom) ST._salesFrom=fromIso;
    (ST._loadErrors=ST._loadErrors||[]).push((e&&e.message)||'ventas');
  }
}
function ymdOf(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function calHtml(){
  const v=ST.calView;
  const title=new Date(v.y,v.m,1).toLocaleDateString('es-MX',{month:'long',year:'numeric'});
  const off=(new Date(v.y,v.m,1).getDay()+6)%7;
  const start=new Date(v.y,v.m,1-off);
  let ra=null,rb=null;
  if(ST.repPeriod==='rango'){ ra=ST.repRange.from; rb=ST.repRange.to; }
  let cells='';
  for(let i=0;i<42;i++){
    const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);
    const k=ymdOf(d);
    let cls='day'+(d.getMonth()!==v.m?' out':'');
    if(ra&&rb){ if(k===ra&&k===rb) cls+=' ab'; else if(k===ra) cls+=' a'; else if(k===rb) cls+=' b'; else if(k>ra&&k<rb) cls+=' in'; }
    cells+='<button class="'+cls+'" data-day="'+k+'">'+d.getDate()+'</button>';
  }
  return '<div class="cal" id="repCal"><div class="chd"><button class="cnav" data-cnav="-1">‹</button><b>'+esc(title)+'</b><button class="cnav" data-cnav="1">›</button></div><div class="cgrid">'+['L','M','M','J','V','S','D'].map(d=>'<div class="dow">'+d+'</div>').join('')+cells+'</div><p class="muted" style="margin-top:8px;font-size:11px">'+(ST.calA?'Toca la fecha FINAL para extender el rango.':'Toca una fecha; se aplica al instante. Toca otra para hacer rango.')+'</p></div>';
}
function rReportes(c){
  const per=ST.repPeriod||'mes';
  if(!ST.repTab) ST.repTab='resumen';
  if(!ST.repF) ST.repF={branch:'',emp:''};
  if(!ST.repSeries) ST.repSeries={d:true,a:true,p:true};
  const now=new Date();
  const day0=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
  if(!ST.repRange) ST.repRange={from:ymdOf(new Date(now.getFullYear(),now.getMonth(),1)), to:ymdOf(now)};
  if(!ST.calView){ const f=new Date(ST.repRange.from+'T00:00:00'); ST.calView={y:f.getFullYear(),m:f.getMonth()}; }
  let from,to=new Date(now.getTime()+60000),pFrom=null,pTo=null;
  if(per==='hoy'){ from=day0(now); pFrom=new Date(from.getTime()-86400000); pTo=from; }
  else if(per==='7d'){ from=new Date(day0(now).getTime()-6*86400000); pFrom=new Date(from.getTime()-7*86400000); pTo=from; }
  else if(per==='mesant'){ from=new Date(now.getFullYear(),now.getMonth()-1,1); to=new Date(now.getFullYear(),now.getMonth(),1); }
  else if(per==='rango'){ from=new Date(ST.repRange.from+'T00:00:00'); to=new Date(new Date(ST.repRange.to+'T00:00:00').getTime()+86400000); const len=to.getTime()-from.getTime(); pFrom=new Date(from.getTime()-len); pTo=from; }
  else { from=new Date(now.getFullYear(),now.getMonth(),1); const el=now.getTime()-from.getTime(); pFrom=new Date(now.getFullYear(),now.getMonth()-1,1); pTo=new Date(pFrom.getTime()+el); }
  const inR=(iso,a,b)=>{ const t=new Date(iso).getTime(); return t>=a.getTime()&&t<b.getTime(); };
  const sale=s=>(s.data&&s.data.sale)||{};
  const items=s=>((s.data&&s.data.items)||[]).filter(it=>!it.is_deleted);
  const pays=s=>((s.data&&s.data.payments)||[]).filter(p=>!p.is_deleted);
  const S=ST.MONTH_SALES.filter(s=>s.status!=='cancelled');
  const brIds=[]; S.forEach(s=>{ const b=sale(s).branch_id; if(b&&brIds.indexOf(b)<0) brIds.push(b); });
  brIds.sort(); const brLabel={}; brIds.forEach((b,i)=>{ brLabel[b]='Sucursal '+(i+1); });
  const F=ST.repF;
  if(brIds.length<2) F.branch='';
  const pass=s=>(!F.branch||sale(s).branch_id===F.branch)&&(!F.emp||sale(s).employee_id===F.emp);
  const cur=S.filter(s=>inR(s.created_at,from,to)&&pass(s));
  const prev=(pFrom&&pTo)?S.filter(s=>inR(s.created_at,pFrom,pTo)&&pass(s)):null;
  const tot=a=>a.reduce((x,s)=>x+Number(sale(s).total||0),0);
  const util=a=>{ let u=0; a.forEach(s=>{ items(s).forEach(it=>{ u+=Number(it.line_total||0)-Number(it.cost_price||0)*Number(it.quantity||0); }); }); return u; };
  const sumk=(a,k)=>a.reduce((x,y)=>x+Number(y[k]||0),0);
  const pct=(a,b)=>{ if(b==null||b<=0) return ''; const d=(a-b)/b*100; const up=d>=0; return ' <span style="font-size:11px;font-weight:800;color:'+(up?'var(--ok-fg)':'var(--bad-fg)')+'">'+(up?'▲ ':'▼ ')+Math.abs(Math.round(d))+'%</span>'; };
  // Devoluciones (oct-2026, igual que el POS 0.6.4): se RESTAN de las ventas el
  // día en que se hicieron. Antes el portal las mostraba aparte y las ventas
  // netas no cuadraban con la caja (venta de 999,999 devuelta seguía sumando).
  const retIn=(a,b)=>ST.RETURNS.filter(r=>r.created_at&&inR(r.created_at,a,b)&&(!F.branch||r.branch_id===F.branch)&&(!F.emp||r.employee_id===F.emp));
  const devsCur=retIn(from,to), devsPrev=(pFrom&&pTo)?retIn(pFrom,pTo):[];
  const devT=a=>a.reduce((x,r)=>x+Number(r.total||0),0);
  const costByItem={}; S.forEach(s=>{ items(s).forEach(it=>{ costByItem[it.id]=Number(it.cost_price||0); }); });
  const retUtil=a=>a.reduce((x,r)=>x+((r.items||[]).reduce((y,it)=>y+Number(it.line_total||0)-(costByItem[it.sale_item_id]||0)*Number(it.quantity||0),0)),0);
  const vTot=tot(cur)-devT(devsCur), vPrev=prev?tot(prev)-devT(devsPrev):null;
  const uTot=util(cur)-retUtil(devsCur), uPrev=prev?util(prev)-retUtil(devsPrev):null;
  const tickets=cur.length, tickProm=tickets?vTot/tickets:0;
  const desc=cur.reduce((x,s)=>x+Number(sale(s).discount_total||0),0);
  let tax=0,cashT=0,cardT=0,otrosT=0;
  cur.forEach(s=>{ tax+=Number(sale(s).tax_total||0); const ps=pays(s); if(ps.length){ ps.forEach(p=>{ const a2=Number(p.amount||0); if(p.method==='cash')cashT+=a2; else if(p.method==='card')cardT+=a2; else otrosT+=a2; }); } else { const a2=Number(sale(s).total||0); if(sale(s).payment_method==='card')cardT+=a2; else cashT+=a2; } });
  const devs=devsCur;
  // Lo devuelto en EFECTIVO sale de la caja (los de saldo a favor no).
  devs.forEach(r=>{ if(r.refund_method==='cash') cashT-=Number(r.total||0); });
  const egs=ST.EGRESOS.filter(e=>e.created_at&&inR(e.created_at,from,to));
  const mms=ST.MERMAS.filter(m=>m.created_at&&inR(m.created_at,from,to));
  const mermUnits=Math.abs(mms.reduce((a,m)=>a+Number(m.qty_change||0),0));
  const PERS=[['hoy','Hoy'],['7d','7 días'],['mes','Este mes'],['mesant','Mes anterior']];
  const perLbl=per==='rango'?'Rango':((PERS.find(p=>p[0]===per)||[])[1]||per);
  const fromStr=from.toLocaleDateString('es-MX'); const toStr=new Date(Math.min(to.getTime()-1,Date.now())).toLocaleDateString('es-MX');
  const fileTag=per+'-'+new Date().toISOString().slice(0,10);
  const emName={}; ST.EMPLOYEES.forEach(e=>{ emName[e.id]=e.full_name||'—'; });
  const filterDesc=[F.branch?('Sucursal: '+(brLabel[F.branch]||'')):'' , F.emp?('Empleado: '+(emName[F.emp]||'')):''].filter(Boolean).join(' · ');
  const topAgg={};
  cur.forEach(s=>{ items(s).forEach(it=>{ const k=it.name||'—'; const t=(topAgg[k]=topAgg[k]||{name:k,sku:it.sku||'',qty:0,total:0,util:0,cost:0}); t.qty+=Number(it.quantity||0); t.total+=Number(it.line_total||0); t.cost+=Number(it.cost_price||0)*Number(it.quantity||0); t.util+=Number(it.line_total||0)-Number(it.cost_price||0)*Number(it.quantity||0); }); });
  const prodAll=Object.values(topAgg).sort((a,b)=>b.total-a.total);
  const PM={}; ST.PRODUCTS.forEach(p=>{ PM[p.id]=p; });
  const catAgg={};
  cur.forEach(s=>{ items(s).forEach(it=>{ const p=PM[it.product_id]; const cn=(p&&p.category_id&&ST.CATEGORIES[p.category_id])||'Sin categoría'; const t=(catAgg[cn]=catAgg[cn]||{label:cn,total:0,qty:0}); t.total+=Number(it.line_total||0); t.qty+=Number(it.quantity||0); }); });
  const catRows=Object.values(catAgg).sort((a,b)=>b.total-a.total);
  const payAgg={};
  cur.forEach(s=>{ const ps=pays(s); if(ps.length){ ps.forEach(p=>{ const k=PAY_LBL[p.method]||p.method||'—'; const t=(payAgg[k]=payAgg[k]||{label:k,total:0}); t.total+=Number(p.amount||0); }); } else { const m=sale(s).payment_method||'—'; const k=PAY_LBL[m]||m; const t=(payAgg[k]=payAgg[k]||{label:k,total:0}); t.total+=Number(sale(s).total||0); } });
  const payRows=Object.values(payAgg).sort((a,b)=>b.total-a.total);
  const empAgg={};
  cur.forEach(s=>{ const n2=(s.data&&s.data.employee_name)||'—'; const t=(empAgg[n2]=empAgg[n2]||{name:n2,n:0,total:0}); t.n++; t.total+=Number(sale(s).total||0); });
  const empRows=Object.values(empAgg).sort((a,b)=>b.total-a.total);
  const expDays={};
  cur.forEach(s=>{ const d=new Date(s.created_at); const k=d.toLocaleDateString('es-MX'); const t=(expDays[k]=expDays[k]||{day:k,ts:new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime(),tickets:0,cash:0,card:0,otros:0,desc:0,total:0}); t.tickets++; t.total+=Number(sale(s).total||0); t.desc+=Number(sale(s).discount_total||0); const ps=pays(s); if(ps.length){ ps.forEach(p=>{ const a2=Number(p.amount||0); if(p.method==='cash') t.cash+=a2; else if(p.method==='card') t.card+=a2; else t.otros+=a2; }); } else { const a2=Number(sale(s).total||0); if(sale(s).payment_method==='card') t.card+=a2; else t.cash+=a2; } });
  ST._rep={label:perLbl,fromStr,toStr,fileTag,filterDesc,vTot,tickets,tickProm,uTot,desc,tax,cashT,cardT,otrosT,gross:vTot+devT(devsCur)+desc,units:prodAll.reduce((x,p)=>x+p.qty,0),costT:prodAll.reduce((x,p)=>x+p.cost,0),prodT:prodAll.reduce((x,p)=>x+p.total,0),devsN:devs.length,devsT:sumk(devs,'total'),egsN:egs.length,egsT:sumk(egs,'amount'),mermU:mermUnits,days:Object.values(expDays).sort((a,b)=>a.ts-b.ts),prods:prodAll,pays:payRows,emps:empRows};
  let labels=[],dayVals=[],prevVals=[],tickVals=[];
  if(per==='hoy'){
    for(let h=0;h<24;h++){ labels.push(String(h).padStart(2,'0')+':00'); dayVals.push(0); prevVals.push(0); tickVals.push(0); }
    cur.forEach(s=>{ const h=new Date(s.created_at).getHours(); dayVals[h]+=Number(sale(s).total||0); tickVals[h]++; });
    if(prev) prev.forEach(s=>{ prevVals[new Date(s.created_at).getHours()]+=Number(sale(s).total||0); });
    devsCur.forEach(r=>{ dayVals[new Date(r.created_at).getHours()]-=Number(r.total||0); });
    if(prev) devsPrev.forEach(r=>{ prevVals[new Date(r.created_at).getHours()]-=Number(r.total||0); });
    let lo=8,hi=21; for(let i=0;i<24;i++){ if(dayVals[i]>0||prevVals[i]>0){ lo=Math.min(lo,i); hi=Math.max(hi,i); } }
    labels=labels.slice(lo,hi+1); dayVals=dayVals.slice(lo,hi+1); prevVals=prevVals.slice(lo,hi+1); tickVals=tickVals.slice(lo,hi+1);
  } else {
    const endMs=Math.min(to.getTime(),Date.now()+86400000);
    const nd=Math.max(1,Math.ceil((endMs-from.getTime())/86400000));
    const stepDays=nd>92?7:1;
    const nb=Math.ceil(nd/stepDays);
    for(let i=0;i<nb;i++){ const d=new Date(from.getTime()+i*stepDays*86400000); labels.push(d.toLocaleDateString('es-MX',{day:'2-digit',month:'short'})); dayVals.push(0); prevVals.push(0); tickVals.push(0); }
    const bidx=(t,base)=>Math.floor((t-base)/(stepDays*86400000));
    cur.forEach(s=>{ const i=bidx(new Date(s.created_at).getTime(),from.getTime()); if(i>=0&&i<nb){ dayVals[i]+=Number(sale(s).total||0); tickVals[i]++; } });
    if(prev) prev.forEach(s=>{ const i=bidx(new Date(s.created_at).getTime(),pFrom.getTime()); if(i>=0&&i<nb) prevVals[i]+=Number(sale(s).total||0); });
    devsCur.forEach(r=>{ const i=bidx(new Date(r.created_at).getTime(),from.getTime()); if(i>=0&&i<nb) dayVals[i]-=Number(r.total||0); });
    if(prev) devsPrev.forEach(r=>{ const i=bidx(new Date(r.created_at).getTime(),pFrom.getTime()); if(i>=0&&i<nb) prevVals[i]-=Number(r.total||0); });
  }
  const cum=[]; let ac=0; dayVals.forEach(v=>{ ac+=v; cum.push(ac); });
  const pcum=[]; let pc2=0; prevVals.forEach(v=>{ pc2+=v; pcum.push(pc2); });
  const series=[
    {key:'d',name:per==='hoy'?'Por hora':'Diario',color:'#60a5fa',vals:dayVals,avail:true,on:!!ST.repSeries.d},
    {key:'a',name:'Acumulado',color:'#22c55e',vals:cum,avail:true,on:!!ST.repSeries.a},
    {key:'p',name:'Anterior (acum.)',color:'#f59e0b',vals:pcum,avail:!!prev,on:!!ST.repSeries.p&&!!prev}
  ];
  const legend='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;justify-content:center">'+series.map(s=>'<button class="btn ghost sm" data-serie="'+s.key+'" style="border:1.5px solid '+s.color+';color:'+s.color+';font-weight:800;letter-spacing:.04em;opacity:'+(s.on?'1':'.35')+'">'+esc(s.name.toUpperCase())+'</button>').join('')+'</div>';
  const TABS2=[['resumen','Resumen'],['tendencias','Tendencias'],['articulos','Por artículo'],['categorias','Por categoría'],['equipo','Por empleado']];
  const tabsHtml='<div class="rtabs">'+TABS2.map(t=>'<button class="rtab'+(ST.repTab===t[0]?' on':'')+'" data-rtab="'+t[0]+'">'+t[1]+'</button>').join('')+'</div>';
  const selHtml=PERS.map(p=>`<button class="btn ${p[0]===per?'':'ghost '}sm" data-per="${p[0]}">${p[1]}</button>`).join('');
  const calBtnLbl=per==='rango'?(fromStr+' – '+toStr):'Elegir fechas';
  const calBtn='<div style="position:relative"><button class="btn '+(per==='rango'?'':'ghost ')+'sm" id="repCalBtn" style="display:inline-flex;align-items:center;gap:7px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'+esc(calBtnLbl)+'</button>'+(ST.calOpen?calHtml():'')+'</div>';
  const brSel=brIds.length>1?('<select id="repBr"><option value="">Todas las sucursales</option>'+brIds.map(b=>'<option value="'+esc(b)+'"'+(F.branch===b?' selected':'')+'>'+esc(brLabel[b])+'</option>').join('')+'</select>'):'';
  const emAct=ST.EMPLOYEES.filter(e=>e.is_active!==0);
  const emSel='<select id="repEm"><option value="">Todos los empleados</option>'+emAct.map(e=>'<option value="'+esc(e.id)+'"'+(F.emp===e.id?' selected':'')+'>'+esc(e.full_name||'—')+'</option>').join('')+'</select>';
  const icons='<span style="flex:1"></span>'
    +'<button class="ic" id="repXls" title="Exportar Excel"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="12" y1="3" x2="12" y2="21"/></svg></button>'
    +'<button class="ic" id="repPdfDl" title="Exportar PDF (descargar)"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><polyline points="9 14 12 17 15 14"/></svg></button>'
    +'<button class="ic" id="repPrn" title="Imprimir reporte"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>';
  const kpis=`<div class="cards">
      <div class="card"><div class="n">${money(vTot)}${pct(vTot,vPrev)}</div><div class="l">Ventas · ${tickets} tickets${prev?' · vs periodo anterior':''}</div></div>
      <div class="card"><div class="n">${money(tickProm)}</div><div class="l">Ticket promedio</div></div>
      <div class="card"><div class="n">${money(uTot)}${pct(uTot,uPrev)}</div><div class="l">Utilidad estimada</div></div>
    </div>`;
  c.innerHTML='<h2>Reportes</h2><p class="sub">La foto de tu negocio · '+esc(perLbl)+' ('+esc(fromStr)+(fromStr===toStr?'':(' – '+toStr))+')</p>'
    +tabsHtml
    +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center">'+selHtml+calBtn+brSel+emSel+icons+'</div>'
    +(filterDesc?('<p class="muted" style="margin:-4px 0 12px;font-size:12.5px">Filtrando · '+esc(filterDesc)+'</p>'):'')
    +kpis
    +'<div id="repBody" style="margin-top:14px"></div>'
    +'<p class="muted" style="margin-top:12px;font-size:12px">Utilidad estimada con el costo capturado de cada producto. Filtro por caja disponible cuando la app suba el dispositivo en cada venta.</p>';
  const body=c.querySelector('#repBody');
  const h3='style="font-size:14px;font-weight:800;margin-bottom:10px"';
  const marginPct=vTot>0?Math.round(uTot/vTot*100):0;
  if(!cur.length){ body.innerHTML='<div class="state">No hay ventas en este periodo (con estos filtros).</div>'; }
  else if(ST.repTab==='tendencias'){
    body.innerHTML='<h3 '+h3+'>Ventas del periodo</h3>'+repLine(labels,series)+legend;
  } else if(ST.repTab==='articulos'){
    body.innerHTML='<div class="card" style="padding:12px"><input id="repQ" placeholder="Buscar producto o SKU…" style="max-width:340px"></div>'
      +'<div class="card" style="margin-top:10px;padding:6px 12px;overflow-x:auto"><table id="artTbl"><thead><tr><th>Producto</th><th>SKU</th><th>Cant.</th><th>Vendido</th><th>Costo</th><th>Utilidad</th></tr></thead><tbody>'
      +prodAll.map(p=>'<tr data-n="'+esc((p.name+' '+(p.sku||'')).toLowerCase())+'"><td>'+esc(p.name)+'</td><td class="mono muted">'+esc(p.sku||'—')+'</td><td>'+(Math.round(p.qty*100)/100).toLocaleString('es-MX')+'</td><td><strong>'+money(p.total)+'</strong></td><td class="muted">'+money(p.cost)+'</td><td>'+money(p.util)+'</td></tr>').join('')
      +'</tbody></table></div>';
  } else if(ST.repTab==='categorias'){
    body.innerHTML='<div class="grid2"><div><h3 '+h3+'>Vendido por categoría</h3>'+repBars(catRows.slice(0,10))+'</div>'
      +'<div><h3 '+h3+'>Detalle</h3><div class="card" style="padding:6px 12px;overflow-x:auto"><table><thead><tr><th>Categoría</th><th>Cant.</th><th>Vendido</th><th>% del total</th></tr></thead><tbody>'
      +catRows.map(cr=>'<tr><td>'+esc(cr.label)+'</td><td>'+(Math.round(cr.qty*100)/100).toLocaleString('es-MX')+'</td><td><strong>'+money(cr.total)+'</strong></td><td class="muted">'+(vTot>0?Math.round(cr.total/vTot*100):0)+'%</td></tr>').join('')
      +'</tbody></table></div></div></div>';
  } else if(ST.repTab==='equipo'){
    body.innerHTML='<div class="card" style="padding:6px 12px;overflow-x:auto"><table><thead><tr><th>Empleado</th><th>Tickets</th><th>Vendido</th><th>Ticket prom.</th><th>% del total</th></tr></thead><tbody>'
      +empRows.map(e=>'<tr><td>'+esc(e.name)+'</td><td>'+e.n+'</td><td><strong>'+money(e.total)+'</strong></td><td class="muted">'+money(e.n?e.total/e.n:0)+'</td><td class="muted">'+(vTot>0?Math.round(e.total/vTot*100):0)+'%</td></tr>').join('')
      +'</tbody></table></div>';
  } else {
    body.innerHTML='<div class="grid2"><div><h3 '+h3+'>Resumen</h3><div class="card"><dl class="kv">'
      +'<dt>Ventas brutas</dt><dd><b>'+money(vTot+devT(devsCur)+desc)+'</b></dd>'
      +'<dt>Descuentos</dt><dd>- '+money(desc)+'</dd>'
      +(devsCur.length?('<dt>Devoluciones ('+devsCur.length+')</dt><dd>- '+money(devT(devsCur))+'</dd>'):'')
      +'<dt>Ventas netas</dt><dd><b>'+money(vTot)+'</b></dd>'
      +'<dt>IVA incluido</dt><dd>'+money(tax)+'</dd>'
      +'<dt>Tarjeta</dt><dd>'+money(cardT)+'</dd>'
      +'<dt>Efectivo</dt><dd>'+money(cashT)+'</dd>'
      +(otrosT>0?('<dt>Otros métodos</dt><dd>'+money(otrosT)+'</dd>'):'')
      +'<dt>Utilidad estimada</dt><dd><b>'+money(uTot)+'</b></dd>'
      +'<dt>Margen bruto</dt><dd>'+marginPct+'%</dd>'
      +'</dl></div></div>'
      +'<div><h3 '+h3+'>Por método de pago</h3>'+repBars(payRows)
      +'<h3 '+h3+' style="margin-top:16px">Movimientos del periodo</h3><div class="card"><dl class="kv">'
      +'<dt>Devoluciones</dt><dd>'+devs.length+' · '+money(sumk(devs,'total'))+'</dd>'
      +'<dt>Egresos</dt><dd>'+egs.length+' · '+money(sumk(egs,'amount'))+'</dd>'
      +'<dt>Mermas y salidas</dt><dd>'+mms.length+' · '+mermUnits.toLocaleString('es-MX')+' unidades</dd>'
      +'</dl></div></div></div>';
  }
  // ----- Handlers -----
  const keep=()=>{ ST._calKeep=true; };
  c.querySelectorAll('[data-rtab]').forEach(b=>b.addEventListener('click',()=>{ ST.repTab=b.dataset.rtab; rReportes(c); }));
  c.querySelectorAll('[data-per]').forEach(b=>b.addEventListener('click',()=>{ ST.repPeriod=b.dataset.per; ST.calOpen=false; ST.calA=null; rReportes(c); }));
  const cbtn=c.querySelector('#repCalBtn');
  if(cbtn) cbtn.addEventListener('click',()=>{ keep(); ST.calOpen=!ST.calOpen; if(ST.calOpen){ const f=new Date((ST.repPeriod==='rango'?ST.repRange.from:ymdOf(new Date()))+'T00:00:00'); ST.calView={y:f.getFullYear(),m:f.getMonth()}; ST.calA=null; } rReportes(c); });
  c.querySelectorAll('[data-cnav]').forEach(b=>b.addEventListener('click',()=>{ keep(); let m=ST.calView.m+Number(b.dataset.cnav), y=ST.calView.y; if(m<0){m=11;y--;} if(m>11){m=0;y++;} ST.calView={y,m}; ST.calOpen=true; rReportes(c); }));
  c.querySelectorAll('[data-day]').forEach(b=>b.addEventListener('click',async()=>{
    keep();
    const k=b.dataset.day;
    let a,b2;
    if(!ST.calA){ ST.calA=k; a=k; b2=k; }
    else { a=ST.calA; b2=k; if(b2<a){ const t2=a; a=b2; b2=t2; } ST.calA=null; }
    ST.repRange={from:a,to:b2};
    ST.calOpen=true;
    await ensureSalesRange(new Date(a+'T00:00:00').toISOString());
    ST.repPeriod='rango';
    rReportes(c);
  }));
  // El calendario se cierra SOLO al hacer clic fuera de el.
  if(window._calDocH){ document.removeEventListener('click',window._calDocH); window._calDocH=null; }
  if(ST.calOpen){
    window._calDocH=ev=>{
      if(ST._calKeep){ ST._calKeep=false; return; }
      const cal=document.getElementById('repCal'), btn=document.getElementById('repCalBtn');
      if((cal&&cal.contains(ev.target))||(btn&&btn.contains(ev.target))) return;
      document.removeEventListener('click',window._calDocH); window._calDocH=null;
      if(!ST.calOpen) return;
      ST.calOpen=false; ST.calA=null; rReportes(c);
    };
    setTimeout(()=>{ if(window._calDocH) document.addEventListener('click',window._calDocH); },0);
  }
  const br=c.querySelector('#repBr'); if(br) br.addEventListener('change',()=>{ ST.repF.branch=br.value; rReportes(c); });
  const em=c.querySelector('#repEm'); if(em) em.addEventListener('change',()=>{ ST.repF.emp=em.value; rReportes(c); });
  const bx=c.querySelector('#repXls'); if(bx) bx.addEventListener('click',()=>{ void repExcel(); });
  const bpd=c.querySelector('#repPdfDl'); if(bpd) bpd.addEventListener('click',()=>{ void repPdfFile(); });
  const bpr=c.querySelector('#repPrn'); if(bpr) bpr.addEventListener('click',repPrint);
  c.querySelectorAll('[data-serie]').forEach(b=>b.addEventListener('click',()=>{ ST.repSeries[b.dataset.serie]=!ST.repSeries[b.dataset.serie]; chartUpdate(c); }));
  const q=c.querySelector('#repQ'); if(q) q.addEventListener('input',()=>{ const t2=q.value.trim().toLowerCase(); c.querySelectorAll('#artTbl tbody tr').forEach(r=>{ r.style.display=(!t2||String(r.dataset.n).indexOf(t2)>=0)?'':'none'; }); });
  const box=c.querySelector('#chartBox');
  if(box&&ST._chart){
    const svg=box.querySelector('#repSvg'), tip=c.querySelector('#rTip'), gd=box.querySelector('#rGuide');
    box.addEventListener('mousemove',ev=>{
      const M=ST._chart;
      const r=svg.getBoundingClientRect();
      const vx=(ev.clientX-r.left)/r.width*M.W;
      let i=Math.round((vx-M.L)/((M.W-M.L-M.Rr)/(M.n-1))); i=Math.max(0,Math.min(M.labels.length-1,i));
      const gx=M.L+(M.W-M.L-M.Rr)*i/(M.n-1);
      gd.setAttribute('x1',gx); gd.setAttribute('x2',gx); gd.setAttribute('opacity','.8');
      let h='<b>'+esc(M.labels[i])+'</b>';
      M.series.forEach(s=>{ if(!s.on) return; h+='<div style="display:flex;align-items:center;gap:6px;margin-top:3px"><span style="width:8px;height:8px;border-radius:50%;background:'+s.color+'"></span><span class="muted" style="font-size:11px">'+esc(s.name)+'</span><b style="margin-left:auto;padding-left:10px">'+money(s.vals[i]||0)+'</b></div>'; });
      h+='<div class="muted" style="margin-top:3px;font-size:11px">Tickets: '+(M.tickets&&M.tickets[i]||0)+'</div>';
      tip.innerHTML=h; tip.style.display='block'; tip.style.left=(ev.clientX+14)+'px'; tip.style.top=(ev.clientY+12)+'px';
    });
    box.addEventListener('mouseleave',()=>{ tip.style.display='none'; gd.setAttribute('opacity','0'); });
    ST._chart.tickets=tickVals;
  }
}

// ===== EXPORTACIONES (formato SPES identico a la app) =====
function loadXLSX(){ return new Promise((res,rej)=>{ if(window.XLSX) return res(); const s=document.createElement('script'); s.src='/assets/vendor/xlsx-0.18.5.full.min.js'; s.integrity='sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw'; s.crossOrigin='anonymous'; s.onload=()=>res(); s.onerror=()=>rej(new Error('No se pudo cargar el exportador. Revisa tu internet.')); document.head.appendChild(s); }); }
function loadH2P(){ return new Promise((res,rej)=>{ if(window.html2pdf) return res(); const s=document.createElement('script'); s.src='/assets/vendor/html2pdf-0.10.1.bundle.min.js'; s.integrity='sha384-Yv5O+t3uE3hunW8uyrbpPW3iw6/5/Y7HitWJBLgqfMoA36NogMmy+8wWZMpn3HWc'; s.crossOrigin='anonymous'; s.onload=()=>res(); s.onerror=()=>rej(new Error('No se pudo cargar el generador de PDF. Revisa tu internet.')); document.head.appendChild(s); }); }
async function repExcel(){
  const R=ST._rep; if(!R){ notify('Abre Reportes y elige un periodo primero.','error'); return; }
  try{ await loadXLSX(); }catch(e){ notify(e.message,'error'); return; }
  const biz=(ST.biz&&ST.biz.business_name)||'';
  const meta=[['SPES Systems'],['Control inteligente para tu empresa.'],['Informe de ventas'+(biz?(' · '+biz):'')],['Periodo: '+R.label+' ('+R.fromStr+' – '+R.toStr+')'+(R.filterDesc?(' · '+R.filterDesc):'')],['Generado: '+new Date().toLocaleString('es-MX')+' · Portal del cliente'],[]];
  const wb=XLSX.utils.book_new();
  const resumen=meta.concat([['Indicador','Valor'],['Ventas brutas',R.gross],['Descuentos',R.desc],['Devoluciones',R.devsT],['Ventas netas',R.vTot],['IVA incluido',R.tax],['Tickets',R.tickets],['Ticket promedio',R.tickProm],['Efectivo',R.cashT],['Tarjeta',R.cardT],['Otros métodos',R.otrosT],['Utilidad estimada',R.uTot],['Devoluciones ('+R.devsN+')',R.devsT],['Egresos ('+R.egsN+')',R.egsT],['Mermas (unidades)',R.mermU]]);
  const sh1=XLSX.utils.aoa_to_sheet(resumen); sh1['!cols']=[{wch:34},{wch:18}];
  XLSX.utils.book_append_sheet(wb,sh1,'Resumen');
  const dias=meta.concat([['Día','Tickets','Efectivo','Tarjeta','Otros','Descuentos','Total']]).concat(R.days.map(d=>[d.day,d.tickets,d.cash,d.card,d.otros,d.desc,d.total]));
  const sh2=XLSX.utils.aoa_to_sheet(dias); sh2['!cols']=[{wch:14},{wch:8},{wch:12},{wch:12},{wch:12},{wch:12},{wch:14}];
  XLSX.utils.book_append_sheet(wb,sh2,'Ventas por dia');
  const prods=meta.concat([['SKU','Producto','Unidades','Ingreso','Costo','Utilidad']]).concat(R.prods.map(p=>[p.sku||'',p.name,Math.round(p.qty*100)/100,p.total,p.cost,p.util]));
  const sh3=XLSX.utils.aoa_to_sheet(prods); sh3['!cols']=[{wch:12},{wch:34},{wch:10},{wch:12},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb,sh3,'Productos');
  const des=meta.concat([['Método de pago','Total']]).concat(R.pays.map(p=>[p.label,p.total])).concat([[''],['Empleado','Tickets','Vendido']]).concat(R.emps.map(e=>[e.name,e.n,e.total]));
  const sh4=XLSX.utils.aoa_to_sheet(des); sh4['!cols']=[{wch:28},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb,sh4,'Desgloses');
  XLSX.writeFile(wb,'SPES-Reporte-'+R.fileTag+'.xlsx');
}
// Cuerpo del reporte formato SPES (plantilla identica a reportHtml de la app),
// con estilos SCOPED a .spesrep para poder montarlo en la pagina sin chocar.
function repBody(R){
  const period=R.fromStr===R.toStr?R.fromStr:(R.fromStr+' a '+R.toStr);
  const sub='Periodo: '+period+(R.filterDesc?(' · '+R.filterDesc):'');
  const marginPct=R.vTot>0?Math.round((R.uTot/R.vTot)*100):0;
  const biz=(ST.biz&&ST.biz.business_name)||'';
  const kpis=[['Ventas totales',money(R.vTot)],['Tickets',String(R.tickets)],['Ticket promedio',R.tickets>0?money(R.tickProm):'—'],['Utilidad estimada',money(R.uTot)]];
  const kpiCards=kpis.map(k=>'<div class="kpi"><div class="kv">'+esc(k[1])+'</div><div class="kl">'+esc(k[0])+'</div></div>').join('');
  const sr=(cls,l,v)=>'<tr class="'+cls+'"><td class="'+((cls==='ind'||cls==='sub')?'ind':'')+'">'+esc(l)+'</td><td class="v">'+esc(v)+'</td></tr>';
  const summary='<table class="sum"><tbody><tr class="cap"><td>Resumen</td><td class="v">'+esc(period)+'</td></tr>'
    +sr('sec','Ventas brutas',money(R.gross))+sr('ind','Descuentos','- '+money(R.desc))+(R.devsN?sr('ind','Devoluciones','- '+money(R.devsT)):'')+sr('sec','Ventas netas',money(R.vTot))+sr('ind','IVA incluido',money(R.tax))
    +sr('top','Total cobrado',money(R.vTot))+sr('sub','Tarjeta',money(R.cardT))+sr('sub','Efectivo',money(R.cashT))+(R.otrosT>0?sr('sub','Otros métodos',money(R.otrosT)):'')
    +sr('top','Utilidad estimada',money(R.uTot))+sr('ind','Margen bruto',marginPct+'%')+'</tbody></table>';
  const th=a=>'<tr>'+a.map((h,i)=>'<th style="text-align:'+(i===0?'left':'right')+'">'+esc(h)+'</th>').join('')+'</tr>';
  const tr2=a=>'<tr>'+a.map((x2,i)=>'<td style="text-align:'+(i===0?'left':'right')+(i===0?'':';font-variant-numeric:tabular-nums')+'">'+x2+'</td>').join('')+'</tr>';
  const tf=a=>'<tr class="tot">'+a.map((x2,i)=>'<td style="text-align:'+(i===0?'left':'right')+'">'+x2+'</td>').join('')+'</tr>';
  let det='';
  if(R.days.length){
    det+='<div class="dttl">Detalle por día</div><table><thead>'+th(['Periodo','Tickets','Efectivo','Tarjeta','Descuentos','Total'])+'</thead><tbody>'
      +R.days.map(d=>tr2([esc(d.day),String(d.tickets),money(d.cash),money(d.card),money(d.desc),money(d.total)])).join('')
      +tf(['Total',String(R.tickets),money(R.cashT),money(R.cardT),money(R.desc),money(R.vTot)])+'</tbody></table>';
  }
  if(R.prods.length){
    det+='<div class="dttl" style="margin-top:16px">Detalle por producto (top 15)</div><table><thead>'+th(['Producto','Unidades','Ingreso','Costo','Utilidad'])+'</thead><tbody>'
      +R.prods.slice(0,15).map(p=>tr2([esc(p.name),String(Math.round(p.qty*100)/100),money(p.total),money(p.cost),money(p.util)])).join('')
      +tf(['Total',String(Math.round(R.units*100)/100),money(R.prodT),money(R.costT),money(R.uTot)])+'</tbody></table>';
    if(R.prods.length>15) det+='<p style="font-size:10px;color:#6b7280;margin-top:6px">Mostrando los 15 productos principales de '+R.prods.length+'. El detalle completo de todos los productos está en la exportación a Excel.</p>';
  }
  const css='.spesrep{background:#fff;color:#1f2937;font-family:Arial,Helvetica,sans-serif;font-size:12px;padding:28px 32px;max-width:816px;margin:0 auto}'
    +'.spesrep .hd{display:flex;align-items:center;gap:14px;border-bottom:3px solid #111827;padding-bottom:14px}.spesrep .hd img{height:44px;width:auto;border-radius:8px}'
    +'.spesrep .brand .app{font-size:18px;font-weight:800;color:#111827;letter-spacing:.2px}.spesrep .brand .slg{font-size:11px;color:#6b7280}'
    +'.spesrep .meta{margin-left:auto;text-align:right}.spesrep .meta .t{font-size:15px;font-weight:700;color:#111827}.spesrep .meta .s{font-size:11px;color:#6b7280;margin-top:2px}'
    +'.spesrep .kpis{display:flex;gap:10px;margin:18px 0}.spesrep .kpi{flex:1;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#f9fafb}'
    +'.spesrep .kpi .kv{font-size:18px;font-weight:800;color:#111827}.spesrep .kpi .kl{font-size:10px;color:#6b7280;margin-top:2px;text-transform:uppercase;letter-spacing:.5px}'
    +'.spesrep table{width:100%;border-collapse:collapse;margin-top:6px}.spesrep th{background:#111827;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:8px 10px;font-weight:600}'
    +'.spesrep td{padding:7px 10px;border-bottom:1px solid #eef2f5}.spesrep tr:nth-child(even) td{background:#f9fafb}'
    +'.spesrep tr.tot td{border-top:2px solid #111827;border-bottom:none;font-weight:800;color:#111827;background:#f3f4f6}'
    +'.spesrep .sum{width:100%;border-collapse:collapse;margin:6px 0 20px;border:1px solid #e5e7eb}.spesrep .sum td{padding:7px 12px;border-bottom:1px solid #eef2f5;font-size:12px}'
    +'.spesrep .sum td.v{text-align:right;font-variant-numeric:tabular-nums}.spesrep .sum tr.cap td{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;background:#f3f4f6;font-weight:700}'
    +'.spesrep .sum tr.sec td{font-weight:700;color:#111827}.spesrep .sum tr.top td{border-top:2px solid #111827;font-weight:800;color:#111827;background:#f3f4f6}.spesrep .sum td.ind{padding-left:26px;color:#6b7280}'
    +'.spesrep .dttl{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;font-weight:700;margin-bottom:4px}'
    +'.spesrep .ft{margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px;display:flex;align-items:center;justify-content:space-between;font-size:10px;color:#6b7280}.spesrep .ft b{color:#111827}';
  return '<div class="spesrep"><style>'+css+'<\/style>'
    +'<div class="hd"><img src="'+location.origin+'/assets/spes-logo.jpeg" alt="SPES"/>'
    +'<div class="brand"><div class="app">SPES Systems<\/div><div class="slg">Control inteligente para tu empresa.<\/div><\/div>'
    +'<div class="meta"><div class="t">Informe de ventas'+(biz?(' · '+esc(biz)):'')+'<\/div><div class="s">'+esc(sub)+'<\/div><\/div><\/div>'
    +'<div class="kpis">'+kpiCards+'<\/div>'+summary+det
    +'<div class="ft"><span>Generado desde el Portal del cliente · '+esc(new Date().toLocaleString('es-MX'))+'<\/span><span>Reporte creado con <b>SPES Systems<\/b> · Control inteligente para tu empresa.<\/span><\/div><\/div>';
}
// Exportar PDF: DESCARGA el archivo directamente (sin abrir ventanas).
async function repPdfFile(){
  const R=ST._rep; if(!R){ notify('Abre Reportes y elige un periodo primero.','error'); return; }
  try{ await loadH2P(); }catch(e){ notify(e.message,'error'); return; }
  const holder=document.createElement('div');
  holder.style.cssText='position:fixed;left:-10000px;top:0;width:816px;background:#fff;z-index:-1;';
  holder.innerHTML=repBody(R);
  document.body.appendChild(holder);
  try{
    await html2pdf().set({margin:0,filename:'SPES-Reporte-'+R.fileTag+'.pdf',image:{type:'jpeg',quality:.95},html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff'},jsPDF:{unit:'pt',format:'letter',orientation:'portrait'},pagebreak:{mode:['css','legacy']}}).from(holder.firstChild).save();
  }catch(e){ notify('No se pudo generar el PDF: '+(e&&e.message||e),'error'); }
  holder.remove();
}
// Imprimir reporte: en ESTA misma pagina (iframe oculto), sin ventanas nuevas.
function repPrint(){
  const R=ST._rep; if(!R){ notify('Abre Reportes y elige un periodo primero.','error'); return; }
  const old=document.getElementById('repPrintFrame'); if(old) old.remove();
  const f=document.createElement('iframe');
  f.id='repPrintFrame';
  f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(f);
  const d=f.contentDocument;
  d.open();
  d.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe de ventas<\/title><style>@page{size:Letter;margin:0}body{margin:0}<\/style><\/head><body>'+repBody(R)+'<\/body><\/html>');
  d.close();
  setTimeout(()=>{ try{ f.contentWindow.focus(); f.contentWindow.print(); }catch(_){ notify('No se pudo abrir la impresión.','error'); } },450);
}
