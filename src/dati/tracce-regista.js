export async function salvaTracciaRegistaAI(db, {
  chiaveComposizione,
  giro = 0,
  agenda = [],
  domandeEsplorate = [],
  nuoveDomande = [],
  strategie = []
} = {}) {
  if (!db || !chiaveComposizione) return false;
  try {
    await db.prepare(`
      INSERT INTO tracce_regista_ai(
        id, chiave_composizione, giro, agenda_json,
        domande_esplorate_json, nuove_domande_json, strategie_json
      ) VALUES (?1,?2,?3,?4,?5,?6,?7)
    `).bind(
      crypto.randomUUID(),
      chiaveComposizione,
      Number(giro || 0),
      JSON.stringify(agenda || []).slice(0, 12000),
      JSON.stringify(domandeEsplorate || []).slice(0, 12000),
      JSON.stringify(nuoveDomande || []).slice(0, 12000),
      JSON.stringify(strategie || []).slice(0, 16000)
    ).run();
    return true;
  } catch (e) {
    if (String(e?.message || '').includes('no such table')) return false;
    throw e;
  }
}
