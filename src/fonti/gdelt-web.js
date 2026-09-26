const ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc';

function intero(valore, ripiego, minimo = 1, massimo = 75) {
  const n = Number(valore);
  if (!Number.isFinite(n)) return ripiego;
  return Math.max(minimo, Math.min(massimo, Math.round(n)));
}

function testo(valore, massimo = 1200) {
  return String(valore || '').trim().slice(0, massimo);
}

function articoliDaPayload(dati) {
  if (Array.isArray(dati?.articles)) return dati.articles;
  if (Array.isArray(dati?.results)) return dati.results;
  if (Array.isArray(dati)) return dati;
  return [];
}

export function statoProviderWebEditoriale() {
  return {
    provider: 'web_editoriale',
    disponibile: true,
    stato: 'configurato_senza_chiave'
  };
}

export async function cercaSuWebEditoriale({
  query,
  limite = 25
} = {}, fetchFn = fetch, signal = null) {
  const q = testo(query, 500);
  if (!q) {
    return {
      provider: 'web_editoriale',
      disponibile: true,
      stato: 'ok',
      query: q,
      elementi: [],
      prossimoCursore: null,
      totaleStimato: 0
    };
  }

  // DOC 2.0 e preferito a Context 2.0 perche il Context e pensato per
  // finestre molto recenti. DOC resta comunque una fonte editoriale
  // complementare: non sostituisce cataloghi o pagine ufficiali.
  const params = new URLSearchParams({
    query: q,
    mode: 'artlist',
    maxrecords: String(intero(limite, 25)),
    timespan: '1y',
    format: 'json'
  });

  const opzioni = {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CoverLabAI/0.8 (+public-web-verification)'
    }
  };
  if (signal) opzioni.signal = signal;

  const risposta = await fetchFn(`${ENDPOINT}?${params.toString()}`, opzioni);
  if (!risposta.ok) {
    const errore = new Error(`GDELT DOC API ha risposto ${risposta.status}`);
    errore.status = risposta.status;
    errore.retryAfter = risposta.headers?.get?.('retry-after') || null;
    throw errore;
  }

  const dati = await risposta.json();
  const articoli = articoliDaPayload(dati);
  const elementi = articoli
    .map((a, indice) => {
      const indirizzo = testo(a?.url || a?.link, 1000) || null;
      const titoloArticolo = testo(a?.title || a?.name, 500);
      const dominio = testo(a?.domain || a?.source || a?.outlet, 200) || null;
      if (!indirizzo && !titoloArticolo) return null;
      return {
        idEsterno: indirizzo || `gdelt-${indice}`,
        titolo: titoloArticolo || q,
        interprete: null,
        indirizzo,
        descrizione: [dominio, titoloArticolo].filter(Boolean).join(' — '),
        autoreCanale: dominio,
        dataPubblicazione: testo(a?.seendate || a?.date || a?.published, 80) || null,
        lingua: testo(a?.language || a?.lang, 40) || null,
        paese: testo(a?.sourcecountry || a?.country, 80) || null,
        fonte: 'web_editoriale'
      };
    })
    .filter(Boolean);

  return {
    provider: 'web_editoriale',
    disponibile: true,
    stato: 'ok',
    query: q,
    elementi,
    prossimoCursore: null,
    precedenteCursore: null,
    totaleStimato: elementi.length,
    risultatiPerPagina: elementi.length
  };
}
