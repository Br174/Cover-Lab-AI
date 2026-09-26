import { creaChiaveRicerca } from '../motore/normalizzazione.js';

function limitaIntero(valore, minimo = 0, massimo = 100) {
  const n = Number(valore);
  if (!Number.isFinite(n)) return minimo;
  return Math.max(minimo, Math.min(massimo, Math.round(n)));
}

export function chiaveComposizione(titolo, artista = '') {
  return creaChiaveRicerca(titolo, artista);
}

export function chiaveCandidato(candidato = {}) {
  return creaChiaveRicerca(candidato.titolo || '', candidato.interprete || '');
}

async function trovaCandidatoEsistente(db, chiave, candidato) {
  if (!db || !candidato?.titolo) return null;
  const nuovaChiave = chiaveCandidato(candidato);
  return db.prepare(`
    SELECT id, chiave_candidato
    FROM candidati_scoperta
    WHERE chiave_composizione=?1
      AND (chiave_candidato=?2 OR chiave_candidato LIKE ?3)
    ORDER BY CASE WHEN chiave_candidato=?2 THEN 0 ELSE 1 END, prima_scoperta
    LIMIT 1
  `).bind(chiave, nuovaChiave, `${nuovaChiave}::%`).first();
}

export async function leggiStatoScoperta(db, chiave) {
  if (!db) return null;
  return db.prepare(
    'SELECT * FROM stato_scoperta_composizione WHERE chiave_composizione=?1 LIMIT 1'
  ).bind(chiave).first();
}

export async function assicuraStatoScoperta(db, chiave) {
  if (!db) return;
  await db.prepare(`
    INSERT OR IGNORE INTO stato_scoperta_composizione(chiave_composizione)
    VALUES (?1)
  `).bind(chiave).run();
}

export async function leggiStrategieNote(db, chiave) {
  if (!db) return [];
  const risultato = await db.prepare(`
    SELECT provider, query, lingua, paese, stato, cursore,
           pagine_analizzate, candidati_trovati
    FROM strategie_scoperta
    WHERE chiave_composizione=?1
    ORDER BY creata_il
  `).bind(chiave).all();
  return risultato.results || [];
}

export async function leggiCandidatiNoti(db, chiave, limite = 200) {
  if (!db) return [];
  const risultato = await db.prepare(`
    SELECT titolo, interprete, anno, lingua, paese, tipo_proposto,
           affidabilita_proposta, stato, prima_origine, numero_fonti
    FROM candidati_scoperta
    WHERE chiave_composizione=?1
    ORDER BY affidabilita_proposta DESC, prima_scoperta
    LIMIT ?2
  `).bind(chiave, Math.max(1, Math.min(500, Number(limite) || 200))).all();
  return risultato.results || [];
}

export async function esisteCandidatoScoperta(db, chiave, candidato) {
  return Boolean(await trovaCandidatoEsistente(db, chiave, candidato));
}

export async function salvaStrategieScoperta(db, chiave, strategie = []) {
  if (!db || !strategie.length) return 0;
  let inserite = 0;
  for (const strategia of strategie) {
    const provider = String(strategia?.provider || '').trim().toLowerCase();
    const query = String(strategia?.query || strategia?.testo || '').trim();
    if (!provider || !query) continue;
    const risultato = await db.prepare(`
      INSERT OR IGNORE INTO strategie_scoperta(
        id, chiave_composizione, provider, query, lingua, paese, priorita
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `).bind(
      crypto.randomUUID(), chiave, provider, query,
      strategia.lingua || null, strategia.paese || null,
      limitaIntero(strategia.priorita ?? 50, 1, 100)
    ).run();
    inserite += Number(risultato?.meta?.changes || 0);
  }
  return inserite;
}

