import test from 'node:test';
import assert from 'node:assert/strict';
import { classificaRelazioneDuplicato, deduplicaVersioni } from '../src/motore/deduplicazione.js';

test('unisce lo stesso identificativo MusicBrainz e conserva il dato più affidabile', () => {
  const dati = [
    { idMusicBrainz: 'x', titolo: 'A', interprete: 'B', anno: 1970, affidabilita: 80 },
    { idMusicBrainz: 'x', titolo: 'A', interprete: 'B', anno: 1970, affidabilita: 90 }
  ];
  const r = deduplicaVersioni(dati);
  assert.equal(r.length, 1);
  assert.equal(r[0].affidabilita, 90);
});

test('unisce duplicati certi con titolo e interprete uguali e anno compatibile', () => {
  const dati = [
    { titolo: 'Sapore di sale', interprete: 'X', anno: 1970, affidabilita: 70 },
    { titolo: 'Sapore di sale', interprete: 'X', anno: 1971, affidabilita: 95 }
  ];
  const r = deduplicaVersioni(dati);
  assert.equal(r.length, 1);
  assert.equal(r[0].affidabilita, 95);
});

test('non elimina un probabile duplicato con anno molto distante', () => {
  const dati = [
    { titolo: 'Sapore di sale', interprete: 'X', anno: 1970, tipo: 'cover', affidabilita: 80 },
    { titolo: 'Sapore di sale', interprete: 'X', anno: 1995, tipo: 'cover', affidabilita: 85 }
  ];
  const r = deduplicaVersioni(dati);
  assert.equal(r.length, 2);
  assert.equal(r[1].possibiliDuplicati.length, 1);
  assert.equal(classificaRelazioneDuplicato(dati[0], dati[1]).stato, 'probabile_duplicato');
});

test('live e studio dello stesso interprete restano versioni distinte', () => {
  const studio = { titolo: 'Sapore di sale', interprete: 'X', anno: 1990, tipo: 'cover' };
  const live = { titolo: 'Sapore di sale', interprete: 'X', anno: 1990, tipo: 'live' };
  assert.equal(classificaRelazioneDuplicato(studio, live).stato, 'versione_distinta');
  assert.equal(deduplicaVersioni([studio, live]).length, 2);
});

test('interpreti diversi non vengono mai fusi solo perche il titolo coincide', () => {
  const a = { titolo: 'Sapore di sale', interprete: 'Artista A', anno: 1970, tipo: 'cover' };
  const b = { titolo: 'Sapore di sale', interprete: 'Artista B', anno: 1970, tipo: 'cover' };
  assert.equal(classificaRelazioneDuplicato(a, b).stato, 'versione_distinta');
  assert.equal(deduplicaVersioni([a, b]).length, 2);
});
