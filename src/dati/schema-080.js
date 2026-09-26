let promessaSchema = null;

async function colonneTabella(db, tabella) {
  const r = await db.prepare(`PRAGMA table_info('${tabella}')`).all();
  return new Set((r.results || []).map(x => String(x.name || '').trim()).filter(Boolean));
}

async function aggiungiColonnaTabellaSeManca(db, tabella, colonne, nome, definizione) {
  if (colonne.has(nome)) return false;
  await db.prepare(`ALTER TABLE ${tabella} ADD COLUMN ${nome} ${definizione}`).run();
  colonne.add(nome);
  return true;
}

async function assicuraTabelleCrediti(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS crediti_versione (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      versione_id TEXT NOT NULL,
      ruolo TEXT NOT NULL,
      nome TEXT NOT NULL,
      fonte TEXT,
      id_esterno TEXT,
      nota TEXT,
      data_verifica TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(versione_id) REFERENCES versioni(id) ON DELETE CASCADE
    )
  `).run();
  await db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crediti_versione_unico
    ON crediti_versione(versione_id, ruolo, nome, COALESCE(fonte, ''))
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_crediti_versione_versione
    ON crediti_versione(versione_id)
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS crediti_composizione (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      composizione_id TEXT NOT NULL,
      ruolo TEXT NOT NULL,
      nome TEXT NOT NULL,
      fonte TEXT,
      id_esterno TEXT,
      nota TEXT,
      data_verifica TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(composizione_id) REFERENCES composizioni(id) ON DELETE CASCADE
    )
  `).run();
  await db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crediti_composizione_unici
    ON crediti_composizione(composizione_id, ruolo,nome)
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_crediti_composizione_lookup
    ON crediti_composizione(composizione_id, ruolo)
  `).run();
}

async function assicuraConfigurazioneArchivio(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS configurazione_archivio_vivo (
      chiave TEXT PRIMARY KEY,
      valore TEXT NOT NULL,
      aggiornato_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

async function assicuraVerificaMultifonte(db) {
  // Alcune D1 remote storiche hanno le tabelle dell'orchestratore ma non le
  // colonne introdotte dalla migrazione di verifica. Le aggiungiamo senza
  // modificare o cancellare i candidati gia raccolti.
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS candidati_scoperta (
      id TEXT PRIMARY KEY,
      chiave_composizione TEXT NOT NULL,
      chiave_candidato TEXT NOT NULL,
      titolo TEXT NOT NULL,
      interprete TEXT,
      anno INTEGER,
      lingua TEXT,
      paese TEXT,
      tipo_proposto TEXT,
      affidabilita_proposta INTEGER NOT NULL DEFAULT 0,
      stato TEXT NOT NULL DEFAULT 'da_verificare',
      prima_origine TEXT,
      numero_fonti INTEGER NOT NULL DEFAULT 0,
      prima_scoperta TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ultima_verifica TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(chiave_composizione, chiave_candidato)
    )
  `).run();
  const colonneCandidati = await colonneTabella(db, 'candidati_scoperta');
  await aggiungiColonnaTabellaSeManca(db, 'candidati_scoperta', colonneCandidati, 'affidabilita_verificata', 'INTEGER NOT NULL DEFAULT 0');
  await aggiungiColonnaTabellaSeManca(db, 'candidati_scoperta', colonneCandidati, 'motivo_verifica', 'TEXT');
  await aggiungiColonnaTabellaSeManca(db, 'candidati_scoperta', colonneCandidati, 'versione_id', 'TEXT');
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_candidati_scoperta_verifica
    ON candidati_scoperta(chiave_composizione, stato, numero_fonti DESC, affidabilita_proposta DESC)
  `).run();

  // Il salvataggio delle prove usa ON CONFLICT: eliminiamo soltanto eventuali
  // duplicati tecnici storici con lo stesso identificatore esterno.
  await db.prepare(`
    DELETE FROM fonti_verifica
    WHERE id_esterno IS NOT NULL
      AND id NOT IN (
        SELECT MIN(id) FROM fonti_verifica
        WHERE id_esterno IS NOT NULL
        GROUP BY versione_id, fonte, id_esterno
      )
  `).run();
  await db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_fonti_verifica_unica
    ON fonti_verifica(versione_id, fonte, id_esterno)
    WHERE id_esterno IS NOT NULL
  `).run();
}

