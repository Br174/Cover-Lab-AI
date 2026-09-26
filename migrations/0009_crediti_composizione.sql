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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crediti_composizione_unici
ON crediti_composizione(composizione_id, ruolo, nome);

CREATE INDEX IF NOT EXISTS idx_crediti_composizione_lookup
ON crediti_composizione(composizione_id, ruolo);
