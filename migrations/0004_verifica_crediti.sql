ALTER TABLE candidati_scoperta ADD COLUMN affidabilita_verificata INTEGER NOT NULL DEFAULT 0;
ALTER TABLE candidati_scoperta ADD COLUMN motivo_verifica TEXT;
ALTER TABLE candidati_scoperta ADD COLUMN versione_id TEXT;

CREATE INDEX IF NOT EXISTS idx_candidati_scoperta_verifica
  ON candidati_scoperta(chiave_composizione, stato, numero_fonti DESC, affidabilita_proposta DESC);

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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crediti_versione_unico
  ON crediti_versione(versione_id, ruolo, nome, COALESCE(fonte, ''));
CREATE INDEX IF NOT EXISTS idx_crediti_versione_versione
  ON crediti_versione(versione_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fonti_verifica_unica
  ON fonti_verifica(versione_id, fonte, id_esterno)
  WHERE id_esterno IS NOT NULL;

INSERT OR IGNORE INTO configurazione_archivio_vivo(chiave, valore) VALUES
  ('candidati_verifica_per_giro', '2'),
  ('soglia_promozione_candidato', '90');
