import test from 'node:test';
import assert from 'node:assert/strict';
import { classificaDaMetadati, applicaAdattamentoSeNecessario } from '../src/motore/classificazione.js';

const originale = { titolo: 'Sapore di sale', artista: 'Gino Paoli', anno: 1963, lingua: 'ita' };

test('classifica una relazione cover esplicita', () => {
  const r = classificaDaMetadati({ titolo: 'Sapore di sale', interprete: 'Altro', attributi: ['cover'], stessaComposizione: true }, originale);
  assert.equal(r.tipo, 'cover');
  assert.ok(r.affidabilita >= 95);
});

test('classifica live', () => {
  const r = classificaDaMetadati({ titolo: 'Sapore di sale', interprete: 'Altro', attributi: ['live'], stessaComposizione: true }, originale);
  assert.equal(r.tipo, 'live');
});

test('classifica strumentale', () => {
  const r = classificaDaMetadati({ titolo: 'Sapore di sale', interprete: 'Altro', attributi: ['instrumental'], stessaComposizione: true }, originale);
  assert.equal(r.tipo, 'strumentale');
});

test('classifica karaoke', () => {
  const r = classificaDaMetadati({ titolo: 'Sapore di sale karaoke', interprete: 'Studio', attributi: [], stessaComposizione: true }, originale);
  assert.equal(r.tipo, 'karaoke');
});

test('riconosce la registrazione originale', () => {
  const r = classificaDaMetadati({ titolo: 'Sapore di sale', interprete: 'Gino Paoli', anno: 1963, attributi: [], stessaComposizione: true }, originale);
  assert.equal(r.tipo, 'originale');
});

test('una traduzione diventa adattamento', () => {
  const base = { tipo: 'cover', affidabilita: 90, motivo: 'stessa composizione' };
  const r = applicaAdattamentoSeNecessario(base, { titolo: 'Titolo tradotto', interprete: 'X', lingua: 'spa', stessaComposizione: true, derivazioneTradotta: true }, originale);
  assert.equal(r.tipo, 'adattamento');
  assert.ok(r.affidabilita >= 92);
});
