export function scopertaScaduta(ultimaGenerazione, ore = 168, adessoMs = Date.now()) {
  if (!ultimaGenerazione) return true;
  const istante = Date.parse(String(ultimaGenerazione).replace(' ', 'T') + (String(ultimaGenerazione).includes('Z') ? '' : 'Z'));
  if (!Number.isFinite(istante)) return true;
  const sogliaMs = Math.max(1, Number(ore) || 168) * 60 * 60 * 1000;
  return adessoMs - istante >= sogliaMs;
}

export async function riapriScopertaSeScaduta(db, chiave, ore = 168) {
  if (!db || !chiave) return { riaperta: false, strategieRiattivate: 0 };
  const stato = await db.prepare(`
    SELECT ia_esaurita, ultima_generazione_ia
    FROM stato_scoperta_composizione
    WHERE chiave_composizione=?1
    LIMIT 1
  `).bind(chiave).first();

  const oreValide = Math.max(1, Math.min(24 * 365, Number(ore) || 168));
  const modifier = `-${oreValide} hours`;
  const esauritaEVecchia = Number(stato?.ia_esaurita || 0) === 1
    && scopertaScaduta(stato?.ultima_generazione_ia, oreValide);

  if (esauritaEVecchia) {
    await db.prepare(`
      UPDATE stato_scoperta_composizione
      SET ia_esaurita=0, aggiornato_il=CURRENT_TIMESTAMP
      WHERE chiave_composizione=?1
    `).bind(chiave).run();
  }

  const risultato = await db.prepare(`
    UPDATE strategie_scoperta
    SET stato='in_attesa', cursore=NULL, ultimo_errore=NULL,
        aggiornata_il=CURRENT_TIMESTAMP
    WHERE chiave_composizione=?1
      AND stato='esaurita'
      AND datetime(aggiornata_il) <= datetime('now', ?2)
  `).bind(chiave, modifier).run();

  return {
    riaperta: esauritaEVecchia,
    strategieRiattivate: Number(risultato?.meta?.changes || 0)
  };
}
