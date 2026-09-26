const API = 'https://it.wikipedia.org/w/api.php';
const USER_AGENT = 'CoverLabAI/0.8.0 (https://github.com/Br174/Cover-Lab-AI)';

function normalizza(valore = '') {
  return String(valore)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function urlPagina(titolo) {
  return `https://it.wikipedia.org/wiki/${encodeURIComponent(String(titolo || '').trim().replace(/ /g, '_'))}`;
}

function togliTemplate(testo) {
  let s = String(testo || '');
  for (let i = 0; i < 4; i += 1) s = s.replace(/\{\{[^{}]*\}\}/g, ' ');
  return s;
}

export function pulisciWikitesto(testo = '') {
  return togliTemplate(String(testo || ''))
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, ' ')
    .replace(/<ref\b[^>]*\/>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')
    .replace(/\[(?:https?:\/\/[^\s\]]+)(?:\s+([^\]]+))?\]/g, '$1')
    .replace(/'{2,5}/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function livelloTitolo(riga) {
  const m = String(riga || '').match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
  return m ? { livello: m[1].length, titolo: m[2].trim() } : null;
}

function sezioneVersioni(titolo = '') {
  const h = normalizza(titolo);
  return h === 'cover' || h === 'covers' || h === 'reprises' ||
    h.includes('versioni e adattamenti') || h === 'versioni' ||
    h.includes('versions et adaptations') || h.includes('versiones y adaptaciones') ||
    h.includes('cover versions');
}

function tipoDaSezione(titolo = '') {
  const h = normalizza(titolo);
  if (h.includes('strumental')) return 'strumentale';
  if (h.includes('altre lingue') || h.includes('adatt') || h.includes('other language') || h.includes('otras lenguas')) return 'adattamento';
  return 'cover';
}

function interpreteDaRiga(raw, pulita) {
  const link = String(raw || '').match(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/);
  if (link?.[1]) return pulisciWikitesto(link[1]).trim();
  let s = String(pulita || '').replace(/^\*+\s*/, '').trim();
  s = s.split(/\s*\(|\s*[;,]\s*|\s+-\s+/)[0].trim();
  s = s.replace(/^(?:nel|nella|in|dal|dalla)\s+\d{4}\s+/i, '').trim();
  return s.slice(0, 200);
}

function annoDaRiga(riga = '') {
  const m = String(riga).match(/(?:18|19|20|21)\d{2}/);
  return m ? Number(m[0]) : null;
}

export function estraiVersioniDaWikitesto(wikitext, {
  titoloOriginale,
  artistaOriginale = '',
  titoloPagina = titoloOriginale,
  pageid = null
} = {}) {
  const righe = String(wikitext || '').split(/\r?\n/);
  const elementi = [];
  let dentro = false;
  let livelloBase = null;
  let sottoSezione = '';
  let indice = 0;

  for (const riga of righe) {
    const h = livelloTitolo(riga);
    if (h) {
      if (!dentro && sezioneVersioni(h.titolo)) {
        dentro = true;
        livelloBase = h.livello;
        sottoSezione = h.titolo;
        continue;
      }
      if (dentro) {
        if (h.livello <= livelloBase) break;
        sottoSezione = h.titolo;
        continue;
      }
    }
    if (!dentro || !/^\s*\*+\s+/.test(riga)) continue;

    const descrizione = pulisciWikitesto(riga.replace(/^\s*\*+\s*/, ''));
    const interprete = interpreteDaRiga(riga, descrizione);
    if (!interprete || interprete.length < 2) continue;
    if (normalizza(interprete) === normalizza(artistaOriginale)) continue;

    indice += 1;
    const anno = annoDaRiga(descrizione);
    const tipoProposto = tipoDaSezione(sottoSezione);
    elementi.push({
      idEsterno: `${pageid || normalizza(titoloPagina) || 'pagina'}:${indice}`,
      titolo: String(titoloOriginale || titoloPagina || '').trim(),
      interprete,
      anno,
      dataPubblicazione: anno ? `${anno}-01-01` : null,
      tipoProposto,
      descrizione: `[${sottoSezione || 'Cover'}] ${descrizione}`.slice(0, 1000),
      autoreCanale: interprete,
      indirizzo: urlPagina(titoloPagina),
      fonte: 'wikipedia'
    });
  }

  const visti = new Set();
  return elementi.filter(e => {
    const k = `${normalizza(e.titolo)}::${normalizza(e.interprete)}`;
    if (!k || visti.has(k)) return false;
    visti.add(k);
    return true;
  });
}

async function chiama(params, fetchFn, signal = null) {
  const url = `${API}?${new URLSearchParams({
    ...params,
    format: 'json',
    formatversion: '2',
    maxlag: '5'
  }).toString()}`;
  const opzioni = {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }
  };
  if (signal) opzioni.signal = signal;
  const risposta = await fetchFn(url, opzioni);
  if (!risposta.ok) {
    const e = new Error(`Wikipedia/MediaWiki ha risposto ${risposta.status}`);
    e.status = risposta.status;
    e.retryAfter = risposta.headers?.get?.('retry-after') || null;
    throw e;
  }
  const dati = await risposta.json();
  if (dati?.error?.code === 'maxlag') {
    const e = new Error(`Wikipedia/MediaWiki richiede attesa per carico elevato: ${dati.error.info || 'maxlag'}`);
    e.status = 503;
    e.retryAfter = risposta.headers?.get?.('retry-after') || '5';
    throw e;
  }
  return dati;
}

