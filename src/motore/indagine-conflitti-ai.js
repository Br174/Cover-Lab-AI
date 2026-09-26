const PROVIDER_AMMESSI = new Set(['youtube', 'cataloghi', 'internet_archive']);
const MASSIMO_STRATEGIE = 3;
const TIMEOUT_MS = 20000;

function testo(v, max = 500) {
  return String(v || '').trim().slice(0, max);
}

async function conTimeout(promessa, millisecondi) {
  let timer;
  try {
    return await Promise.race([
      promessa,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('INDAGINE_CONFLITTO_TIMEOUT')), millisecondi);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

export async function indagaConflittoConIA({ originale, versione, conflitto }, env) {
  if (!env?.AI?.run || !conflitto?.campo) {
    return {
      disponibile: false,
      ipotesi: null,
      domandaVerifica: null,
      strategie: []
    };
  }

  const messaggi = [
    {
      role: 'system',
      content: [
        'Sei l investigatore musicale di Cover Lab AI.',
        'Hai ricevuto due valori discordanti sullo stesso campo di una versione musicale.',
        'PRIMA devi capire se e un vero conflitto oppure se le fonti stanno descrivendo concetti diversi, per esempio anno di composizione, prima registrazione, pubblicazione, ristampa o caricamento online.',
        'Non scegliere un valore come vero solo perche ti sembra piu plausibile.',
        'Formula una ipotesi breve e una domanda precisa da verificare con fonti reali.',
        'Genera ricerche mirate per trovare conferme indipendenti. Le fonti disponibili per questa fase sono youtube, cataloghi e internet_archive.',
        'YouTube deve essere usato solo come fonte di dati e metadati, mai come riproduzione.',
        'Non dichiarare il conflitto risolto: questa funzione prepara l indagine, non sostituisce la prova.',
        'Rispondi esclusivamente con JSON valido nel formato {ipotesi:string, domandaVerifica:string, strategie:[{provider,query,lingua,paese,priorita}]}.',
        `Restituisci al massimo ${MASSIMO_STRATEGIE} strategie.`
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify({
        composizioneOriginale: originale || {},
        versione: versione || {},
        conflitto: {
          campo: conflitto.campo,
          valoreA: conflitto.valoreA,
          fonteA: conflitto.fonteA,
          valoreB: conflitto.valoreB,
          fonteB: conflitto.fonteB
        }
      })
    }
  ];

  try {
    const raw = await conTimeout(
      env.AI.run(env.MODELLO_CLASSIFICAZIONE || '@cf/zai-org/glm-4.7-flash', {
        messages: messaggi,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_completion_tokens: 700
      }),
      TIMEOUT_MS
    );
    const dati = leggiJson(raw) || {};
    const strategie = (Array.isArray(dati.strategie) ? dati.strategie : [])
      .slice(0, MASSIMO_STRATEGIE)
      .map(s => {
        const provider = testo(s?.provider, 40).toLowerCase();
        const query = testo(s?.query, 300);
        if (!PROVIDER_AMMESSI.has(provider) || !query) return null;
        const priorita = Math.max(1, Math.min(100, Number(s?.priorita) || 80));
        return {
          provider,
          query,
          lingua: testo(s?.lingua, 20) || null,
          paese: testo(s?.paese, 20) || null,
          priorita
        };
      })
      .filter(Boolean);

    return {
      disponibile: true,
      ipotesi: testo(dati.ipotesi, 1000) || null,
      domandaVerifica: testo(dati.domandaVerifica, 700) || null,
      strategie
    };
  } catch (e) {
    return {
      disponibile: true,
      ipotesi: null,
      domandaVerifica: null,
      strategie: [],
      errore: String(e?.message || 'Errore indagine AI').slice(0, 300)
    };
  }
}
