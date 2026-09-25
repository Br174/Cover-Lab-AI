import { applicaPolicyMusicLab } from '../motore/policy-fonti-media.js';

function raggruppa(righe = []) {
  const mappa = new Map();
  for (const riga of righe) {
    const id = riga.versione_id;
    if (!mappa.has(id)) mappa.set(id, []);
    mappa.get(id).push(riga);
  }
  return mappa;
}

export async function aggiungiFontiECrediti(db, versioni = []) {
  if (!db || !versioni.length) return versioni.map(applicaPolicyMusicLab);
  const ids = versioni.map(v => v.id).filter(Boolean);
  if (!ids.length) return versioni.map(applicaPolicyMusicLab);
  const segnaposto = ids.map((_, i) => `?${i + 1}`).join(',');

  let fonti = [];
  try {
    const risultato = await db.prepare(`
      SELECT versione_id, fonte, id_esterno AS idEsterno, indirizzo, nota, data_verifica AS dataVerifica
      FROM fonti_verifica
      WHERE versione_id IN (${segnaposto})
      ORDER BY data_verifica DESC
    `).bind(...ids).all();
    fonti = risultato.results || [];
  } catch {
    fonti = [];
  }

  let crediti = [];
  try {
    const risultato = await db.prepare(`
      SELECT versione_id, ruolo, nome, fonte, id_esterno AS idEsterno, nota
      FROM crediti_versione
      WHERE versione_id IN (${segnaposto})
      ORDER BY ruolo, nome
    `).bind(...ids).all();
    crediti = risultato.results || [];
  } catch {
    crediti = [];
  }

  const fontiPerVersione = raggruppa(fonti);
  const creditiPerVersione = raggruppa(crediti);
  return versioni.map(versione => applicaPolicyMusicLab({
    ...versione,
    fonti: (fontiPerVersione.get(versione.id) || []).map(({ versione_id, ...resto }) => resto),
    crediti: (creditiPerVersione.get(versione.id) || []).map(({ versione_id, ...resto }) => resto)
  }));
}
