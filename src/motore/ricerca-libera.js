function testo(valore, massimo = 300) {
  return String(valore || '').trim().slice(0, massimo);
}

function annoValido(valore) {
  const n = Number(valore);
  return Number.isInteger(n) && n >= 1800 && n <= 2200 ? n : null;
}

function leggiJson(raw) {
  if (!raw) return null;
  if (raw.response && typeof raw.response === 'object') return raw.response;
  if (typeof raw.response === 'string') {
    try { return JSON.parse(raw.response); } catch { /* continua */ }
  }
  const contenuto = raw?.choices?.[0]?.message?.content;
  if (typeof contenuto === 'string') {
    try { return JSON.parse(contenuto); } catch { /* continua */ }
  }
  return null;
}

function fallbackDeterministico(query) {
  const parti = String(query || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);

  const anno = parti.map(annoValido).find(Boolean) || null;
  const testuali = parti.filter(p => !annoValido(p));

  if (testuali.length >= 2) {
    return {
      stato: 'risolto_fallback',
      titolo: testuali[1],
      artista: testuali[0],
      anno,
      lingua: null,
      paese: null,
      confidenzaInterpretazione: 55,
      metodo: 'separazione_con_virgola'
    };
  }

  return {
    stato: 'dati_insufficienti',
    titolo: null,
    artista: null,
    anno,
    lingua: null,
    paese: null,
    confidenzaInterpretazione: 0,
    metodo: 'fallback_non_risolto'
  };
}

export async function interpretaRicercaLibera(query, env) {
  const richiesta = testo(query, 500);
  if (!richiesta) return { stato: 'vuota' };

  if (!env?.AI?.run) return fallbackDeterministico(richiesta);

  try {
    const raw = await env.AI.run(
      env.MODELLO_CLASSIFICAZIONE || '@cf/zai-org/glm-4.7-flash',
      {
        messages: [
          {
            role: 'system',
            content: [
              'Sei l interprete della barra diagnostica di Cover Lab AI.',
              'Ricevi testo libero che dovrebbe identificare una composizione musicale.',
              'Estrai titolo del brano, artista originale o artista di riferimento, eventuale anno, lingua e paese.',
              'L utente puo scrivere per esempio: "Gino Paoli, Sapore di sale", "Sapore di sale, Gino Paoli, 1963" oppure solo un titolo molto noto.',
              'Non devi inventare una composizione quando la richiesta e troppo generica o ambigua.',
              'Se riconosci con buona sicurezza una composizione restituisci stato="risolto".',
              'Se manca un dato essenziale o esistono piu possibilita plausibili restituisci stato="ambiguo".',
              'Questa interpretazione NON verifica la cover: serve solo a identificare la composizione da passare al motore reale.',
              'Rispondi esclusivamente con JSON valido: {stato,titolo,artista,anno,lingua,paese,confidenzaInterpretazione,motivo}.'
            ].join(' ')
          },
          { role: 'user', content: richiesta }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_completion_tokens: 450
      }
    );

    const dati = leggiJson(raw) || {};
    const stato = String(dati.stato || '').toLowerCase();
    const titolo = testo(dati.titolo, 250) || null;
    const artista = testo(dati.artista, 200) || null;
    const confidenza = Math.max(0, Math.min(100, Math.round(Number(dati.confidenzaInterpretazione) || 0)));

    if (stato === 'risolto' && titolo && artista && confidenza >= 60) {
      return {
        stato: 'risolto',
        titolo,
        artista,
        anno: annoValido(dati.anno),
        lingua: testo(dati.lingua, 30) || null,
        paese: testo(dati.paese, 30) || null,
        confidenzaInterpretazione: confidenza,
        motivo: testo(dati.motivo, 300) || null,
        metodo: 'regista_ai'
      };
    }

    const fallback = fallbackDeterministico(richiesta);
    if (fallback.stato === 'risolto_fallback') return fallback;

    return {
      stato: 'ambiguo',
      titolo,
      artista,
      anno: annoValido(dati.anno),
      lingua: testo(dati.lingua, 30) || null,
      paese: testo(dati.paese, 30) || null,
      confidenzaInterpretazione: confidenza,
      motivo: testo(dati.motivo, 300) || 'La richiesta non identifica con sufficiente certezza una sola composizione.',
      metodo: 'regista_ai'
    };
  } catch (e) {
    return {
      ...fallbackDeterministico(richiesta),
      erroreInterpretazione: String(e?.message || 'Errore AI').slice(0, 300)
    };
  }
}
