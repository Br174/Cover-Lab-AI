const BASE = 'https://musicbrainz.org/ws/2';
const ATTESA_MINIMA_MS = 1050;
let ultimoAccesso = 0;

function dormi(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function richiesta(url, fetchFn = fetch) {
  if (fetchFn === fetch) {
    const attesa = Math.max(0, ATTESA_MINIMA_MS - (Date.now() - ultimoAccesso));
    if (attesa) await dormi(attesa);
    ultimoAccesso = Date.now();
  }

  const risposta = await fetchFn(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'CoverLabAI/0.2 (https://github.com/Br174/Cover-Lab-AI)'
    }
  });
  if (!risposta.ok) throw new Error(`MusicBrainz ha risposto ${risposta.status}`);
  return risposta.json();
}

function normalizzaConfronto(valore) {
  return String(valore || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .toLocaleLowerCase('it')
    .replace(/\s+/g, ' ')
    .trim();
}

function fraseLucene(valore) {
  return String(valore || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .trim();
}

function creditoArtista(recording) {
  const crediti = recording?.['artist-credit'] || [];
  return crediti.map(x => x?.name || x?.artist?.name).filter(Boolean).join('');
}

function annoDaRelease(recording) {
  const anni = (recording?.releases || [])
    .map(r => String(r.date || '').slice(0, 4))
    .filter(x => /^\d{4}$/.test(x))
    .map(Number);
  return anni.length ? Math.min(...anni) : null;
}

function relazioneOpera(recording) {
  return (recording?.relations || []).find(r => r.type === 'performance' && r.work);
}

function attributiRelazione(relazione) {
  return Array.isArray(relazione?.attributes) ? relazione.attributes : [];
}

function operaDerivataDaRelazione(relazione, idOperaBase) {
  if (!relazione?.work?.id || relazione.work.id === idOperaBase) return null;
  const attributi = (relazione.attributes || []).map(x => String(x).toLowerCase());
  const tipo = String(relazione.type || '').toLowerCase();
  const tradotta = attributi.includes('translated') || attributi.includes('tradotto');
  const parodia = attributi.includes('parody') || attributi.includes('parodia');
  const eVersione = tipo === 'other version' || tipo.includes('version');
  if (!eVersione && !tradotta && !parodia) return null;

  return {
    idMusicBrainz: relazione.work.id,
    titolo: relazione.work.title || null,
    tipoRelazione: relazione.type || 'other version',
    direzione: relazione.direction || null,
    tradotta,
    parodia,
    attributi
  };
}

function estraiOpereDerivate(opera) {
  const viste = new Set();
  const risultato = [];
  for (const relazione of opera?.relations || []) {
    const derivata = operaDerivataDaRelazione(relazione, opera.id);
    if (!derivata || viste.has(derivata.idMusicBrainz)) continue;
    viste.add(derivata.idMusicBrainz);
    risultato.push(derivata);
  }
  return risultato;
}

function compositoriOpera(opera) {
  return (opera?.relations || [])
    .filter(r => ['composer', 'lyricist and composer'].includes(r.type) && r.artist)
    .map(r => r.artist.name)
    .filter(Boolean)
    .join(', ') || null;
}

async function dettaglioOpera(idOpera, titoloRichiesto, artistaRichiesto, fetchFn, extra = {}) {
  const opera = await richiesta(
    `${BASE}/work/${idOpera}?inc=aliases+artist-rels+work-rels&fmt=json`,
    fetchFn
  );
  return {
    idMusicBrainz: opera.id,
    titoloCanonico: opera.title || titoloRichiesto,
    artistaOriginale: artistaRichiesto,
    annoOriginale: extra.annoOriginale ?? null,
    linguaOriginale: opera.language || null,
    compositore: compositoriOpera(opera),
    opereDerivate: estraiOpereDerivate(opera),
    registrazioneRiferimento: extra.registrazioneRiferimento || null,
    metodoIndividuazione: extra.metodoIndividuazione || 'opera'
  };
}

function opereEsatte(ricerca, titolo) {
  const atteso = normalizzaConfronto(titolo);
  return (ricerca?.works || [])
    .filter(w => Number(w.score || 0) >= 90 && normalizzaConfronto(w.title) === atteso)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
}

async function cercaOperaDiretta(titolo, artista, fetchFn) {
  const q = `work:\"${fraseLucene(titolo)}\" AND artist:\"${fraseLucene(artista)}\"`;
  const ricerca = await richiesta(
    `${BASE}/work/?query=${encodeURIComponent(q)}&fmt=json&limit=5`,
    fetchFn
  );
  const esatte = opereEsatte(ricerca, titolo);
  if (!esatte.length) return null;
  return dettaglioOpera(esatte[0].id, titolo, artista, fetchFn, {
    metodoIndividuazione: 'opera per titolo e artista'
  });
}

async function cercaOperaDaRegistrazioni(titolo, artista, fetchFn) {
  const q = `recording:\"${fraseLucene(titolo)}\" AND artist:\"${fraseLucene(artista)}\"`;
  const ricerca = await richiesta(
    `${BASE}/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=10`,
    fetchFn
  );

  const titoloAtteso = normalizzaConfronto(titolo);
  const artistaAtteso = normalizzaConfronto(artista);
  const candidati = (ricerca.recordings || [])
    .filter(r => normalizzaConfronto(r.title) === titoloAtteso)
    .filter(r => !artistaAtteso || normalizzaConfronto(creditoArtista(r)) === artistaAtteso)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 5);

  for (const candidato of candidati) {
    const dettaglio = await richiesta(
      `${BASE}/recording/${candidato.id}?inc=work-rels+artist-credits+releases&fmt=json`,
      fetchFn
    );
    const relazione = relazioneOpera(dettaglio);
    if (!relazione?.work?.id) continue;
    return dettaglioOpera(relazione.work.id, titolo, artista, fetchFn, {
      annoOriginale: annoDaRelease(dettaglio),
      registrazioneRiferimento: dettaglio.id,
      metodoIndividuazione: 'registrazione collegata a opera'
    });
  }
  return null;
}

async function cercaOperaUnicaPerTitolo(titolo, artista, fetchFn) {
  const q = `work:\"${fraseLucene(titolo)}\"`;
  const ricerca = await richiesta(
    `${BASE}/work/?query=${encodeURIComponent(q)}&fmt=json&limit=10`,
    fetchFn
  );
  const esatte = opereEsatte(ricerca, titolo);
  if (esatte.length !== 1) return null;
  return dettaglioOpera(esatte[0].id, titolo, artista, fetchFn, {
    metodoIndividuazione: 'opera unica per titolo'
  });
}

export async function individuaComposizione(titolo, artista, fetchFn = fetch) {
  // Percorso rapido: quando MusicBrainz collega l'artista direttamente all'opera
  // (compositore, autore, ecc.), bastano ricerca opera + dettaglio opera.
  const diretta = await cercaOperaDiretta(titolo, artista, fetchFn);
  if (diretta) return diretta;

  // Percorso robusto: non ci si ferma al primo recording con punteggio alto.
  // Si scorrono più candidati fino a trovare una relazione performance -> opera.
  const daRegistrazione = await cercaOperaDaRegistrazioni(titolo, artista, fetchFn);
  if (daRegistrazione) return daRegistrazione;

  // Ultima possibilità sicura: titolo che identifica una sola opera esatta.
  return cercaOperaUnicaPerTitolo(titolo, artista, fetchFn);
}

export async function elencaRegistrazioniOpera(idOpera, fetchFn = fetch, limite = 100, offset = 0, metadatiOpera = {}) {
  const dati = await richiesta(
    `${BASE}/recording?work=${encodeURIComponent(idOpera)}&fmt=json&limit=${limite}&offset=${offset}&inc=artist-credits+releases+work-rels`,
    fetchFn
  );

  return {
    totale: dati['recording-count'] ?? dati.count ?? 0,
    registrazioni: (dati.recordings || []).map(r => {
      const rel = relazioneOpera(r);
      return {
        idMusicBrainz: r.id,
        titolo: r.title,
        interprete: creditoArtista(r) || 'Interprete non indicato',
        anno: annoDaRelease(r),
        lingua: metadatiOpera.lingua || null,
        paese: metadatiOpera.paese || null,
        attributi: attributiRelazione(rel),
        stessaComposizione: true,
        derivazione: Boolean(metadatiOpera.derivazione),
        derivazioneTradotta: Boolean(metadatiOpera.tradotta),
        idOperaMusicBrainz: idOpera,
        titoloOpera: metadatiOpera.titolo || null
      };
    })
  };
}

export async function approfondisciOpereDerivate(opere = [], fetchFn = fetch, massimoOpere = 2) {
  const selezionate = opere
    .filter(o => o && o.idMusicBrainz && !o.parodia)
    .sort((a, b) => Number(b.tradotta) - Number(a.tradotta))
    .slice(0, Math.max(0, massimoOpere));

  const registrazioni = [];
  const opereAnalizzate = [];

  for (const operaBreve of selezionate) {
    const opera = await richiesta(
      `${BASE}/work/${operaBreve.idMusicBrainz}?inc=artist-rels+work-rels&fmt=json`,
      fetchFn
    );
    const elenco = await elencaRegistrazioniOpera(opera.id, fetchFn, 100, 0, {
      titolo: opera.title || operaBreve.titolo,
      lingua: opera.language || null,
      derivazione: true,
      tradotta: operaBreve.tradotta
    });
    registrazioni.push(...elenco.registrazioni);
    opereAnalizzate.push({
      idMusicBrainz: opera.id,
      titolo: opera.title || operaBreve.titolo,
      lingua: opera.language || null,
      tradotta: operaBreve.tradotta,
      registrazioni: elenco.registrazioni.length,
      totaleRegistrazioni: elenco.totale
    });
  }

  return { registrazioni, opereAnalizzate };
}
