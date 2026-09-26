const GIORNO_MS = 24 * 60 * 60 * 1000;

const REGOLE = Object.freeze({
  musicbrainz: Object.freeze({
    provider: 'musicbrainz', nome: 'MusicBrainz', verificatoIl: '2026-09-26',
    documentazione: 'https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting',
    modalitaUso: 'Web Service metadata; User-Agent descrittivo obbligatorio.',
    apiKey: 'non richiesta per lettura pubblica',
    limiteUfficiale: '1 richiesta al secondo per IP/applicazione salvo accordi diversi',
    richiestePerFinestra: 1, finestraMs: 1000, intervalloMinimoMs: 1100, concorrenzaMassima: 1,
    quotaGiornaliera: null, resetQuota: null,
    cache: 'consigliata per evitare richieste ripetute', segnaliLimitazione: [429, 503], retryAfter: true, backoff: true,
    cacheTtlMs: 15000,
    ricontrollareSe: ['429/503 ripetuti', 'documentazione o API cambia', 'comportamento anomalo'],
    note: 'MusicBrainz può modificare le regole di throttling per proteggere il servizio.'
  }),
  apple_catalogo: Object.freeze({
    provider: 'apple_catalogo', nome: 'Apple Search API', verificatoIl: '2026-09-26',
    documentazione: 'https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html',
    modalitaUso: 'Search API per metadati del catalogo.', apiKey: 'non richiesta',
    limiteUfficiale: 'circa 20 chiamate al minuto, soggetto a modifica',
    richiestePerFinestra: 20, finestraMs: 60 * 1000, intervalloMinimoMs: 3100, concorrenzaMassima: 1,
    quotaGiornaliera: null, resetQuota: null,
    cache: 'raccomandata da Apple per siti/app con traffico elevato', segnaliLimitazione: [429], retryAfter: true, backoff: true,
    cacheTtlMs: 60000,
    ricontrollareSe: ['429/403 ripetuti', 'documentazione o API cambia', 'comportamento anomalo'],
    note: 'L intervallo operativo e volutamente conservativo rispetto al limite approssimativo.'
  }),
  deezer: Object.freeze({
    provider: 'deezer', nome: 'Deezer API', verificatoIl: '2026-09-26',
    documentazione: 'https://developers.deezer.com/api',
    modalitaUso: 'Ricerca pubblica di metadati tracce; nessun download o riproduzione in Cover Lab.', apiKey: 'non richiesta per la ricerca pubblica usata qui',
    limiteUfficiale: 'nessun tetto pubblico unico assunto da Cover Lab; viene applicato pacing prudenziale e rispetto di 429/Retry-After',
    richiestePerFinestra: null, finestraMs: null, intervalloMinimoMs: 750, concorrenzaMassima: 1,
    quotaGiornaliera: null, resetQuota: null,
    cache: 'cache breve per evitare ricerche duplicate', segnaliLimitazione: [429, 503], retryAfter: true, backoff: true,
    cacheTtlMs: 60000,
    ricontrollareSe: ['429/403 ripetuti', 'documentazione o API cambia', 'comportamento anomalo'],
    note: 'Il limite interno e intenzionalmente conservativo e non viene presentato come limite ufficiale Deezer.'
  }),
  youtube: Object.freeze({
    provider: 'youtube', nome: 'YouTube Data API', verificatoIl: '2026-09-26',
    documentazione: 'https://developers.google.com/youtube/v3/determine_quota_cost',
    modalitaUso: 'Solo ricerca/metadati/ID; nessun download o player in Cover Lab.', apiKey: 'richiesta',
    limiteUfficiale: 'search.list: bucket predefinito di 100 chiamate al giorno; 1 unita per chiamata',
    richiestePerFinestra: null, finestraMs: null, intervalloMinimoMs: 250, concorrenzaMassima: 1,
    quotaGiornaliera: 100, resetQuota: 'mezzanotte America/Los_Angeles (Pacific Time)',
    cache: 'conservare solo i dati consentiti e necessari secondo le policy YouTube', segnaliLimitazione: [403, 429], retryAfter: true, backoff: true,
    cacheTtlMs: 0,
    ricontrollareSe: ['quota o policy cambia', '403/429 ripetuti', 'versione API o documentazione cambia'],
    note: 'Le quote YouTube sono configurabili nel progetto Google Cloud e possono differire dal valore predefinito.'
  }),
  web_editoriale: Object.freeze({
    provider: 'web_editoriale', nome: 'GDELT Context API', verificatoIl: '2026-09-26',
    documentazione: 'https://blog.gdeltproject.org/announcing-the-gdelt-context-2-0-api/',
    modalitaUso: 'Ricerca pubblica di articoli e contesto testuale per verificare citazioni di registrazioni.', apiKey: 'non richiesta',
    limiteUfficiale: 'nessun tetto di chiamate assunto; l API documenta fino a 75 risultati per richiesta e Cover Lab applica pacing prudenziale',
    richiestePerFinestra: null, finestraMs: null, intervalloMinimoMs: 1500, concorrenzaMassima: 1,
    quotaGiornaliera: null, resetQuota: null,
    cache: 'cache raccomandata per evitare query editoriali duplicate', segnaliLimitazione: [429, 503], retryAfter: true, backoff: true,
    cacheTtlMs: 5 * 60 * 1000,
    ricontrollareSe: ['429/503 ripetuti', 'documentazione o API cambia', 'comportamento anomalo'],
    note: 'Usato come verificatore editoriale, non come database musicale autoritativo.'
  }),
  internet_archive: Object.freeze({
    provider: 'internet_archive', nome: 'Internet Archive', verificatoIl: '2026-09-26',
    documentazione: 'https://archive.org/developers/bots.html',
    modalitaUso: 'Ricerca e metadata API con User-Agent descrittivo.', apiKey: 'non richiesta per la ricerca pubblica usata da Cover Lab',
    limiteUfficiale: 'nessun tetto numerico unico pubblicato nella guida automatizzata; richiede ritardi, concorrenza limitata e rispetto di 429/Retry-After',
    richiestePerFinestra: null, finestraMs: null, intervalloMinimoMs: 1000, concorrenzaMassima: 1,
    quotaGiornaliera: null, resetQuota: null,
    cache: 'raccomandata; evitare richieste o trasferimenti duplicati', segnaliLimitazione: [429], retryAfter: true, backoff: true,
    cacheTtlMs: 60000,
    ricontrollareSe: ['429/403 ripetuti', 'documentazione cambia', 'comportamento anomalo'],
    note: 'Intervallo operativo interno conservativo: la guida ufficiale non dichiara un singolo limite numerico globale.'
  }),
  wikipedia: Object.freeze({
    provider: 'wikipedia', nome: 'Wikipedia / Wikimedia Action API', verificatoIl: '2026-09-26',
    documentazione: 'https://www.mediawiki.org/wiki/API:Etiquette',
    modalitaUso: 'Action API in sola lettura con User-Agent identificabile, JSON, maxlag e richieste seriali.',
    apiKey: 'non richiesta per lettura pubblica',
    limiteUfficiale: 'nessun tetto fisso unico per le letture; Wikimedia richiede uso rispettoso, massimo 3 richieste concorrenti e rispetto di 429/Retry-After',
    richiestePerFinestra: null, finestraMs: null, intervalloMinimoMs: 1000, concorrenzaMassima: 1,
    quotaGiornaliera: null, resetQuota: null,
    cache: 'raccomandata per evitare di richiedere ripetutamente lo stesso contenuto', segnaliLimitazione: [429, 503], retryAfter: true, backoff: true,
    cacheTtlMs: 5 * 60 * 1000,
    ricontrollareSe: ['429/maxlag ripetuti', 'documentazione o policy cambia', 'comportamento anomalo'],
    note: 'Cover Lab usa concorrenza 1, piu prudente del massimo 3 raccomandato, e invia maxlag=5.'
  })
});

