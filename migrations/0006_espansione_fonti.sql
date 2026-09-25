INSERT OR IGNORE INTO stato_provider(provider, stato) VALUES
  ('internet_archive', 'disponibile');

INSERT OR IGNORE INTO configurazione_archivio_vivo(chiave, valore) VALUES
  ('risultati_minimi_sospetti', '3'),
  ('strategie_fallback_per_giro', '3'),
  ('internet_archive_abilitato', '1');
