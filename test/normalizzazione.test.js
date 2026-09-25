import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizzaTesto, creaChiaveRicerca, testoSimile } from '../src/motore/normalizzazione.js';

test('rimuove accenti e uniforma le maiuscole', () => {
  assert.equal(normalizzaTesto('È Già Finita'), 'e gia finita');
});

test('uniforma apostrofi tipografici', () => {
  assert.equal(normalizzaTesto("L’estate"), "l'estate");
});

test('crea una chiave stabile', () => {
  assert.equal(creaChiaveRicerca('Sapore di sale', 'Gino Paoli'), 'sapore di sale::gino paoli');
});

test('riconosce titoli inclusi come simili', () => {
  assert.equal(testoSimile('Sapore di sale', 'Sapore di sale'), true);
});
