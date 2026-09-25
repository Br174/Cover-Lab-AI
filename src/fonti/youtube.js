const ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';

export function statoProviderYouTube(env) {
  return env?.YOUTUBE_API_KEY
    ? { disponibile: true, stato: 'configurato' }
    : { disponibile: false, stato: 'chiave_da_configurare' };
}

export async function cercaSuYouTube({
  query,
  lingua = null,
  paese = null,
  pageToken = null,
  maxResults = 50
}, env, fetchFn = fetch) {
  const stato = statoProviderYouTube(env);
  if (!stato.disponibile) {
    return {
      ...stato,
      provider: 'youtube',
      query,
      elementi: [],
      prossimoCursore: null
    };
  }

  const parametri = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    q: String(query || '').trim(),
    maxResults: String(Math.max(1, Math.min(50, Number(maxResults) || 50))),
    key: env.YOUTUBE_API_KEY
  });
  if (lingua) parametri.set('relevanceLanguage', String(lingua).slice(0, 8));
  if (paese && /^[A-Za-z]{2}$/.test(String(paese))) parametri.set('regionCode', String(paese).toUpperCase());
  if (pageToken) parametri.set('pageToken', String(pageToken));

  const risposta = await fetchFn(`${ENDPOINT}?${parametri.toString()}`, {
    headers: { Accept: 'application/json' }
  });

  if (!risposta.ok) {
    let dettaglio = '';
    try {
      const corpo = await risposta.json();
      dettaglio = corpo?.error?.message || '';
    } catch { /* ignora */ }
    const errore = new Error(`YouTube ha risposto ${risposta.status}${dettaglio ? `: ${dettaglio}` : ''}`);
    errore.status = risposta.status;
    throw errore;
  }

  const dati = await risposta.json();
  const elementi = (dati.items || [])
    .map(item => {
      const videoId = item?.id?.videoId;
      const snippet = item?.snippet || {};
      if (!videoId) return null;
      return {
        idEsterno: videoId,
        titolo: snippet.title || '',
        descrizione: snippet.description || '',
        autoreCanale: snippet.channelTitle || '',
        canaleId: snippet.channelId || null,
        dataPubblicazione: snippet.publishedAt || null,
        indirizzo: `https://www.youtube.com/watch?v=${videoId}`,
        fonte: 'youtube'
      };
    })
    .filter(Boolean);

  return {
    disponibile: true,
    stato: 'ok',
    provider: 'youtube',
    query,
    elementi,
    prossimoCursore: dati.nextPageToken || null,
    precedenteCursore: dati.prevPageToken || null,
    totaleStimato: Number(dati?.pageInfo?.totalResults || 0),
    risultatiPerPagina: Number(dati?.pageInfo?.resultsPerPage || elementi.length)
  };
}
