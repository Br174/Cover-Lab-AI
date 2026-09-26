import test from 'node:test';
import assert from 'node:assert/strict';
import { chiaveCandidato } from '../src/dati/scoperta.js';

test('la chiave candidato non dipende dall anno', () => {
  const a = chiaveCandidato({ titolo: 'Sapore di sale', interprete: 'Artista X', anno: 1965 });
  const b = chiaveCandidato({ titolo: 'Sapore di sale', interprete: 'Artista X', anno: 2001 });
  const c = chiaveCandidato({ titolo: 'Sapore di sale', interprete: 'Artista X' });
  assert.equal(a, b);
  assert.equal(b, c);
});

test('la chiave candidato normalizza accenti e maiuscole', () => {
  const a = chiaveCandidato({ titolo: 'Città', interprete: 'ARTISTA' });
  const b = chiaveCandidato({ titolo: 'citta', interprete: 'artista' });
  assert.equal(a, b);
});
