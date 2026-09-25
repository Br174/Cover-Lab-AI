CREATE TABLE IF NOT EXISTS coda_archivio_vivo (
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
);

CREATE INDEX IF NOT EXISTS idx_coda_archivio_vivo_pronta
  ON coda_archivio_vivo(stato, prossima_esecuzione, priorita DESC);
CREATE INDEX IF NOT EXISTS idx_coda_archivio_vivo_successo
  ON coda_archivio_vivo(ultimo_successo);

CREATE TABLE IF NOT EXISTS scansioni_archivio_vivo (
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
);

CREATE INDEX IF NOT EXISTS idx_scansioni_archivio_vivo_chiave
  ON scansioni_archivio_vivo(chiave_ricerca, iniziata_il DESC);

CREATE TABLE IF NOT EXISTS configurazione_archivio_vivo (
  chiave TEXT PRIMARY KEY,
  valore TEXT NOT NULL,
  aggiornato_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO configurazione_archivio_vivo(chiave, valore) VALUES
  ('abilitato', '1'),
  ('voci_per_giro', '1'),
  ('ricontrollo_ore', '168'),
  ('ritenta_errore_ore', '6'),
  ('lotto_visualizzazione_music_lab', '20');

-- Primo lotto iniziale italiano. Non e una classifica definitiva: serve ad avviare
-- l'archivio autonomo mentre il catalogo verra poi ampliato progressivamente.
INSERT OR IGNORE INTO coda_archivio_vivo(
  id, chiave_ricerca, titolo, artista, paese, lingua, priorita, motivo
) VALUES
  ('seed-it-001', 'nel blu dipinto di blu|domenico modugno', 'Nel blu dipinto di blu', 'Domenico Modugno', 'IT', 'it', 100, 'lotto italiano iniziale'),
  ('seed-it-002', 'sapore di sale|gino paoli', 'Sapore di sale', 'Gino Paoli', 'IT', 'it', 99, 'lotto italiano iniziale'),
  ('seed-it-003', 'azzurro|adriano celentano', 'Azzurro', 'Adriano Celentano', 'IT', 'it', 98, 'lotto italiano iniziale'),
  ('seed-it-004', 'il cielo in una stanza|gino paoli', 'Il cielo in una stanza', 'Gino Paoli', 'IT', 'it', 97, 'lotto italiano iniziale'),
  ('seed-it-005', 'caruso|lucio dalla', 'Caruso', 'Lucio Dalla', 'IT', 'it', 96, 'lotto italiano iniziale'),
  ('seed-it-006', 'la canzone del sole|lucio battisti', 'La canzone del sole', 'Lucio Battisti', 'IT', 'it', 95, 'lotto italiano iniziale'),
  ('seed-it-007', 'almeno tu nell universo|mia martini', 'Almeno tu nell universo', 'Mia Martini', 'IT', 'it', 94, 'lotto italiano iniziale'),
  ('seed-it-008', 'con te partiro|andrea bocelli', 'Con te partiro', 'Andrea Bocelli', 'IT', 'it', 93, 'lotto italiano iniziale'),
  ('seed-it-009', 'l italiano|toto cutugno', 'L italiano', 'Toto Cutugno', 'IT', 'it', 92, 'lotto italiano iniziale'),
  ('seed-it-010', 'gloria|umberto tozzi', 'Gloria', 'Umberto Tozzi', 'IT', 'it', 91, 'lotto italiano iniziale');
