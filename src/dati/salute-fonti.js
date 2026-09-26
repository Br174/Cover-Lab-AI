import { valutaCircuitBreaker, statoDopoSuccesso, statoDopoErrore } from '../motore/circuit-breaker.js';

let tabellaAssicurata = null;

async function assicuraTabellaStatoProvider(db) {
  if (!db?.prepare) return false;
  if (!tabellaAssicurata) {
    tabellaAssicurata = (async () => {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS stato_provider (
          provider TEXT PRIMARY KEY,
          stato TEXT NOT NULL DEFAULT 'sconosciuto',
          errori_consecutivi INTEGER NOT NULL DEFAULT 0,
          sospeso_fino TEXT,
          ultimo_successo TEXT,
          ultimo_errore TEXT,
          codice_ultimo_errore INTEGER,
          chiamate_totali INTEGER NOT NULL DEFAULT 0,
          errori_totali INTEGER NOT NULL DEFAULT 0,
          risultati_totali INTEGER NOT NULL DEFAULT 0,
          latenza_media_ms REAL NOT NULL DEFAULT 0,
          latenza_massima_ms INTEGER NOT NULL DEFAULT 0,
          ultima_durata_ms INTEGER NOT NULL DEFAULT 0,
          aggiornato_il TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      await db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_stato_provider_stato
        ON stato_provider(stato, sospeso_fino)
      `).run();
      return true;
    })().catch(e => {
      tabellaAssicurata = null;
      throw e;
    });
  }
  return tabellaAssicurata;
}

export async function leggiStatoProvider(db, provider) {
  if (!db || !provider) return null;
  try {
    await assicuraTabellaStatoProvider(db);
    return await db.prepare(
      'SELECT * FROM stato_provider WHERE provider=?1 LIMIT 1'
    ).bind(provider).first();
  } catch (e) {
    if (String(e?.message || '').includes('no such table')) return null;
    throw e;
  }
}

export async function assicuraStatoProvider(db, provider, statoIniziale = 'sconosciuto') {
  if (!db || !provider) return null;
  try {
    await assicuraTabellaStatoProvider(db);
    await db.prepare(`
      INSERT OR IGNORE INTO stato_provider(provider, stato)
      VALUES (?1, ?2)
    `).bind(provider, statoIniziale).run();
    return leggiStatoProvider(db, provider);
  } catch (e) {
    if (String(e?.message || '').includes('no such table')) return null;
    throw e;
  }
}

export async function puoUsareProvider(db, provider, oraMs = Date.now()) {
  const stato = await assicuraStatoProvider(db, provider, 'disponibile');
  if (!stato) return { consentito: true, stato: 'salute_non_persistita', sospesoFino: null };
  return valutaCircuitBreaker(stato, oraMs);
}

async function salvaStatoCalcolato(db, provider, nuovo, {
  ultimoErrore = null,
  codiceErrore = null,
  successo = false
} = {}) {
  if (!db || !provider || !nuovo) return;
  await assicuraTabellaStatoProvider(db);
  await db.prepare(`
    UPDATE stato_provider
    SET stato=?2,
        errori_consecutivi=?3,
        sospeso_fino=?4,
        ultimo_successo=CASE WHEN ?5=1 THEN CURRENT_TIMESTAMP ELSE ultimo_successo END,
        ultimo_errore=?6,
        codice_ultimo_errore=?7,
        chiamate_totali=?8,
        errori_totali=?9,
        risultati_totali=?10,
        latenza_media_ms=?11,
        latenza_massima_ms=?12,
        ultima_durata_ms=?13,
        aggiornato_il=CURRENT_TIMESTAMP
    WHERE provider=?1
  `).bind(
    provider,
    nuovo.stato,
    nuovo.erroriConsecutivi,
    nuovo.sospesoFino,
    successo ? 1 : 0,
    ultimoErrore,
    codiceErrore,
    nuovo.chiamateTotali,
    nuovo.erroriTotali,
    nuovo.risultatiTotali,
    nuovo.latenzaMediaMs,
    nuovo.latenzaMassimaMs,
    nuovo.ultimaDurataMs
  ).run();
}

export async function registraSuccessoProvider(db, provider, { durataMs = 0, risultati = 0 } = {}) {
  const stato = await assicuraStatoProvider(db, provider, 'disponibile');
  if (!stato) return;
  const nuovo = statoDopoSuccesso(stato, { durataMs, risultati });
  await salvaStatoCalcolato(db, provider, nuovo, { successo: true });
}

export async function registraErroreProvider(db, provider, {
  durataMs = 0,
  errore = null,
  codiceErrore = null,
  sogliaErrori = 3,
  sospensioneMinuti = 30,
  oraMs = Date.now()
} = {}) {
  const stato = await assicuraStatoProvider(db, provider, 'disponibile');
  if (!stato) return;
  const nuovo = statoDopoErrore(stato, {
    durataMs,
    sogliaErrori,
    sospensioneMinuti,
    oraMs
  });
  await salvaStatoCalcolato(db, provider, nuovo, {
    ultimoErrore: String(errore || 'Errore non specificato').slice(0, 500),
    codiceErrore: Number.isFinite(Number(codiceErrore)) ? Number(codiceErrore) : null,
    successo: false
  });
}

export async function marcaProviderNonConfigurato(db, provider) {
  const stato = await assicuraStatoProvider(db, provider, 'da_configurare');
  if (!stato) return;
  await db.prepare(`
    UPDATE stato_provider
    SET stato='da_configurare', sospeso_fino=NULL, aggiornato_il=CURRENT_TIMESTAMP
    WHERE provider=?1
  `).bind(provider).run();
}

export async function leggiSaluteFonti(db) {
  if (!db) return [];
  try {
    await assicuraTabellaStatoProvider(db);
    const risultato = await db.prepare(`
      SELECT provider, stato, errori_consecutivi AS erroriConsecutivi,
             sospeso_fino AS sospesoFino, ultimo_successo AS ultimoSuccesso,
             ultimo_errore AS ultimoErrore, codice_ultimo_errore AS codiceUltimoErrore,
             chiamate_totali AS chiamateTotali, errori_totali AS erroriTotali,
             risultati_totali AS risultatiTotali, latenza_media_ms AS latenzaMediaMs,
             latenza_massima_ms AS latenzaMassimaMs, ultima_durata_ms AS ultimaDurataMs,
             aggiornato_il AS aggiornatoIl
      FROM stato_provider
      ORDER BY provider
    `).all();
    return risultato.results || [];
  } catch (e) {
    if (String(e?.message || '').includes('no such table')) return [];
    throw e;
  }
}

export function __azzeraCacheSchemaSalutePerTest() {
  tabellaAssicurata = null;
}