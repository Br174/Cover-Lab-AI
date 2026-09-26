const PROVIDER_AMMESSI = new Set(['youtube', 'cataloghi', 'internet_archive']);

// Nessun limite complessivo al catalogo: questi limiti valgono SOLO per una
// singola tornata, cosi l Archivio Vivo puo continuare nei giri successivi.
const MASSIMO_STRATEGIE_CONTESTO = 40;
const MASSIMO_CANDIDATI_CONTESTO = 80;
const MASSIMO_STRATEGIE_TORNATA = 8;
const MASSIMO_CANDIDATI_TORNATA = 16;
const MASSIMO_RISULTATI_SORGENTE_TORNATA = 30;
const MASSIMO_DOMANDE_DIAGNOSTICA = 16;
const TIMEOUT_PIANO_MS = 30000;
const TIMEOUT_FILTRO_MS = 25000;

function provaJson(testoRaw) {
  if (typeof testoRaw !== 'string') return null;
  let s = testoRaw.trim();
  if (!s) return null;

  // Alcuni modelli racchiudono il JSON in blocchi Markdown anche quando viene
  // richiesto response_format=json_object. Non deve azzerare l intero Regista.
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(s); } catch { /* prova estrazione */ }

  const primo = s.indexOf('{');
  const ultimo = s.lastIndexOf('}');
  if (primo >= 0 && ultimo > primo) {
    try { return JSON.parse(s.slice(primo, ultimo + 1)); } catch { /* niente */ }
  }
  return null;
}

