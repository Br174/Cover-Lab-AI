-- Cover Lab AI 0.8.0 - stato persistente del Gestore Limiti e Regole Fonti.
-- Conserva solo contatori/tempi operativi, mai media o contenuti dei provider.
CREATE TABLE IF NOT EXISTS limiti_provider_runtime (
  provider TEXT PRIMARY KEY,
  finestra_quota TEXT,
  chiamate_finestra INTEGER NOT NULL DEFAULT 0,
  ultimo_accesso_ms INTEGER NOT NULL DEFAULT 0,
  sospeso_fino_ms INTEGER NOT NULL DEFAULT 0,
  ultimo_http INTEGER,
  aggiornato_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_limiti_provider_sospeso
ON limiti_provider_runtime(sospeso_fino_ms);