async function parsePagina(titolo, fetchFn, signal) {
  const dati = await chiama({
    action: 'parse',
    page: titolo,
    prop: 'wikitext|sections'
  }, fetchFn, signal);
  if (dati?.error) return null;
  return dati?.parse || null;
}

async function cercaPagina(titolo, artista, fetchFn, signal) {
  const query = [titolo, artista].filter(Boolean).map(x => `"${x}"`).join(' ');
  const dati = await chiama({
    action: 'query',
    list: 'search',
    srsearch: query || titolo,
    srlimit: '5',
    srnamespace: '0'
  }, fetchFn, signal);
  return (dati?.query?.search || []).map(x => x.title).filter(Boolean);
}

export function statoProviderWikipedia() {
  return { provider: 'wikipedia', disponibile: true, stato: 'configurato_senza_chiave' };
}

export async function cercaSuWikipedia({
  titoloOriginale,
  artistaOriginale = '',
  query = null
} = {}, fetchFn = fetch, signal = null) {
  const titolo = String(titoloOriginale || query || '').trim();
  if (!titolo) return { provider: 'wikipedia', stato: 'ok', elementi: [], prossimoCursore: null };

  let pagina = await parsePagina(titolo, fetchFn, signal);
  const artistaNormalizzato = normalizza(artistaOriginale);
  const testoPagina = pagina ? pulisciWikitesto(pagina.wikitext || '') : '';
  const coerente = !artistaNormalizzato || normalizza(testoPagina).includes(artistaNormalizzato);

  if (!pagina || !coerente) {
    const titoli = await cercaPagina(titolo, artistaOriginale, fetchFn, signal);
    pagina = null;
    for (const candidato of titoli.slice(0, 3)) {
      const p = await parsePagina(candidato, fetchFn, signal);
      if (!p) continue;
      const testo = normalizza(pulisciWikitesto(p.wikitext || ''));
      if (!artistaNormalizzato || testo.includes(artistaNormalizzato)) {
        pagina = p;
        break;
      }
    }
  }

  if (!pagina) {
    return {
      provider: 'wikipedia', stato: 'ok', elementi: [], prossimoCursore: null,
      totaleStimato: 0, risultatiPerPagina: 0
    };
  }

  const elementi = estraiVersioniDaWikitesto(pagina.wikitext || '', {
    titoloOriginale: titolo,
    artistaOriginale,
    titoloPagina: pagina.title || titolo,
    pageid: pagina.pageid || null
  });

  return {
    provider: 'wikipedia',
    stato: 'ok',
    query: titolo,
    elementi,
    prossimoCursore: null,
    precedenteCursore: null,
    totaleStimato: elementi.length,
    risultatiPerPagina: elementi.length,
    pagina: pagina.title || titolo,
    indirizzoPagina: urlPagina(pagina.title || titolo)
  };
}