async function assicuraConflitti(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS conflitti_versione (
      id TEXT PRIMARY KEY,
      versione_id TEXT NOT NULL,
      campo TEXT NOT NULL,
      valore_a TEXT NOT NULL,
      fonte_a TEXT NOT NULL,
      valore_b TEXT NOT NULL,
      fonte_b TEXT NOT NULL,
      stato TEXT NOT NULL DEFAULT 'aperto',
      valore_risolto TEXT,
      fonte_risoluzione TEXT,
      rilevato_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      aggiornato_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ipotesi_ai TEXT,
      domanda_verifica TEXT,
      strategie_generate INTEGER NOT NULL DEFAULT 0,
      ultimo_tentativo TEXT,
      FOREIGN KEY(versione_id) REFERENCES versioni(id) ON DELETE CASCADE
    )
  `).run();
  const colonne = await colonneTabella(db, 'conflitti_versione');
  await aggiungiColonnaTabellaSeManca(db, 'conflitti_versione', colonne, 'ipotesi_ai', 'TEXT');
  await aggiungiColonnaTabellaSeManca(db, 'conflitti_versione', colonne, 'domanda_verifica', 'TEXT');
  await aggiungiColonnaTabellaSeManca(db, 'conflitti_versione', colonne, 'strategie_generate', 'INTEGER NOT NULL DEFAULT 0');
  await aggiungiColonnaTabellaSeManca(db, 'conflitti_versione', colonne, 'ultimo_tentativo', 'TEXT');
  await db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_conflitti_versione_unico
    ON conflitti_versione(versione_id, campo, valore_a, fonte_a, valore_b, fonte_b)
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_conflitti_versione_aperti
    ON conflitti_versione(versione_id, stato, campo)
  `).run();
}

function condizioneArchivioCertificato() {
  return `
    lower(COALESCE(versioni.tipo,'')) NOT IN ('originale','dubbio')
    AND versioni.affidabilita >= 90
    AND lower(COALESCE(versioni.stato_verifica,'')) LIKE 'verificato%'
    AND (
      (
        versioni.id_opera_musicbrainz IS NOT NULL
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
      )
      OR (
        (SELECT COUNT(DISTINCT lower(fv.fonte)) FROM fonti_verifica fv WHERE fv.versione_id=versioni.id) >= 2
        AND EXISTS (
          SELECT 1 FROM crediti_versione cv2
          WHERE cv2.versione_id=versioni.id
            AND lower(cv2.ruolo) IN ('compositore','paroliere','autore','traduttore','adattatore','arrangiatore')
        )
      )
    )
  `;
}

async function rivalidaArchivio(db) {
  const condizione = condizioneArchivioCertificato();

  // L'originale resta nel database come riferimento della composizione, ma non
  // viene contato ne mostrato come cover dell'Archivio ufficiale.
  await db.prepare(`
    UPDATE versioni
    SET stato_archivio='riferimento_originale',
        motivo_archivio='Registrazione originale conservata come riferimento, non conteggiata tra le cover.',
        data_ammissione_archivio=NULL
    WHERE lower(COALESCE(tipo,''))='originale'
  `).run();

  // Se una vecchia versione era stata ammessa con criteri piu deboli, viene
  // retrocessa: la correttezza dell'Archivio prevale sul numero dei risultati.
  await db.prepare(`
    UPDATE versioni
    SET stato_archivio='in_verifica',
        motivo_archivio='Rivalidazione 0.8: prove o crediti ancora insufficienti per l Archivio certificato.',
        data_ammissione_archivio=NULL
    WHERE lower(COALESCE(tipo,''))<>'originale'
      AND NOT (${condizione})
  `).run();

  await db.prepare(`
    UPDATE versioni
    SET stato_archivio='archiviata',
        motivo_archivio='Rivalidazione 0.8: relazione verificata con l opera e crediti essenziali documentati.',
        data_ammissione_archivio=COALESCE(data_ammissione_archivio, CURRENT_TIMESTAMP)
    WHERE ${condizione}
  `).run();
}

async function applica(db) {
  if (!db) return { stato: 'database_non_collegato' };

  const colonne = await colonneTabella(db, 'versioni');
  let modificato = false;
  modificato = await aggiungiColonnaTabellaSeManca(
    db, 'versioni', colonne, 'stato_archivio', "TEXT NOT NULL DEFAULT 'da_rivalidare'"
  ) || modificato;
  modificato = await aggiungiColonnaTabellaSeManca(
    db, 'versioni', colonne, 'motivo_archivio', 'TEXT'
  ) || modificato;
  modificato = await aggiungiColonnaTabellaSeManca(
    db, 'versioni', colonne, 'data_ammissione_archivio', 'TEXT'
  ) || modificato;

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_versioni_stato_archivio
    ON versioni(composizione_id, stato_archivio, anno)
  `).run();

  await assicuraTabelleCrediti(db);
  await assicuraConfigurazioneArchivio(db);
  await assicuraVerificaMultifonte(db);
  await assicuraConflitti(db);

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

  await rivalidaArchivio(db);

  const configurazioni = [
    ['archivio_richiede_crediti_essenziali', '1'],
    ['archivio_soglia_affidabilita', '90'],
    ['strategie_provider_per_giro', '3'],
    ['candidati_verifica_per_giro', '5'],
    ['query_ia_per_giro', '18'],
    ['candidati_ia_per_giro', '45'],
    ['conflitti_indagine_per_giro', '2']
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
    archivioCertificato: true,
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
