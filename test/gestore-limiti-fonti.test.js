import test from 'node:test';
import assert from 'node:assert/strict';
import {
  regolaFonte,
  descriviRegoleFonti,
  retryAfterMsDaValore,
  calcolaBackoffEsponenziale,
  eseguiConGestoreLimiti,
  azzeraStatoGestoreLimitiPerTest
} from '../src/motore/gestore-limiti-fonti.js';

test('registra le regole essenziali delle fonti', () => {
  const regole = descriviRegoleFonti();
  assert.ok(regole.length >= 5);
  assert.equal(regolaFonte('musicbrainz').richiestePerFinestra, 1);
  assert.equal(regolaFonte('youtube').quotaGiornaliera, 100);
  assert.equal(regolaFonte('apple_catalogo').richiestePerFinestra, 20);
  assert.equal(regolaFonte('internet_archive').retryAfter, true);
  assert.equal(regolaFonte('wikipedia').concorrenzaMassima, 1);
  assert.equal(regolaFonte('wikipedia').retryAfter, true);
});

test('interpreta Retry-After sia in secondi sia come data HTTP', () => {
  assert.equal(retryAfterMsDaValore('7', 0), 7000);
  const base = Date.parse('2026-09-26T12:00:00Z');
  assert.equal(retryAfterMsDaValore('Sat, 26 Sep 2026 12:00:05 GMT', base), 5000);
});

test('backoff esponenziale cresce senza jitter nel test', () => {
  const opts = { baseMs: 500, massimoMs: 10000, jitter: 0, casuale: () => 0.5 };
  assert.equal(calcolaBackoffEsponenziale(1, opts), 500);
  assert.equal(calcolaBackoffEsponenziale(2, opts), 1000);
  assert.equal(calcolaBackoffEsponenziale(3, opts), 2000);
});

test('un 429 sospende subito la fonte e rispetta Retry-After', async () => {
  azzeraStatoGestoreLimitiPerTest();
  let ora = 100000;
  let chiamate = 0;
  await assert.rejects(
    eseguiConGestoreLimiti({
      provider: 'internet_archive', ignoraAttese: true, ora: () => ora,
      operazione: async () => {
        chiamate += 1;
        const e = new Error('429'); e.status = 429; e.retryAfterMs = 5000; throw e;
      }
    }),
    e => e.status === 429 && e.retryAfterMs === 5000
  );
  assert.equal(chiamate, 1);
  await assert.rejects(
    eseguiConGestoreLimiti({
      provider: 'internet_archive', ignoraAttese: true, ora: () => ora,
      operazione: async () => { chiamate += 1; return 'no'; }
    }),
    e => e.status === 429 && e.retryAfterMs === 5000
  );
  assert.equal(chiamate, 1);
  ora += 5001;
  const ok = await eseguiConGestoreLimiti({ provider: 'internet_archive', ignoraAttese: true, ora: () => ora, operazione: async () => 'ok' });
  assert.equal(ok.valore, 'ok');
});

test('ritenta un 503 con backoff ma non martella su 429', async () => {
  azzeraStatoGestoreLimitiPerTest();
  let chiamate = 0;
  const attese = [];
  const risultato = await eseguiConGestoreLimiti({
    provider: 'musicbrainz', ignoraAttese: false,
    ora: (() => { let t = 100000; return () => t += 2000; })(),
    dormi: async ms => { attese.push(ms); }, casuale: () => 0.5, massimoTentativi: 3,
    operazione: async () => {
      chiamate += 1;
      if (chiamate === 1) { const e = new Error('503'); e.status = 503; throw e; }
      return { ok: true };
    }
  });
  assert.equal(risultato.valore.ok, true);
  assert.equal(chiamate, 2);
  assert.ok(attese.some(ms => ms >= 500));
});

test('Wikimedia rispetta il Retry-After come gli altri provider', async () => {
  azzeraStatoGestoreLimitiPerTest();
  let chiamate = 0;
  await assert.rejects(
    eseguiConGestoreLimiti({
      provider: 'wikipedia', ignoraAttese: true, ora: () => 100000,
      operazione: async () => {
        chiamate += 1;
        const e = new Error('429 Wikimedia'); e.status = 429; e.retryAfter = '4'; throw e;
      }
    }),
    e => e.status === 429 && e.retryAfterMs === 4000
  );
  assert.equal(chiamate, 1);
});
