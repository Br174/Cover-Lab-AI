import { creaChiaveDuplicato, normalizzaTesto } from './normalizzazione.js';

export function deduplicaVersioni(versioni = []) {
  const perId = new Map();
  const perChiave = new Map();
  const risultato = [];

  for (const versione of versioni) {
    if (versione.idMusicBrainz && perId.has(versione.idMusicBrainz)) continue;

    const chiave = creaChiaveDuplicato(versione);
    const chiaveMorbida = `${normalizzaTesto(versione.titolo)}::${normalizzaTesto(versione.interprete)}`;
    const esistente = perChiave.get(chiave) || perChiave.get(chiaveMorbida);

    if (esistente && Math.abs((esistente.anno || 0) - (versione.anno || 0)) <= 1) {
      if ((versione.affidabilita || 0) > (esistente.affidabilita || 0)) {
        Object.assign(esistente, versione);
      }
      continue;
    }

    risultato.push(versione);
    if (versione.idMusicBrainz) perId.set(versione.idMusicBrainz, versione);
    perChiave.set(chiave, versione);
    perChiave.set(chiaveMorbida, versione);
  }

  return risultato;
}
