import { creaChiaveRicerca } from '../motore/normalizzazione.js';
import { aggiungiFontiECrediti } from './dettagli-versioni.js';
import { leggiCreditiComposizione } from './crediti-composizione.js';

function interoPositivo(valore, ripiego, massimo = 1000) {
  const n = Number(valore);
  if (!Number.isFinite(n) || n <= 0) return ripiego;
  return Math.min(Math.floor(n), massimo);
}

function creditiComposizioneDaRiga(composizione = {}) {
  const nomi = String(composizione.compositore || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);
  return nomi.map(nome => ({
    ruolo: 'compositore',
    nome,
    fonte: composizione.id_musicbrainz ? 'musicbrainz' : null
  }));
}

export async function leggiConfigurazioneArchivioVivo(db) {
  if (!db) return {};
  try {
    const risultato = await db.prepare(
      'SELECT chiave, valore FROM configurazione_archivio_vivo'
    ).all();
    return Object.fromEntries((risultato.results || []).map(r => [r.chiave, r.valore]));
  } catch (e) {
    if (String(e?.message || '').includes('no such table')) return {};
    throw e;
  }
}

export async function accodaArchivioVivo(db, {
  titolo,
  artista = '',
  paese = null,
  lingua = null,
  priorita = 80,
  motivo = 'richiesta Music Lab'
}) {
  if (!db || !titolo) return { stato: 'non_disponibile' };
  const chiave = creaChiaveRicerca(titolo, artista);
  try {
    await db.prepare(`
      INSERT INTO coda_archivio_vivo (
        id, chiave_ricerca, titolo, artista, paese, lingua,
        priorita, motivo, stato, prossima_esecuzione, aggiornato_il
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'in_attesa', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(chiave_ricerca) DO UPDATE SET
        titolo=excluded.titolo,
        artista=COALESCE(excluded.artista, coda_archivio_vivo.artista),
        paese=COALESCE(excluded.paese, coda_archivio_vivo.paese),
        lingua=COALESCE(excluded.lingua, coda_archivio_vivo.lingua),
        priorita=MAX(coda_archivio_vivo.priorita, excluded.priorita),
        motivo=excluded.motivo,
        stato=CASE
          WHEN coda_archivio_vivo.stato = 'in_esecuzione' THEN coda_archivio_vivo.stato
          ELSE 'in_attesa'
        END,
        prossima_esecuzione=CASE
          WHEN coda_archivio_vivo.stato = 'in_esecuzione' THEN coda_archivio_vivo.prossima_esecuzione
          ELSE CURRENT_TIMESTAMP
        END,
        aggiornato_il=CURRENT_TIMESTAMP
    `).bind(
      crypto.randomUUID(), chiave, titolo, artista || null, paese, lingua,
      Math.max(1, Math.min(100, Number(priorita) || 50)), motivo
    ).run();
    return { stato: 'accodata', chiaveRicerca: chiave };
  } catch (e) {
    if (String(e?.message || '').includes('no such table')) {
      return { stato: 'migrazione_non_applicata', chiaveRicerca: chiave };
    }
    throw e;
  }
}

export async function prossimeVociArchivioVivo(db, limite = 1) {
  if (!db) return [];
  const quantita = interoPositivo(limite, 1, 10);
  const risultato = await db.prepare(`
    SELECT *
    FROM coda_archivio_vivo
    WHERE stato IN ('in_attesa', 'da_ricontrollare', 'errore')
      AND datetime(prossima_esecuzione) <= datetime('now')
    ORDER BY priorita DESC,
             CASE WHEN ultimo_successo IS NULL THEN 0 ELSE 1 END,
             datetime(COALESCE(ultimo_successo, creato_il)) ASC
    LIMIT ?1
  `).bind(quantita).all();
  return risultato.results || [];
}

export async function segnaVoceInEsecuzione(db, id) {
  await db.prepare(`
    UPDATE coda_archivio_vivo
    SET stato='in_esecuzione', ultimo_tentativo=CURRENT_TIMESTAMP,
        tentativi=tentativi+1, ultimo_errore=NULL, aggiornato_il=CURRENT_TIMESTAMP
    WHERE id=?1
  `).bind(id).run();
}

export async function segnaVoceCompletata(db, id, ricontrolloOre = 168, cursore = null) {
  const ore = interoPositivo(ricontrolloOre, 168, 24 * 365);
  await db.prepare(`
    UPDATE coda_archivio_vivo
    SET stato='da_ricontrollare',
        ultimo_successo=CURRENT_TIMESTAMP,
        ultimo_errore=NULL,
        cicli_completati=cicli_completati+1,
        cursore_json=?2,
        prossima_esecuzione=datetime('now', ?3),
        aggiornato_il=CURRENT_TIMESTAMP
    WHERE id=?1
  `).bind(id, cursore ? JSON.stringify(cursore) : null, `+${ore} hours`).run();
}

