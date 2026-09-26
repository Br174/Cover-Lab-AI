import { providerScoperta, trovaProviderPerStrategia } from '../fonti/provider-registry.js';
import {
  puoUsareProvider,
  registraSuccessoProvider,
  registraErroreProvider,
  marcaProviderNonConfigurato,
  leggiStatoProvider
} from '../dati/salute-fonti.js';
import { eseguiConGestoreLimiti, regolaFonte } from './gestore-limiti-fonti.js';

function numero(valore, ripiego, min = 1, max = 120000) {
  const n = Number(valore);
  if (!Number.isFinite(n)) return ripiego;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function punteggioSalute(stato = {}) {
  if (!stato) return 0;
  if (stato.stato === 'sospeso') return -1000;
  if (stato.stato === 'da_configurare') return -500;
  const errori = Math.max(0, Number(stato.errori_consecutivi || 0));
  const latenza = Math.max(0, Number(stato.latenza_media_ms || 0));
  return -(errori * 100) - Math.min(200, latenza / 50);
}

function statoErroreGestito(errore, timeout) {
  if (timeout) return 'timeout';
  if (errore?.codiceGestore === 'QUOTA_FONTE_ESAURITA') return 'quota_esaurita';
  if (errore?.codiceGestore === 'FONTE_LIMITATA' || errore?.codiceGestore === 'QUOTA_O_POLICY_PROVIDER' || errore?.codiceGestore === 'FONTE_DEGRADATA_SOSPESA') {
    return 'limitato_temporaneamente';
  }
  return 'errore';
}

function chiaveOperazione(provider, richiesta = {}) {
  const pulita = {
    query: String(richiesta?.query || '').trim(),
    lingua: richiesta?.lingua || null,
    paese: richiesta?.paese || null,
    cursore: richiesta?.cursore || null,
    limite: Number(richiesta?.limite || 0) || null
  };
  return `${provider}::${JSON.stringify(pulita)}`;
}

export async function ordinaProviderPerSalute(db, providers = []) {
  const arricchiti = [];
  for (const provider of providers) {
    const salute = await leggiStatoProvider(db, provider.id);
    arricchiti.push({ provider, salute });
  }
  return arricchiti
    .sort((a, b) => {
      const punteggioA = Number(a.provider.priorita || 0) + punteggioSalute(a.salute);
      const punteggioB = Number(b.provider.priorita || 0) + punteggioSalute(b.salute);
      return punteggioB - punteggioA;
    })
    .map(x => x.provider);
}

export async function scegliProviderScoperta(db, nomeStrategia, env = {}, opzioni = {}) {
  const esplicito = trovaProviderPerStrategia(nomeStrategia, env, opzioni);
  if (esplicito) return esplicito;
  const ordinati = await ordinaProviderPerSalute(db, providerScoperta(env, opzioni));
  return ordinati[0] || null;
}

export async function eseguiOperazioneProvider({
  db,
  provider,
  operazione,
  configurazione = {},
  oraMs = Date.now(),
  contaRisultati = () => 0,
  chiaveRichiesta = null
}) {
  if (!provider?.id || typeof operazione !== 'function') {
    return { stato: 'provider_non_disponibile', provider: provider?.id || null, saltato: true };
  }

  const regola = regolaFonte(provider.id);
  if (!regola) {
    return {
      stato: 'regole_provider_non_registrate',
      provider: provider.id,
      saltato: true,
      errore: `Il provider ${provider.id} non puo essere usato finche limiti e policy non sono registrati.`
    };
  }

  const statoDichiarato = provider.stato?.() || { disponibile: true, stato: 'configurato' };
  if (statoDichiarato.disponibile === false) {
    await marcaProviderNonConfigurato(db, provider.id);
    return {
      stato: statoDichiarato.stato || 'non_disponibile',
      provider: provider.id,
      saltato: true
    };
  }

  const circuito = await puoUsareProvider(db, provider.id, oraMs);
  if (!circuito.consentito) {
    return {
      stato: 'sospeso_circuit_breaker',
      provider: provider.id,
      saltato: true,
      sospesoFino: circuito.sospesoFino
    };
  }

  const sogliaErrori = numero(configurazione.circuit_breaker_errori_consecutivi, 3, 1, 20);
  const sospensioneMinuti = numero(configurazione.circuit_breaker_sospensione_minuti, 30, 1, 24 * 60);
  const timeoutMs = numero(configurazione.provider_timeout_ms, 8000, 500, 60000);
  const tentativiMassimi = numero(configurazione.provider_tentativi_massimi, 2, 1, 5);
  const cacheMs = Number.isFinite(Number(configurazione.provider_cache_ms))
    ? Math.max(0, Number(configurazione.provider_cache_ms))
    : null;
  const inizio = Date.now();

  try {
    const eseguiTentativo = async ({ tentativo = 1, regola: regolaAttiva = regola } = {}) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort('timeout_provider'), timeoutMs);
      try {
        return await operazione({ signal: controller.signal, tentativo, regola: regolaAttiva });
      } catch (e) {
        if (controller.signal.aborted) {
          const timeout = new Error(`Timeout del provider ${provider.id} dopo ${timeoutMs} ms`);
          timeout.name = 'AbortError';
          timeout.status = 408;
          throw timeout;
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }
    };

    // Le fonti che governano ogni singola richiesta HTTP con il gestore centrale
    // non devono essere riaccodate qui sullo stesso provider: eviterebbe il rilascio
    // della coda esterna e provocherebbe un deadlock.
    const gestito = provider.gestisceLimitiInternamente
      ? {
          valore: await eseguiTentativo({ tentativo: 1, regola }),
          tentativi: 1,
          attesaTotaleMs: 0,
          regola
        }
      : await eseguiConGestoreLimiti({
          provider: provider.id,
          db,
          massimoTentativi: tentativiMassimi,
          chiaveRichiesta,
          cacheTtlMs: cacheMs,
          operazione: eseguiTentativo
        });

    const durataMs = Date.now() - inizio;
    const risultati = Math.max(0, Number(contaRisultati(gestito.valore) || 0));
    if (!gestito.daCache && !gestito.richiestaDeduplicata) {
      await registraSuccessoProvider(db, provider.id, { durataMs, risultati });
    }
    return {
      stato: 'ok',
      provider: provider.id,
      durataMs,
      saltato: false,
      valore: gestito.valore,
      tentativi: gestito.tentativi,
      attesaLimitiMs: gestito.attesaTotaleMs,
      daCache: Boolean(gestito.daCache),
      richiestaDeduplicata: Boolean(gestito.richiestaDeduplicata),
      regolaFonte: gestito.regola
    };
  } catch (e) {
    const durataMs = Date.now() - inizio;
    const timeout = e?.name === 'AbortError' || Number(e?.status) === 408;
    const codice = timeout ? 408 : (Number.isFinite(Number(e?.status)) ? Number(e.status) : null);
    const messaggio = timeout
      ? `Timeout del provider ${provider.id} dopo ${timeoutMs} ms`
      : String(e?.message || `Errore del provider ${provider.id}`);
    const retryAfterMs = Number.isFinite(Number(e?.retryAfterMs)) ? Math.max(0, Number(e.retryAfterMs)) : null;
    const limitazioneImmediata = codice === 429 || (codice === 403 && provider.id === 'youtube') || Boolean(e?.codiceGestore);
    const sospensioneDaGestoreMinuti = retryAfterMs != null ? Math.max(1, Math.ceil(retryAfterMs / 60000)) : sospensioneMinuti;

    if (!e?.saltato) {
      await registraErroreProvider(db, provider.id, {
        durataMs,
        errore: messaggio,
        codiceErrore: codice,
        sogliaErrori: limitazioneImmediata ? 1 : sogliaErrori,
        sospensioneMinuti: limitazioneImmediata ? sospensioneDaGestoreMinuti : sospensioneMinuti,
        oraMs
      });
    }

    return {
      stato: statoErroreGestito(e, timeout),
      provider: provider.id,
      saltato: Boolean(e?.saltato),
      errore: messaggio,
      codiceErrore: codice,
      codiceGestore: e?.codiceGestore || null,
      retryAfterMs,
      durataMs,
      regolaFonte: regola
    };
  }
}

export async function eseguiRicercaProvider({
  db,
  provider,
  richiesta,
  configurazione = {},
  oraMs = Date.now()
}) {
  if (!provider || typeof provider.cerca !== 'function') {
    return { stato: 'provider_non_disponibile', provider: provider?.id || null, elementi: [] };
  }

  const esito = await eseguiOperazioneProvider({
    db,
    provider,
    configurazione,
    oraMs,
    chiaveRichiesta: chiaveOperazione(provider.id, richiesta),
    operazione: ({ signal }) => provider.cerca(richiesta, { signal }),
    contaRisultati: pagina => Array.isArray(pagina?.elementi) ? pagina.elementi.length : 0
  });

  if (esito.stato !== 'ok') {
    return { ...esito, elementi: [] };
  }

  const pagina = esito.valore || {};
  return {
    ...pagina,
    stato: pagina?.stato || 'ok',
    provider: provider.id,
    durataMs: esito.durataMs,
    saltato: false,
    tentativi: esito.tentativi,
    attesaLimitiMs: esito.attesaLimitiMs,
    daCache: esito.daCache,
    richiestaDeduplicata: esito.richiestaDeduplicata
  };
}
