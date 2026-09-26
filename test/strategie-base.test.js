import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generaStrategieDeterministiche,
  generaStrategieFallback,
  ricercaSospettosamentePovera
} from '../src/motore/strategie-base.js';

test('le strategie deterministiche coprono Wikipedia, YouTube, cataloghi e Internet Archive', () => {
  const strategie = generaStrategieDeterministiche({
    titolo: 'Sapore di sale',
    artista: 'Gino Paoli',
    compositore: 'Gino Paoli',
    lingua: 'it',
    paese: 'IT'
  });
  const providers = new Set(strategie.map(s => s.provider));
  assert.ok(providers.has('wikipedia'));
  assert.ok(providers.has('youtube'));
  assert.ok(providers.has('cataloghi'));
  assert.ok(providers.has('internet_archive'));
  assert.ok(strategie.every(s => s.query && s.priorita > 0));
});

test('il fallback non ripete una strategia gia nota', () => {
  const note = [{ provider: 'youtube', query: 'Sapore di sale cover' }];
  const fallback = generaStrategieFallback({
    titolo: 'Sapore di sale',
    artista: 'Gino Paoli'
  }, 'youtube', note);
  assert.equal(
    fallback.some(s => s.provider === 'youtube' && s.query.toLowerCase() === 'sapore di sale cover'),
    false
  );
  assert.ok(fallback.length > 0);
});

test('Wikipedia usa il titolo canonico e non crea raffiche di fallback', () => {
  const fallback = generaStrategieFallback({
    titolo: 'Sapore di sale', artista: 'Gino Paoli'
  }, 'wikipedia', []);
  assert.equal(fallback.length, 1);
  assert.equal(fallback[0].query, 'Sapore di sale');
});

test('zero risultati e pochi candidati vengono considerati sospetti', () => {
  assert.equal(ricercaSospettosamentePovera({ risultatiGrezzi: 0, candidatiUtili: 0, soglia: 3 }), true);
  assert.equal(ricercaSospettosamentePovera({ risultatiGrezzi: 20, candidatiUtili: 1, soglia: 3 }), true);
  assert.equal(ricercaSospettosamentePovera({ risultatiGrezzi: 20, candidatiUtili: 5, soglia: 3 }), false);
});
