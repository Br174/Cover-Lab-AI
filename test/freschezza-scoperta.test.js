import test from 'node:test';
import assert from 'node:assert/strict';
import { scopertaScaduta } from '../src/dati/freschezza-scoperta.js';

test('una scoperta recente non viene riaperta prima della soglia', () => {
  const adesso = Date.parse('2026-09-25T12:00:00Z');
  assert.equal(scopertaScaduta('2026-09-24 12:00:00', 168, adesso), false);
});

test('una scoperta vecchia viene riaperta e puo trovare cover pubblicate dopo', () => {
  const adesso = Date.parse('2026-09-25T12:00:00Z');
  assert.equal(scopertaScaduta('2026-09-10 12:00:00', 168, adesso), true);
});

test('una composizione mai scandita e subito considerata da esplorare', () => {
  assert.equal(scopertaScaduta(null, 168, Date.now()), true);
});
