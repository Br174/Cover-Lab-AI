const BASE = 'https://itunes.apple.com/search';
let limitatoFinoMs = 0;

function paese(valore, ripiego = 'IT') {
  const v = String(valore || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : ripiego;
}

function retryAfterMs(risposta) {
  const valore = risposta?.headers?.get?.('retry-after');
  const secondi = Number(valore || 0);
  if (Number.isFinite(secondi) && secondi > 0) return Math.min(10 * 60 * 1000, secondi * 1000);
  return 60 * 1000;
}

function errore429(attesaMs) {
  const errore = new Error(`Apple Search API temporaneamente limitata (429). Nuovo tentativo non prima di ${Math.ceil(attesaMs / 1000)} secondi.`);
  errore.status = 429;
  errore.retryAfterMs = attesaMs;
  return errore;
}

export function statoProviderApple() {
  const residuo = Math.max(0, limitatoFinoMs - Date.now());
  return {
    provider: 'apple_catalogo',
    disponibile: true,
    stato: residuo > 0 ? 'limitato_temporaneamente' : 'configurato_senza_chiave',
    ...(residuo > 0 ? { riprovaTraMs: residuo } : {})
  };
}

export async function cercaNelCatalogoApple({
  query,
  paeseRicerca = 'IT',
  limite = 50
}, fetchFn = fetch, signal = null) {
  const testo = String(query || '').trim();
  if (!testo) return { elementi: [], totale: 0 };

  const ora = Date.now();
  if (ora < limitatoFinoMs) {
    throw errore429(limitatoFinoMs - ora);
  }

  const quantita = Math.max(1, Math.min(100, Number(limite) || 50));
  const params = new URLSearchParams({
    term: testo,
    media: 'music',
    entity: 'song',
    country: paese(paeseRicerca),
    limit: String(quantita),
    explicit: 'Yes'
  });

  const opzioniFetch = { headers: { Accept: 'application/json' } };
  if (signal) opzioniFetch.signal = signal;
  const risposta = await fetchFn(`${BASE}?${params.toString()}`, opzioniFetch);
  if (!risposta.ok) {
    if (Number(risposta.status) === 429) {
      const attesa = retryAfterMs(risposta);
      limitatoFinoMs = Date.now() + attesa;
      throw errore429(attesa);
    }
    const errore = new Error(`Apple Search API ha risposto ${risposta.status}`);
    errore.status = risposta.status;
    throw errore;
  }

  // Una risposta riuscita riapre subito il provider.
  limitatoFinoMs = 0;
  const dati = await risposta.json();
  const risultati = Array.isArray(dati?.results) ? dati.results : [];
  const elementi = risultati
    .filter(r => r?.kind === 'song' && r?.trackName && r?.artistName)
    .map(r => ({
      idEsterno: r.trackId != null ? String(r.trackId) : null,
      titolo: r.trackName,
      interprete: r.artistName,
      album: r.collectionName || null,
      dataPubblicazione: r.releaseDate || null,
      paese: r.country || paese(paeseRicerca),
      genere: r.primaryGenreName || null,
      indirizzo: r.trackViewUrl || null,
      descrizione: [r.artistName, r.trackName, r.collectionName, r.primaryGenreName]
        .filter(Boolean)
        .join(' — '),
      autoreCanale: r.artistName
    }));

  return {
    provider: 'apple_catalogo',
    paese: paese(paeseRicerca),
    totale: Number(dati?.resultCount || elementi.length),
    elementi
  };
}
