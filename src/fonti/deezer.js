const ENDPOINT = 'https://api.deezer.com/search/track';

function intero(valore, ripiego, minimo = 0, massimo = 100) {
  const n = Number(valore);
  if (!Number.isFinite(n)) return ripiego;
  return Math.max(minimo, Math.min(massimo, Math.round(n)));
}

function prossimoIndice(indirizzo) {
  if (!indirizzo) return null;
  try {
    const u = new URL(indirizzo);
    const indice = Number(u.searchParams.get('index'));
    return Number.isFinite(indice) && indice >= 0 ? String(indice) : null;
  } catch {
    return null;
  }
}

export function statoProviderDeezer() {
  return {
    provider: 'deezer',
    disponibile: true,
    stato: 'configurato_senza_chiave'
  };
}

export async function cercaSuDeezer({
  query,
  cursore = null,
  limite = 50
} = {}, fetchFn = fetch, signal = null) {
  const testo = String(query || '').trim();
  if (!testo) {
    return {
      provider: 'deezer',
      disponibile: true,
      stato: 'ok',
      query: testo,
      elementi: [],
      prossimoCursore: null,
      totaleStimato: 0
    };
  }

  const params = new URLSearchParams({
    q: testo,
    limit: String(intero(limite, 50, 1, 100)),
    index: String(intero(cursore, 0, 0, 1000000))
  });
  const opzioni = {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CoverLabAI/0.8 (+metadata-verification)'
    }
  };
  if (signal) opzioni.signal = signal;

  const risposta = await fetchFn(`${ENDPOINT}?${params.toString()}`, opzioni);
  if (!risposta.ok) {
    const errore = new Error(`Deezer ha risposto ${risposta.status}`);
    errore.status = risposta.status;
    errore.retryAfter = risposta.headers?.get?.('retry-after') || null;
    throw errore;
  }

  const dati = await risposta.json();
  const elementi = (Array.isArray(dati?.data) ? dati.data : [])
    .map(r => {
      const titolo = String(r?.title || r?.title_short || '').trim();
      const interprete = String(r?.artist?.name || '').trim();
      if (!titolo || !interprete) return null;
      const album = String(r?.album?.title || '').trim() || null;
      const isrc = String(r?.isrc || '').trim() || null;
      return {
        idEsterno: r?.id != null ? String(r.id) : null,
        titolo,
        interprete,
        album,
        isrc,
        durataSecondi: Number.isFinite(Number(r?.duration)) ? Number(r.duration) : null,
        indirizzo: r?.link || null,
        descrizione: [interprete, titolo, album, isrc ? `ISRC ${isrc}` : null]
          .filter(Boolean)
          .join(' — '),
        autoreCanale: interprete,
        dataPubblicazione: null,
        fonte: 'deezer'
      };
    })
    .filter(Boolean);

  return {
    provider: 'deezer',
    disponibile: true,
    stato: 'ok',
    query: testo,
    elementi,
    prossimoCursore: prossimoIndice(dati?.next),
    precedenteCursore: prossimoIndice(dati?.prev),
    totaleStimato: Number(dati?.total || elementi.length),
    risultatiPerPagina: elementi.length
  };
}
