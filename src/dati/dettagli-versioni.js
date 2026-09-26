import { applicaPolicyMusicLab } from '../motore/policy-fonti-media.js';
import { applicaNaturaVersione } from '../motore/natura-versione.js';
import { leggiConflittiVersioni } from './conflitti-versione.js';

function raggruppa(righe = []) {
  const mappa = new Map();
  for (const riga of righe) {
    const id = riga.versione_id;
    if (!mappa.has(id)) mappa.set(id, []);
    mappa.get(id).push(riga);
  }
  return mappa;
}

function completaStatoQualita(versione, conflitti = []) {
  const nonRisolti = conflitti.filter(c => c.stato !== 'risolto');
  const inIndagine = conflitti.filter(c => c.stato === 'in_indagine');
  return {
    ...versione,
    confidenza: Number(versione.affidabilita || 0),
    statoVerifica: versione.statoVerifica || 'da_verificare',
    haConflitti: nonRisolti.length > 0,
    conflittiAperti: nonRisolti.length,
    conflittiInIndagine: inIndagine.length,
    conflitti
  };
}

function completaCrediti(versione = {}) {
  const crediti = Array.isArray(versione.crediti) ? [...versione.crediti] : [];
  const interprete = String(versione.interprete || '').trim();
  if (interprete && !crediti.some(c => String(c?.ruolo || '').toLowerCase() === 'interprete' && String(c?.nome || '').trim() === interprete)) {
    crediti.unshift({
      ruolo: 'interprete',
      nome: interprete,
      fonte: versione.idMusicBrainz ? 'musicbrainz' : null,
      idEsterno: versione.idMusicBrainz || null,
      nota: 'Credito base derivato dall identita della versione.'
    });
  }
  return { ...versione, crediti };
}

function completaVersione(versione, conflitti = []) {
  return applicaPolicyMusicLab(
    applicaNaturaVersione(
      completaCrediti(
        completaStatoQualita(versione, conflitti)
      )
    )
  );
}

export async function aggiungiFontiECrediti(db, versioni = []) {
  if (!db || !versioni.length) {
    return versioni.map(v => completaVersione(v, []));
  }
  const ids = versioni.map(v => v.id).filter(Boolean);
  if (!ids.length) {
    return versioni.map(v => completaVersione(v, []));
  }
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

  const conflitti = await leggiConflittiVersioni(db, ids);
  const fontiPerVersione = raggruppa(fonti);
  const creditiPerVersione = raggruppa(crediti);
  const conflittiPerVersione = raggruppa(conflitti);

  return versioni.map(versione => completaVersione({
    ...versione,
    fonti: (fontiPerVersione.get(versione.id) || []).map(({ versione_id, ...resto }) => resto),
    crediti: (creditiPerVersione.get(versione.id) || []).map(({ versione_id, ...resto }) => resto)
  }, (conflittiPerVersione.get(versione.id) || []).map(({ versione_id, ...resto }) => resto)));
}
