const TIPI_AMMESSI = new Set([
  'cover', 'adattamento', 'live', 'strumentale', 'remix', 'karaoke',
  'originale', 'duplicato', 'non correlato', 'dubbio'
]);

const RUOLI_CREDITO_AMMESSI = new Set([
  'compositore', 'paroliere', 'autore', 'coautore', 'adattatore',
  'traduttore', 'autore_nuovo_testo', 'arrangiatore', 'produttore'
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

function normalizzaCreditiAI(crediti = []) {
  const risultato = [];
  const visti = new Set();
  for (const c of Array.isArray(crediti) ? crediti : []) {
    const ruolo = String(c?.ruolo || '').trim().toLowerCase().replace(/\s+/g, '_');
    const nome = String(c?.nome || '').trim();
    if (!nome || !RUOLI_CREDITO_AMMESSI.has(ruolo)) continue;
    const chiave = `${ruolo}::${nome.toLocaleLowerCase('it')}`;
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    risultato.push({
      ruolo,
      nome,
      fonte: 'ai_arricchimento',
      nota: 'Credito aggiunto come arricchimento AI; da rivalidare con una fonte esterna quando disponibile.'
    });
  }
  return risultato;
}

export async function verificaCandidatoConIA({ candidato, originale, fonti = [], creditiOriginale = [] }, env) {
  if (!env?.AI?.run || !candidato?.titolo || !candidato?.interprete || !fonti.length) {
    return { disponibile: false, confermato: false, crediti: [] };
  }

  const fontiSintesi = fonti.slice(0, 8).map(f => ({
    fonte: f.fonte || null,
    titolo: f.titoloFonte || null,
    descrizione: f.descrizione || null,
    data: f.dataPubblicazione || null,
    id: f.idEsterno || null
  }));

  const messaggi = [
    {
      role: 'system',
      content: [
        'Sei il passaggio di ARRICCHIMENTO di Cover Lab AI.',
        'Esiste gia almeno una fonte reale associata al candidato. Se il motore lo ha gia confermato, non devi rimettere in discussione la sua esistenza.',
        'Il tuo compito principale e classificare meglio la natura della versione e completare soltanto i crediti mancanti.',
        'Puoi usare la tua conoscenza musicale interna per proporre compositore, paroliere, autore, adattatore, traduttore, arrangiatore o produttore mancanti.',
        'I crediti che aggiungi saranno marcati come arricchimento AI e potranno essere rivalidati in seguito da una fonte esterna.',
        'Il campo confermato indica solo una coerenza supplementare tra candidato, fonte e composizione; non e un veto su una conferma gia ottenuta dal motore.',
        'Se noti chiaramente un omonimo o una relazione diversa, segnala confermato=false e spiega il motivo: il motore usera questa informazione come diagnostica o controllo supplementare.',
        'Rispondi esclusivamente JSON con: confermato, tipo, affidabilita, motivo, crediti[].'
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify({
        originale,
        candidato: {
          titolo: candidato.titolo,
          interprete: candidato.interprete,
          anno: candidato.anno || null,
          lingua: candidato.lingua || null,
          tipoProposto: candidato.tipo_proposto || candidato.tipo || null,
          affidabilitaProposta: candidato.affidabilita_proposta || candidato.affidabilita || 0
        },
        fonti: fontiSintesi,
        creditiOriginale: (creditiOriginale || []).slice(0, 20)
      })
    }
  ];

  try {
    const raw = await env.AI.run(env.MODELLO_CLASSIFICAZIONE || '@cf/zai-org/glm-4.7-flash', {
      messages: messaggi,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_completion_tokens: 1000
    });
    const dati = leggiRisposta(raw);
    if (!dati || typeof dati !== 'object') {
      return { disponibile: true, confermato: false, errore: 'RISPOSTA_AI_NON_INTERPRETABILE', crediti: [] };
    }
    const tipo = String(dati.tipo || candidato.tipo_proposto || 'cover').trim().toLowerCase();
    const affidabilita = limita(dati.affidabilita, 0, 100);
    const confermato = dati.confermato === true && TIPI_AMMESSI.has(tipo) && !['originale', 'duplicato', 'non correlato', 'dubbio'].includes(tipo);
    return {
      disponibile: true,
      confermato,
      tipo: TIPI_AMMESSI.has(tipo) ? tipo : 'dubbio',
      affidabilita,
      motivo: String(dati.motivo || 'Arricchimento AI su fonte reale.').slice(0, 500),
      crediti: normalizzaCreditiAI(dati.crediti)
    };
  } catch (e) {
    return {
      disponibile: true,
      confermato: false,
      errore: String(e?.message || 'Errore arricchimento AI').slice(0, 500),
      crediti: []
    };
  }
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
