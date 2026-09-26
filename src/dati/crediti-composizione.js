async function garantisciSchema(db) {
  if (!db) return false;
  await db.prepare(`
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
    )
  `).run();
  await db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crediti_composizione_unici
    ON crediti_composizione(composizione_id, ruolo, nome)
  `).run();
  return true;
}

function pulisciCredito(credito = {}) {
  const ruolo = String(credito.ruolo || '').trim().toLowerCase();
  const nome = String(credito.nome || '').trim();
  if (!ruolo || !nome) return null;
  return {
    ruolo,
    nome,
    fonte: credito.fonte ? String(credito.fonte).trim() : null,
    idEsterno: credito.idEsterno ? String(credito.idEsterno).trim() : null,
    nota: credito.nota ? String(credito.nota).slice(0, 1000) : null
  };
}

export async function salvaCreditiComposizione(db, composizioneId, crediti = []) {
  if (!db || !composizioneId || !Array.isArray(crediti) || !crediti.length) return 0;
  await garantisciSchema(db);
  let salvati = 0;
  for (const voce of crediti) {
    const credito = pulisciCredito(voce);
    if (!credito) continue;
    await db.prepare(`
      INSERT INTO crediti_composizione(
        composizione_id, ruolo, nome, fonte, id_esterno, nota, data_verifica
      ) VALUES (?1,?2,?3,?4,?5,?6,CURRENT_TIMESTAMP)
      ON CONFLICT(composizione_id, ruolo, nome) DO UPDATE SET
        fonte=COALESCE(excluded.fonte, crediti_composizione.fonte),
        id_esterno=COALESCE(excluded.id_esterno, crediti_composizione.id_esterno),
        nota=COALESCE(excluded.nota, crediti_composizione.nota),
        data_verifica=CURRENT_TIMESTAMP
    `).bind(
      composizioneId,
      credito.ruolo,
      credito.nome,
      credito.fonte,
      credito.idEsterno,
      credito.nota
    ).run();
    salvati += 1;
  }
  return salvati;
}

export async function leggiCreditiComposizione(db, composizioneId) {
  if (!db || !composizioneId) return [];
  try {
    await garantisciSchema(db);
    const risultato = await db.prepare(`
      SELECT ruolo, nome, fonte, id_esterno AS idEsterno, nota,
             data_verifica AS dataVerifica
      FROM crediti_composizione
      WHERE composizione_id=?1
      ORDER BY CASE ruolo
        WHEN 'compositore' THEN 1
        WHEN 'paroliere' THEN 2
        WHEN 'autore' THEN 3
        WHEN 'traduttore' THEN 4
        WHEN 'adattatore' THEN 5
        WHEN 'arrangiatore' THEN 6
        ELSE 20 END,
        nome COLLATE NOCASE
    `).bind(composizioneId).all();
    return risultato.results || [];
  } catch (e) {
    if (String(e?.message || '').includes('no such table')) return [];
    throw e;
  }
}
