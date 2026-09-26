export function paginaArchivioCloud() {
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cover Lab AI · Archivio Cloud</title>
<style>
:root{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#151515;background:#f6f7f8}
*{box-sizing:border-box}body{margin:0}.wrap{max-width:920px;margin:auto;padding:24px 16px 60px}
h1{font-size:28px;margin:0 0 4px}.sub{color:#697078;margin:0 0 20px}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:14px 0 22px}
.card,.result{background:white;border:1px solid #e5e7ea;border-radius:14px;padding:14px}.n{font-size:24px;font-weight:700}.l{font-size:12px;color:#747b83;margin-top:3px}
.search{display:flex;gap:8px;margin:0 0 14px}.search input{flex:1;border:1px solid #cfd4da;border-radius:12px;padding:14px;font-size:16px}.search button,.more{border:0;border-radius:12px;padding:0 18px;background:#1d72e8;color:white;font-weight:650}.more{padding:11px 16px;margin-top:12px}
#status{font-size:13px;color:#697078;margin:8px 2px 14px}.result{margin:9px 0;cursor:pointer}.result strong{display:block;font-size:17px}.meta{font-size:13px;color:#6d747b;margin-top:4px}.badge{display:inline-block;font-size:10px;font-weight:700;border:1px solid #cfd4da;border-radius:999px;padding:3px 7px;margin-left:6px;vertical-align:2px}
.versione{padding:12px 0;border-bottom:1px solid #eceef0}.versione:last-child{border-bottom:0}.crediti{font-size:12px;color:#535a61;margin-top:4px}.fonti{font-size:11px;color:#757b82;margin-top:3px}
@media(max-width:560px){.search{display:block}.search button{width:100%;height:46px;margin-top:8px}}
</style>
</head>
<body><main class="wrap">
<h1>Archivio Cover Lab</h1>
<p class="sub">Archivio cloud certificato. Nessun elenco infinito: cerca soltanto ciò che ti interessa.</p>
<section class="stats">
<div class="card"><div class="n" id="brani">–</div><div class="l">Brani presenti in archivio</div></div>
<div class="card"><div class="n" id="versioni">–</div><div class="l">Versioni / cover archiviate</div></div>
<div class="card"><div class="n" id="nuove">–</div><div class="l">Nuove nell'ultimo aggiornamento</div></div>
<div class="card"><div class="n" id="aggiornamento">–</div><div class="l">Ultimo aggiornamento</div></div>
</section>
<div class="search"><input id="q" autocomplete="off" placeholder="Cerca titolo, artista, adattamento…"><button id="cerca">CERCA</button></div>
<div id="status">Scrivi un titolo o un artista per entrare nel relativo dossier.</div>
<section id="risultati"></section>
<section id="dossier"></section>
</main>
<script>
const $=id=>document.getElementById(id);let dossier=null;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function stats(){const d=await fetch('/api/archivio/statistiche').then(r=>r.json());$('brani').textContent=d.braniPresenti??0;$('versioni').textContent=d.versioniArchiviate??0;$('nuove').textContent='+'+(d.nuoveUltimoAggiornamento??0);$('aggiornamento').textContent=d.ultimoAggiornamento?new Date(d.ultimoAggiornamento+'Z').toLocaleDateString('it-IT'):'–'}
async function cerca(){const q=$('q').value.trim();$('dossier').innerHTML='';if(!q){$('status').textContent='Scrivi qualcosa da cercare.';return}$('status').textContent='Ricerca nell archivio…';const d=await fetch('/api/archivio/cerca?q='+encodeURIComponent(q)).then(r=>r.json());const rr=d.risultati||[];$('status').textContent=rr.length?rr.length+' brani corrispondenti':'Nessun brano certificato corrispondente.';$('risultati').innerHTML=rr.map((r,i)=>'<article class="result" data-i="'+i+'"><strong>'+esc(r.artista||'')+' — '+esc(r.titolo)+'</strong><div class="meta">'+esc(r.anno||'anno non disponibile')+' · '+esc(r.versioniArchiviate)+' versioni archiviate</div></article>').join('');[...document.querySelectorAll('.result')].forEach(el=>el.onclick=()=>apri(rr[Number(el.dataset.i)],0,true));}
async function apri(r,offset=0,reset=false){if(reset){dossier=r;$('dossier').innerHTML='<h2>'+esc(r.artista||'')+' — '+esc(r.titolo)+'</h2><div id="lista"></div>'}const d=await fetch('/api/versioni?titolo='+encodeURIComponent(r.titolo)+'&artista='+encodeURIComponent(r.artista||'')+'&offset='+offset).then(x=>x.json());const lista=$('lista');if(!lista)return;const html=(d.versioni||[]).map(v=>{const cr=(v.crediti||[]).map(c=>esc(c.ruolo)+' — '+esc(c.nome)).join(' · ');const fo=(v.fonti||[]).map(f=>esc(f.fonte)).filter((x,i,a)=>a.indexOf(x)===i).join(', ');return '<div class="versione"><strong>'+esc(v.interprete)+' — '+esc(v.titolo)+' <span class="badge">ARCHIVIO</span></strong><div class="meta">'+esc(v.anno||'anno n/d')+' · '+esc(v.tipo||'cover')+' · '+esc(v.lingua||'lingua n/d')+'</div>'+(cr?'<div class="crediti">Crediti: '+cr+'</div>':'')+(fo?'<div class="fonti">Fonti: '+fo+'</div>':'')+'</div>'}).join('');lista.insertAdjacentHTML('beforeend',html);document.querySelectorAll('.more').forEach(x=>x.remove());if(d.prossimoOffset!=null){const b=document.createElement('button');b.className='more';b.textContent='CARICA ALTRE 20';b.onclick=()=>apri(dossier,d.prossimoOffset,false);$('dossier').appendChild(b)}}
$('cerca').onclick=cerca;$('q').addEventListener('keydown',e=>{if(e.key==='Enter')cerca()});stats();
</script></body></html>`;
}
