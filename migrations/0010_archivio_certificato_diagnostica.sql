ALTER TABLE versioni ADD COLUMN stato_archivio TEXT NOT NULL DEFAULT 'da_rivalidare';
ALTER TABLE versioni ADD COLUMN motivo_archivio TEXT;
ALTER TABLE versioni ADD COLUMN data_ammissione_archivio TEXT;

CREATE INDEX IF NOT EXISTS idx_versioni_stato_archivio
ON versioni(composizione_id, stato_archivio, anno);

CREATE TABLE IF NOT EXISTS tracce_regista_ai (
  id TEXT PRIMARY KEY,
  chiave_composizione TEXT NOT NULL,
  giro INTEGER NOT NULL DEFAULT 0,
  agenda_json TEXT,
  domande_esplorate_json TEXT,
  nuove_domande_json TEXT,
  strategie_json TEXT,
  creata_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracce_regista_chiave
ON tracce_regista_ai(chiave_composizione, creata_il DESC);

-- Le versioni gia presenti vengono ammesse all'Archivio ufficiale solo se esiste
-- una relazione strutturata verso un'opera e almeno un credito essenziale
-- dell'opera/versione. Le altre restano conservate come materiale da rivalidare.
UPDATE versioni
SET stato_archivio='archiviata',
    motivo_archivio='Rivalidazione automatica: relazione MusicBrainz e crediti essenziali disponibili.',
    data_ammissione_archivio=COALESCE(data_ammissione_archivio, CURRENT_TIMESTAMP)
WHERE id_opera_musicbrainz IS NOT NULL
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
  );

INSERT OR REPLACE INTO configurazione_archivio_vivo(chiave, valore, aggiornato_il)
VALUES
  ('archivio_richiede_crediti_essenziali', '1', CURRENT_TIMESTAMP),
  ('strategie_provider_per_giro', '3', CURRENT_TIMESTAMP),
  ('candidati_verifica_per_giro', '5', CURRENT_TIMESTAMP),
  ('query_ia_per_giro', '18', CURRENT_TIMESTAMP),
  ('candidati_ia_per_giro', '45', CURRENT_TIMESTAMP);
