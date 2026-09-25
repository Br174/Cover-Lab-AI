const ISTRUZIONI = [
  `CREATE TABLE IF NOT EXISTS stato_scoperta_composizione (
    chiave_composizione TEXT PRIMARY KEY,
    giri_ia INTEGER NOT NULL DEFAULT 0,
    ia_esaurita INTEGER NOT NULL DEFAULT 0,
    ultima_generazione_ia TEXT,
    ultimo_giro_provider TEXT,
    candidati_totali INTEGER NOT NULL DEFAULT 0,
    fonti_totali INTEGER NOT NULL DEFAULT 0,
    aggiornato_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS strategie_scoperta (
    id TEXT PRIMARY KEY,
    chiave_composizione TEXT NOT NULL,
    provider TEXT NOT NULL,
    query TEXT NOT NULL,
    lingua TEXT,
    paese TEXT,
    cursore TEXT,
    stato TEXT NOT NULL DEFAULT 'in_attesa',
    priorita INTEGER NOT NULL DEFAULT 50,
    pagine_analizzate INTEGER NOT NULL DEFAULT 0,
    candidati_trovati INTEGER NOT NULL DEFAULT 0,
    ultimo_errore TEXT,
    creata_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    aggiornata_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chiave_composizione, provider, query)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_strategie_scoperta_lavoro
    ON strategie_scoperta(chiave_composizione, provider, stato, priorita DESC, creata_il)`,
  `CREATE TABLE IF NOT EXISTS candidati_scoperta (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_candidati_scoperta_stato
    ON candidati_scoperta(chiave_composizione, stato, affidabilita_proposta DESC)`,
  `CREATE TABLE IF NOT EXISTS fonti_candidato (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidato_id TEXT NOT NULL,
    fonte TEXT NOT NULL,
    id_esterno TEXT,
    indirizzo TEXT,
    titolo_fonte TEXT,
    descrizione TEXT,
    data_pubblicazione TEXT,
    data_verifica TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(candidato_id) REFERENCES candidati_scoperta(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_fonti_candidato_id
    ON fonti_candidato(candidato_id, fonte)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_fonti_candidato_unica
    ON fonti_candidato(candidato_id, fonte, id_esterno)
    WHERE id_esterno IS NOT NULL`
];

const CONFIG = [
  ['multifonte_abilitato', '1'],
  ['strategie_provider_per_giro', '2'],
  ['query_ia_per_giro', '12'],
  ['candidati_ia_per_giro', '30']
];

export async function migraMultifonteLab(db) {
  if (!db) throw new Error('Database D1 non collegato.');
  for (const sql of ISTRUZIONI) await db.prepare(sql).run();
  for (const [chiave, valore] of CONFIG) {
    await db.prepare(`
      INSERT OR IGNORE INTO configurazione_archivio_vivo(chiave, valore)
      VALUES (?1, ?2)
    `).bind(chiave, valore).run();
  }
  const tabelle = await db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name IN (
      'stato_scoperta_composizione','strategie_scoperta',
      'candidati_scoperta','fonti_candidato'
    ) ORDER BY name
  `).all();
  const config = await db.prepare(`
    SELECT chiave, valore FROM configurazione_archivio_vivo
    WHERE chiave IN ('multifonte_abilitato','strategie_provider_per_giro','query_ia_per_giro','candidati_ia_per_giro')
    ORDER BY chiave
  `).all();
  return {
    stato: 'ok',
    tabelle: (tabelle.results || []).map(r => r.name),
    configurazione: config.results || []
  };
}

export async function statoMultifonteLab(db, chiave) {
  if (!db) throw new Error('Database D1 non collegato.');
  const stato = await db.prepare(
    'SELECT * FROM stato_scoperta_composizione WHERE chiave_composizione=?1'
  ).bind(chiave).first();
  const strategie = await db.prepare(`
    SELECT provider, query, stato, priorita, pagine_analizzate, candidati_trovati
    FROM strategie_scoperta WHERE chiave_composizione=?1
    ORDER BY priorita DESC, creata_il LIMIT 50
  `).bind(chiave).all();
  const candidati = await db.prepare(`
    SELECT titolo, interprete, anno, lingua, paese, tipo_proposto,
           affidabilita_proposta, stato, prima_origine, numero_fonti
    FROM candidati_scoperta WHERE chiave_composizione=?1
    ORDER BY affidabilita_proposta DESC, prima_scoperta LIMIT 50
  `).bind(chiave).all();
  return {
    stato: 'ok',
    riepilogo: stato || null,
    strategie: strategie.results || [],
    candidati: candidati.results || []
  };
}
