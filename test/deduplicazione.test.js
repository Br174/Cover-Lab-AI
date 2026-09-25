import test from 'node:test';
import assert from 'node:assert/strict';
import { deduplicaVersioni } from '../src/motore/deduplicazione.js';

test('elimina lo stesso identificativo MusicBrainz', () => {
  const dati = [
    { idMusicBrainz: 'x', titolo: 'A', interprete: 'B', anno: 1970, affidabilita: 80 },
    { idMusicBrainz: 'x', titolo: 'A', interprete: 'B', anno: 1970, affidabilita: 90 }
  ];
  assert.equal(deduplicaVersioni(dati).length, 1);
});

test('elimina duplicati morbidi e conserva il più affidabile', () => {
  const dati = [
    { titolo: 'Sapore di sale', interprete: 'X', anno: 1970, affidabilita: 70 },
    { titolo: 'Sapore di sale', interprete: 'X', anno: 1971, affidabilita: 95 }
  ];
  const r = deduplicaVersioni(dati);
  assert.equal(r.length, 1);
  assert.equal(r[0].affidabilita, 95);
});