const runtime = new Map();
let tabellaRuntimeAssicurata = null;

function dormiDefault(ms) { return new Promise(resolve => setTimeout(resolve, Math.max(0, ms))); }
function statoRuntime(provider) {
  if (!runtime.has(provider)) runtime.set(provider, {
    coda: Promise.resolve(), ultimoAccessoMs: 0, sospesoFinoMs: 0,
    quotaChiave: null, quotaUsata: 0, inVolo: new Map(), cache: new Map()
  });
  return runtime.get(provider);
}
function clonaRegola(regola) {
  return regola ? { ...regola, segnaliLimitazione: [...(regola.segnaliLimitazione || [])], ricontrollareSe: [...(regola.ricontrollareSe || [])] } : null;
}
export function regolaFonte(provider) { return clonaRegola(REGOLE[String(provider || '').trim().toLowerCase()] || null); }
export function descriviRegoleFonti() { return Object.values(REGOLE).map(clonaRegola); }

export function retryAfterMsDaValore(valore, oraMs = Date.now()) {
  if (valore == null || valore === '') return null;
  const secondi = Number(valore);
  if (Number.isFinite(secondi) && secondi >= 0) return Math.max(0, Math.round(secondi * 1000));
  const data = Date.parse(String(valore));
  return Number.isFinite(data) ? Math.max(0, data - oraMs) : null;
}
export function calcolaBackoffEsponenziale(tentativo, { baseMs = 500, massimoMs = 30000, jitter = 0.2, casuale = Math.random } = {}) {
  const indice = Math.max(1, Number(tentativo) || 1) - 1;
  const puro = Math.min(Math.max(0, massimoMs), Math.max(0, baseMs) * (2 ** indice));
  const ampiezza = puro * Math.max(0, Math.min(1, Number(jitter) || 0));
  const fattore = (Math.max(0, Math.min(1, Number(casuale?.() ?? 0.5))) * 2) - 1;
  return Math.max(0, Math.round(puro + (ampiezza * fattore)));
}
function chiaveQuotaPacifico(oraMs) {
  try {
    const parti = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(oraMs));
    const leggi = tipo => parti.find(p => p.type === tipo)?.value;
    return `${leggi('year')}-${leggi('month')}-${leggi('day')}`;
  } catch { return new Date(oraMs).toISOString().slice(0, 10); }
}

