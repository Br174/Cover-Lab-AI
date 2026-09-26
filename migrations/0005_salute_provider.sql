CREATE TABLE IF NOT EXISTS stato_provider (
  provider TEXT PRIMARY KEY,
  stato TEXT NOT NULL DEFAULT 'sconosciuto',
  errori_consecutivi INTEGER NOT NULL DEFAULT 0,
  sospeso_fino TEXT,
  ultimo_successo TEXT,
  ultimo_errore TEXT,
  codice_ultimo_errore INTEGER,
  chiamate_totali INTEGER NOT NULL DEFAULT 0,
  errori_totali INTEGER NOT NULL DEFAULT 0,
  risultati_totali INTEGER NOT NULL DEFAULT 0,
  latenza_media_ms REAL NOT NULL DEFAULT 0,
  latenza_massima_ms INTEGER NOT NULL DEFAULT 0,
  ultima_durata_ms INTEGER,
  aggiornato_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stato_provider_stato
  ON stato_provider(stato, sospeso_fino);

INSERT OR IGNORE INTO stato_provider(provider, stato) VALUES
  ('musicbrainz', 'disponibile'),
  ('apple_catalogo', 'disponibile'),
  ('youtube', 'da_configurare');

INSERT OR IGNORE INTO configurazione_archivio_vivo(chiave, valore) VALUES
  ('circuit_breaker_errori_consecutivi', '3'),
  ('circuit_breaker_sospensione_minuti', '30'),
  ('provider_timeout_ms', '8000'),
  ('source_router_abilitato', '1');