export async function salvaCandidatoScoperta(db, chiave, candidato, origine = 'ia') {
  if (!db || !candidato?.titolo) return null;
  const chiaveDuplicato = chiaveCandidato(candidato);
  const esistente = await trovaCandidatoEsistente(db, chiave, candidato);
  const confermaFonteAI = candidato?.coerenzaFonteAI === true;

  if (esistente?.id) {
    await db.prepare(`
      UPDATE candidati_scoperta
      SET anno=COALESCE(anno, ?2),
          lingua=COALESCE(lingua, ?3),
          paese=COALESCE(paese, ?4),
          tipo_proposto=CASE
            WHEN ?7=1 AND ?5 IS NOT NULL THEN ?5
            ELSE COALESCE(tipo_proposto, ?5)
          END,
          affidabilita_proposta=MAX(affidabilita_proposta, ?6),
          stato=CASE WHEN ?7=1 THEN 'fonte_confermata_ai' ELSE stato END,
          ultima_verifica=CURRENT_TIMESTAMP
      WHERE id=?1
    `).bind(
      esistente.id,
      candidato.anno || null,
      candidato.lingua || null,
      candidato.paese || null,
      candidato.tipo || candidato.tipoProposto || null,
      limitaIntero(candidato.affidabilita ?? candidato.affidabilitaProposta ?? 0, 0, 100),
      confermaFonteAI ? 1 : 0
    ).run();
    return esistente.id;
  }

  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO candidati_scoperta(
      id, chiave_composizione, chiave_candidato, titolo, interprete,
      anno, lingua, paese, tipo_proposto, affidabilita_proposta,
      stato, prima_origine, ultima_verifica
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, CURRENT_TIMESTAMP)
  `).bind(
    id, chiave, chiaveDuplicato, candidato.titolo,
    candidato.interprete || null, candidato.anno || null,
    candidato.lingua || null, candidato.paese || null,
    candidato.tipo || candidato.tipoProposto || null,
    limitaIntero(candidato.affidabilita ?? candidato.affidabilitaProposta ?? 0, 0, 100),
    confermaFonteAI ? 'fonte_confermata_ai' : 'da_verificare',
    origine
  ).run();
  return id;
}

export async function salvaFonteCandidato(db, candidatoId, fonte) {
  if (!db || !candidatoId || !fonte?.fonte) return;
  const idEsterno = fonte.idEsterno || null;
  if (idEsterno) {
    await db.prepare(`
      INSERT INTO fonti_candidato(
        candidato_id, fonte, id_esterno, indirizzo, titolo_fonte,
        descrizione, data_pubblicazione, data_verifica
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)
      ON CONFLICT(candidato_id, fonte, id_esterno) WHERE id_esterno IS NOT NULL
      DO UPDATE SET
        indirizzo=COALESCE(excluded.indirizzo, fonti_candidato.indirizzo),
        titolo_fonte=COALESCE(excluded.titolo_fonte, fonti_candidato.titolo_fonte),
        descrizione=COALESCE(excluded.descrizione, fonti_candidato.descrizione),
        data_pubblicazione=COALESCE(excluded.data_pubblicazione, fonti_candidato.data_pubblicazione),
        data_verifica=CURRENT_TIMESTAMP
    `).bind(
      candidatoId, fonte.fonte, idEsterno, fonte.indirizzo || null,
      fonte.titoloFonte || null, fonte.descrizione || null,
      fonte.dataPubblicazione || null
    ).run();
  } else {
    await db.prepare(`
      INSERT INTO fonti_candidato(
        candidato_id, fonte, indirizzo, titolo_fonte, descrizione,
        data_pubblicazione, data_verifica
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)
    `).bind(
      candidatoId, fonte.fonte, fonte.indirizzo || null,
      fonte.titoloFonte || null, fonte.descrizione || null,
      fonte.dataPubblicazione || null
    ).run();
  }

  const conteggio = await db.prepare(
    'SELECT COUNT(*) AS totale FROM fonti_candidato WHERE candidato_id=?1'
  ).bind(candidatoId).first();
  await db.prepare(`
    UPDATE candidati_scoperta
    SET numero_fonti=?2, ultima_verifica=CURRENT_TIMESTAMP
    WHERE id=?1
  `).bind(candidatoId, Number(conteggio?.totale || 0)).run();
}

export async function prossimeStrategieProvider(db, chiave, provider, limite = 2) {
  if (!db) return [];
  const risultato = await db.prepare(`
    SELECT * FROM strategie_scoperta
    WHERE chiave_composizione=?1
      AND provider=?2
      AND stato IN ('in_attesa','continua','attesa_provider')
    ORDER BY priorita DESC, creata_il
    LIMIT ?3
  `).bind(chiave, provider, Math.max(1, Math.min(10, Number(limite) || 2))).all();
  return risultato.results || [];
}

export async function aggiornaStrategia(db, id, {
  stato,
  cursore = null,
  candidatiAggiunti = 0,
  errore = null,
  incrementaPagina = true
}) {
  if (!db || !id) return;
  await db.prepare(`
    UPDATE strategie_scoperta
    SET stato=?2,
        cursore=?3,
        pagine_analizzate=pagine_analizzate+?4,
        candidati_trovati=candidati_trovati+?5,
        ultimo_errore=?6,
        aggiornata_il=CURRENT_TIMESTAMP
    WHERE id=?1
  `).bind(id, stato, cursore, incrementaPagina ? 1 : 0, Number(candidatiAggiunti || 0), errore).run();
}

export async function registraGiroIA(db, chiave, { esaurita = false } = {}) {
  if (!db) return;
  await assicuraStatoScoperta(db, chiave);
  await db.prepare(`
    UPDATE stato_scoperta_composizione
    SET giri_ia=giri_ia+1,
        ia_esaurita=?2,
        ultima_generazione_ia=CURRENT_TIMESTAMP,
        candidati_totali=(SELECT COUNT(*) FROM candidati_scoperta WHERE chiave_composizione=?1),
        fonti_totali=(
          SELECT COUNT(*) FROM fonti_candidato f
          JOIN candidati_scoperta c ON c.id=f.candidato_id
          WHERE c.chiave_composizione=?1
        ),
        aggiornato_il=CURRENT_TIMESTAMP
    WHERE chiave_composizione=?1
  `).bind(chiave, esaurita ? 1 : 0).run();
}

export async function aggiornaStatisticheScoperta(db, chiave, provider = null) {
  if (!db) return;
  await assicuraStatoScoperta(db, chiave);
  await db.prepare(`
    UPDATE stato_scoperta_composizione
    SET ultimo_giro_provider=?2,
        candidati_totali=(SELECT COUNT(*) FROM candidati_scoperta WHERE chiave_composizione=?1),
        fonti_totali=(
          SELECT COUNT(*) FROM fonti_candidato f
          JOIN candidati_scoperta c ON c.id=f.candidato_id
          WHERE c.chiave_composizione=?1
        ),
        aggiornato_il=CURRENT_TIMESTAMP
    WHERE chiave_composizione=?1
  `).bind(chiave, provider).run();
}
