import { creaChiaveDuplicato } from '../motore/normalizzazione.js';

function limita(n, min = 0, max = 100) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

export async function salvaVersioneVerificata(db, composizioneId, versione) {
  if (!db || !composizioneId || !versione?.titolo || !versione?.interprete) return null;
  const chiave = creaChiaveDuplicato(versione);
  let esistente = null;

  if (versione.idMusicBrainz) {
    esistente = await db.prepare(`
      SELECT id FROM versioni
      WHERE composizione_id=?1 AND id_musicbrainz=?2
      LIMIT 1
    `).bind(composizioneId, versione.idMusicBrainz).first();
  }
  if (!esistente) {
    esistente = await db.prepare(`
      SELECT id FROM versioni
      WHERE composizione_id=?1 AND chiave_duplicato=?2
      LIMIT 1
    `).bind(composizioneId, chiave).first();
  }

  const id = esistente?.id || crypto.randomUUID();
  if (esistente) {
    await db.prepare(`
      UPDATE versioni
      SET titolo=?2,
          interprete=?3,
          anno=COALESCE(?4, anno),
          lingua=COALESCE(?5, lingua),
          paese=COALESCE(?6, paese),
          tipo=?7,
          affidabilita=MAX(affidabilita, ?8),
          id_musicbrainz=COALESCE(?9, id_musicbrainz),
          chiave_duplicato=?10,
          stato_verifica=?11,
          id_opera_musicbrainz=COALESCE(?12, id_opera_musicbrainz),
          titolo_opera=COALESCE(?13, titolo_opera),
          derivazione=MAX(derivazione, ?14),
          derivazione_tradotta=MAX(derivazione_tradotta, ?15),
          data_ultima_verifica=CURRENT_TIMESTAMP
      WHERE id=?1
    `).bind(
      id, versione.titolo, versione.interprete, versione.anno || null,
      versione.lingua || null, versione.paese || null,
      versione.tipo || 'cover', limita(versione.affidabilita, 0, 100),
      versione.idMusicBrainz || null, chiave,
      versione.statoVerifica || 'verificato_multifonte',
      versione.idOperaMusicBrainz || null, versione.titoloOpera || null,
      versione.derivazione ? 1 : 0, versione.derivazioneTradotta ? 1 : 0
    ).run();
  } else {
    await db.prepare(`
      INSERT INTO versioni(
        id, composizione_id, titolo, interprete, anno, lingua, paese, tipo,
        affidabilita, id_musicbrainz, chiave_duplicato, stato_verifica,
        id_opera_musicbrainz, titolo_opera, derivazione, derivazione_tradotta,
        data_ultima_verifica
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,CURRENT_TIMESTAMP)
    `).bind(
      id, composizioneId, versione.titolo, versione.interprete,
      versione.anno || null, versione.lingua || null, versione.paese || null,
      versione.tipo || 'cover', limita(versione.affidabilita, 0, 100),
      versione.idMusicBrainz || null, chiave,
      versione.statoVerifica || 'verificato_multifonte',
      versione.idOperaMusicBrainz || null, versione.titoloOpera || null,
      versione.derivazione ? 1 : 0, versione.derivazioneTradotta ? 1 : 0
    ).run();
  }
  return id;
}

export async function salvaFontiVersione(db, versioneId, fonti = []) {
  if (!db || !versioneId || !fonti.length) return;
  for (const fonte of fonti) {
    const nome = String(fonte?.fonte || '').trim();
    if (!nome) continue;
    const idEsterno = fonte.idEsterno || null;
    if (idEsterno) {
      await db.prepare(`
        INSERT INTO fonti_verifica(versione_id, fonte, id_esterno, indirizzo, nota, data_verifica)
        VALUES (?1,?2,?3,?4,?5,CURRENT_TIMESTAMP)
        ON CONFLICT(versione_id, fonte, id_esterno) WHERE id_esterno IS NOT NULL
        DO UPDATE SET
          indirizzo=COALESCE(excluded.indirizzo, fonti_verifica.indirizzo),
          nota=COALESCE(excluded.nota, fonti_verifica.nota),
          data_verifica=CURRENT_TIMESTAMP
      `).bind(
        versioneId, nome, idEsterno, fonte.indirizzo || null,
        String(fonte.nota || fonte.titoloFonte || '').slice(0, 1000) || null
      ).run();
    } else {
      const esiste = await db.prepare(`
        SELECT id FROM fonti_verifica
        WHERE versione_id=?1 AND fonte=?2 AND COALESCE(indirizzo,'')=COALESCE(?3,'')
        LIMIT 1
      `).bind(versioneId, nome, fonte.indirizzo || null).first();
      if (!esiste) {
        await db.prepare(`
          INSERT INTO fonti_verifica(versione_id, fonte, indirizzo, nota, data_verifica)
          VALUES (?1,?2,?3,?4,CURRENT_TIMESTAMP)
        `).bind(
          versioneId, nome, fonte.indirizzo || null,
          String(fonte.nota || fonte.titoloFonte || '').slice(0, 1000) || null
        ).run();
      }
    }
  }
}

export async function salvaCreditiVersione(db, versioneId, crediti = []) {
  if (!db || !versioneId || !crediti.length) return;
  try {
    for (const credito of crediti) {
      const ruolo = String(credito?.ruolo || '').trim();
      const nome = String(credito?.nome || '').trim();
      if (!ruolo || !nome) continue;
      await db.prepare(`
        INSERT OR IGNORE INTO crediti_versione(
          versione_id, ruolo, nome, fonte, id_esterno, nota, data_verifica
        ) VALUES (?1,?2,?3,?4,?5,?6,CURRENT_TIMESTAMP)
      `).bind(
        versioneId, ruolo, nome, credito.fonte || null,
        credito.idEsterno || null,
        credito.nota ? String(credito.nota).slice(0, 1000) : null
      ).run();
    }
  } catch (e) {
    if (String(e?.message || '').includes('no such table')) return;
    throw e;
  }
}
