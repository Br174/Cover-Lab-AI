const TIPI_AMMESSI = new Set([
  'cover', 'adattamento', 'live', 'strumentale', 'remix', 'karaoke',
  'originale', 'duplicato', 'non correlato', 'dubbio'
]);

function limita(n, min = 0, max = 100) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function leggiRisposta(raw) {
  if (!raw) return null;
  if (raw.response && typeof raw.response === 'object') return raw.response;
  if (typeof raw.response === 'string') {
    try { return JSON.parse(raw.response); } catch { /* ignora */ }
  }
  const contenuto = raw?.choices?.[0]?.message?.content;
  if (typeof contenuto === 'string') {
    try { return JSON.parse(contenuto); } catch { /* ignora */ }
  }
  return null;
}

export async function verificaCandidatiConIA(versioni, originale, env, massimo = 12) {
  if (!env?.AI?.run) return versioni;

  const dubbi = versioni
    .filter(v => (v.affidabilita || 0) < 90 || v.tipo === 'dubbio')
    .slice(0, Math.max(0, massimo));
  if (!dubbi.length) return versioni;

  const candidati = dubbi.map((v, indice) => ({
    indice,
    id: v.idMusicBrainz || null,
    titolo: v.titolo,
    interprete: v.interprete,
    anno: v.anno,
    lingua: v.lingua,
    attributi: v.attributi || [],
    tipoAttuale: v.tipo,
    affidabilitaAttuale: v.affidabilita,
    stessaComposizione: Boolean(v.stessaComposizione),
    derivazione: Boolean(v.derivazione),
    derivazioneTradotta: Boolean(v.derivazioneTradotta)
  }));

  const messaggi = [
    {
      role: 'system',
      content: [
        'Sei il verificatore musicale di Cover Lab AI.',
        'Classifica SOLO in base ai dati forniti. Non inventare artisti, anni, lingue o relazioni.',
        'Tipi ammessi: cover, adattamento, live, strumentale, remix, karaoke, originale, duplicato, non correlato, dubbio.',
        'Se le prove non bastano usa dubbio. Rispondi esclusivamente con JSON valido.'
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify({ originale, candidati })
    }
  ];

  let raw;
  try {
    raw = await env.AI.run(env.MODELLO_CLASSIFICAZIONE || '@cf/zai-org/glm-4.7-flash', {
      messages: messaggi,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_completion_tokens: 1200
    });
  } catch {
    return versioni;
  }

  const dati = leggiRisposta(raw);
  const risultati = Array.isArray(dati?.risultati) ? dati.risultati : [];
  if (!risultati.length) return versioni;

  const aggiornate = [...versioni];
  for (const esito of risultati) {
    const indiceLocale = Number(esito?.indice);
    if (!Number.isInteger(indiceLocale) || indiceLocale < 0 || indiceLocale >= dubbi.length) continue;
    const tipo = String(esito?.tipo || '').toLowerCase().trim();
    if (!TIPI_AMMESSI.has(tipo)) continue;

    const bersaglio = dubbi[indiceLocale];
    const indiceGlobale = aggiornate.indexOf(bersaglio);
    if (indiceGlobale < 0) continue;

    const affidabilitaIA = limita(esito.affidabilita, 0, 100);
    const affidabilita = Math.max(bersaglio.affidabilita || 0, affidabilitaIA);
    aggiornate[indiceGlobale] = {
      ...bersaglio,
      tipo,
      affidabilita,
      motivoClassificazione: String(esito?.motivo || 'verifica intelligente').slice(0, 240),
      statoVerifica: affidabilita >= 90 ? 'verificato_ia' : 'da_verificare'
    };
  }

  return aggiornate;
}
