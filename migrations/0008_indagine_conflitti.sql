ALTER TABLE conflitti_versione ADD COLUMN ipotesi_ai TEXT;
ALTER TABLE conflitti_versione ADD COLUMN domanda_verifica TEXT;
ALTER TABLE conflitti_versione ADD COLUMN strategie_generate INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conflitti_versione ADD COLUMN ultimo_tentativo TEXT;

INSERT OR IGNORE INTO configurazione_archivio_vivo(chiave, valore) VALUES
  ('conflitti_indagine_per_giro', '2');
