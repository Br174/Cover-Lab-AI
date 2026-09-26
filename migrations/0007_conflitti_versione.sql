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
  FOREIGN KEY(versione_id) REFERENCES versioni(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conflitti_versione_unico
  ON conflitti_versione(versione_id, campo, valore_a, fonte_a, valore_b, fonte_b);
CREATE INDEX IF NOT EXISTS idx_conflitti_versione_aperti
  ON conflitti_versione(versione_id, stato, campo);
