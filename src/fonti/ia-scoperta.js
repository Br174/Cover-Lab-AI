const PROVIDER_AMMESSI = new Set(['youtube', 'cataloghi', 'internet_archive']);

// Nessun limite complessivo al catalogo: questi limiti valgono SOLO per una
// singola tornata, così l'Archivio Vivo può continuare nei giri successivi
// senza bloccare la risposta per decine di secondi.
const MASSIMO_STRATEGIE_CONTESTO = 40;
const MASSIMO_CANDIDATI_CONTESTO = 80;
const MASSIMO_STRATEGIE_TORNATA = 8;
const MASSIMO_CANDIDATI_TORNATA = 16;
const MASSIMO_RISULTATI_SORGENTE_TORNATA = 30;
const TIMEOUT_PIANO_MS = 30000;
const TIMEOUT_FILTRO_MS = 25000;

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

function testo(valore, massimo = 300) {
  return String(valore || '').trim().slice(0, massimo);
}

function numero(valore, minimo = 0, massimo = 100) {
  const n = Number(valore);
  if (!Number.isFinite(n)) return minimo;
  return Math.max(minimo, Math.min(massimo, Math.round(n)));
}

async function conTimeout(promessa, millisecondi, etichetta) {
  let timer;
  try {
    return await Promise.race([
      promessa,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${etichetta}_TIMEOUT`)), millisecondi);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function generaPianoScopertaConIA({
  titolo,
  artista,
  compositore = null,
  anno = null,
  lingua = null,
  paese = null,
  strategieGiaUsate = [],
  candidatiGiaNoti = []
}, env) {
  if (!env?.AI?.run) {
    return { disponibile: false, strategie: [], candidati: [], esaurita: false };
  }

  const esclusioniStrategie = strategieGiaUsate
    .slice(-MASSIMO_STRATEGIE_CONTESTO)
    .map(s => ({ provider: s.provider, query: s.query }));
  const esclusioniCandidati = candidatiGiaNoti
    .slice(0, MASSIMO_CANDIDATI_CONTESTO)
    .map(c => ({ titolo: c.titolo, interprete: c.interprete, anno: c.anno }));

  const messaggi = [
    {
      role: 'system',
      content: [
        'Sei il ricercatore musicale di Cover Lab AI.',
        'Il tuo compito non e certificare: devi proporre piste plausibili per trovare cover, adattamenti e versioni della STESSA composizione.',
        'Cerca mentalmente anche versioni in altre lingue, titoli tradotti o completamente differenti, adattamenti locali, artisti internazionali, versioni storiche e recenti.',
        `In QUESTA singola tornata restituisci al massimo ${MASSIMO_STRATEGIE_TORNATA} strategie e ${MASSIMO_CANDIDATI_TORNATA} candidati, scegliendo le piste nuove a maggior valore.`,
        'NON esiste un limite complessivo: altre tornate continueranno a cercare e ad ampliare il catalogo.',
        'Non ripetere strategie o candidati gia forniti.',
        'Per ogni query indica il provider preferito tra youtube, cataloghi oppure internet_archive.',
        'YouTube e usato come fonte di scoperta: Cover Lab non cerca apposta un video YouTube per una cover trovata altrove.',
        'I candidati sono IPOTESI e verranno verificati dopo; se un dato non e ragionevolmente noto lascialo nullo invece di inventarlo.',
        'Imposta esaurita=true solo se non riesci davvero a proporre altre piste sostanzialmente nuove.',
        'Rispondi esclusivamente con JSON valido nel formato {strategie:[...], candidati:[...], esaurita:boolean}.',
        'Strategia: {provider, query, lingua, paese, priorita}.',
        'Candidato: {titolo, interprete, anno, lingua, paese, tipo, affidabilita}.'
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify({
        composizione: { titolo, artista, compositore, anno, lingua, paese },
        strategieGiaUsate: esclusioniStrategie,
        candidatiGiaNoti: esclusioniCandidati
      })
    }
  ];

  let raw;
  try {
    raw = await conTimeout(
      env.AI.run(env.MODELLO_CLASSIFICAZIONE || '@cf/zai-org/glm-4.7-flash', {
        messages: messaggi,
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_completion_tokens: 1200
      }),
      TIMEOUT_PIANO_MS,
      'PIANO_SCOPERTA'
    );
  } catch (e) {
    return {
      disponibile: true,
      strategie: [],
      candidati: [],
      esaurita: false,
      errore: e?.message || 'Errore AI non specificato'
    };
  }

  const dati = leggiJson(raw) || {};
  const strategie = (Array.isArray(dati.strategie) ? dati.strategie : [])
    .slice(0, MASSIMO_STRATEGIE_TORNATA)
    .map(s => {
      const provider = testo(s?.provider, 30).toLowerCase();
      const query = testo(s?.query, 300);
      if (!PROVIDER_AMMESSI.has(provider) || !query) return null;
      return {
        provider,
        query,
        lingua: testo(s?.lingua, 20) || null,
        paese: testo(s?.paese, 20) || null,
        priorita: numero(s?.priorita ?? 50, 1, 100)
      };
    })
    .filter(Boolean);

  const candidati = (Array.isArray(dati.candidati) ? dati.candidati : [])
    .slice(0, MASSIMO_CANDIDATI_TORNATA)
    .map(c => {
      const titoloCandidato = testo(c?.titolo, 250);
      if (!titoloCandidato) return null;
      const annoCandidato = Number(c?.anno);
      return {
        titolo: titoloCandidato,
        interprete: testo(c?.interprete, 200) || null,
        anno: Number.isInteger(annoCandidato) && annoCandidato > 1800 && annoCandidato < 2200 ? annoCandidato : null,
        lingua: testo(c?.lingua, 20) || null,
        paese: testo(c?.paese, 30) || null,
        tipo: testo(c?.tipo, 40) || 'dubbio',
        affidabilita: numero(c?.affidabilita ?? 25, 0, 80)
      };
    })
    .filter(Boolean);

  return {
    disponibile: true,
    strategie,
    candidati,
    esaurita: dati.esaurita === true
  };
}

export async function interpretaRisultatiSorgenteConIA(originale, elementi = [], env) {
  if (!env?.AI?.run || !elementi.length) return [];

  const input = elementi.slice(0, MASSIMO_RISULTATI_SORGENTE_TORNATA).map((e, indice) => ({
    indice,
    titolo: e.titolo,
    descrizione: e.descrizione,
    autoreCanale: e.autoreCanale,
    dataPubblicazione: e.dataPubblicazione,
    idEsterno: e.idEsterno
  }));

  const messaggi = [
    {
      role: 'system',
      content: [
        'Sei il filtro di scoperta di Cover Lab AI.',
        'Ricevi risultati provenienti da una piattaforma e la composizione originale.',
        'Individua solo elementi plausibilmente collegati alla stessa composizione.',
        'Non certificare una cover solo dal titolo: estrai un candidato da verificare ulteriormente.',
        'Se non riesci a distinguere interprete e titolo, non inventarli.',
        'Rispondi esclusivamente con JSON valido {risultati:[...]}.',
        'Ogni risultato: {indice, correlato, titolo, interprete, anno, lingua, paese, tipo, affidabilita, motivo}.'
      ].join(' ')
    },
    { role: 'user', content: JSON.stringify({ originale, elementi: input }) }
  ];

  try {
    const raw = await conTimeout(
      env.AI.run(env.MODELLO_CLASSIFICAZIONE || '@cf/zai-org/glm-4.7-flash', {
        messages: messaggi,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_completion_tokens: 1400
      }),
      TIMEOUT_FILTRO_MS,
      'FILTRO_SORGENTE'
    );
    const dati = leggiJson(raw) || {};
    return (Array.isArray(dati.risultati) ? dati.risultati : [])
      .filter(r => r?.correlato === true)
      .map(r => ({
        indice: Number(r.indice),
        titolo: testo(r.titolo, 250),
        interprete: testo(r.interprete, 200) || null,
        anno: Number.isInteger(Number(r.anno)) ? Number(r.anno) : null,
        lingua: testo(r.lingua, 20) || null,
        paese: testo(r.paese, 30) || null,
        tipo: testo(r.tipo, 40) || 'dubbio',
        affidabilita: numero(r.affidabilita ?? 25, 0, 85),
        motivo: testo(r.motivo, 300)
      }))
      .filter(r => Number.isInteger(r.indice) && r.indice >= 0 && r.indice < input.length && r.titolo);
  } catch {
    return [];
  }
}
