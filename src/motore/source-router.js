import { providerScoperta, trovaProviderPerStrategia } from '../fonti/provider-registry.js';
import {
  puoUsareProvider,
  registraSuccessoProvider,
  registraErroreProvider,
  marcaProviderNonConfigurato,
  leggiStatoProvider
} from '../dati/salute-fonti.js';

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
  contaRisultati = () => 0
}) {
  if (!provider?.id || typeof operazione !== 'function') {
    return { stato: 'provider_non_disponibile', provider: provider?.id || null, saltato: true };
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout_provider'), timeoutMs);
  const inizio = Date.now();

  try {
    const valore = await operazione({ signal: controller.signal });
    const durataMs = Date.now() - inizio;
    const risultati = Math.max(0, Number(contaRisultati(valore) || 0));
    await registraSuccessoProvider(db, provider.id, { durataMs, risultati });
    return {
      stato: 'ok',
      provider: provider.id,
      durataMs,
      saltato: false,
      valore
    };
  } catch (e) {
    const durataMs = Date.now() - inizio;
    const timeout = e?.name === 'AbortError' || controller.signal.aborted;
    const codice = timeout ? 408 : (Number.isFinite(Number(e?.status)) ? Number(e.status) : null);
    const messaggio = timeout
      ? `Timeout del provider ${provider.id} dopo ${timeoutMs} ms`
      : String(e?.message || `Errore del provider ${provider.id}`);
    await registraErroreProvider(db, provider.id, {
      durataMs,
      errore: messaggio,
      codiceErrore: codice,
      sogliaErrori,
      sospensioneMinuti,
      oraMs
    });
    return {
      stato: timeout ? 'timeout' : 'errore',
      provider: provider.id,
      saltato: false,
      errore: messaggio,
      codiceErrore: codice,
      durataMs
    };
  } finally {
    clearTimeout(timer);
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
    saltato: false
  };
}
