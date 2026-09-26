let promessaSchema = null;

async function colonneVersioni(db) {
  const r = await db.prepare("PRAGMA table_info('versioni')").all();
  return new Set((r.results || []).map(x => String(x.name || '').trim()).filter(Boolean));
}

async function aggiungiColonnaSeManca(db, colonne, nome, definizione) {
  if (colonne.has(nome)) return false;
  await db.prepare(`ALTER TABLE versioni ADD COLUMN ${nome} ${definizione}`).run();
  colonne.add(nome);
  return true;
}

async function applica(db) {
  if (!db) return { stato: 'database_non_collegato' };

  const colonne = await colonneVersioni(db);
  let modificato = false;
  modificato = await aggiungiColonnaSeManca(
    db, colonne, 'stato_archivio', "TEXT NOT NULL DEFAULT 'da_rivalidare'"
  ) || modificato;
  modificato = await aggiungiColonnaSeManca(
    db, colonne, 'motivo_archivio', 'TEXT'
  ) || modificato;
  modificato = await aggiungiColonnaSeManca(
    db, colonne, 'data_ammissione_archivio', 'TEXT'
  ) || modificato;

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_versioni_stato_archivio
    ON versioni(composizione_id, stato_archivio, anno)
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS tracce_regista_ai (
      id TEXT PRIMARY KEY,
      chiave_composizione TEXT NOT NULL,
      giro INTEGER NOT NULL DEFAULT 0,
      agenda_json TEXT,
      domande_esplorate_json TEXT,
      nuove_domande_json TEXT,
      strategie_json TEXT,
      creata_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_tracce_regista_chiave
    ON tracce_regista_ai(chiave_composizione, creata_il DESC)
  `).run();

  // Rivalida in modo conservativo solo versioni gia collegate a un'opera reale
  // e dotate di almeno un credito essenziale. Il resto rimane fuori dall'Archivio ufficiale.
  await db.prepare(`
    UPDATE versioni
    SET stato_archivio='archiviata',
        motivo_archivio=COALESCE(
          motivo_archivio,
          'Rivalidazione automatica: relazione con opera e crediti essenziali disponibili.'
        ),
        data_ammissione_archivio=COALESCE(data_ammissione_archivio, CURRENT_TIMESTAMP)
    WHERE stato_archivio<>'archiviata'
      AND id_opera_musicbrainz IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM crediti_versione cv
          WHERE cv.versione_id=versioni.id
            AND lower(cv.ruolo) IN ('compositore','paroliere','autore','traduttore','adattatore','arrangiatore')
        )
        OR EXISTS (
          SELECT 1 FROM crediti_composizione cc
          WHERE cc.composizione_id=versioni.composizione_id
            AND lower(cc.ruolo) IN ('compositore','paroliere','autore','traduttore','adattatore','arrangiatore')
        )
      )
  `).run();

  const configurazioni = [
    ['archivio_richiede_crediti_essenziali', '1'],
    ['strategie_provider_per_giro', '3'],
    ['candidati_verifica_per_giro', '5'],
    ['query_ia_per_giro', '18'],
    ['candidati_ia_per_giro', '45']
  ];
  for (const [chiave, valore] of configurazioni) {
    await db.prepare(`
      INSERT INTO configurazione_archivio_vivo(chiave, valore, aggiornato_il)
      VALUES (?1, ?2, CURRENT_TIMESTAMP)
      ON CONFLICT(chiave) DO UPDATE SET valore=excluded.valore, aggiornato_il=CURRENT_TIMESTAMP
    `).bind(chiave, valore).run();
  }

  return {
    stato: 'pronto',
    versioneSchema: '0.8.0',
    modificato
  };
}

export function assicuraSchema080(db) {
  if (!promessaSchema) {
    promessaSchema = applica(db).catch(e => {
      promessaSchema = null;
      throw e;
    });
  }
  return promessaSchema;
}
