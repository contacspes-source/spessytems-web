/* ============================================================================
 * SPES · Demo interactiva del POS (spessystems.com/pos) — nov-2026
 *
 * Recreación JUGABLE de la pantalla de Ventas de SPES POS (v0.7.x), armada a
 * partir del código real de la app (SalesModule, PaymentModal, WeighModal,
 * NumericKeypad): mismas zonas, textos, teclado inteligente, mayoreo
 * automático, cobro mixto y cambio. Todo vive en memoria: no hay red, no se
 * guarda nada. Temas Blanco / Gris / Oscuro con la paleta de la app.
 *
 * Uso: <div id="posDemo"></div> + <script src="/pos-demo.js" defer></script>
 * ========================================================================== */
(function () {
  'use strict'

  /* ------------------------------- catálogo -------------------------------- */
  // Artículos de ejemplo (genéricos). w = se vende a peso (kg).
  // tiers = mayoreo por escalas: desde X unidades/kg, precio Y.
  var PRODUCTS = [
    { id: 'p1', sku: 'P000001', code: '2000000000011', name: 'Jitomate saladet', price: 25, w: 1, stock: 38.5, tiers: [{ min: 3, price: 23.25 }] },
    { id: 'p2', sku: 'P000002', code: '2000000000028', name: 'Plátano tabasco', price: 18, w: 1, stock: 52 },
    { id: 'p3', sku: 'P000003', code: '2000000000035', name: 'Aguacate hass', price: 65, w: 1, stock: 14.2 },
    { id: 'p4', sku: 'P000004', code: '2000000000042', name: 'Cebolla blanca', price: 22, w: 1, stock: 21 },
    { id: 'p5', sku: 'P000005', code: '2000000000059', name: 'Manzana roja', price: 45, w: 1, stock: 17.8 },
    { id: 'p6', sku: 'P000006', code: '2000000000066', name: 'Limón sin semilla', price: 32, w: 1, stock: 9.4 },
    { id: 'p7', sku: 'P000007', code: '7500000000017', name: 'Refresco de cola 600 ml', price: 20, stock: 96, tiers: [{ min: 12, price: 18 }] },
    { id: 'p8', sku: 'P000008', code: '7500000000024', name: 'Refresco de cola 2.5 L', price: 45, stock: 30 },
    { id: 'p9', sku: 'P000009', code: '7500000000031', name: 'Agua natural 1 L', price: 13, stock: 64, tiers: [{ min: 6, price: 11.5 }] },
    { id: 'p10', sku: 'P000010', code: '7500000000048', name: 'Papas fritas sal 45 g', price: 21, stock: 40 },
    { id: 'p11', sku: 'P000011', code: '7500000000055', name: 'Pan de caja blanco', price: 52, stock: 11 },
    { id: 'p12', sku: 'P000012', code: '7500000000062', name: 'Leche entera 1 L', price: 29, stock: 3, min: 6 },
    { id: 'p13', sku: 'P000013', code: '7500000000079', name: 'Huevo blanco 18 pzas', price: 62, stock: 18 },
    { id: 'p14', sku: 'P000014', code: '7500000000086', name: 'Frijol negro 1 kg', price: 38, stock: 25 },
    { id: 'p15', sku: 'P000015', code: '7500000000093', name: 'Arroz súper extra 1 kg', price: 32, stock: 27 },
    { id: 'p16', sku: 'P000016', code: '7500000000109', name: 'Galletas marías 170 g', price: 18, stock: 33 },
    { id: 'p17', sku: 'P000017', code: '7500000000116', name: 'Aceite vegetal 1 L', price: 48, stock: 16 },
    { id: 'p18', sku: 'P000018', code: '7500000000123', name: 'Café soluble 100 g', price: 79, stock: 8 }
  ]
  var SHORTCUTS = ['p1', 'p2', 'p7', 'p13', 'p11']
  var CUSTOMERS = [
    { id: 'c1', name: 'María López', phone: '33 1234 5678', points: 240 },
    { id: 'c2', name: 'Don Ramón (fiado)', phone: '33 8765 4321', points: 85 },
    { id: 'c3', name: 'Cocina Lupita', phone: '33 5555 0101', points: 1320 }
  ]
  var DISCOUNTS = [
    { id: 'd1', name: 'Tercera edad', kind: 'percent', value: 10, label: '10% en toda la venta' },
    { id: 'd2', name: 'Cliente frecuente', kind: 'percent', value: 5, label: '5% en toda la venta' },
    { id: 'd3', name: 'Promo $20', kind: 'amount', value: 20, label: '$20 de descuento' }
  ]
  var PAY_LABEL = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' }

  /* -------------------------------- estilos -------------------------------- */
  var CSS = [
    '.pd{--bg:#f5f5f5;--card:#fff;--input:#fff;--g50:#f9fafb;--g100:#f3f4f6;--g200:#e5e7eb;--g300:#d1d5db;--g400:#9ca3af;--g500:#6b7280;--g600:#4b5563;--g700:#374151;--pri:#424242;--acc:#424242;--ok:#1e9e5a;--warn:#b48214;--bad:#dc2626;--okbg:#ecfdf3;--warnbg:#fffbeb;--badbg:#fef2f2;',
    ' position:relative;font-family:Inter,system-ui,sans-serif;color:var(--pri);background:var(--bg);font-size:14px;line-height:1.35;text-align:left;-webkit-user-select:none;user-select:none}',
    '.pd[data-t=gray]{--bg:#e7eaee;--card:#f6f8fa;--input:#fff;--g50:#edeff2;--g100:#e2e6eb;--g200:#d6dae0;--g300:#c2c8d0;--g400:#6f7680;--g500:#5e646e;--g600:#474d56;--g700:#343a42;--pri:#2a3038;--acc:#3b4654}',
    '.pd[data-t=dark]{--bg:#121212;--card:#1f1f1f;--input:#2a2a2a;--g50:#242424;--g100:#2a2a2a;--g200:#383838;--g300:#4b4b4b;--g400:#949494;--g500:#a8a8a8;--g600:#bebebe;--g700:#d4d4d4;--pri:#ededed;--acc:#606060;--ok:#2fbf6b;--warn:#d9a12d;--bad:#f26b6b;--okbg:rgba(47,191,107,.12);--warnbg:rgba(217,161,45,.12);--badbg:rgba(242,107,107,.12)}',
    '.pd *{box-sizing:border-box}',
    '.pd button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.pd button:disabled{opacity:.4;cursor:not-allowed}',
    '.pd input{font:inherit;color:var(--pri);background:var(--input);-webkit-user-select:text;user-select:text}',
    '.pd .mono{font-family:"JetBrains Mono",ui-monospace,monospace}',
    '.pd-top{display:flex;align-items:center;justify-content:space-between;gap:10px;height:52px;padding:0 18px;background:var(--card);border-bottom:1px solid var(--g200)}',
    '.pd-top .l{display:flex;align-items:center;gap:10px;min-width:0}',
    '.pd-top img{width:26px;height:26px;border-radius:6px}',
    '.pd-top .app{font-weight:700;letter-spacing:-.01em}',
    '.pd-top .r{display:flex;align-items:center;gap:12px;font-size:13px;color:var(--g500)}',
    '.pd-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--ok);margin-right:6px}',
    '.pd-pill{border:1px solid var(--g300);border-radius:999px;padding:3px 10px;font-weight:600;color:var(--pri);font-size:12px}',
    '.pd-main{display:flex;gap:14px;padding:16px;height:640px}',
    '.pd-left{display:flex;flex-direction:column;gap:10px;width:60%;min-width:0}',
    '.pd-right{display:flex;flex-direction:column;width:40%;flex-shrink:0;background:var(--card);border:1px solid var(--g200);border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.05);min-height:0}',
    '.pd-row{display:flex;gap:8px}',
    '.pd-search{flex:1;height:46px;border:1px solid var(--g300);border-radius:7px;padding:0 16px;font-size:15px;outline:none;min-width:0}',
    '.pd-search:focus{border-color:var(--pri)}',
    '.pd-btn{height:46px;flex-shrink:0;border:1px solid var(--g300)!important;border-radius:7px;background:var(--card)!important;padding:0 14px;font-size:13px;font-weight:600;color:var(--g600)!important;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:border-color .15s,color .15s}',
    '.pd-btn:hover{border-color:var(--g400)!important;color:var(--pri)!important}',
    '.pd-sc{display:flex;align-items:center;gap:8px}',
    '.pd-sc .ed{flex-shrink:0;border:1px solid var(--g200);border-radius:7px;padding:5px 11px;font-size:13px;font-weight:500;color:var(--g500)}',
    '.pd-sc .list{display:flex;gap:8px;overflow-x:auto;flex:1;padding-bottom:2px}',
    '.pd-sc .chip{display:flex;flex-direction:column;flex-shrink:0;border:1px solid var(--g200);background:var(--card);border-radius:7px;padding:6px 11px;text-align:left;box-shadow:0 1px 2px rgba(0,0,0,.04)}',
    '.pd-sc .chip:hover{border-color:var(--g300);background:var(--g50)}',
    '.pd-sc .chip b{max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;font-weight:500}',
    '.pd-sc .chip span{font-size:12px;color:var(--g400)}',
    '.pd-res{flex:1;min-height:0;overflow:auto}',
    '.pd-empty{height:100%;display:flex;align-items:center;justify-content:center;text-align:center;border:1px dashed var(--g300);border-radius:7px;background:var(--card);padding:24px;color:var(--g400);font-size:13.5px}',
    '.pd-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}',
    '.pd-card{display:flex;flex-direction:column;text-align:left;border:1px solid var(--g200);background:var(--card);border-radius:7px;padding:13px;box-shadow:0 1px 2px rgba(0,0,0,.04)}',
    '.pd-card:hover{border-color:var(--g300);background:var(--g50)}',
    '.pd-card .n{font-size:13.5px;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.pd-card .s{font-size:11.5px;color:var(--g400);margin-top:3px}',
    '.pd-card .p{font-size:15px;font-weight:700;margin-top:7px}',
    '.pd-card .k{font-size:11.5px;color:var(--g400);margin-top:2px}',
    '.pd-kp{border:1px solid var(--g200);background:var(--card);border-radius:10px;padding:11px;box-shadow:0 1px 3px rgba(0,0,0,.05)}',
    '.pd-modes{display:flex;align-items:center;gap:6px;margin-bottom:6px}',
    '.pd-mode{border:1px solid var(--g200)!important;border-radius:7px;padding:5px 10px;font-size:13px;font-weight:500;color:var(--g500)!important}',
    '.pd-mode.on{border-color:var(--pri)!important;background:var(--g100)!important;color:var(--pri)!important}',
    '.pd-modes .val{margin-left:auto;font-family:"JetBrains Mono",monospace;font-size:19px;font-weight:700;white-space:nowrap}',
    '.pd-hint{font-size:12px;color:var(--g400);margin-bottom:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.pd-keys{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}',
    '.pd-key{height:44px;border:1px solid var(--g200)!important;border-radius:7px;font-size:19px;font-weight:600}',
    '.pd-key:hover{background:var(--g100)!important}',
    '.pd-key.m{color:var(--g500)}',
    '.pd-key.clr{grid-column:span 3;height:36px;font-size:13px;font-weight:500;color:var(--g500)}',
    '.pd-kact{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px}',
    '.pd-kact button{height:40px;border-radius:7px;font-size:13px;font-weight:600}',
    '.pd-sec{border:1px solid var(--g300)!important;color:var(--g600)}',
    '.pd-sec:hover{background:var(--g100)!important}',
    '.pd-acc{background:var(--acc)!important;color:#fff!important}',
    '.pd-acc:hover:not(:disabled){opacity:.9}',
    '.pd-pri{background:var(--pri)!important;color:var(--bg)!important}',
    '.pd[data-t=dark] .pd-pri{background:#ededed!important;color:#121212!important}',
    '.pd-ch{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--g200);padding:11px 15px}',
    '.pd-ch b{font-size:13.5px;font-weight:600}',
    '.pd-link{font-size:12px;color:var(--g400)}',
    '.pd-link:hover{color:var(--bad)}',
    '.pd-cust{display:flex;width:100%;align-items:center;justify-content:space-between;border-bottom:1px solid var(--g200)!important;padding:9px 15px!important;text-align:left}',
    '.pd-cust:hover{background:var(--g50)!important}',
    '.pd-cust span{font-size:13.5px;color:var(--g600)}',
    '.pd-cust small{font-size:12px;color:var(--g400)}',
    '.pd-disc{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--g200);padding:8px 15px;font-size:13.5px}',
    '.pd-disc button{color:var(--g500)}',
    '.pd-disc button:hover{color:var(--pri)}',
    '.pd-items{flex:1;overflow:auto;min-height:0}',
    '.pd-it{border-bottom:1px solid var(--g100);padding:11px 15px;cursor:pointer;transition:background .12s}',
    '.pd-it:hover{background:var(--g50)}',
    '.pd-it.on{background:var(--g50);box-shadow:inset 0 0 0 1px var(--g300)}',
    '.pd-it .t{display:flex;justify-content:space-between;gap:8px}',
    '.pd-it .nm{font-size:13.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.pd-it .sk{font-family:"JetBrains Mono",monospace;font-size:11.5px;color:var(--g400)}',
    '.pd-it .x{font-size:18px;line-height:1;color:var(--g300)}',
    '.pd-it .x:hover{color:var(--bad)}',
    '.pd-it .b{display:flex;align-items:center;justify-content:space-between;margin-top:7px}',
    '.pd-it .lt{font-size:13.5px;font-weight:600}',
    '.pd-step{display:flex;align-items:center;gap:7px}',
    '.pd-step button{width:30px;height:30px;border:1px solid var(--g300)!important;border-radius:5px;color:var(--g600)}',
    '.pd-step button:hover{background:var(--g100)!important}',
    '.pd-step span{width:30px;text-align:center;font-size:13.5px;font-weight:500}',
    '.pd-tier{margin-top:6px;font-size:12px}',
    '.pd-tier s{color:var(--g400)}',
    '.pd-tier em{font-style:normal;font-weight:500;margin-left:8px}',
    '.pd-tier p{display:inline-block;margin:4px 0 0;border-radius:3px;background:var(--g100);padding:2px 8px;font-weight:500;color:var(--g600)}',
    '.pd-tag{margin-left:7px;border-radius:3px;background:var(--g100);padding:1px 6px;font-size:11.5px;font-weight:500;color:var(--g500);vertical-align:middle}',
    '.pd-tot{border-top:1px solid var(--g200);padding:11px 15px}',
    '.pd-tot .ln{display:flex;justify-content:space-between;font-size:13.5px;color:var(--g500);margin-top:3px}',
    '.pd-tot .big{display:flex;align-items:baseline;justify-content:space-between;margin-top:6px}',
    '.pd-tot .big b{font-size:15px;font-weight:600}',
    '.pd-tot .big strong{font-size:25px;font-weight:700;font-variant-numeric:tabular-nums}',
    '.pd-tot .pts{text-align:right;font-size:12px;color:var(--g400);margin-top:2px}',
    '.pd-cobrar{width:100%;height:50px;margin-top:10px;border-radius:7px;font-size:15px;font-weight:700}',
    '.pd-nav{display:flex;height:62px;border-top:1px solid var(--g200);background:var(--card)}',
    '.pd-nav button{position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:var(--g400);font-size:11.5px;font-weight:500}',
    '.pd-nav button:hover{color:var(--g600)}',
    '.pd-nav button.on{color:var(--pri)}',
    '.pd-nav button.on:before{content:"";position:absolute;top:0;left:22%;right:22%;height:3px;border-radius:3px;background:var(--pri)}',
    '.pd-ico{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
    '.pd-ov{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.45)}',
    '.pd-ov.anim{animation:pdIn .15s ease}.pd-ov.anim .pd-mod{animation:pdUp .18s ease}',
    '@keyframes pdIn{from{opacity:0}to{opacity:1}}',
    '.pd-mod{width:100%;max-height:100%;overflow:auto;background:var(--card);border-radius:12px;box-shadow:0 20px 50px -12px rgba(0,0,0,.45);padding:20px}',
    '@keyframes pdUp{from{transform:translateY(10px);opacity:.6}to{transform:none;opacity:1}}',
    '.pd-mh{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}',
    '.pd-mh h3{margin:0;font-size:17px;font-weight:700}',
    '.pd-mh button{font-size:20px;color:var(--g400);line-height:1}',
    '.pd-f{display:flex;flex-direction:column;gap:5px;font-size:13px;color:var(--g700);margin-bottom:11px}',
    '.pd-f input{height:44px;border:1px solid var(--g300);border-radius:5px;padding:0 13px;outline:none}',
    '.pd-f input:focus{border-color:var(--pri)}',
    '.pd-err{border-radius:5px;background:var(--badbg);color:var(--bad);padding:8px 11px;font-size:13px;margin-top:6px}',
    '.pd-warn{border-radius:5px;border:1px solid var(--warn);background:var(--warnbg);color:var(--warn);padding:8px 11px;font-size:13px;margin-top:12px}',
    '.pd-mbtns{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}',
    '.pd-mbtns button{height:40px;padding:0 16px;border-radius:7px;font-size:13.5px;font-weight:600}',
    '.pd-pay{display:grid;grid-template-columns:1.1fr 1fr;gap:18px}',
    '.pd-box{border:1px solid var(--g200);background:var(--g50);border-radius:12px;padding:15px;text-align:center}',
    '.pd-box .cap{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--g400)}',
    '.pd-box .tt{font-size:34px;font-weight:700;font-variant-numeric:tabular-nums}',
    '.pd-box .fc{display:flex;justify-content:center;gap:14px;margin-top:6px;font-size:13.5px;color:var(--g500)}',
    '.pd-tend{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:11px}',
    '.pd-tend button{height:46px;border:1px solid var(--g200)!important;border-radius:9px;font-size:13.5px;font-weight:600;color:var(--g500)}',
    '.pd-tend button.on{border-color:var(--pri)!important;background:var(--g100)!important;color:var(--pri)}',
    '.pd-added{margin-top:10px;border:1px solid var(--g200);border-radius:9px}',
    '.pd-added div{display:flex;justify-content:space-between;padding:7px 11px;font-size:13.5px;border-bottom:1px solid var(--g100)}',
    '.pd-added div:last-child{border:0}',
    '.pd-added button{color:var(--g300);margin-left:8px}',
    '.pd-entry{height:58px;display:flex;align-items:center;justify-content:flex-end;border:1px solid var(--g300);border-radius:12px;background:var(--input);padding:0 15px;font-size:29px;font-weight:700}',
    '.pd-quick{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:10px 0}',
    '.pd-quick button{height:34px;border:1px solid var(--g300)!important;border-radius:7px;font-size:12.5px;font-weight:600;color:var(--g600)}',
    '.pd-quick button:hover{background:var(--g100)!important}',
    '.pd-pk{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}',
    '.pd-pk button{height:50px;border:1px solid var(--g200)!important;border-radius:9px;font-size:19px;font-weight:500;color:var(--g700)}',
    '.pd-pk button:hover{background:var(--g50)!important}',
    '.pd-go{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}',
    '.pd-go button,.pd-wide{height:50px;border-radius:7px;font-size:14px;font-weight:700}',
    '.pd-wide{width:100%;margin-top:16px}',
    '.pd-foot{text-align:center;font-size:12px;color:var(--g400);margin-top:7px}',
    '.pd-done{display:grid;grid-template-columns:1.1fr 1fr;gap:18px}',
    '.pd-ok{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:1px solid var(--g200);background:var(--g50);border-radius:12px;padding:22px;text-align:center}',
    '.pd-ok .ck{width:54px;height:54px;border-radius:50%;background:var(--ok);color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px}',
    '.pd-ok .ch{font-size:46px;font-weight:800;font-variant-numeric:tabular-nums}',
    '.pd-dl{display:flex;flex-direction:column;gap:7px;font-size:13.5px}',
    '.pd-dl div{display:flex;justify-content:space-between}',
    '.pd-dl dt{color:var(--g500)}',
    '.pd-ticket{font-family:"JetBrains Mono",monospace;font-size:11.5px;line-height:1.5;background:#fff;color:#111;border:1px dashed #bbb;border-radius:6px;padding:12px;margin-top:10px;max-height:210px;overflow:auto}',
    '.pd-ticket .c{text-align:center}',
    '.pd-ticket .r{display:flex;justify-content:space-between;gap:8px}',
    '.pd-wscale{border:1px solid var(--g200);background:var(--g50);border-radius:9px;padding:15px;text-align:center}',
    '.pd-wscale .kg{font-family:"JetBrains Mono",monospace;font-size:44px;font-weight:700}',
    '.pd-wscale .kg small{font-size:22px;color:var(--g500);margin-left:6px}',
    '.pd-wscale .im{font-size:21px;font-weight:600;margin-top:4px}',
    '.pd-wq{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:11px 0}',
    '.pd-wq button{height:36px;border:1px solid var(--g300)!important;border-radius:7px;font-size:13px;font-weight:600;color:var(--g600)}',
    '.pd-wq button:hover{background:var(--g100)!important}',
    '.pd-list button{display:flex;width:100%;justify-content:space-between;align-items:center;border:1px solid var(--g200)!important;border-radius:9px;padding:11px 13px!important;margin-bottom:8px;text-align:left}',
    '.pd-list button:hover{border-color:var(--pri)!important;background:var(--g50)!important}',
    '.pd-list small{display:block;color:var(--g400);font-size:12px}',
    '.pd-pc{border:1px solid var(--g200);border-radius:9px;padding:14px;margin-top:10px}',
    '.pd-pc .pp{font-size:30px;font-weight:800}',
    '.pd-toast{position:absolute;left:50%;bottom:76px;transform:translateX(-50%);z-index:40;background:var(--pri);color:var(--bg);font-size:13px;font-weight:600;border-radius:999px;padding:9px 16px;box-shadow:0 10px 24px -8px rgba(0,0,0,.4);white-space:nowrap;animation:pdUp .2s ease;max-width:92%;overflow:hidden;text-overflow:ellipsis}',
    '.pd[data-t=dark] .pd-toast{background:#ededed;color:#121212}',
    '.pd-clock{position:absolute;left:12px;bottom:74px;z-index:5;width:38px;height:38px;border-radius:50%;border:1px solid var(--g200)!important;background:var(--card)!important;color:var(--g400);display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.08)}',
    '@media (max-width:880px){',
    ' .pd-main{flex-direction:column;height:auto}',
    ' .pd-left,.pd-right{width:100%}',
    ' .pd-res{min-height:120px;max-height:330px}',
    ' .pd-right{min-height:420px}',
    ' .pd-grid{grid-template-columns:repeat(2,1fr)}',
    ' .pd-top .r .hide-sm,.pd-row .hide-sm{display:none}',
    ' .pd-pay,.pd-done{grid-template-columns:1fr}',
    ' .pd-clock{display:none}',
    ' .pd-modes{flex-wrap:wrap}',
    ' .pd-modes .val{flex-basis:100%;text-align:right;margin-top:2px}',
    '}',
    '@media (max-width:520px){',
    ' .pd-row{flex-wrap:wrap}',
    ' .pd-search{flex-basis:100%}',
    ' .pd-btn{flex:1}',
    ' .pd-top .ctx{display:none}',
    ' .pd-nav button span{font-size:10.5px}',
    '}'
  ].join('\n')

  /* ------------------------------- utilidades ------------------------------ */
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100 }
  function money(n) {
    var v = r2(n)
    return '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  function fq(n) { var v = Math.round(n * 1000) / 1000; return String(v % 1 === 0 ? v : v.toFixed(3).replace(/0+$/, '')) }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') }
  function byId(id) { return PRODUCTS.filter(function (p) { return p.id === id })[0] }
  var ICONS = {
    cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  }
  function ico(n) { return '<svg viewBox="0 0 24 24" class="pd-ico">' + ICONS[n] + '</svg>' }

  /* --------------------------------- estado -------------------------------- */
  function freshState() {
    return {
      term: '', items: [], active: null, mode: 'free', digits: '',
      customer: null, discount: null, folio: S0 ? S0.folio : 1048, modal: null, sales: S0 ? S0.sales : 0
    }
  }
  var S0 = null
  var S = freshState()

  /** Precio unitario aplicado: mayoreo por escalas (si llega al mínimo). */
  function tierFor(p, q) {
    var t = null
    ;(p.tiers || []).forEach(function (x) { if (q >= x.min && (!t || x.min > t.min)) t = x })
    return t
  }
  function unitPrice(it) {
    if (it.free) return it.price
    var t = tierFor(it.p, it.q)
    return t ? t.price : it.p.price
  }
  function lineTotal(it) { return r2(unitPrice(it) * it.q) }
  function totals() {
    var sub = 0, auto = 0, n = 0
    S.items.forEach(function (it) {
      var base = it.free ? it.price : it.p.price
      sub += base * it.q
      auto += (base - unitPrice(it)) * it.q
      n += it.p && it.p.w ? 1 : it.q
    })
    sub = r2(sub); auto = r2(auto)
    var after = r2(sub - auto), gen = 0
    if (S.discount) gen = S.discount.kind === 'percent' ? r2(after * S.discount.value / 100) : Math.min(after, S.discount.value)
    return { sub: sub, auto: auto, gen: r2(gen), total: r2(after - gen), count: Math.round(n * 1000) / 1000 }
  }
  function activeItem() { return S.items.filter(function (x) { return x.key === S.active })[0] || null }

  /* ------------------------------- montaje --------------------------------- */
  var root, toastT
  function mount(el) {
    root = el
    if (!document.getElementById('pd-css')) {
      var st = document.createElement('style'); st.id = 'pd-css'; st.textContent = CSS
      document.head.appendChild(st)
    }
    root.classList.add('pd')
    root.setAttribute('tabindex', '-1')
    root.setAttribute('data-t', root.getAttribute('data-t') || 'white')
    root.addEventListener('keydown', onKey)
    render()
  }
  function setTheme(t) { if (root) root.setAttribute('data-t', t) }

  function toast(msg) {
    var old = root.querySelector('.pd-toast'); if (old) old.remove()
    var d = document.createElement('div'); d.className = 'pd-toast'; d.textContent = msg
    root.appendChild(d)
    clearTimeout(toastT); toastT = setTimeout(function () { d.remove() }, 2600)
  }

  /* -------------------------------- render --------------------------------- */
  var lastModal = null
  function render() {
    var ci = root.querySelector('.pd-items'), cartTop = ci ? ci.scrollTop : 0
    var keepFocus = document.activeElement && document.activeElement.id === 'pd-q'
    var caret = keepFocus ? document.activeElement.selectionStart : null
    var t = totals()
    root.innerHTML = header() + '<div class="pd-main">' + left() + right(t) + '</div>' + nav()
      + '<button class="pd-clock" data-a="clock" title="Asistencia (entrada/salida)">' + ico('clock') + '</button>'
      + (S.modal ? modal(t) : '')
    var ov = root.querySelector('.pd-ov')
    if (ov && S.modal !== lastModal) ov.classList.add('anim') // anima solo al abrir, no en cada tecla
    lastModal = S.modal
    var ci2 = root.querySelector('.pd-items'); if (ci2) ci2.scrollTop = cartTop
    bind()
    if (keepFocus) { var q = root.querySelector('#pd-q'); if (q) { q.focus(); try { q.setSelectionRange(caret, caret) } catch (_) {} } }
  }

  function header() {
    return '<div class="pd-top"><div class="l">'
      + '<img src="/assets/spes-logo.jpeg" alt="SPES" onerror="this.style.display=\'none\'">'
      + '<span class="app">SPES Systems</span><span class="ctx" style="font-size:13px;color:var(--g400)">Sucursal Principal</span>'
      + '<span class="ctx" style="color:var(--g300)">·</span><span class="ctx" style="font-size:13px;font-weight:500;color:var(--g600)">Ventas</span></div>'
      + '<div class="r"><span class="hide-sm"><span class="pd-dot"></span>Conectado</span>'
      + '<span><span class="pd-dot"></span>Demo <span class="hide-sm" style="color:var(--g400)">(Administrador)</span></span>'
      + '<span class="pd-pill hide-sm">Cambiar usuario</span></div></div>'
  }

  function left() {
    var h = '<div class="pd-left">'
    h += '<div class="pd-row"><input id="pd-q" class="pd-search" autocomplete="off" placeholder="Escanea un codigo o busca por nombre, SKU, marca..." value="' + esc(S.term) + '">'
      + '<button class="pd-btn hide-sm" data-a="tabs" title="Cuentas abiertas">' + ico('cart') + '</button>'
      + '<button class="pd-btn" data-a="price">Consultar precio</button>'
      + '<button class="pd-btn" data-a="free">Venta Libre <span class="hide-sm">(Ctrl+P)</span></button></div>'
    return h + '<div id="pd-lb" style="display:flex;flex-direction:column;gap:10px;flex:1;min-height:0">' + leftBody() + '</div></div>'
  }
  /** Lo que cambia al teclear en el buscador (el input NO se re-crea: en el
   *  celular así no se cierra el teclado). */
  function leftBody() {
    var term = S.term.trim(), h = ''
    h += '<div class="pd-sc"><span class="ed">Editar</span><div class="list">'
      + SHORTCUTS.map(function (id) { var p = byId(id); return '<button class="chip" data-add="' + p.id + '"><b>' + esc(p.name) + '</b><span>' + money(p.price) + '</span></button>' }).join('')
      + '</div></div>'
    h += '<div class="pd-res">'
    if (!term) {
      h += '<div class="pd-empty">Escanea, busca o usa tus accesos rapidos para agregar al carrito.</div>'
    } else {
      var res = search(term)
      h += res.length
        ? '<div class="pd-grid">' + res.map(function (p) {
          return '<button class="pd-card" data-add="' + p.id + '"><span class="n">' + esc(p.name) + '</span><span class="s mono">' + p.sku + '</span><span class="p">' + money(p.price) + '</span>' + (p.w ? '<span class="k">por kg / a peso</span>' : '') + '</button>'
        }).join('') + '</div>'
        : '<div class="pd-empty">Sin resultados.</div>'
    }
    h += '</div>'
    if (!term) h += keypad()
    return h
  }

  function search(term) {
    var q = norm(term)
    return PRODUCTS.filter(function (p) { return norm(p.name).indexOf(q) >= 0 || p.sku.toLowerCase().indexOf(q) >= 0 || p.code.indexOf(q) === 0 }).slice(0, 12)
  }

  function keypad() {
    var a = activeItem(), m = S.mode, w = a && a.p && a.p.w
    var modes = [['free', 'Importe libre', true], ['qty', 'Cantidad', !!a && !a.free], ['weight', 'Peso', !!w], ['amount', 'Importe', !!w]]
    var val = ''
    if (m === 'free') val = money(freeAmount())
    else if (a) val = (m === 'amount' && S.digits ? '$' + S.digits + ' → ' + fq(a.q) + ' kg' : fq(a.q) + (w ? ' kg' : ''))
    var hint = m === 'free'
      ? (a ? 'Teclea un importe y "Agregar", o un número y "× Cantidad" para ' + a.name : 'Teclea un importe y "Agregar" para cobrarlo como venta libre')
      : !a ? 'Agrega o toca un artículo del carrito para capturarlo'
        : m === 'weight' ? 'Peso de ' + a.name + ' · decimales automáticos: 500 = 0.500 kg, 1250 = 1.250 kg'
          : m === 'amount' ? 'Importe de ' + a.name + ' · ej. "$80" calcula los kg solos (' + money(a.p.price) + '/kg)'
            : 'Cantidad de ' + a.name + ' (piezas)'
    var k = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
    return '<div class="pd-kp"><div class="pd-modes">'
      + modes.map(function (x) { return '<button class="pd-mode' + (m === x[0] ? ' on' : '') + '" data-mode="' + x[0] + '"' + (x[2] ? '' : ' disabled') + '>' + x[1] + '</button>' }).join('')
      + '<span class="val">' + esc(val) + '</span></div>'
      + '<div class="pd-hint">' + esc(hint) + '</div>'
      + '<div class="pd-keys">' + k.map(function (d) { return '<button class="pd-key" data-k="' + d + '">' + d + '</button>' }).join('')
      + '<button class="pd-key m" data-k="00">00</button><button class="pd-key" data-k="0">0</button><button class="pd-key m" data-k="back">⌫</button>'
      + '<button class="pd-key clr" data-k="clear">Limpiar</button></div>'
      + '<div class="pd-kact"><button class="pd-sec" data-a="times"' + (a && !a.free ? '' : ' disabled') + '>× Cantidad</button>'
      + '<button class="pd-acc" data-a="addfree"' + (m === 'free' && freeAmount() > 0 ? '' : ' disabled') + '>Agregar ' + (freeAmount() > 0 ? money(freeAmount()) : '') + '</button></div></div>'
  }
  function freeAmount() { return S.mode === 'free' ? (Number(S.digits || 0) / 100) : 0 }

  function right(t) {
    var h = '<div class="pd-right"><div class="pd-ch"><b>Carrito (' + fq(t.count) + ')</b>' + (S.items.length ? '<button class="pd-link" data-a="clear">Vaciar</button>' : '') + '</div>'
    h += '<button class="pd-cust" data-a="cust"><span>' + (S.customer ? esc(S.customer.name) : 'Cliente: público en general') + '</span><small>' + (S.customer ? S.customer.points + ' pts · cambiar' : 'asignar') + '</small></button>'
    h += '<div class="pd-disc">' + (S.discount
      ? '<span style="color:var(--g600)">Descuento: <b>' + esc(S.discount.name) + '</b></span><button class="pd-link" data-a="nodisc">quitar</button>'
      : '<button data-a="disc">+ Aplicar descuento</button>') + '</div>'
    h += '<div class="pd-items">'
    if (!S.items.length) h += '<p style="padding:38px 14px;text-align:center;font-size:13.5px;color:var(--g400)">El carrito esta vacio.</p>'
    S.items.forEach(function (it) {
      var up = unitPrice(it), tier = it.free ? null : tierFor(it.p, it.q), w = it.p && it.p.w
      h += '<div class="pd-it' + (it.key === S.active ? ' on' : '') + '" data-sel="' + it.key + '"><div class="t"><div style="min-width:0"><div class="nm">' + esc(it.name)
        + (it.free ? '<span class="pd-tag">Venta libre</span>' : '') + '</div><div class="sk">' + (it.free ? 'LIBRE' : it.p.sku) + ' · ' + money(up) + (w ? ' /kg' : '') + '</div></div>'
        + '<button class="x" data-del="' + it.key + '" aria-label="Quitar">×</button></div>'
        + '<div class="b">' + (w ? '<span class="mono" style="font-size:13.5px;color:var(--g600)">' + fq(it.q) + ' kg</span>'
          : '<div class="pd-step"><button data-dec="' + it.key + '">−</button><span>' + fq(it.q) + '</span><button data-inc="' + it.key + '">+</button></div>')
        + '<span class="lt">' + money(lineTotal(it)) + '</span></div>'
      if (tier) h += '<div class="pd-tier"><s>Normal: ' + money(it.p.price) + (w ? '/kg' : '') + '</s><em>Aplicado: ' + money(tier.price) + (w ? '/kg' : '') + '</em><br><p>✓ Mayoreo aplicado · Ahorro: ' + money((it.p.price - tier.price) * it.q) + '</p></div>'
      else if (!it.free && it.p.tiers) h += '<div class="pd-tier" style="color:var(--g400)">Mayoreo desde ' + it.p.tiers[0].min + (w ? ' kg' : ' pzas') + ': ' + money(it.p.tiers[0].price) + '</div>'
      h += '</div>'
    })
    h += '</div><div class="pd-tot"><div class="ln"><span>Subtotal</span><span>' + money(t.sub) + '</span></div>'
    if (t.auto > 0) h += '<div class="ln"><span>Descuento automático</span><span>- ' + money(t.auto) + '</span></div>'
    if (t.gen > 0) h += '<div class="ln"><span>' + esc(S.discount.name) + '</span><span>- ' + money(t.gen) + '</span></div>'
    h += '<div class="big"><b>Total</b><strong>' + money(t.total) + '</strong></div>'
    if (S.customer && pts(t.total) > 0) h += '<div class="pts">' + esc(S.customer.name) + ' acumulará ' + pts(t.total) + ' puntos</div>'
    h += '<button class="pd-cobrar pd-pri" data-a="pay"' + (S.items.length ? '' : ' disabled') + '>Cobrar (F12)</button></div></div>'
    return h
  }
  function pts(total) { return Math.floor(total / 10) }

  function nav() {
    var it = [['sales', 'cart', 'Ventas'], ['inv', 'box', 'Inventario'], ['art', 'tag', 'Artículos'], ['rep', 'chart', 'Reportes'], ['cash', 'cash', 'Salida $'], ['more', 'more', 'Menu']]
    return '<div class="pd-nav">' + it.map(function (x) { return '<button class="' + (x[0] === 'sales' ? 'on' : '') + '" data-nav="' + x[0] + '">' + ico(x[1]) + '<span>' + x[2] + '</span></button>' }).join('') + '</div>'
  }

  /* -------------------------------- modales -------------------------------- */
  function shell(title, body, max) {
    return '<div class="pd-ov" data-ov="1"><div class="pd-mod" style="max-width:' + (max || 460) + 'px"><div class="pd-mh"><h3>' + esc(title) + '</h3><button data-a="close" aria-label="Cerrar">×</button></div>' + body + '</div></div>'
  }
  function modal(t) {
    var M = S.modal
    if (M.type === 'pay') return payModal(t)
    if (M.type === 'done') return doneModal()
    if (M.type === 'weigh') {
      var p = byId(M.pid), kg = Number(M.digits || 0) / 1000
      return shell(p.name, '<p style="margin:-6px 0 12px;font-size:13.5px;color:var(--g500)">' + money(p.price) + ' por kg</p>'
        + '<div class="pd-wscale"><div class="kg">' + kg.toFixed(3) + '<small>kg</small></div><div class="im">' + money(kg * unitFor(p, kg)) + '</div>'
        + '<div style="font-size:12px;color:var(--g500);margin-top:4px">Báscula simulada · toca un peso o teclea</div></div>'
        + '<div class="pd-wq">' + [250, 500, 1000, 1500, 2000, 3000, 4250, 5000].map(function (g) { return '<button data-wq="' + g + '">' + (g / 1000).toFixed(g % 1000 ? 3 : 0).replace(/\.?0+$/, '') + ' kg</button>' }).join('') + '</div>'
        + '<label class="pd-f">Peso a mano (decimales automáticos: 500 = 0.500 kg)<input id="pd-w" inputmode="numeric" class="mono" style="text-align:right;font-size:18px" value="' + esc(M.digits ? kg.toFixed(3) : '') + '" placeholder="0.000"></label>'
        + '<div class="pd-mbtns"><button class="pd-sec" data-a="close">Cancelar</button><button class="pd-pri" data-a="wadd"' + (kg > 0 ? '' : ' disabled') + '>Agregar al carrito</button></div>', 440)
    }
    if (M.type === 'free') {
      return shell('Venta Libre', '<p style="margin:-4px 0 12px;font-size:13.5px;color:var(--g500)">Cobro directo sin artículo de inventario. No afecta existencias.</p>'
        + '<label class="pd-f">Descripción<input id="pd-fd" maxlength="120" placeholder="Mercancía no registrada, servicio de entrega..." value="' + esc(M.desc || '') + '"></label>'
        + '<label class="pd-f">Importe<input id="pd-fa" inputmode="numeric" style="text-align:right;font-size:20px" value="' + money((M.cents || 0) / 100) + '"></label>'
        + (M.err ? '<div class="pd-err">' + esc(M.err) + '</div>' : '')
        + '<div class="pd-mbtns" style="margin-top:12px"><button class="pd-sec" data-a="close">Cancelar</button><button class="pd-pri" data-a="freeadd">Agregar al carrito</button></div>', 400)
    }
    if (M.type === 'price') {
      var q = norm(M.q || ''), hits = q ? search(M.q).slice(0, 4) : []
      return shell('Consultar precio', '<label class="pd-f">Escanea o busca el producto<input id="pd-pq" placeholder="Ej. aguacate o P000003" value="' + esc(M.q || '') + '"></label>'
        + (q && !hits.length ? '<p style="color:var(--g400);font-size:13.5px">Sin resultados.</p>' : '')
        + hits.map(function (p) {
          var low = p.min && p.stock <= p.min
          return '<div class="pd-pc"><div style="font-weight:600">' + esc(p.name) + '</div><div class="mono" style="font-size:12px;color:var(--g400)">' + p.sku + ' · ' + p.code + '</div>'
            + '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-top:6px"><span class="pp">' + money(p.price) + (p.w ? '<small style="font-size:14px;color:var(--g500)"> /kg</small>' : '') + '</span>'
            + '<span style="font-size:13px;color:' + (low ? 'var(--warn)' : 'var(--g500)') + '">Existencia: <b>' + fq(p.stock) + (p.w ? ' kg' : '') + '</b>' + (low ? ' · bajo mínimo' : '') + '</span></div>'
            + (p.tiers ? '<div style="font-size:12.5px;color:var(--g500);margin-top:4px">Mayoreo: desde ' + p.tiers[0].min + (p.w ? ' kg' : ' pzas') + ' a ' + money(p.tiers[0].price) + '</div>' : '') + '</div>'
        }).join('')
        + '<p style="font-size:12px;color:var(--g400);margin-top:12px">Ve el precio sin agregarlo a la venta.</p>', 440)
    }
    if (M.type === 'cust') {
      return shell('Asignar cliente', '<div class="pd-list">' + CUSTOMERS.map(function (c) {
        return '<button data-cust="' + c.id + '"><span><b style="font-weight:600">' + esc(c.name) + '</b><small>' + esc(c.phone) + '</small></span><span style="font-size:13px;color:var(--g500)">' + c.points + ' pts</span></button>'
      }).join('') + '</div>' + (S.customer ? '<div class="pd-mbtns"><button class="pd-sec" data-a="nocust">Quitar cliente</button></div>' : '')
        + '<p style="font-size:12px;color:var(--g400);margin-top:8px">El cliente acumula puntos de lealtad con cada compra.</p>', 420)
    }
    if (M.type === 'disc') {
      return shell('Aplicar descuento', '<div class="pd-list">' + DISCOUNTS.map(function (d) {
        return '<button data-disc="' + d.id + '"><span><b style="font-weight:600">' + esc(d.name) + '</b><small>' + esc(d.label) + '</small></span><span style="font-size:13px;color:var(--g500)">Aplicar ›</span></button>'
      }).join('') + '</div><p style="font-size:12px;color:var(--g400);margin-top:8px">En tu caja los descuentos los define el dueño y puedes pedir autorización con PIN.</p>', 420)
    }
    if (M.type === 'info') {
      return shell(M.title, '<p style="font-size:14px;color:var(--g600);margin:0 0 14px">' + M.html + '</p>'
        + '<div class="pd-mbtns"><button class="pd-sec" data-a="close">Seguir probando</button><a href="/#contacto" class="pd-pri" style="display:inline-flex;align-items:center;height:40px;padding:0 16px;border-radius:7px;font-size:13.5px;font-weight:600;text-decoration:none">Quiero mi demo</a></div>', 420)
    }
    return ''
  }
  function unitFor(p, q) { var t = tierFor(p, q); return t ? t.price : p.price }

  function payModal(t) {
    var M = S.modal, total = t.total
    var paid = r2(M.added.reduce(function (a, x) { return a + x.amount }, 0))
    var remaining = r2(Math.max(0, total - paid))
    var entryNum = Number(M.entry || 0)
    var isCash = M.method === 'cash'
    var overNonCash = !isCash && entryNum > remaining + 0.001
    var covered = paid + entryNum >= total - 0.001
    var cashIn = M.added.filter(function (x) { return x.method === 'cash' }).reduce(function (a, x) { return a + x.amount }, 0) + (isCash ? entryNum : 0)
    var change = covered ? r2(Math.min(cashIn, paid + entryNum - total)) : 0
    var missing = r2(Math.max(0, total - paid - entryNum))
    var quick = [50, 100, 200, 500].filter(function (d) { return d >= remaining }).slice(0, 3)
    if (quick.length < 3) quick = [100, 200, 500]
    var h = '<div class="pd-pay"><div><div class="pd-box"><div class="cap">Total a cobrar</div><div class="tt">' + money(total) + '</div>'
    if (M.added.length || entryNum > 0) h += '<div class="fc"><span>Falta: <b style="color:' + (missing > 0.001 ? 'var(--warn)' : 'var(--ok)') + '">' + money(missing) + '</b></span><span>Cambio: <b style="color:var(--pri)">' + money(change) + '</b></span></div>'
    h += '</div><div class="pd-tend">' + ['cash', 'card', 'transfer'].map(function (k) { return '<button class="' + (M.method === k ? 'on' : '') + '" data-tend="' + k + '">' + PAY_LABEL[k] + '</button>' }).join('') + '</div>'
    if (M.added.length) h += '<div class="pd-added">' + M.added.map(function (x, i) { return '<div><span style="color:var(--g600)">' + PAY_LABEL[x.method] + '</span><span><b>' + money(x.amount) + '</b><button data-unpay="' + i + '">×</button></span></div>' }).join('') + '</div>'
    if (remaining > 0.001 && entryNum > 0 && entryNum < remaining) h += '<button class="pd-sec" data-a="split" style="width:100%;min-height:40px;border-radius:7px;margin-top:10px;font-size:13px;font-weight:600;padding:6px 10px">+ Pagar ' + money(entryNum) + ' con ' + PAY_LABEL[M.method] + ' y el resto con otro método</button>'
    h += '</div><div><div class="pd-entry">' + (M.entry ? '$' + esc(M.entry) : '<span style="color:var(--g300)">$0</span>') + '</div>'
    h += '<div class="pd-quick"><button data-ent="' + remaining + '">Exacto</button>' + (isCash ? quick.map(function (d) { return '<button data-ent="' + d + '">' + money(d) + '</button>' }).join('') : '') + '</div>'
    h += '<div class="pd-pk">' + ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '←'].map(function (d) { return '<button data-pk="' + d + '">' + d + '</button>' }).join('') + '</div></div></div>'
    if (overNonCash) h += '<div class="pd-warn">Con ' + PAY_LABEL[M.method] + ' no se da cambio. Cobra como máximo ' + money(remaining) + ' (toca “Exacto”) o paga la diferencia en efectivo.</div>'
    if (overNonCash || !covered) h += '<button class="pd-wide pd-pri" disabled>' + (overNonCash ? 'Máximo ' + money(remaining) + ' con ' + PAY_LABEL[M.method] : 'Falta ' + money(missing)) + '</button>'
    else h += '<div class="pd-go"><button class="pd-sec" data-done="1">Cobrar con recibo (F1)</button><button class="pd-pri" data-done="0">Cobrar sin ticket (F2)' + (change > 0 ? ' · cambio ' + money(change) : '') + '</button></div>'
    h += '<p class="pd-foot">F1 = cobrar e imprimir recibo · F2 = cobrar sin ticket</p>'
    return shell('Cobrar', h, 760)
  }

  function doneModal() {
    var d = S.modal.sale
    var h = '<div class="pd-done"><div class="pd-ok"><div class="ck">✓</div><div style="margin-top:6px;font-size:13.5px;font-weight:600;color:var(--ok)">Venta registrada</div>'
      + '<div style="font-size:12px;color:var(--g400)">Folio ' + d.folio + '</div><div style="margin-top:14px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--g400)">Cambio</div>'
      + '<div class="ch">' + money(d.change) + '</div></div><div style="display:flex;flex-direction:column;justify-content:space-between;gap:12px"><dl class="pd-dl" style="margin:0">'
      + '<div><dt>Total</dt><dd style="margin:0;font-weight:700">' + money(d.total) + '</dd></div>'
      + d.pays.map(function (p) { return '<div><dt>' + PAY_LABEL[p.method] + '</dt><dd style="margin:0">' + money(p.amount) + '</dd></div>' }).join('')
      + '<div><dt>Artículos</dt><dd style="margin:0">' + d.lines.length + '</dd></div>'
      + (d.customer ? '<div><dt>Puntos para ' + esc(d.customer) + '</dt><dd style="margin:0">+' + d.points + '</dd></div>' : '')
      + '</dl>'
    if (d.receipt) {
      h += '<div class="pd-ticket"><div class="c"><b>MI TIENDA DEMO</b><br>Sucursal Principal</div><div class="c">--------------------------------</div>'
        + '<div>Folio: ' + d.folio + '<br>' + d.when + '</div><div class="c">--------------------------------</div>'
        + d.lines.map(function (l) { return '<div>' + esc(l.name) + '</div><div class="r"><span>' + l.qty + ' x ' + money(l.price) + '</span><span>' + money(l.total) + '</span></div>' }).join('')
        + '<div class="c">--------------------------------</div>'
        + (d.disc > 0 ? '<div class="r"><span>Descuentos</span><span>-' + money(d.disc) + '</span></div>' : '')
        + '<div class="r"><b>TOTAL</b><b>' + money(d.total) + '</b></div>'
        + d.pays.map(function (p) { return '<div class="r"><span>' + PAY_LABEL[p.method] + '</span><span>' + money(p.amount) + '</span></div>' }).join('')
        + '<div class="r"><span>Cambio</span><span>' + money(d.change) + '</span></div><div class="c" style="margin-top:6px">¡Gracias por su compra!</div></div>'
    } else {
      h += '<p style="font-size:12.5px;color:var(--g400);margin:0">Sin ticket. Puedes reimprimirlo después desde Transacciones.</p>'
    }
    h += '<button class="pd-wide pd-pri" style="margin-top:0" data-a="newsale">Nueva venta (Enter)</button></div></div>'
    h += '<p class="pd-foot" style="margin-top:12px">En tu caja, la venta ya descontó inventario, sumó al corte y se sincronizó con tu portal.</p>'
    return shell('Venta completada', h, 760)
  }

  /* -------------------------------- acciones ------------------------------- */
  function add(pid) {
    var p = byId(pid); if (!p) return
    S.term = ''
    if (p.w) { S.modal = { type: 'weigh', pid: pid, digits: '' }; render(); return }
    var key = p.id
    var it = S.items.filter(function (x) { return x.key === key })[0]
    if (it) it.q += 1
    else { it = { key: key, p: p, name: p.name, q: 1 }; S.items.push(it) }
    S.active = key; S.mode = 'free'; S.digits = ''
    render()
    scrollCartTo(key)
  }
  function addWeighed(pid, kg) {
    var p = byId(pid)
    var it = S.items.filter(function (x) { return x.key === p.id })[0]
    if (it) it.q = r3(it.q + kg)
    else { it = { key: p.id, p: p, name: p.name, q: r3(kg) }; S.items.push(it) }
    S.active = p.id; S.mode = 'free'; S.digits = ''; S.modal = null
    render(); scrollCartTo(p.id)
  }
  function r3(n) { return Math.round(n * 1000) / 1000 }
  function addFree(desc, amount) {
    var key = 'free-' + Date.now()
    S.items.push({ key: key, free: true, name: desc, price: r2(amount), q: 1 })
    S.active = key; S.mode = 'free'; S.digits = ''
  }
  function scrollCartTo(key) {
    var box = root.querySelector('.pd-items'), el = root.querySelector('[data-sel="' + key + '"]')
    if (!box || !el) return
    var top = el.offsetTop - box.offsetTop
    if (top < box.scrollTop) box.scrollTop = top
    else if (top + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + el.offsetHeight - box.clientHeight
  }

  function key(k) {
    var a = activeItem()
    if (k === 'clear') { S.digits = ''; if (S.mode !== 'free') S.mode = 'free'; render(); return }
    if (k === 'back') S.digits = S.digits.slice(0, -1)
    else if (S.digits.length < 8) S.digits = (S.digits + k).replace(/^0+(?=\d)/, '')
    if (S.mode === 'qty' && a) { var n = Number(S.digits || 0); if (n > 0) a.q = n }
    else if (S.mode === 'weight' && a) { var kg = Number(S.digits || 0) / 1000; if (kg > 0) a.q = r3(kg) }
    else if (S.mode === 'amount' && a) { var im = Number(S.digits || 0); if (im > 0) a.q = r3(im / a.p.price) }
    render()
  }

  function pay() { if (!S.items.length) return; S.modal = { type: 'pay', method: 'cash', entry: '', added: [] }; render() }
  function finish(receipt) {
    var t = totals(), M = S.modal
    var pays = M.added.slice()
    var entryNum = Number(M.entry || 0)
    var paid = pays.reduce(function (a, x) { return a + x.amount }, 0)
    if (entryNum > 0) pays.push({ method: M.method, amount: r2(entryNum) })
    var change = r2(paid + entryNum - t.total)
    S.folio += 1; S.sales += 1
    var now = new Date()
    var sale = {
      folio: 'VDE-' + String(S.folio).padStart(6, '0'), total: t.total, change: Math.max(0, change), pays: pays, receipt: receipt,
      disc: r2(t.auto + t.gen), customer: S.customer ? S.customer.name : null, points: pts(t.total),
      when: now.toLocaleDateString('es-MX') + ' ' + now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      lines: S.items.map(function (it) { return { name: it.name, qty: fq(it.q) + (it.p && it.p.w ? ' kg' : ''), price: unitPrice(it), total: lineTotal(it) } })
    }
    // Existencias de la demo: bajan como en la caja (solo en memoria).
    S.items.forEach(function (it) { if (it.p) it.p.stock = r3(it.p.stock - it.q) })
    if (S.customer) S.customer.points += sale.points
    S.modal = { type: 'done', sale: sale }
    render()
  }
  function newSale() {
    S0 = { folio: S.folio, sales: S.sales }
    var theme = root.getAttribute('data-t')
    S = freshState()
    root.setAttribute('data-t', theme)
    render()
    var q = root.querySelector('#pd-q'); if (q) q.focus()
  }

  /* -------------------------------- eventos -------------------------------- */
  function bind() {
    var q = root.querySelector('#pd-q')
    if (q) {
      q.oninput = function () { S.term = q.value; var lb = root.querySelector('#pd-lb'); if (lb) { lb.innerHTML = leftBody(); bind() } else render() }
      q.onkeydown = function (e) {
        if (e.key !== 'Enter') return
        e.preventDefault()
        var t = S.term.trim(); if (!t) return
        var exact = PRODUCTS.filter(function (p) { return p.code === t || p.sku.toLowerCase() === t.toLowerCase() })[0]
        var res = exact ? [exact] : search(t)
        if (res.length === 1) add(res[0].id)
        else if (!res.length) toast('Sin resultados para "' + t + '"')
      }
    }
    each('[data-add]', function (b) { b.onclick = function () { add(b.getAttribute('data-add')) } })
    each('[data-mode]', function (b) { b.onclick = function () { S.mode = b.getAttribute('data-mode'); S.digits = ''; render() } })
    each('[data-k]', function (b) { b.onclick = function () { key(b.getAttribute('data-k')) } })
    each('[data-sel]', function (b) { b.onclick = function () { S.active = b.getAttribute('data-sel'); render() } })
    each('[data-del]', function (b) { b.onclick = function (e) { e.stopPropagation(); var k = b.getAttribute('data-del'); S.items = S.items.filter(function (x) { return x.key !== k }); if (S.active === k) { S.active = null; S.mode = 'free' } render() } })
    each('[data-inc]', function (b) { b.onclick = function (e) { e.stopPropagation(); var it = find(b.getAttribute('data-inc')); it.q += 1; S.active = it.key; render() } })
    each('[data-dec]', function (b) { b.onclick = function (e) { e.stopPropagation(); var it = find(b.getAttribute('data-dec')); it.q = Math.max(1, it.q - 1); S.active = it.key; render() } })
    each('[data-nav]', function (b) {
      b.onclick = function () {
        var n = b.getAttribute('data-nav'); if (n === 'sales') return
        var txt = {
          inv: 'Inventario: existencias en tiempo real, recepción de mercancía, mermas y alertas de mínimo.',
          art: 'Artículos: alta con código de barras, precios por mayoreo, plantillas de precio y etiquetas.',
          rep: 'Reportes: ventas por día, utilidad, productos más vendidos y corte de caja.',
          cash: 'Salida $: registra pagos a proveedores o gastos desde la caja, y el corte lo descuenta solo.',
          more: 'Menú: clientes y lealtad, empleados y permisos, compras, devoluciones, configuración y más.'
        }[n]
        S.modal = { type: 'info', title: b.textContent.trim(), html: esc(txt) + '<br><br>En esta demo puedes jugar con <b>Ventas</b>. Te enseñamos lo demás con tus propios productos.' }
        render()
      }
    })
    each('[data-a]', function (b) {
      b.onclick = function () {
        var a = b.getAttribute('data-a')
        if (a === 'close') { S.modal = null; render(); return }
        if (a === 'price') { S.modal = { type: 'price', q: '' }; render(); focus('#pd-pq'); return }
        if (a === 'free') { S.modal = { type: 'free', desc: '', cents: 0 }; render(); focus('#pd-fd'); return }
        if (a === 'tabs') { toast('Cuentas abiertas: guarda la venta de un cliente y retómala después.'); return }
        if (a === 'clock') { toast('Asistencia: el empleado checa su entrada y salida desde aquí.'); return }
        if (a === 'times') { var it = activeItem(); var n = Number(S.digits || 0) / 100; if (it && n > 0) { it.q = it.p.w ? r3(n) : Math.max(1, Math.round(n)) } S.digits = ''; render(); return }
        if (a === 'addfree') { var am = freeAmount(); if (am > 0) { addFree('Venta libre', am); render() } return }
        if (a === 'clear') { S.items = []; S.active = null; S.customer = null; S.discount = null; S.mode = 'free'; S.digits = ''; render(); return }
        if (a === 'cust') { S.modal = { type: 'cust' }; render(); return }
        if (a === 'nocust') { S.customer = null; S.modal = null; render(); return }
        if (a === 'disc') { S.modal = { type: 'disc' }; render(); return }
        if (a === 'nodisc') { S.discount = null; render(); return }
        if (a === 'pay') { pay(); return }
        if (a === 'wadd') { var kg = Number(S.modal.digits || 0) / 1000; if (kg > 0) addWeighed(S.modal.pid, kg); return }
        if (a === 'freeadd') {
          var d = (root.querySelector('#pd-fd').value || '').trim(), c = S.modal.cents || 0
          if (!d) { S.modal.err = 'Captura la descripción'; S.modal.desc = d; render(); return }
          if (c <= 0) { S.modal.err = 'Captura un importe mayor a 0'; S.modal.desc = d; render(); return }
          addFree(d, c / 100); S.modal = null; render(); return
        }
        if (a === 'split') { var M = S.modal, e = Number(M.entry || 0); if (e > 0) { M.added.push({ method: M.method, amount: r2(e) }); M.entry = ''; M.method = M.method === 'cash' ? 'card' : 'cash' } render(); return }
        if (a === 'newsale') { newSale(); return }
      }
    })
    each('[data-cust]', function (b) { b.onclick = function () { S.customer = CUSTOMERS.filter(function (c) { return c.id === b.getAttribute('data-cust') })[0]; S.modal = null; render() } })
    each('[data-disc]', function (b) { b.onclick = function () { S.discount = DISCOUNTS.filter(function (d) { return d.id === b.getAttribute('data-disc') })[0]; S.modal = null; render(); toast('Descuento aplicado: ' + S.discount.name) } })
    each('[data-wq]', function (b) { b.onclick = function () { S.modal.digits = b.getAttribute('data-wq'); render() } })
    each('[data-tend]', function (b) { b.onclick = function () { S.modal.method = b.getAttribute('data-tend'); render() } })
    each('[data-ent]', function (b) { b.onclick = function () { S.modal.entry = String(r2(Number(b.getAttribute('data-ent')))); render() } })
    each('[data-unpay]', function (b) { b.onclick = function () { S.modal.added.splice(Number(b.getAttribute('data-unpay')), 1); render() } })
    each('[data-pk]', function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-pk'), M = S.modal, e = M.entry || ''
        if (k === '←') e = e.slice(0, -1)
        else if (k === '.') { if (e.indexOf('.') < 0) e = (e || '0') + '.' }
        else if (!/\.\d\d$/.test(e) && e.length < 9) e = (e === '0' ? '' : e) + k
        M.entry = e; render()
      }
    })
    each('[data-done]', function (b) { b.onclick = function () { finish(b.getAttribute('data-done') === '1') } })
    var ov = root.querySelector('[data-ov]')
    if (ov) ov.onclick = function (e) { if (e.target === ov && S.modal && S.modal.type !== 'done') { S.modal = null; render() } }
    var w = root.querySelector('#pd-w')
    if (w) w.oninput = function () { var d = w.value.replace(/\D/g, '').slice(0, 6); S.modal.digits = d; render(); focus('#pd-w', true) }
    var fa = root.querySelector('#pd-fa')
    if (fa) {
      fa.onkeydown = function (e) {
        if (e.key >= '0' && e.key <= '9') { e.preventDefault(); S.modal.cents = Math.min(99999999, (S.modal.cents || 0) * 10 + Number(e.key)) }
        else if (e.key === 'Backspace') { e.preventDefault(); S.modal.cents = Math.floor((S.modal.cents || 0) / 10) }
        else return
        S.modal.desc = root.querySelector('#pd-fd').value; render(); focus('#pd-fa', true)
      }
      fa.oninput = function () { var d = fa.value.replace(/\D/g, ''); S.modal.cents = Number(d || 0); S.modal.desc = root.querySelector('#pd-fd').value; render(); focus('#pd-fa', true) }
    }
    var pq = root.querySelector('#pd-pq')
    if (pq) pq.oninput = function () { S.modal.q = pq.value; render(); focus('#pd-pq', true) }
  }
  function find(k) { return S.items.filter(function (x) { return x.key === k })[0] }
  function each(sel, fn) { Array.prototype.forEach.call(root.querySelectorAll(sel), fn) }
  function focus(sel, end) {
    var el = root.querySelector(sel); if (!el) return
    el.focus()
    if (end) { try { var n = el.value.length; el.setSelectionRange(n, n) } catch (_) {} }
  }

  /* Atajos de la caja (solo mientras el foco está DENTRO de la demo). */
  function onKey(e) {
    var M = S.modal
    if (e.key === 'F12') { e.preventDefault(); if (!M) pay(); return }
    if (e.key === 'Escape' && M && M.type !== 'done') { S.modal = null; render(); return }
    if (M && M.type === 'pay' && (e.key === 'F1' || e.key === 'F2')) { var btn = root.querySelector('[data-done="' + (e.key === 'F1' ? 1 : 0) + '"]'); if (btn) { e.preventDefault(); btn.click() } return }
    if (M && M.type === 'done' && e.key === 'Enter') { e.preventDefault(); newSale(); return }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); S.modal = { type: 'free', desc: '', cents: 0 }; render(); focus('#pd-fd') }
  }

  window.PosDemo = {
    mount: mount, setTheme: setTheme,
    // expuestos para pruebas
    _state: function () { return S }, _totals: totals, _add: add, _addWeighed: addWeighed, _pay: pay, _finish: finish, _products: PRODUCTS
  }

  function auto() { var el = document.getElementById('posDemo'); if (el && !el.classList.contains('pd')) mount(el) }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto)
  else auto()
})()
