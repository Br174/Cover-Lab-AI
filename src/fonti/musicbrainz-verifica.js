const BASE = 'https://musicbrainz.org/ws/2';
const ATTESA_MS = 1100;

function dormi(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizza(valore = '') {
  return String(valore)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function fraseLucene(valore = '') {
  return String(valore).replace(/\\/g, '\\\\').replace(/"/g, '\\"').trim();
}

function artista(recording) {
  return (recording?.['artist-credit'] || [])
    .map(x => x?.name || x?.artist?.name)
    .filter(Boolean)
    .join('');
}

function anno(recording) {
  const prima = String(recording?.['first-release-date'] || '').slice(0, 4);
  if (/^\d{4}$/.test(prima)) return Number(prima);
  const anni = (recording?.releases || [])
    .map(r => String(r?.date || '').slice(0, 4))
    .filter(x => /^\d{4}$/.test(x))
    .map(Number);
  return anni.length ? Math.min(...anni) : null;
}

async function get(url, fetchFn) {
  if (fetchFn === fetch) await dormi(ATTESA_MS);
  const risposta = await fetchFn(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CoverLabAI/0.5 (https://github.com/Br174/Cover-Lab-AI)'
    }
  });
  if (!risposta.ok) {
    const errore = new Error(`MusicBrainz verifica ha risposto ${risposta.status}`);
    errore.status = risposta.status;
    throw errore;
  }
  return risposta.json();
}

export async function verificaCandidatoSuMusicBrainz({
  titolo,
  interprete,
  idOperaOriginale,
  opereDerivate = []
}, fetchFn = fetch) {
  if (!titolo || !interprete || !idOperaOriginale) {
    return { stato: 'dati_insufficienti', verificato: false };
  }

  const q = `recording:"${fraseLucene(titolo)}" AND artist:"${fraseLucene(interprete)}"`;
  const ricerca = await get(
    `${BASE}/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=8`,
    fetchFn
  );

  const titoloAtteso = normalizza(titolo);
  const artistaAtteso = normalizza(interprete);
  const candidati = (ricerca.recordings || [])
    .filter(r => normalizza(r.title) === titoloAtteso)
    .filter(r => normalizza(artista(r)) === artistaAtteso)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 4);

  const derivate = new Map(
    (opereDerivate || [])
      .filter(o => o?.idMusicBrainz)
      .map(o => [o.idMusicBrainz, o])
  );

  for (const breve of candidati) {
    const dettaglio = await get(
      `${BASE}/recording/${breve.id}?inc=work-rels+artist-credits+releases&fmt=json`,
      fetchFn
    );
    const relazioni = (dettaglio.relations || [])
      .filter(r => r?.type === 'performance' && r?.work?.id);

    for (const relazione of relazioni) {
      const idOpera = relazione.work.id;
      const stessa = idOpera === idOperaOriginale;
      const derivata = derivate.get(idOpera) || null;
      if (!stessa && !derivata) continue;

      const attributi = Array.isArray(relazione.attributes)
        ? relazione.attributes.map(x => String(x).toLowerCase())
        : [];
      const tradotta = Boolean(derivata?.tradotta) || attributi.includes('translated');
      const esplicitaCover = attributi.includes('cover');
      const tipo = tradotta ? 'adattamento' : (esplicitaCover ? 'cover' : 'cover');
      const affidabilita = stessa ? 99 : 97;

      return {
        stato: 'verificato',
        verificato: true,
        affidabilita,
        motivo: stessa
          ? 'MusicBrainz collega esplicitamente la registrazione alla composizione originale.'
          : 'MusicBrainz collega la registrazione a una versione derivata nota della composizione.',
        versione: {
          titolo: dettaglio.title || titolo,
          interprete: artista(dettaglio) || interprete,
          anno: anno(dettaglio),
          lingua: derivata?.lingua || null,
          paese: null,
          tipo,
          affidabilita,
          idMusicBrainz: dettaglio.id,
          idOperaMusicBrainz: idOpera,
          titoloOpera: relazione.work.title || derivata?.titolo || null,
          derivazione: !stessa,
          derivazioneTradotta: tradotta,
          statoVerifica: 'verificato_musicbrainz'
        },
        fonte: {
          fonte: 'musicbrainz',
          idEsterno: dettaglio.id,
          indirizzo: `https://musicbrainz.org/recording/${dettaglio.id}`,
          nota: `Relazione performance verso opera ${idOpera}`
        },
        crediti: [
          {
            ruolo: 'interprete',
            nome: artista(dettaglio) || interprete,
            fonte: 'musicbrainz',
            idEsterno: dettaglio.id
          }
        ]
      };
    }
  }

  return {
    stato: candidati.length ? 'non_confermato' : 'non_trovato',
    verificato: false,
    candidatiEsaminati: candidati.length
  };
}