export async function segnaVoceErrore(db, id, messaggio, ritentaOre = 6) {
  const ore = interoPositivo(ritentaOre, 6, 24 * 30);
  await db.prepare(`
    UPDATE coda_archivio_vivo
    SET stato='errore', ultimo_errore=?2,
        prossima_esecuzione=datetime('now', ?3), aggiornato_il=CURRENT_TIMESTAMP
    WHERE id=?1
  `).bind(id, String(messaggio || 'errore non specificato').slice(0, 1000), `+${ore} hours`).run();
}

export async function contaVersioniArchiviate(db, titolo, artista = '') {
  if (!db) return 0;
  const chiave = creaChiaveRicerca(titolo, artista);
  const riga = await db.prepare(`
    SELECT COUNT(v.id) AS totale
    FROM composizioni c
    LEFT JOIN versioni v ON v.composizione_id = c.id
    WHERE c.chiave_ricerca=?1
  `).bind(chiave).first();
  return Number(riga?.totale || 0);
}

export async function registraScansioneArchivioVivo(db, {
  voce,
  stato,
  candidati = 0,
  versioniIndividuate = 0,
  nuoveOAggiornate = 0,
  durataMs = 0,
  dettaglio = null
}) {
  if (!db || !voce) return;
  await db.prepare(`
    INSERT INTO scansioni_archivio_vivo (
      id, voce_coda_id, chiave_ricerca, titolo, artista, stato,
      candidati, versioni_individuate, nuove_o_aggiornate,
      durata_ms, dettaglio, completata_il
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, CURRENT_TIMESTAMP)
  `).bind(
    crypto.randomUUID(), voce.id, voce.chiave_ricerca, voce.titolo,
    voce.artista || null, stato, candidati, versioniIndividuate,
    nuoveOAggiornate, durataMs, dettaglio ? String(dettaglio).slice(0, 2000) : null
  ).run();
}

export async function paginaVersioniArchiviate(db, {
  titolo,
  artista = '',
  ordine = 'asc',
  offset = 0,
  limite = 20
}) {
  if (!db) return { stato: 'database_non_collegato', totale: 0, versioni: [] };
  const chiave = creaChiaveRicerca(titolo, artista);
  const composizione = await db.prepare(
    'SELECT * FROM composizioni WHERE chiave_ricerca=?1 LIMIT 1'
  ).bind(chiave).first();
  if (!composizione) return { stato: 'non_trovato', totale: 0, versioni: [] };

  const posizione = Math.max(0, Number(offset) || 0);
  const quantita = Math.min(20, interoPositivo(limite, 20, 20));
  const direzione = String(ordine).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const conteggio = await db.prepare(
    'SELECT COUNT(*) AS totale FROM versioni WHERE composizione_id=?1'
  ).bind(composizione.id).first();

  const risultato = await db.prepare(`
    SELECT id, titolo, interprete, anno, lingua, paese, tipo, affidabilita,
           id_musicbrainz AS idMusicBrainz, stato_verifica AS statoVerifica,
           id_opera_musicbrainz AS idOperaMusicBrainz,
           titolo_opera AS titoloOpera,
           derivazione, derivazione_tradotta AS derivazioneTradotta
    FROM versioni
    WHERE composizione_id=?1
    ORDER BY CASE WHEN anno IS NULL THEN 1 ELSE 0 END,
             anno ${direzione}, interprete COLLATE NOCASE
    LIMIT ?2 OFFSET ?3
  `).bind(composizione.id, quantita, posizione).all();

  const totale = Number(conteggio?.totale || 0);
  const versioniBase = risultato.results || [];
  const versioni = await aggiungiFontiECrediti(db, versioniBase);
  const creditiPersistiti = await leggiCreditiComposizione(db, composizione.id);
  const prossimoOffset = posizione + versioni.length < totale
    ? posizione + versioni.length
    : null;

  return {
    stato: 'pronto',
    composizione: {
      id: composizione.id,
      titolo: composizione.titolo_canonico,
      artista: composizione.artista_originale,
      compositore: composizione.compositore || null,
      crediti: creditiPersistiti.length ? creditiPersistiti : creditiComposizioneDaRiga(composizione),
      anno: composizione.anno_originale,
      lingua: composizione.lingua_originale,
      idMusicBrainz: composizione.id_musicbrainz
    },
    totale,
    offset: posizione,
    limite: quantita,
    prossimoOffset,
    haAltriRisultati: prossimoOffset !== null,
    versioni
  };
}
