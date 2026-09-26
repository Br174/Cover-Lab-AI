const ENDPOINT = 'https://archive.org/advancedsearch.php';

function intero(valore, ripiego, min = 1, max = 100) {
  const n = Number(valore);
  if (!Number.isFinite(n)) return ripiego;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function primoValore(valore) {
  if (Array.isArray(valore)) return valore.find(Boolean) || null;
  return valore || null;
}

function testoDescrizione(doc) {
  const descrizione = primoValore(doc?.description);
  const soggetto = Array.isArray(doc?.subject) ? doc.subject.slice(0, 5).join(', ') : doc?.subject;
  return [doc?.creator, doc?.title, descrizione, soggetto].filter(Boolean).join(' — ').slice(0, 1000);
}

export function statoProviderInternetArchive() {
  return {
    provider: 'internet_archive',
    disponibile: true,
    stato: 'configurato_senza_chiave'
  };
}

export async function cercaSuInternetArchive({
  query,
  pagina = 1,
  limite = 50
} = {}, fetchFn = fetch, signal = null) {
  const testo = String(query || '').trim();
  if (!testo) {
    return {
      provider: 'internet_archive',
      stato: 'ok',
      elementi: [],
      prossimoCursore: null,
      totaleStimato: 0
    };
  }

  const quantita = intero(limite, 50, 1, 100);
  const numeroPagina = intero(pagina, 1, 1, 100000);
  const q = `(${testo}) AND (mediatype:(audio) OR mediatype:(movies))`;
  const params = new URLSearchParams({
    q,
    output: 'json',
    rows: String(quantita),
    page: String(numeroPagina)
  });
  for (const campo of ['identifier', 'title', 'creator', 'date', 'description', 'subject', 'language', 'mediatype']) {
    params.append('fl[]', campo);
  }

  const opzioniFetch = {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CoverLabAI/0.8.0 (https://github.com/Br174/Cover-Lab-AI)'
    }
  };
  if (signal) opzioniFetch.signal = signal;

  const risposta = await fetchFn(`${ENDPOINT}?${params.toString()}`, opzioniFetch);
  if (!risposta.ok) {
    const errore = new Error(`Internet Archive ha risposto ${risposta.status}`);
    errore.status = risposta.status;
    errore.retryAfter = risposta.headers?.get?.('retry-after') || null;
    throw errore;
  }

  const dati = await risposta.json();
  const docs = Array.isArray(dati?.response?.docs) ? dati.response.docs : [];
  const totale = Number(dati?.response?.numFound || 0);
  const elementi = docs
    .filter(doc => doc?.identifier && doc?.title)
    .map(doc => ({
      idEsterno: String(doc.identifier),
      titolo: primoValore(doc.title) || '',
      interprete: primoValore(doc.creator),
      dataPubblicazione: primoValore(doc.date),
      lingua: primoValore(doc.language),
      tipoMedia: primoValore(doc.mediatype),
      indirizzo: `https://archive.org/details/${encodeURIComponent(String(doc.identifier))}`,
      descrizione: testoDescrizione(doc),
      autoreCanale: primoValore(doc.creator) || ''
    }));

  const consumati = numeroPagina * quantita;
  return {
    provider: 'internet_archive',
    stato: 'ok',
    query: testo,
    elementi,
    prossimoCursore: consumati < totale ? String(numeroPagina + 1) : null,
    precedenteCursore: numeroPagina > 1 ? String(numeroPagina - 1) : null,
    totaleStimato: totale,
    risultatiPerPagina: elementi.length
  };
}
