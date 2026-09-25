const ISTRUZIONI_BASE = [
  `CREATE TABLE IF NOT EXISTS composizioni (
    id TEXT PRIMARY KEY,
    chiave_ricerca TEXT NOT NULL UNIQUE,
    titolo_canonico TEXT NOT NULL,
    artista_originale TEXT,
    compositore TEXT,
    anno_originale INTEGER,
    lingua_originale TEXT,
    paese_origine TEXT,
    id_musicbrainz TEXT UNIQUE,
    data_prima_scoperta TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_verifica TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_composizioni_titolo ON composizioni(titolo_canonico)`,
  `CREATE INDEX IF NOT EXISTS idx_composizioni_artista ON composizioni(artista_originale)`,
  `CREATE INDEX IF NOT EXISTS idx_composizioni_musicbrainz ON composizioni(id_musicbrainz)`,

  `CREATE TABLE IF NOT EXISTS versioni (
    id TEXT PRIMARY KEY,
    composizione_id TEXT NOT NULL,
    titolo TEXT NOT NULL,
    interprete TEXT NOT NULL,
    anno INTEGER,
    lingua TEXT,
    paese TEXT,
    tipo TEXT NOT NULL,
    affidabilita INTEGER NOT NULL DEFAULT 50 CHECK(affidabilita BETWEEN 0 AND 100),
    id_musicbrainz TEXT,
    chiave_duplicato TEXT,
    stato_verifica TEXT NOT NULL DEFAULT 'da_verificare',
    data_prima_scoperta TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_verifica TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(composizione_id) REFERENCES composizioni(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_versioni_composizione ON versioni(composizione_id)`,
  `CREATE INDEX IF NOT EXISTS idx_versioni_anno ON versioni(anno)`,
  `CREATE INDEX IF NOT EXISTS idx_versioni_lingua ON versioni(lingua)`,
  `CREATE INDEX IF NOT EXISTS idx_versioni_tipo ON versioni(tipo)`,
  `CREATE INDEX IF NOT EXISTS idx_versioni_interprete ON versioni(interprete)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_versioni_musicbrainz_unica
    ON versioni(composizione_id, id_musicbrainz)
    WHERE id_musicbrainz IS NOT NULL`,

  `CREATE TABLE IF NOT EXISTS fonti_verifica (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    versione_id TEXT NOT NULL,
    fonte TEXT NOT NULL,
    id_esterno TEXT,
    indirizzo TEXT,
    nota TEXT,
    data_verifica TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(versione_id) REFERENCES versioni(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fonti_versione ON fonti_verifica(versione_id)`,

  `CREATE TABLE IF NOT EXISTS ricerche (
    id TEXT PRIMARY KEY,
    titolo_richiesto TEXT NOT NULL,
    artista_richiesto TEXT,
    chiave_ricerca TEXT NOT NULL,
    composizione_id TEXT,
    candidati INTEGER NOT NULL DEFAULT 0,
    risultati_validi INTEGER NOT NULL DEFAULT 0,
    durata_ms INTEGER,
    versione_algoritmo TEXT NOT NULL,
    provenienza TEXT NOT NULL DEFAULT 'motore',
    data_ricerca TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(composizione_id) REFERENCES composizioni(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ricerche_chiave ON ricerche(chiave_ricerca)`,
  `CREATE INDEX IF NOT EXISTS idx_ricerche_data ON ricerche(data_ricerca)`
];

const ISTRUZIONI_DERIVATE = [
  `CREATE INDEX IF NOT EXISTS idx_versioni_opera_musicbrainz ON versioni(id_opera_musicbrainz)`,
  `CREATE INDEX IF NOT EXISTS idx_versioni_derivazione ON versioni(derivazione, derivazione_tradotta)`,
  `CREATE TABLE IF NOT EXISTS opere_collegate (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    composizione_id TEXT NOT NULL,
    id_musicbrainz TEXT NOT NULL,
    titolo TEXT,
    lingua TEXT,
    tipo_relazione TEXT,
    tradotta INTEGER NOT NULL DEFAULT 0,
    parodia INTEGER NOT NULL DEFAULT 0,
    analizzata INTEGER NOT NULL DEFAULT 0,
    data_prima_scoperta TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_ultima_verifica TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(composizione_id) REFERENCES composizioni(id) ON DELETE CASCADE,
    UNIQUE(composizione_id, id_musicbrainz)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_opere_collegate_composizione ON opere_collegate(composizione_id)`,
  `CREATE INDEX IF NOT EXISTS idx_opere_collegate_tradotte ON opere_collegate(tradotta, analizzata)`
];

async function eseguiIstruzioni(db, istruzioni) {
  for (const sql of istruzioni) {
    await db.prepare(sql).run();
  }
}

async function colonneVersioni(db) {
  const risultato = await db.prepare('PRAGMA table_info(versioni)').all();
  return new Set((risultato.results || []).map(r => r.name));
}

export async function inizializzaDatabase(db) {
  if (!db) throw new Error('Database D1 non collegato.');

  await eseguiIstruzioni(db, ISTRUZIONI_BASE);

  const colonne = await colonneVersioni(db);
  const mancanti = [
    ['id_opera_musicbrainz', 'TEXT'],
    ['titolo_opera', 'TEXT'],
    ['derivazione', 'INTEGER NOT NULL DEFAULT 0'],
    ['derivazione_tradotta', 'INTEGER NOT NULL DEFAULT 0']
  ];

  for (const [nome, definizione] of mancanti) {
    if (!colonne.has(nome)) {
      await db.prepare(`ALTER TABLE versioni ADD COLUMN ${nome} ${definizione}`).run();
    }
  }

  await eseguiIstruzioni(db, ISTRUZIONI_DERIVATE);

  const tabelle = await db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
      AND name IN ('composizioni','versioni','fonti_verifica','ricerche','opere_collegate')
    ORDER BY name
  `).all();

  return {
    stato: 'ok',
    tabelle: (tabelle.results || []).map(r => r.name),
    colonneVersioni: [...(await colonneVersioni(db))]
  };
}
