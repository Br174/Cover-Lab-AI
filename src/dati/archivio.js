import { creaChiaveRicerca, creaChiaveDuplicato } from '../motore/normalizzazione.js';

export async function trovaComposizione(db, titolo, artista) {
  if (!db) return null;
  const chiave = creaChiaveRicerca(titolo, artista);
  return db.prepare('SELECT * FROM composizioni WHERE chiave_ricerca = ?1 LIMIT 1').bind(chiave).first();
}

export async function salvaComposizione(db, composizione, titoloRichiesto, artistaRichiesto) {
  if (!db) return null;
  const id = composizione.idMusicBrainz || crypto.randomUUID();
  const chiave = creaChiaveRicerca(titoloRichiesto, artistaRichiesto);
  await db.prepare(`
    INSERT INTO composizioni (
      id, chiave_ricerca, titolo_canonico, artista_originale, compositore,
      anno_originale, lingua_originale, paese_origine, id_musicbrainz,
      data_ultima_verifica
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, CURRENT_TIMESTAMP)
    ON CONFLICT(chiave_ricerca) DO UPDATE SET
      titolo_canonico=excluded.titolo_canonico,
      artista_originale=COALESCE(excluded.artista_originale, composizioni.artista_originale),
      compositore=COALESCE(excluded.compositore, composizioni.compositore),
      anno_originale=COALESCE(excluded.anno_originale, composizioni.anno_originale),
      lingua_originale=COALESCE(excluded.lingua_originale, composizioni.lingua_originale),
      id_musicbrainz=COALESCE(excluded.id_musicbrainz, composizioni.id_musicbrainz),
      data_ultima_verifica=CURRENT_TIMESTAMP
  `).bind(
    id, chiave, composizione.titoloCanonico, composizione.artistaOriginale,
    composizione.compositore, composizione.annoOriginale, composizione.linguaOriginale,
    composizione.paeseOrigine || null, composizione.idMusicBrainz
  ).run();
  return id;
}

export async function salvaVersioni(db, composizioneId, versioni) {
  if (!db || !versioni.length) return;
  const istruzioni = versioni.map(v => db.prepare(`
    INSERT INTO versioni (
      id, composizione_id, titolo, interprete, anno, lingua, paese, tipo,
      affidabilita, id_musicbrainz, chiave_duplicato, stato_verifica,
      id_opera_musicbrainz, titolo_opera, derivazione, derivazione_tradotta,
      data_ultima_verifica
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, CURRENT_TIMESTAMP)
    ON CONFLICT(composizione_id, id_musicbrainz) WHERE id_musicbrainz IS NOT NULL
    DO UPDATE SET
      titolo=excluded.titolo,
      interprete=excluded.interprete,
      anno=COALESCE(excluded.anno, versioni.anno),
      lingua=COALESCE(excluded.lingua, versioni.lingua),
      paese=COALESCE(excluded.paese, versioni.paese),
      tipo=excluded.tipo,
      affidabilita=MAX(versioni.affidabilita, excluded.affidabilita),
      stato_verifica=excluded.stato_verifica,
      id_opera_musicbrainz=COALESCE(excluded.id_opera_musicbrainz, versioni.id_opera_musicbrainz),
      titolo_opera=COALESCE(excluded.titolo_opera, versioni.titolo_opera),
      derivazione=MAX(versioni.derivazione, excluded.derivazione),
      derivazione_tradotta=MAX(versioni.derivazione_tradotta, excluded.derivazione_tradotta),
      data_ultima_verifica=CURRENT_TIMESTAMP
  `).bind(
    v.id || crypto.randomUUID(), composizioneId, v.titolo, v.interprete, v.anno,
    v.lingua, v.paese, v.tipo, v.affidabilita, v.idMusicBrainz,
    creaChiaveDuplicato(v), v.statoVerifica || 'verificato_metadati',
    v.idOperaMusicBrainz || null, v.titoloOpera || null,
    v.derivazione ? 1 : 0, v.derivazioneTradotta ? 1 : 0
  ));
  await db.batch(istruzioni);
}

export async function caricaVersioni(db, composizioneId, ordine = 'asc') {
  if (!db) return [];
  const direzione = String(ordine).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const risultato = await db.prepare(`
    SELECT id, titolo, interprete, anno, lingua, paese, tipo, affidabilita,
           id_musicbrainz AS idMusicBrainz, stato_verifica AS statoVerifica,
           id_opera_musicbrainz AS idOperaMusicBrainz, titolo_opera AS titoloOpera,
           derivazione, derivazione_tradotta AS derivazioneTradotta
    FROM versioni
    WHERE composizione_id = ?1
    ORDER BY CASE WHEN anno IS NULL THEN 1 ELSE 0 END, anno ${direzione}, interprete COLLATE NOCASE
  `).bind(composizioneId).all();
  return risultato.results || [];
}

export async function registraRicerca(db, dati) {
  if (!db) return;
  await db.prepare(`
    INSERT INTO ricerche (
      id, titolo_richiesto, artista_richiesto, chiave_ricerca, composizione_id,
      candidati, risultati_validi, durata_ms, versione_algoritmo, provenienza
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
  `).bind(
    crypto.randomUUID(), dati.titolo, dati.artista || null,
    creaChiaveRicerca(dati.titolo, dati.artista), dati.composizioneId || null,
    dati.candidati || 0, dati.risultatiValidi || 0, dati.durataMs || 0,
    dati.versioneAlgoritmo, dati.provenienza || 'motore'
  ).run();
}

export async function salvaOpereCollegate(db, composizioneId, opere = []) {
  if (!db || !composizioneId || !opere.length) return;
  const istruzioni = opere.map(o => db.prepare(`
    INSERT INTO opere_collegate (
      composizione_id, id_musicbrainz, titolo, lingua, tipo_relazione,
      tradotta, parodia, data_ultima_verifica
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)
    ON CONFLICT(composizione_id, id_musicbrainz) DO UPDATE SET
      titolo=COALESCE(excluded.titolo, opere_collegate.titolo),
      lingua=COALESCE(excluded.lingua, opere_collegate.lingua),
      tipo_relazione=COALESCE(excluded.tipo_relazione, opere_collegate.tipo_relazione),
      tradotta=MAX(opere_collegate.tradotta, excluded.tradotta),
      parodia=MAX(opere_collegate.parodia, excluded.parodia),
      data_ultima_verifica=CURRENT_TIMESTAMP
  `).bind(
    composizioneId, o.idMusicBrainz, o.titolo || null, o.lingua || null,
    o.tipoRelazione || null, o.tradotta ? 1 : 0, o.parodia ? 1 : 0
  ));
  await db.batch(istruzioni);
}
