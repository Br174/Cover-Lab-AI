const STRUTTURA = [
  `CREATE TABLE IF NOT EXISTS coda_archivio_vivo (
    id TEXT PRIMARY KEY,
    chiave_ricerca TEXT NOT NULL UNIQUE,
    titolo TEXT NOT NULL,
    artista TEXT,
    paese TEXT,
    lingua TEXT,
    priorita INTEGER NOT NULL DEFAULT 50,
    motivo TEXT NOT NULL DEFAULT 'espansione archivio',
    stato TEXT NOT NULL DEFAULT 'in_attesa',
    prossima_esecuzione TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo_tentativo TEXT,
    ultimo_successo TEXT,
    ultimo_errore TEXT,
    tentativi INTEGER NOT NULL DEFAULT 0,
    cicli_completati INTEGER NOT NULL DEFAULT 0,
    cursore_json TEXT,
    creato_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    aggiornato_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS idx_coda_archivio_vivo_pronta
    ON coda_archivio_vivo(stato, prossima_esecuzione, priorita DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_coda_archivio_vivo_successo
    ON coda_archivio_vivo(ultimo_successo)`,
  `CREATE TABLE IF NOT EXISTS scansioni_archivio_vivo (
    id TEXT PRIMARY KEY,
    voce_coda_id TEXT,
    chiave_ricerca TEXT NOT NULL,
    titolo TEXT NOT NULL,
    artista TEXT,
    stato TEXT NOT NULL,
    candidati INTEGER NOT NULL DEFAULT 0,
    versioni_individuate INTEGER NOT NULL DEFAULT 0,
    nuove_o_aggiornate INTEGER NOT NULL DEFAULT 0,
    durata_ms INTEGER NOT NULL DEFAULT 0,
    dettaglio TEXT,
    iniziata_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completata_il TEXT,
    FOREIGN KEY(voce_coda_id) REFERENCES coda_archivio_vivo(id) ON DELETE SET NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scansioni_archivio_vivo_chiave
    ON scansioni_archivio_vivo(chiave_ricerca, iniziata_il DESC)`,
  `CREATE TABLE IF NOT EXISTS configurazione_archivio_vivo (
    chiave TEXT PRIMARY KEY,
    valore TEXT NOT NULL,
    aggiornato_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`
];

const CONFIGURAZIONE = [
  ['abilitato', '1'],
  ['voci_per_giro', '1'],
  ['ricontrollo_ore', '168'],
  ['ritenta_errore_ore', '6'],
  ['lotto_visualizzazione_music_lab', '20']
];

const SEMI = [
  ['seed-it-001', 'nel blu dipinto di blu::domenico modugno', 'Nel blu dipinto di blu', 'Domenico Modugno', 'IT', 'it', 100],
  ['seed-it-002', 'sapore di sale::gino paoli', 'Sapore di sale', 'Gino Paoli', 'IT', 'it', 99],
  ['seed-it-003', 'azzurro::adriano celentano', 'Azzurro', 'Adriano Celentano', 'IT', 'it', 98],
  ['seed-it-004', 'il cielo in una stanza::gino paoli', 'Il cielo in una stanza', 'Gino Paoli', 'IT', 'it', 97],
  ['seed-it-005', 'caruso::lucio dalla', 'Caruso', 'Lucio Dalla', 'IT', 'it', 96],
  ['seed-it-006', 'la canzone del sole::lucio battisti', 'La canzone del sole', 'Lucio Battisti', 'IT', 'it', 95],
  ['seed-it-007', "almeno tu nell'universo::mia martini", "Almeno tu nell'universo", 'Mia Martini', 'IT', 'it', 94],
  ['seed-it-008', 'con te partiro::andrea bocelli', 'Con te partirò', 'Andrea Bocelli', 'IT', 'it', 93],
  ['seed-it-009', "l'italiano::toto cutugno", "L'italiano", 'Toto Cutugno', 'IT', 'it', 92],
  ['seed-it-010', 'gloria::umberto tozzi', 'Gloria', 'Umberto Tozzi', 'IT', 'it', 91]
];

export async function migraArchivioVivoLab(db) {
  if (!db) throw new Error('Database D1 non collegato.');

  for (const sql of STRUTTURA) {
    await db.prepare(sql).run();
  }

  for (const [chiave, valore] of CONFIGURAZIONE) {
    await db.prepare(`
      INSERT OR IGNORE INTO configurazione_archivio_vivo(chiave, valore)
      VALUES (?1, ?2)
    `).bind(chiave, valore).run();
  }

  for (const [id, chiave, titolo, artista, paese, lingua, priorita] of SEMI) {
    await db.prepare(`
      INSERT OR IGNORE INTO coda_archivio_vivo(
        id, chiave_ricerca, titolo, artista, paese, lingua, priorita, motivo
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'lotto italiano iniziale')
    `).bind(id, chiave, titolo, artista, paese, lingua, priorita).run();
  }

  const tabelle = await db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table'
      AND name IN ('coda_archivio_vivo','scansioni_archivio_vivo','configurazione_archivio_vivo')
    ORDER BY name
  `).all();
  const coda = await db.prepare('SELECT COUNT(*) AS totale FROM coda_archivio_vivo').first();
  const semi = await db.prepare("SELECT COUNT(*) AS totale FROM coda_archivio_vivo WHERE id LIKE 'seed-it-%'").first();
  const configurazione = await db.prepare('SELECT chiave, valore FROM configurazione_archivio_vivo ORDER BY chiave').all();

  return {
    stato: 'ok',
    tabelle: (tabelle.results || []).map(r => r.name),
    vociCoda: Number(coda?.totale || 0),
    semiItaliani: Number(semi?.totale || 0),
    configurazione: configurazione.results || []
  };
}

export async function statoArchivioVivoLab(db) {
  if (!db) throw new Error('Database D1 non collegato.');
  const coda = await db.prepare(`
    SELECT id, titolo, artista, priorita, stato, tentativi, cicli_completati,
           ultimo_successo, ultimo_errore, prossima_esecuzione
    FROM coda_archivio_vivo
    ORDER BY priorita DESC, titolo
    LIMIT 20
  `).all();
  const scansioni = await db.prepare(`
    SELECT titolo, artista, stato, versioni_individuate, nuove_o_aggiornate,
           durata_ms, dettaglio, completata_il
    FROM scansioni_archivio_vivo
    ORDER BY datetime(iniziata_il) DESC
    LIMIT 10
  `).all();
  return {
    stato: 'ok',
    coda: coda.results || [],
    scansioni: scansioni.results || []
  };
}
