/* Oberfläche, Diagramm und Animation. Rechnet über js/model.js (window.FCModel). */
(function () {
'use strict';
var M = window.FCModel, HHV = M.CONST.HHV, LHV = M.CONST.LHV;
var params = M.params, voltage = M.voltage, curve = M.curve;
var MEMS = {'25':'Nafion 211','51':'Nafion 212','127':'Nafion 115','183':'Nafion 117'};

function $(id){return document.getElementById(id);}
function nf(x,d){ return Number.isFinite(x) ? x.toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d}) : '–'; }
function sci(x){
  var e=Math.floor(Math.log10(x)), m=x/Math.pow(10,e);
  var sup={'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
  return nf(m,1)+'·10'+String(e).split('').map(function(c){return sup[c];}).join('');
}

function readState(){
  return {T:+$('T').value, pa:+$('pa').value, pc:+$('pc').value, o2:$('gas-o2').checked, RH:+$('RH').value/100,
          tm:+$('mem').value, Pt:+$('Pt').value, N:+$('N').value, A:+$('A').value, j:+$('j').value};
}

/* ---------- Farben ---------- */
var C={};
function readColors(){
  var cs=getComputedStyle(document.documentElement);
  ['ink','muted','line','accent','power','h2','o2','h2o','el','hp','n2','chan','gdl','cl','mem','grid','surface','f-body','f-mono']
    .forEach(function(k){C[k]=cs.getPropertyValue('--'+k).trim();});
}
function prep(c,H){
  var dpr=window.devicePixelRatio||1, w=c.clientWidth||300;
  c.style.height=H+'px';
  if(c.width!==Math.round(w*dpr)||c.height!==Math.round(H*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(H*dpr);}
  var ctx=c.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,H);
  return {ctx:ctx,w:w,h:H};
}

/* ---------- Zustand ---------- */
var cur={}, refs=[], rows=[];
var REFDASH=[[6,4],[2,3],[10,3,2,3]];
function gasName(s){return s.o2?'O₂':'Luft';}
function refLabel(s){return s.T+' °C · '+gasName(s)+' · RH '+Math.round(s.RH*100)+' % · '+MEMS[String(s.tm)]+' · Pt '+nf(s.Pt,2);}
function powerFmt(W){ return W>=1000 ? nf(W/1000,2)+' kW' : nf(W,1)+' W'; }

function update(){
  var s=readState(), p=params(s), pts=curve(p);
  var jMax=pts.length?pts[pts.length-1].j:0;
  var sl=$('j'), mx=Math.max(0.01,Math.floor(jMax*100)/100);
  sl.max=mx; if(+sl.value>mx) sl.value=mx;
  s.j=+sl.value;
  var v=voltage(p,s.j), best=M.maxPower(pts);
  var gasChanged = cur.s && cur.s.o2!==s.o2;
  cur={s:s,p:p,pts:pts,v:v,Pmax:best.P,jPmax:best.j,jMax:jMax};
  if(gasChanged || !anim.gas.length) initGas();

  $('j-out').textContent=nf(s.j,2)+' A/cm²';
  $('T-out').textContent=s.T+' °C';
  $('pa-out').textContent=nf(s.pa,1)+' bar';
  $('pc-out').textContent=nf(s.pc,1)+' bar';
  $('RH-out').textContent=Math.round(s.RH*100)+' %';
  $('Pt-out').textContent=nf(s.Pt,2)+' mg/cm²';
  $('N-out').textContent=s.N;
  $('A-out').textContent=s.A+' cm²';

  var U=v.U, P=s.j*U, Pmax=cur.Pmax, jPmax=cur.jPmax;
  $('t-U').innerHTML=nf(U,3)+'<span class="u">V</span>';
  $('t-j').innerHTML=nf(s.j,2)+'<span class="u">A/cm²</span>';
  $('t-P').innerHTML=nf(P,3)+'<span class="u">W/cm²</span>';
  $('t-eta').innerHTML=nf(U/LHV*100,1)+'<span class="u">%</span>';

  var chip=$('chip'), st=$('status-text');
  if(s.j<0.005){chip.className='chip';chip.textContent='Leerlauf';st.textContent='Leerlaufspannung '+nf(U,3)+' V, Nernst-Spannung '+nf(p.EN,3)+' V';}
  else if(s.j<0.6*jPmax){chip.className='chip ok';chip.textContent='Teillast';st.textContent='hoher Wirkungsgrad, '+nf(P/Pmax*100,0)+' % der Maximalleistung';}
  else if(s.j<=1.08*jPmax){chip.className='chip acc';chip.textContent='Volllast';st.textContent='nahe der Maximalleistung von '+nf(Pmax,3)+' W/cm² bei '+nf(jPmax,2)+' A/cm²';}
  else {chip.className='chip warn';chip.textContent='Überlast';st.textContent='jenseits der Maximalleistung: mehr Strom liefert weniger Leistung';}

  var k=M.stack(U,s.j,s.N,s.A);
  $('s-U').textContent=nf(k.U,1)+' V';
  $('s-I').textContent=nf(k.I,1)+' A';
  $('s-P').textContent=powerFmt(k.Pel);
  $('s-Q').textContent=powerFmt(k.Q);
  $('s-H2').textContent=nf(k.H2_NLmin,2)+' NL/min';
  $('s-H2m').textContent=nf(k.H2_gh,1)+' g/h';
  $('s-O2').textContent=nf(k.O2_NLmin,2)+' NL/min';
  $('s-W').textContent=nf(k.H2O_gh,0)+' g/h';

  renderLosses(p,v);
  renderLegend();
  drawChart();
  if(!anim.running) drawCell();
}

function renderLosses(p,v){
  var segs=[
    {label:'Elektrische Arbeit (U)',v:v.U,col:'var(--accent)'},
    {label:'Aktivierung (Kathode)',v:v.act,col:'var(--l-act)'},
    {label:'Ohmscher Verlust',v:v.ohm,col:'var(--l-ohm)'},
    {label:'Stofftransport',v:v.conc,col:'var(--l-conc)'},
    {label:'Reversible Wärme (1,481 V − E_N)',v:HHV-p.EN,col:'var(--l-rev)'}
  ];
  $('bar').innerHTML=segs.map(function(g){return '<div style="width:'+(Math.max(g.v,0)/HHV*100)+'%;background:'+g.col+'" title="'+g.label+'"></div>';}).join('');
  $('losslist').innerHTML=segs.map(function(g){return '<div><i class="sq" style="background:'+g.col+'"></i><span>'+g.label+'</span><span class="num">'+nf(g.v,3)+' V</span><span class="num">'+nf(g.v/HHV*100,1)+' %</span></div>';}).join('');
  function row(eq,res,note){return '<div><span class="eq">'+eq+'</span><span class="res">'+res+'</span>'+(note?'<span class="note">'+note+'</span>':'')+'</div>';}
  $('formula').innerHTML=
    row('E°(T) = 1,229 V − 0,846 mV/K · (T − 298 K)', nf(p.E0,3)+' V','')+
    row('E<sub>N</sub> = E° + RT/2F · ln(p<sub>H₂</sub> · √p<sub>O₂</sub>)', nf(p.EN,3)+' V','p(H₂) = '+nf(p.pH2,2)+' bar, p(O₂) = '+nf(p.pO2,3)+' bar, p(H₂O) = '+nf(p.pw,2)+' bar')+
    row('η<sub>akt</sub> = RT/(αF) · arsinh((j + j<sub>n</sub>)/(2 j₀))', nf(v.act,3)+' V','j₀ = '+sci(p.j0)+' A/cm², Tafel-Steigung '+nf(v.b*Math.LN10*1000,0)+' mV/Dekade')+
    row('η<sub>ohm</sub> = j · R<sub>i</sub>', nf(v.ohm,3)+' V','R<sub>i</sub> = '+nf(p.Ri,3)+' Ω·cm², λ = '+nf(p.lam,1)+' H₂O/SO₃⁻, σ = '+nf(p.sigma*1000,1)+' mS/cm')+
    row('η<sub>konz</sub> = B · ln(j<sub>L</sub>/(j<sub>L</sub> − j))', nf(v.conc,3)+' V','j<sub>L</sub> = '+nf(p.jL,2)+' A/cm²')+
    row('<b>U = E<sub>N</sub> − η<sub>akt</sub> − η<sub>ohm</sub> − η<sub>konz</sub></b>', '<b>'+nf(v.U,3)+' V</b>','');
}

function renderLegend(){
  var h='<span><i class="sw" style="background:var(--accent)"></i>Spannung U</span><span><i class="sw" style="background:var(--power)"></i>Leistungsdichte P</span>';
  refs.forEach(function(r,i){h+='<span><i class="sw dash"></i>Vergleich '+(i+1)+': '+r.label+'</span>';});
  $('chartlegend').innerHTML=h;
}

/* ---------- Diagramm ---------- */
function drawChart(){
  var c=$('chart'), narrow=c.clientWidth<520, H=narrow?250:310;
  var o=prep(c,H), ctx=o.ctx, w=o.w, h=o.h;
  var m={l:42,r:46,t:26,b:40};
  var pw=w-m.l-m.r, ph=h-m.t-m.b;
  var all=[cur.pts].concat(refs.map(function(r){return r.pts;}));
  var maxJ=0.1,maxP=0.05;
  all.forEach(function(ps){ps.forEach(function(q){if(q.j>maxJ)maxJ=q.j;if(q.P>maxP)maxP=q.P;});});
  var xc=[0.1,0.2,0.25,0.5,1,2], maxT=narrow?5:8, xs=2, i;
  for(i=0;i<xc.length;i++){ if(Math.ceil(maxJ/xc[i]-1e-9)<=maxT){xs=xc[i];break;} }
  var xMax=Math.max(xs,Math.ceil(maxJ/xs-1e-9)*xs);
  var yMax=1.2, yStep=0.2;
  var pc=[0.02,0.05,0.1,0.15,0.2,0.25,0.3,0.4,0.5,0.6,0.8,1], pStep=1;
  for(i=0;i<pc.length;i++){ if(6*pc[i]>=maxP*1.02){pStep=pc[i];break;} }
  var pMax=6*pStep;
  function X(j){return m.l+j/xMax*pw;} function Y(u){return m.t+ph-u/yMax*ph;} function YP(P){return m.t+ph-P/pMax*ph;}
  var fb=C['f-body']||'sans-serif', fm=C['f-mono']||'monospace';
  ctx.lineWidth=1; ctx.strokeStyle=C.grid; ctx.fillStyle=C.muted; ctx.font='11px '+fm;
  var pd=(Math.abs(Math.round(pStep*10)-pStep*10)>1e-9)?2:1;
  for(var k=0;k<=6;k++){
    var y=Y(k*yStep); ctx.beginPath(); ctx.moveTo(m.l,y+.5); ctx.lineTo(m.l+pw,y+.5); ctx.stroke();
    ctx.textAlign='right'; ctx.textBaseline='middle'; ctx.fillStyle=C.accent; ctx.fillText(nf(k*yStep,1),m.l-6,y);
    ctx.textAlign='left'; ctx.fillStyle=C.power; ctx.fillText(nf(k*pStep,pd),m.l+pw+6,y);
  }
  var xd = xs<1 ? (xs===0.25?2:1) : 0;
  ctx.fillStyle=C.muted; ctx.textAlign='center'; ctx.textBaseline='top';
  for(var xv=0; xv<=xMax+1e-9; xv+=xs){
    var x=X(xv); ctx.beginPath(); ctx.moveTo(x+.5,m.t); ctx.lineTo(x+.5,m.t+ph); ctx.stroke();
    ctx.fillText(nf(xv,xd),x,m.t+ph+6);
  }
  ctx.strokeStyle=C.line; ctx.strokeRect(m.l+.5,m.t+.5,pw,ph);
  ctx.font='12px '+fb; ctx.fillStyle=C.muted;
  ctx.textAlign='center'; ctx.fillText('Stromdichte j in A/cm²',m.l+pw/2,h-16);
  ctx.textBaseline='alphabetic'; ctx.textAlign='left'; ctx.fillStyle=C.accent; ctx.fillText('U in V',4,14);
  ctx.textAlign='right'; ctx.fillStyle=C.power; ctx.fillText('P in W/cm²',w-4,14);

  ctx.save(); ctx.beginPath(); ctx.rect(m.l,m.t,pw,ph); ctx.clip();
  refs.forEach(function(r,i){
    ctx.setLineDash(REFDASH[i%3]); ctx.lineWidth=1.5; ctx.strokeStyle=C.muted;
    line(r.pts,function(q){return Y(q.U);}); ctx.globalAlpha=.6; line(r.pts,function(q){return YP(q.P);}); ctx.globalAlpha=1;
  });
  ctx.setLineDash([]);
  var pts=cur.pts;
  if(pts.length>1){
    ctx.beginPath(); ctx.moveTo(X(pts[0].j),YP(0));
    pts.forEach(function(q){ctx.lineTo(X(q.j),YP(q.P));}); ctx.lineTo(X(pts[pts.length-1].j),YP(0)); ctx.closePath();
    ctx.globalAlpha=.12; ctx.fillStyle=C.power; ctx.fill(); ctx.globalAlpha=1;
    ctx.lineWidth=2; ctx.strokeStyle=C.power; line(pts,function(q){return YP(q.P);});
    ctx.lineWidth=2.5; ctx.strokeStyle=C.accent; line(pts,function(q){return Y(q.U);});
  }
  if(cur.Pmax>0){
    var xm=X(cur.jPmax), ym=YP(cur.Pmax);
    ctx.fillStyle=C.power; ctx.beginPath(); ctx.moveTo(xm,ym-5); ctx.lineTo(xm+5,ym); ctx.lineTo(xm,ym+5); ctx.lineTo(xm-5,ym); ctx.closePath(); ctx.fill();
    ctx.font='11px '+fb; ctx.textAlign= xm>m.l+pw-70?'right':'left'; ctx.textBaseline='bottom';
    ctx.fillText('P_max '+nf(cur.Pmax,2),xm+(ctx.textAlign==='left'?7:-7),ym-4);
  }
  var jo=cur.s.j, xo=X(jo);
  ctx.setLineDash([3,3]); ctx.strokeStyle=C.ink; ctx.globalAlpha=.5; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(xo+.5,m.t); ctx.lineTo(xo+.5,m.t+ph); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1;
  dot(xo,Y(cur.v.U),C.accent); dot(xo,YP(jo*cur.v.U),C.power);
  ctx.restore();

  function line(ps,fy){ ctx.beginPath(); ps.forEach(function(q,i){ var x=X(q.j), y=fy(q); if(i)ctx.lineTo(x,y); else ctx.moveTo(x,y);}); ctx.stroke(); }
  function dot(x,y,col){ ctx.beginPath(); ctx.arc(x,y,5.5,0,7); ctx.fillStyle=C.surface; ctx.fill(); ctx.lineWidth=2.5; ctx.strokeStyle=col; ctx.stroke(); }
}

/* ---------- Animation ---------- */
var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var anim={gas:[],parts:[],acc:0,last:0,running:!reduce,geo:null,hp:0,o2:0,raf:null};
function rnd(a,b){return a+Math.random()*(b-a);}
function geo(w,h){
  var L=8, W=w-16; function x(f){return L+f*W;}
  return {w:w,h:h,top:74,bot:h-12,wireY:28,
    chA:[x(0),x(0.19)], gdlA:[x(0.19),x(0.30)], clA:[x(0.30),x(0.335)], mem:[x(0.335),x(0.665)],
    clC:[x(0.665),x(0.70)], gdlC:[x(0.70),x(0.81)], chC:[x(0.81),x(1)], xA:x(0.245), xC:x(0.755)};
}
function initGas(){
  anim.gas=[];
  for(var i=0;i<9;i++) anim.gas.push({side:'A',type:'h2',fx:Math.random(),fy:Math.random(),v:rnd(0.08,0.14)});
  var o2=cur.s&&cur.s.o2;
  for(i=0;i<12;i++) anim.gas.push({side:'C',type:(o2||i<3)?'o2':'n2',fx:Math.random(),fy:Math.random(),v:rnd(0.08,0.14)});
}
function addPart(type,path,speed,onEnd){ if(anim.parts.length<500) anim.parts.push({type:type,path:path,i:0,x:path[0][0],y:path[0][1],speed:speed,onEnd:onEnd}); }
function stepPart(p,dt){
  var d=p.speed*dt;
  while(d>0&&p.i<p.path.length-1){
    var t=p.path[p.i+1], dx=t[0]-p.x, dy=t[1]-p.y, L=Math.hypot(dx,dy);
    if(L<=d){p.x=t[0];p.y=t[1];p.i++;d-=L;} else {p.x+=dx/L*d;p.y+=dy/L*d;d=0;}
  }
  return p.i>=p.path.length-1;
}
function spawnEvent(){
  var g=anim.geo; if(!g) return;
  var y=rnd(g.top+16,g.bot-16), sx=rnd(g.chA[0]+10,g.chA[1]-8);
  var ca=(g.clA[0]+g.clA[1])/2, cc=(g.clC[0]+g.clC[1])/2;
  addPart('h2',[[sx,y],[ca,y]],70,function(){
    [-5,5].forEach(function(dy){
      var yy=y+dy;
      addPart('hp',[[ca,yy],[cc,yy+rnd(-6,6)]],55,function(p){ anim.hp++; if(anim.hp%2===0) spawnWater(p.x,p.y); });
      addPart('el',[[ca,yy],[g.xA,g.top],[g.xA,g.wireY],[g.xC,g.wireY],[g.xC,g.top],[cc,yy+rnd(-8,8)]],150,null);
    });
  });
  anim.o2++;
  if(anim.o2%2===0){ var yo=rnd(g.top+16,g.bot-16); addPart('o2',[[rnd(g.chC[0]+10,g.chC[1]-10),yo],[cc,yo]],60,null); }
}
function spawnWater(x,y){
  var g=anim.geo, cx=rnd(g.chC[0]+10,g.chC[1]-10), y2=Math.min(g.bot-14,y+rnd(-10,10));
  addPart('h2o',[[x,y],[cx,y2],[cx,g.bot-4]],45,null);
}
function simulate(dt){
  anim.gas.forEach(function(m){ m.fy+=m.v*dt; if(m.fy>1){m.fy-=1;m.fx=Math.random();} });
  var rate=Math.min(16,8*(cur.s?cur.s.j:0));
  anim.acc+=rate*dt; while(anim.acc>=1){anim.acc-=1; spawnEvent();}
  var old=anim.parts, keep=[]; anim.parts=[];
  old.forEach(function(p){ if(stepPart(p,dt)){ if(p.onEnd)p.onEnd(p); } else keep.push(p); });
  anim.parts=keep.concat(anim.parts);
}
function mol(ctx,type,x,y){
  function c(cx,cy,r,col){ctx.beginPath();ctx.arc(cx,cy,r,0,7);ctx.fillStyle=col;ctx.fill();}
  if(type==='h2'){c(x-2.4,y,3.2,C.h2);c(x+2.4,y,3.2,C.h2);}
  else if(type==='o2'){c(x-2.8,y,3.8,C.o2);c(x+2.8,y,3.8,C.o2);}
  else if(type==='n2'){c(x-2.7,y,3.6,C.n2);c(x+2.7,y,3.6,C.n2);}
  else if(type==='h2o'){c(x-3.6,y-2.8,2.4,C.h2);c(x+3.6,y-2.8,2.4,C.h2);c(x,y,4,C.h2o);}
  else if(type==='hp'){c(x,y,2.7,C.hp);}
  else if(type==='el'){c(x,y,2.3,C.el);}
}
function drawCell(){
  var c=$('cell'), H=c.clientWidth<520?250:290;
  var o=prep(c,H), ctx=o.ctx, w=o.w, h=o.h;
  if(!anim.geo||anim.geo.w!==w||anim.geo.h!==h){ anim.geo=geo(w,h); anim.parts=[]; }
  var g=anim.geo, fb=C['f-body']||'sans-serif', narrow=w<520;
  function band(b,col){ctx.fillStyle=col;ctx.fillRect(b[0],g.top,b[1]-b[0],g.bot-g.top);}
  band(g.chA,C.chan); band(g.chC,C.chan); band(g.gdlA,C.gdl); band(g.gdlC,C.gdl); band(g.mem,C.mem); band(g.clA,C.cl); band(g.clC,C.cl);
  ctx.save(); ctx.globalAlpha=.35; ctx.strokeStyle=C.muted; ctx.lineWidth=1;
  [g.gdlA,g.gdlC].forEach(function(b){ ctx.beginPath(); for(var yy=g.top+6; yy<g.bot; yy+=9){ ctx.moveTo(b[0]+2,yy); ctx.lineTo(b[1]-2,yy+4);} ctx.stroke(); });
  ctx.restore();
  ctx.strokeStyle=C.line; ctx.lineWidth=1; ctx.strokeRect(g.chA[0]+.5,g.top+.5,g.chC[1]-g.chA[0]-1,g.bot-g.top-1);

  function tag(t,x,col,font){ ctx.font=font; var tw=ctx.measureText(t).width; ctx.fillStyle=C.surface; ctx.fillRect(x-tw/2-3,g.top-21,tw+6,16); ctx.fillStyle=col; ctx.textAlign='center'; ctx.textBaseline='bottom'; ctx.fillText(t,x,g.top-7); }
  ctx.strokeStyle=C.muted; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(g.xA,g.top); ctx.lineTo(g.xA,g.wireY); ctx.lineTo(g.xC,g.wireY); ctx.lineTo(g.xC,g.top); ctx.stroke();
  tag('Anode (−)',(g.chA[0]+g.clA[1])/2,C.ink,'600 12px '+fb);
  tag('Kathode (+)',(g.clC[0]+g.chC[1])/2,C.ink,'600 12px '+fb);
  tag(narrow?'PEM':'Membran (PEM)',(g.mem[0]+g.mem[1])/2,C.muted,'12px '+fb);
  ctx.font='11px '+fb; ctx.textBaseline='top'; ctx.fillStyle=C.muted;
  ctx.fillText(narrow?'H₂':'H₂-Kanal',(g.chA[0]+g.chA[1])/2,g.top+4);
  ctx.fillText(narrow?(cur.s&&cur.s.o2?'O₂':'Luft'):(cur.s&&cur.s.o2?'O₂-Kanal':'Luftkanal'),(g.chC[0]+g.chC[1])/2,g.top+4);

  var on=cur.s&&cur.s.j>0.004, Pc=on?cur.s.j*cur.v.U:0, glow=Math.max(0,Math.min(1,Pc/0.7));
  var lx=(g.xA+g.xC)/2, ly=g.wireY;
  if(glow>0.02){ var gr=ctx.createRadialGradient(lx,ly,2,lx,ly,34); gr.addColorStop(0,C.el); gr.addColorStop(1,'rgba(0,0,0,0)'); ctx.globalAlpha=.25+.6*glow; ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(lx,ly,34,0,7); ctx.fill(); ctx.globalAlpha=1; }
  ctx.beginPath(); ctx.arc(lx,ly,11,0,7); ctx.fillStyle=C.surface; ctx.fill();
  if(glow>0.02){ ctx.globalAlpha=.25+.75*glow; ctx.fillStyle=C.el; ctx.fill(); ctx.globalAlpha=1; }
  ctx.lineWidth=1.6; ctx.strokeStyle=C.ink; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lx-7,ly-7); ctx.lineTo(lx+7,ly+7); ctx.moveTo(lx+7,ly-7); ctx.lineTo(lx-7,ly+7); ctx.stroke();
  ctx.font='11px '+fb; ctx.fillStyle=C.muted; ctx.textAlign='left'; ctx.textBaseline='bottom';
  if(!narrow) ctx.fillText('Verbraucher',lx+17,ly-3);
  ctx.textBaseline='top'; ctx.fillStyle=C.ink;
  if(cur.s) ctx.fillText(nf(cur.v.U,2)+' V · '+nf(cur.s.j,2)+' A/cm²',lx+17,ly+3);

  anim.gas.forEach(function(m){
    var b=m.side==='A'?g.chA:g.chC;
    mol(ctx,m.type,b[0]+8+m.fx*(b[1]-b[0]-16), g.top+22+m.fy*(g.bot-g.top-30));
  });
  anim.parts.forEach(function(p){ mol(ctx,p.type,p.x,p.y); });
}
function loop(t){
  var dt=Math.min(0.05,Math.max(0,(t-anim.last)/1000)); anim.last=t;
  simulate(dt); drawCell();
  if(anim.running) anim.raf=requestAnimationFrame(loop); else anim.raf=null;
}
function start(){ if(anim.raf) return; anim.last=performance.now(); anim.raf=requestAnimationFrame(loop); }

