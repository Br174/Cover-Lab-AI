import test from 'node:test';
import assert from 'node:assert/strict';
import {
  valutaCircuitBreaker,
  statoDopoSuccesso,
  statoDopoErrore
} from '../src/motore/circuit-breaker.js';

const ORA = Date.parse('2026-09-25T18:00:00Z');

test('il circuit breaker resta aperto sotto la soglia errori', () => {
  const primo = statoDopoErrore({}, {
    durataMs: 400,
    sogliaErrori: 3,
    sospensioneMinuti: 30,
    oraMs: ORA
  });
  assert.equal(primo.stato, 'degradato');
  assert.equal(primo.erroriConsecutivi, 1);
  assert.equal(primo.sospesoFino, null);
});

test('il circuit breaker sospende la fonte dopo errori consecutivi', () => {
  let stato = {};
  for (let i = 0; i < 3; i += 1) {
    stato = statoDopoErrore({
      errori_consecutivi: stato.erroriConsecutivi || 0,
      chiamate_totali: stato.chiamateTotali || 0,
      errori_totali: stato.erroriTotali || 0,
      risultati_totali: stato.risultatiTotali || 0,
      latenza_media_ms: stato.latenzaMediaMs || 0,
      latenza_massima_ms: stato.latenzaMassimaMs || 0
    }, {
      durataMs: 500,
      sogliaErrori: 3,
      sospensioneMinuti: 30,
      oraMs: ORA
    });
  }
  assert.equal(stato.stato, 'sospeso');
  const decisione = valutaCircuitBreaker({
    stato: stato.stato,
    sospeso_fino: stato.sospesoFino
  }, ORA + 5 * 60_000);
  assert.equal(decisione.consentito, false);
  assert.equal(decisione.stato, 'sospeso');
});

test('dopo la sospensione la fonte puo essere provata di nuovo', () => {
  const decisione = valutaCircuitBreaker({
    stato: 'sospeso',
    sospeso_fino: new Date(ORA + 30 * 60_000).toISOString()
  }, ORA + 31 * 60_000);
  assert.equal(decisione.consentito, true);
  assert.equal(decisione.stato, 'prova_ripristino');
});

test('un successo azzera gli errori consecutivi e chiude il circuito', () => {
  const nuovo = statoDopoSuccesso({
    stato: 'degradato',
    errori_consecutivi: 2,
    chiamate_totali: 4,
    errori_totali: 2,
    risultati_totali: 10,
    latenza_media_ms: 500,
    latenza_massima_ms: 800
  }, { durataMs: 300, risultati: 5 });
  assert.equal(nuovo.stato, 'disponibile');
  assert.equal(nuovo.erroriConsecutivi, 0);
  assert.equal(nuovo.sospesoFino, null);
  assert.equal(nuovo.risultatiTotali, 15);
});
