function testo(valore) {
  if (valore == null) return null;
  const s = String(valore).trim();
  return s || null;
}

function normalizzaLingua(valore) {
  const v = String(valore || '').trim().toLowerCase();
  const mappa = {
    ita: 'it', italian: 'it', italiano: 'it',
    eng: 'en', english: 'en', inglese: 'en',
    spa: 'es', Spanish: 'es', spagnolo: 'es',
    fra: 'fr', fre: 'fr', french: 'fr', francese: 'fr',
    deu: 'de', ger: 'de', german: 'de', tedesco: 'de',
    por: 'pt', portuguese: 'pt', portoghese: 'pt'
  };
  return mappa[v] || v;
}

function equivalenti(campo, a, b) {
  if (a == null || b == null) return true;
  if (campo === 'anno') return Number(a) === Number(b);
  if (campo === 'lingua') return normalizzaLingua(a) === normalizzaLingua(b);
  if (campo === 'paese') {
    const pa = String(a).trim().toUpperCase();
    const pb = String(b).trim().toUpperCase();
    if (pa.length !== 2 || pb.length !== 2) return true;
    return pa === pb;
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

export function individuaConflittiTraCandidatoEVerifica(candidato, versioneVerificata, fonti = []) {
  if (!candidato || !versioneVerificata || !fonti.length) return [];
  const nomiFonti = [...new Set(fonti.map(f => String(f?.fonte || '').trim()).filter(Boolean))];
  if (!nomiFonti.length) return [];
  const fonteCandidato = nomiFonti.join('+');
  const fonteVerifica = 'musicbrainz';
  const campi = ['anno', 'lingua', 'paese'];
  const conflitti = [];

  for (const campo of campi) {
    const a = candidato[campo];
    const b = versioneVerificata[campo];
    if (a == null || b == null || equivalenti(campo, a, b)) continue;
    conflitti.push({
      campo,
      valoreA: testo(a),
      fonteA: fonteCandidato,
      valoreB: testo(b),
      fonteB: fonteVerifica
    });
  }
  return conflitti;
}

export async function salvaConflittiVersione(db, versioneId, conflitti = []) {
  if (!db || !versioneId || !conflitti.length) return 0;
  let salvati = 0;
  for (const conflitto of conflitti) {
    if (!conflitto?.campo || conflitto.valoreA == null || conflitto.valoreB == null) continue;
    try {
      const esito = await db.prepare(`
        INSERT INTO conflitti_versione(
          id, versione_id, campo, valore_a, fonte_a, valore_b, fonte_b,
          stato, rilevato_il, aggiornato_il
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,'aperto',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(versione_id, campo, valore_a, fonte_a, valore_b, fonte_b)
        DO UPDATE SET aggiornato_il=CURRENT_TIMESTAMP
      `).bind(
        crypto.randomUUID(), versioneId, conflitto.campo,
        String(conflitto.valoreA), String(conflitto.fonteA || 'fonte_non_specificata'),
        String(conflitto.valoreB), String(conflitto.fonteB || 'fonte_non_specificata')
      ).run();
      if (esito) salvati += 1;
    } catch (e) {
      if (String(e?.message || '').includes('no such table')) return 0;
      throw e;
    }
  }
  return salvati;
}

export async function leggiConflittiVersioni(db, ids = []) {
  if (!db || !ids.length) return [];
  const segnaposto = ids.map((_, i) => `?${i + 1}`).join(',');
  try {
    const risultato = await db.prepare(`
      SELECT versione_id, campo,
             valore_a AS valoreA, fonte_a AS fonteA,
             valore_b AS valoreB, fonte_b AS fonteB,
             stato, valore_risolto AS valoreRisolto,
             fonte_risoluzione AS fonteRisoluzione,
             rilevato_il AS rilevatoIl, aggiornato_il AS aggiornatoIl
      FROM conflitti_versione
      WHERE versione_id IN (${segnaposto})
      ORDER BY CASE WHEN stato='aperto' THEN 0 ELSE 1 END, campo, aggiornato_il DESC
    `).bind(...ids).all();
    return risultato.results || [];
  } catch (e) {
    if (String(e?.message || '').includes('no such table')) return [];
    throw e;
  }
}
