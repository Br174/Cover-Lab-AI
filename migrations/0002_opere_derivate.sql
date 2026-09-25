ALTER TABLE versioni ADD COLUMN id_opera_musicbrainz TEXT;
ALTER TABLE versioni ADD COLUMN titolo_opera TEXT;
ALTER TABLE versioni ADD COLUMN derivazione INTEGER NOT NULL DEFAULT 0;
ALTER TABLE versioni ADD COLUMN derivazione_tradotta INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_versioni_opera_musicbrainz ON versioni(id_opera_musicbrainz);
CREATE INDEX IF NOT EXISTS idx_versioni_derivazione ON versioni(derivazione, derivazione_tradotta);

CREATE TABLE IF NOT EXISTS opere_collegate (
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
);

CREATE INDEX IF NOT EXISTS idx_opere_collegate_composizione ON opere_collegate(composizione_id);
CREATE INDEX IF NOT EXISTS idx_opere_collegate_tradotte ON opere_collegate(tradotta, analizzata);
