import test from 'node:test';
import assert from 'node:assert/strict';
import { classificaNaturaVersione, applicaNaturaVersione } from '../src/motore/natura-versione.js';

test('una versione live senza prova discografica resta una performance registrata', () => {
  const esito = classificaNaturaVersione({ tipo: 'live', interprete: 'X', titolo: 'Y' });
  assert.equal(esito.categoria, 'performance_registrata');
});

test('una registrazione live presente in un catalogo discografico resta una pubblicazione', () => {
  const esito = classificaNaturaVersione({
    tipo: 'live',
    anno: 1998,
    fonti: [{ fonte: 'apple_catalogo' }]
  });
  assert.equal(esito.categoria, 'incisione_pubblicata');
  assert.match(esito.etichetta, /live/i);
});

test('una traccia presente nel catalogo Apple viene considerata pubblicazione', () => {
  const esito = classificaNaturaVersione({
    tipo: 'cover',
    anno: 1970,
    fonti: [{ fonte: 'apple_catalogo' }]
  });
  assert.equal(esito.categoria, 'incisione_pubblicata');
});

test('un riferimento solo YouTube non viene promosso automaticamente a pubblicazione', () => {
  const esito = classificaNaturaVersione({
    tipo: 'cover',
    fonti: [{ fonte: 'youtube' }]
  });
  assert.equal(esito.categoria, 'da_classificare');
});

test('una registrazione MusicBrainz datata puo essere classificata come incisione catalogata', () => {
  const esito = applicaNaturaVersione({
    tipo: 'cover',
    anno: 1965,
    idMusicBrainz: 'abc'
  });
  assert.equal(esito.naturaVersione, 'incisione_pubblicata');
  assert.ok(esito.affidabilitaNaturaVersione >= 80);
});
