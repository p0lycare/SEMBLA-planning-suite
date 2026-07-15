//__SEMBLA_OBJLOADER_START__
/* SEMBLA – OBJ-Loader (Single Source).
   Bauteilgeometrie (i2/i3) wird NICHT mehr ins Werkzeug eingebettet, sondern zur Laufzeit
   per Datei-Upload geladen. Läuft komplett lokal im Browser (kein Upload ins Netz); die
   Dateien werden in localStorage gemerkt, damit man sie nur einmal wählen muss.
   Erwartet leere Elemente <script id="obj-i2"> / <script id="obj-i3"> und optional die
   Bedien-Elemente #objI2, #objI3, #objClear, #objStatus.
   Verteilung: build-manager.mjs bettet diesen Block ein; in Modul-3D ist er inline gepflegt. */
(function(){
  const KEY={i2:'sembla.obj.i2',i3:'sembla.obj.i3'};
  const el=t=>document.getElementById('obj-'+t);
  const has=t=>{const e=el(t);return !!(e&&(e.textContent||'').trim());};
  function status(){ const s=document.getElementById('objStatus');
    if(s) s.textContent='Geometrie geladen — i2: '+(has('i2')?'✓':'—')+'   ·   i3: '+(has('i3')?'✓':'—')
      +(has('i2')&&has('i3')?'' : '   (i2_SEMBLA.obj / i3_SEMBLA.obj wählen)'); }
  function refresh(){ // vorhandene Verarbeitung im jeweiligen Tool neu anstoßen, falls vorhanden
    try{ if(typeof OBJCACHE==='object'){ delete OBJCACHE.i2; delete OBJCACHE.i3; } }catch(e){}
    try{ const cr=document.getElementById('cReal'); if(cr&&!cr.checked&&(has('i2')||has('i3'))){ cr.checked=true; if(typeof opt==='object') opt.real=true; } }catch(e){}
    try{ if(typeof WALL!=='undefined'&&WALL&&typeof build==='function') build(WALL); }catch(e){}
  }
  function set(t,text){ const e=el(t); if(!e)return; e.textContent=text;
    try{ localStorage.setItem(KEY[t],text); }catch(e){} status(); refresh(); }
  function restore(){ for(const t of ['i2','i3']){ try{ const v=localStorage.getItem(KEY[t]); if(v&&el(t)&&!(el(t).textContent||'').trim()) el(t).textContent=v; }catch(e){} } status(); refresh(); }
  ['i2','i3'].forEach(t=>{ const inp=document.getElementById('obj'+t.toUpperCase());
    if(inp) inp.addEventListener('change',ev=>{ const f=ev.target.files&&ev.target.files[0]; if(!f)return;
      const rd=new FileReader(); rd.onload=()=>set(t,String(rd.result||'')); rd.readAsText(f); ev.target.value=''; }); });
  const clr=document.getElementById('objClear');
  if(clr) clr.addEventListener('click',()=>{ for(const t of ['i2','i3']){ try{localStorage.removeItem(KEY[t]);}catch(e){} const e=el(t); if(e)e.textContent=''; } status(); refresh(); });
  restore();
})();
//__SEMBLA_OBJLOADER_END__