function leggiJson(raw) {
  if (!raw) return null;

  // Cloudflare Workers AI puo restituire direttamente l oggetto JSON.
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    if (Array.isArray(raw.strategie) || Array.isArray(raw.candidati) || Array.isArray(raw.risultati)) {
      return raw;
    }
    if (raw.response && typeof raw.response === 'object') return raw.response;
  }

  const tentativi = [
    raw?.response,
    raw?.output_text,
    raw?.result,
    raw?.choices?.[0]?.message?.content,
    raw?.content?.[0]?.text,
    raw?.content
  ];
  for (const candidato of tentativi) {
    const letto = provaJson(candidato);
    if (letto) return letto;
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

function normalizza(valore = '') {
  return String(valore || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .toLocaleLowerCase('it')
    .replace(/[^a-z0-9' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function annoDaData(valore) {
  const m = String(valore || '').match(/(?:18|19|20|21)\d{2}/);
  return m ? Number(m[0]) : null;
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

export function estraiCandidatiDeterministici(originale, elementi = []) {
  const titoloOriginale = testo(originale?.titolo, 250);
  const titoloAtteso = normalizza(titoloOriginale);
  const artistaOriginale = normalizza(originale?.artista);
  if (!titoloAtteso) return [];

  const risultato = [];
  const visti = new Set();
  for (let indice = 0; indice < Math.min(elementi.length, MASSIMO_RISULTATI_SORGENTE_TORNATA); indice += 1) {
    const e = elementi[indice] || {};
    const titoloFonte = normalizza(e.titolo);
    if (!titoloFonte) continue;

    const esatto = titoloFonte === titoloAtteso;
    const contiene = !esatto && (
      titoloFonte.includes(titoloAtteso) ||
      titoloAtteso.includes(titoloFonte)
    );
    if (!esatto && !contiene) continue;

    const interprete = testo(e.interprete || e.autoreCanale, 200);
    if (!interprete) continue;
    if (artistaOriginale && normalizza(interprete) === artistaOriginale) continue;

    const chiave = `${indice}::${normalizza(interprete)}`;
    if (visti.has(chiave)) continue;
    visti.add(chiave);

    risultato.push({
      indice,
      titolo: titoloOriginale || testo(e.titolo, 250),
      interprete,
      anno: annoDaData(e.dataPubblicazione),
      lingua: testo(e.lingua, 20) || null,
      paese: testo(e.paese, 30) || null,
      tipo: 'dubbio',
      affidabilita: esatto ? 65 : 55,
      motivo: esatto
        ? 'Titolo coincidente e interprete diverso: pista deterministica da verificare.'
        : 'Titolo della fonte contiene il titolo della composizione: pista deterministica da verificare.',
      origineDeterministica: true
    });
  }
  return risultato;
}

function unisciInterpretazioni(ai = [], deterministiche = []) {
  const mappa = new Map();
  for (const r of [...ai, ...deterministiche]) {
    const chiave = `${Number(r.indice)}::${normalizza(r.interprete)}::${normalizza(r.titolo)}`;
    const esistente = mappa.get(chiave);
    if (!esistente || Number(r.affidabilita || 0) > Number(esistente.affidabilita || 0)) {
      mappa.set(chiave, r);
    }
  }
  return [...mappa.values()].slice(0, MASSIMO_RISULTATI_SORGENTE_TORNATA);
}

export async function generaPianoScopertaConIA({
  titolo,
  artista,
  compositore = null,
  anno = null,
  lingua = null,
  paese = null,
  strategieGiaUsate = [],
  candidatiGiaNoti = [],
  agenda = null
}, env) {
  if (!env?.AI?.run) {
    return { disponibile: false, strategie: [], candidati: [], domandeEsplorate: [], nuoveDomande: [], esaurita: false };
  }

  const esclusioniStrategie = strategieGiaUsate
    .slice(-MASSIMO_STRATEGIE_CONTESTO)
    .map(s => ({ provider: s.provider, query: s.query }));
  const esclusioniCandidati = candidatiGiaNoti
    .slice(0, MASSIMO_CANDIDATI_CONTESTO)
    .map(c => ({ titolo: c.titolo, interprete: c.interprete, anno: c.anno, lingua: c.lingua, paese: c.paese }));
  const domandeAgenda = (Array.isArray(agenda?.domande) ? agenda.domande : [])
    .slice(0, MASSIMO_DOMANDE_DIAGNOSTICA)
    .map(d => ({ id: testo(d?.id, 120), domanda: testo(d?.domanda, 500), obiettivo: testo(d?.obiettivo, 200) }))
    .filter(d => d.domanda);

  const messaggi = [
    {
      role: 'system',
      content: [
        'Sei il REGISTA della ricerca musicale di Cover Lab AI, non un semplice filtro di database.',
        'PRIMA di consultare fonti esterne devi autointerrogarti usando le domande dell agenda e la tua conoscenza generale della musica.',
        'Per ogni domanda pensa a versioni, interpreti, titoli tradotti o completamente differenti, adattamenti, lingue, paesi, anni e crediti che conosci o ritieni plausibili.',
        'Le tue risposte interne NON sono prove: trasformale in IPOTESI da verificare e in strategie concrete per cercare conferme sulle fonti reali.',
        'Se ricordi una versione specifica, proponila come candidato e crea almeno una strategia utile a confermarla quando possibile.',
        'Se un dato e incerto non inventarlo: lascialo nullo e genera una strategia per verificarlo.',
        'Le nuove informazioni possono generare nuove domande e nuove piste nei giri successivi.',
        `In QUESTA singola tornata restituisci al massimo ${MASSIMO_STRATEGIE_TORNATA} strategie e ${MASSIMO_CANDIDATI_TORNATA} candidati, scegliendo le piste nuove a maggior valore.`,
        'NON esiste alcun limite complessivo al numero di cover: i limiti della tornata servono solo a proteggere tempo e risorse e l Archivio Vivo continuera nei giri successivi.',
        'Non ripetere strategie o candidati gia forniti.',
        'Per ogni query indica il provider preferito tra youtube, cataloghi oppure internet_archive.',
        'YouTube e una fonte di scoperta: Cover Lab non cerca apposta un video YouTube per una cover trovata altrove.',
        'Imposta esaurita=true solo se, per le domande di questa agenda, non riesci davvero a proporre altre piste sostanzialmente nuove; non significa che il catalogo mondiale sia completo.',
        'Rispondi esclusivamente con JSON valido nel formato {domandeEsplorate:[...], strategie:[...], candidati:[...], nuoveDomande:[...], esaurita:boolean}.',
        'domandeEsplorate contiene gli id delle domande dell agenda che hai effettivamente considerato.',
        'Strategia: {provider, query, lingua, paese, priorita}.',
        'Candidato: {titolo, interprete, anno, lingua, paese, tipo, affidabilita}.',
        'nuoveDomande contiene brevi domande investigative nate dalle ipotesi appena formulate; serviranno a orientare i giri successivi.'
      ].join(' ')
    },
    {
      role: 'user',
      content: JSON.stringify({
        composizione: { titolo, artista, compositore, anno, lingua, paese },
        agendaAutointerrogazione: domandeAgenda,
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
        temperature: 0.25,
        max_completion_tokens: 1500
      }),
      TIMEOUT_PIANO_MS,
      'PIANO_SCOPERTA'
    );
  } catch (e) {
    return {
      disponibile: true,
      strategie: [],
      candidati: [],
      domandeEsplorate: [],
      nuoveDomande: [],
      esaurita: false,
      errore: e?.message || 'Errore AI non specificato'
    };
  }

  const dati = leggiJson(raw);
  if (!dati) {
    return {
      disponibile: true,
      strategie: [],
      candidati: [],
      domandeEsplorate: [],
      nuoveDomande: [],
      esaurita: false,
      errore: 'RISPOSTA_AI_NON_INTERPRETABILE'
    };
  }

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

  const domandeEsplorate = (Array.isArray(dati.domandeEsplorate) ? dati.domandeEsplorate : [])
    .slice(0, MASSIMO_DOMANDE_DIAGNOSTICA)
    .map(x => testo(x, 120))
    .filter(Boolean);
  const nuoveDomande = (Array.isArray(dati.nuoveDomande) ? dati.nuoveDomande : [])
    .slice(0, 12)
    .map(x => testo(x, 400))
    .filter(Boolean);

  return {
    disponibile: true,
    strategie,
    candidati,
    domandeEsplorate,
    nuoveDomande,
    esaurita: dati.esaurita === true
  };
}

export async function interpretaRisultatiSorgenteConIA(originale, elementi = [], env) {
  const fallback = estraiCandidatiDeterministici(originale, elementi);
  if (!elementi.length) return [];
  if (!env?.AI?.run) return fallback;

  const input = elementi.slice(0, MASSIMO_RISULTATI_SORGENTE_TORNATA).map((e, indice) => ({
    indice,
    titolo: e.titolo,
    interprete: e.interprete,
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
    const ai = (Array.isArray(dati.risultati) ? dati.risultati : [])
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
        motivo: testo(r.motivo, 300),
        origineDeterministica: false
      }))
      .filter(r => Number.isInteger(r.indice) && r.indice >= 0 && r.indice < input.length && r.titolo);
    return unisciInterpretazioni(ai, fallback);
  } catch {
    return fallback;
  }
}