/* ---------- Messprotokoll ---------- */
function renderRows(){
  var tb=$('tbody');
  if(!rows.length){ tb.innerHTML='<tr class="empty"><td colspan="8">Noch keine Messpunkte. Stelle eine Stromdichte ein und tippe auf „Messpunkt aufnehmen“ oder lass die Kennlinie automatisch messen.</td></tr>'; return; }
  tb.innerHTML=rows.map(function(r,i){return '<tr><td>'+(i+1)+'</td><td>'+r.T+'</td><td>'+r.gas+'</td><td>'+r.RH+'</td><td>'+nf(r.j,2)+'</td><td>'+nf(r.U,3)+'</td><td>'+nf(r.P,3)+'</td><td>'+nf(r.eta,1)+'</td></tr>';}).join('');
}
function record(j){
  var s=cur.s, v=voltage(cur.p,j);
  rows.push({T:s.T,gas:gasName(s),RH:Math.round(s.RH*100),j:j,U:v.U,P:j*v.U,eta:v.U/LHV*100});
}
function flash(t){ var m=$('msg'); m.textContent=t; clearTimeout(flash.t); flash.t=setTimeout(function(){m.textContent='';},3500); }

/* ---------- Events ---------- */
['j','T','pa','pc','RH','Pt','N','A'].forEach(function(id){$(id).addEventListener('input',update);});
['mem','gas-air','gas-o2'].forEach(function(id){$(id).addEventListener('change',update);});
$('b-ocv').addEventListener('click',function(){$('j').value=0;update();});
$('b-pmax').addEventListener('click',function(){$('j').value=Math.round(cur.jPmax*100)/100;update();});
$('b-ref').addEventListener('click',function(){
  if(refs.length>=3) refs.shift();
  refs.push({pts:cur.pts.slice(),label:refLabel(cur.s)}); update();
});
$('b-refclr').addEventListener('click',function(){refs=[];update();});
$('b-anim').addEventListener('click',function(){
  anim.running=!anim.running; this.textContent=anim.running?'Animation anhalten':'Animation starten';
  if(anim.running) start();
});
$('b-rec').addEventListener('click',function(){ record(cur.s.j); renderRows(); flash('Messpunkt '+rows.length+' aufgenommen.'); });
$('b-sweep').addEventListener('click',function(){
  var n=10, jm=Math.floor(cur.jMax*0.97*100)/100;
  for(var i=0;i<=n;i++){ record(Math.round(jm*i/n*100)/100); }
  renderRows(); flash((n+1)+' Messpunkte von 0 bis '+nf(jm,2)+' A/cm² aufgenommen.');
});
$('b-clr').addEventListener('click',function(){ rows=[]; renderRows(); });
$('b-copy').addEventListener('click',function(){
  if(!rows.length){ flash('Die Tabelle ist noch leer.'); return; }
  var head=['Nr.','T in °C','Kathodengas','RH in %','j in A/cm²','U in V','P in W/cm²','eta_Hu in %'].join('\t');
  var txt=head+'\n'+rows.map(function(r,i){return [i+1,r.T,r.gas,r.RH,nf(r.j,2),nf(r.U,3),nf(r.P,3),nf(r.eta,1)].join('\t');}).join('\n');
  try{
    navigator.clipboard.writeText(txt).then(function(){flash('Kopiert. In Excel, Numbers oder Google Sheets einfügen.');},function(){flash('Kopieren nicht erlaubt. Markiere die Tabelle von Hand.');});
  }catch(e){ flash('Kopieren nicht erlaubt. Markiere die Tabelle von Hand.'); }
});

function refreshTheme(){ readColors(); update(); if(!anim.running) drawCell(); }
if(window.matchMedia){ var mq=window.matchMedia('(prefers-color-scheme: dark)'); if(mq.addEventListener) mq.addEventListener('change',refreshTheme); }
new MutationObserver(refreshTheme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
var rt; window.addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(function(){update(); if(!anim.running) drawCell();},80);});
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(function(){ update(); });

readColors(); update(); renderRows();
drawCell();
if(anim.running){ start(); }
else { $('b-anim').textContent='Animation starten'; for(var i=0;i<80;i++) simulate(0.05); drawCell(); }
})();
