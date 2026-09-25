const BASE = 'https://itunes.apple.com/search';

function paese(valore, ripiego = 'IT') {
  const v = String(valore || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : ripiego;
}

export function statoProviderApple() {
  return { provider: 'apple_catalogo', disponibile: true, stato: 'configurato_senza_chiave' };
}

export async function cercaNelCatalogoApple({
  query,
  paeseRicerca = 'IT',
  limite = 50
}, fetchFn = fetch, signal = null) {
  const testo = String(query || '').trim();
  if (!testo) return { elementi: [], totale: 0 };
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
    const errore = new Error(`Apple Search API ha risposto ${risposta.status}`);
    errore.status = risposta.status;
    throw errore;
  }
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