async function assicuraTabellaPersistenza(db) {
  if (!db?.prepare) return false;
  if (!tabellaRuntimeAssicurata) {
    tabellaRuntimeAssicurata = (async () => {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS limiti_provider_runtime (
          provider TEXT PRIMARY KEY,
          finestra_quota TEXT,
          chiamate_finestra INTEGER NOT NULL DEFAULT 0,
          ultimo_accesso_ms INTEGER NOT NULL DEFAULT 0,
          sospeso_fino_ms INTEGER NOT NULL DEFAULT 0,
          ultimo_http INTEGER,
          aggiornato_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      await db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_limiti_provider_sospeso
        ON limiti_provider_runtime(sospeso_fino_ms)
      `).run();
      return true;
    })().catch(e => {
      tabellaRuntimeAssicurata = null;
      throw e;
    });
  }
  return tabellaRuntimeAssicurata;
}

async function assicuraPersistenza(db, provider) {
  if (!db?.prepare) return false;
  try {
    await assicuraTabellaPersistenza(db);
    await db.prepare('INSERT OR IGNORE INTO limiti_provider_runtime(provider) VALUES (?1)').bind(provider).run();
    return true;
  } catch (e) {
    if (String(e?.message || '').includes('no such table')) return false;
    throw e;
  }
}
async function leggiPersistenza(db, provider) {
  if (!await assicuraPersistenza(db, provider)) return null;
  return db.prepare('SELECT provider, finestra_quota AS finestraQuota, chiamate_finestra AS chiamateFinestra, ultimo_accesso_ms AS ultimoAccessoMs, sospeso_fino_ms AS sospesoFinoMs, ultimo_http AS ultimoHttp, aggiornato_il AS aggiornatoIl FROM limiti_provider_runtime WHERE provider=?1 LIMIT 1').bind(provider).first();
}
async function registraSospensione(db, provider, sospesoFinoMs, codiceHttp = null) {
  if (!await assicuraPersistenza(db, provider)) return;
  await db.prepare('UPDATE limiti_provider_runtime SET sospeso_fino_ms=?2, ultimo_http=?3, aggiornato_il=CURRENT_TIMESTAMP WHERE provider=?1')
    .bind(provider, Math.max(0, Number(sospesoFinoMs) || 0), Number.isFinite(Number(codiceHttp)) ? Number(codiceHttp) : null).run();
}
async function consumaQuotaPersistente(db, provider, chiave, massimo) {
  if (!await assicuraPersistenza(db, provider)) return null;
  await db.prepare('UPDATE limiti_provider_runtime SET finestra_quota=?2, chiamate_finestra=0, aggiornato_il=CURRENT_TIMESTAMP WHERE provider=?1 AND (finestra_quota IS NULL OR finestra_quota<>?2)').bind(provider, chiave).run();
  const esito = await db.prepare('UPDATE limiti_provider_runtime SET chiamate_finestra=chiamate_finestra+1, aggiornato_il=CURRENT_TIMESTAMP WHERE provider=?1 AND finestra_quota=?2 AND chiamate_finestra<?3').bind(provider, chiave, massimo).run();
  return Number(esito?.meta?.changes || 0) > 0;
}
async function registraUltimoAccesso(db, provider, oraMs) {
  if (!await assicuraPersistenza(db, provider)) return;
  await db.prepare('UPDATE limiti_provider_runtime SET ultimo_accesso_ms=?2, aggiornato_il=CURRENT_TIMESTAMP WHERE provider=?1').bind(provider, Math.max(0, Number(oraMs) || 0)).run();
}
function erroreLimitazione(provider, messaggio, { codice = 'FONTE_LIMITATA', status = 429, retryAfterMs = null, saltato = false } = {}) {
  const e = new Error(messaggio); e.provider = provider; e.codiceGestore = codice; e.status = status; e.saltato = saltato;
  if (retryAfterMs != null) e.retryAfterMs = retryAfterMs;
  return e;
}
function retryAfterDaErrore(errore, oraMs) {
  const diretto = Number(errore?.retryAfterMs);
  if (Number.isFinite(diretto) && diretto >= 0) return diretto;
  return retryAfterMsDaValore(errore?.retryAfter || errore?.headers?.get?.('retry-after'), oraMs);
}
function eTransitorio(status) { return [408, 425, 500, 502, 503, 504].includes(Number(status)); }
async function inCoda(provider, funzione) {
  const stato = statoRuntime(provider), precedente = stato.coda.catch(() => {});
  let libera; stato.coda = new Promise(resolve => { libera = resolve; });
  await precedente;
  try { return await funzione(stato); } finally { libera(); }
}

export async function eseguiConGestoreLimiti({ provider, db = null, operazione, massimoTentativi = 2, ora = () => Date.now(), dormi = dormiDefault, casuale = Math.random, ignoraAttese = false, chiaveRichiesta = null, cacheTtlMs = null } = {}) {
  const id = String(provider || '').trim().toLowerCase(), regola = REGOLE[id];
  if (!regola) throw new Error(`Regole della fonte non registrate: ${id || 'sconosciuta'}`);
  if (typeof operazione !== 'function') throw new Error('Operazione fonte non valida');

  const statoGlobale = statoRuntime(id), chiave = String(chiaveRichiesta || '').trim() || null;
  const ttl = Math.max(0, Number(cacheTtlMs ?? regola.cacheTtlMs ?? 0));
  if (chiave && ttl > 0) {
    const voce = statoGlobale.cache.get(chiave);
    if (voce && Number(voce.scadeMs || 0) > Number(ora())) return { ...voce.risultato, daCache: true };
    if (voce) statoGlobale.cache.delete(chiave);
  }
  if (chiave && statoGlobale.inVolo.has(chiave)) return { ...(await statoGlobale.inVolo.get(chiave)), richiestaDeduplicata: true };

  const esecuzione = inCoda(id, async stato => {
    const persistito = await leggiPersistenza(db, id);
    let oraMs = Number(ora());
    const sospesoFino = Math.max(Number(stato.sospesoFinoMs || 0), Number(persistito?.sospesoFinoMs || 0));
    if (sospesoFino > oraMs) throw erroreLimitazione(id, `${regola.nome} temporaneamente sospesa per rispettare i limiti della fonte.`, { retryAfterMs: sospesoFino - oraMs, saltato: true });

    const tentativi = Math.max(1, Math.min(5, Number(massimoTentativi) || 1));
    let ultimoErrore, attesaTotaleMs = 0, ultimoPersistito = Number(persistito?.ultimoAccessoMs || 0);
    for (let tentativo = 1; tentativo <= tentativi; tentativo += 1) {
      oraMs = Number(ora());
      if (regola.quotaGiornaliera) {
        const quotaChiave = chiaveQuotaPacifico(oraMs);
        const persistente = await consumaQuotaPersistente(db, id, quotaChiave, regola.quotaGiornaliera);
        if (persistente === false) throw erroreLimitazione(id, `${regola.nome}: quota giornaliera prudenziale esaurita.`, { codice: 'QUOTA_FONTE_ESAURITA', status: 429, saltato: true });
        if (persistente == null) {
          if (stato.quotaChiave !== quotaChiave) { stato.quotaChiave = quotaChiave; stato.quotaUsata = 0; }
          if (stato.quotaUsata >= regola.quotaGiornaliera) throw erroreLimitazione(id, `${regola.nome}: quota giornaliera prudenziale esaurita.`, { codice: 'QUOTA_FONTE_ESAURITA', status: 429, saltato: true });
          stato.quotaUsata += 1;
        }
      }

      const ultimo = Math.max(Number(stato.ultimoAccessoMs || 0), ultimoPersistito);
      const attesaIntervallo = Math.max(0, Number(regola.intervalloMinimoMs || 0) - (oraMs - ultimo));
      if (attesaIntervallo > 0 && !ignoraAttese) { await dormi(attesaIntervallo); attesaTotaleMs += attesaIntervallo; oraMs = Number(ora()); }
      stato.ultimoAccessoMs = oraMs; ultimoPersistito = oraMs; await registraUltimoAccesso(db, id, oraMs);

      try {
        const valore = await operazione({ tentativo, regola: clonaRegola(regola) });
        stato.sospesoFinoMs = 0;
        return { valore, tentativi: tentativo, attesaTotaleMs, regola: clonaRegola(regola) };
      } catch (e) {
        ultimoErrore = e;
        const status = Number(e?.status), limitato = status === 429 || (status === 403 && id === 'youtube');
        const retryMs = retryAfterDaErrore(e, Number(ora())) ?? (limitato ? calcolaBackoffEsponenziale(tentativo, { baseMs: 30000, massimoMs: 30 * 60 * 1000, jitter: 0.2, casuale }) : null);
        if (limitato) {
          const sospensione = Math.max(1000, Number(retryMs || 60000));
          stato.sospesoFinoMs = Number(ora()) + sospensione; await registraSospensione(db, id, stato.sospesoFinoMs, status);
          e.retryAfterMs = sospensione; e.codiceGestore = e.codiceGestore || (status === 403 ? 'QUOTA_O_POLICY_PROVIDER' : 'FONTE_LIMITATA');
          throw e;
        }
        if (!eTransitorio(status) || tentativo >= tentativi) {
          if (tentativo >= tentativi && (regola.segnaliLimitazione || []).includes(status)) {
            const sospensione = Math.max(1000, Number(retryMs || 30000));
            stato.sospesoFinoMs = Number(ora()) + sospensione; await registraSospensione(db, id, stato.sospesoFinoMs, status);
            e.retryAfterMs = sospensione; e.codiceGestore = e.codiceGestore || 'FONTE_DEGRADATA_SOSPESA';
          }
          throw e;
        }
        const attesa = retryMs ?? calcolaBackoffEsponenziale(tentativo, { baseMs: 500, massimoMs: 8000, jitter: 0.25, casuale });
        if (!ignoraAttese && attesa > 0) { await dormi(attesa); attesaTotaleMs += attesa; }
      }
    }
    throw ultimoErrore || new Error(`Errore non specificato della fonte ${id}`);
  });

  if (chiave) statoGlobale.inVolo.set(chiave, esecuzione);
  try {
    const risultato = await esecuzione;
    if (chiave && ttl > 0) statoGlobale.cache.set(chiave, { risultato, scadeMs: Number(ora()) + ttl });
    return risultato;
  } finally {
    if (chiave && statoGlobale.inVolo.get(chiave) === esecuzione) statoGlobale.inVolo.delete(chiave);
  }
}

export async function leggiStatoPersistenteLimiti(db) {
  if (!db?.prepare) return [];
  try {
    await assicuraTabellaPersistenza(db);
    const r = await db.prepare(`
      SELECT provider, finestra_quota AS finestraQuota, chiamate_finestra AS chiamateFinestra,
             ultimo_accesso_ms AS ultimoAccessoMs, sospeso_fino_ms AS sospesoFinoMs,
             ultimo_http AS ultimoHttp, aggiornato_il AS aggiornatoIl
      FROM limiti_provider_runtime ORDER BY provider
    `).all();
    return r.results || [];
  } catch { return []; }
}

export function azzeraStatoGestoreLimitiPerTest() { runtime.clear(); tabellaRuntimeAssicurata = null; }
export const DURATA_GIORNO_MS = GIORNO_MS;