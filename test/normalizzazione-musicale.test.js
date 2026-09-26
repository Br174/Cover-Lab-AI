import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizzaTitoloPerConfronto,
  titoloMusicaleSimile,
  creaChiaveDuplicato
} from '../src/motore/normalizzazione.js';

test('rimuove solo le etichette di versione dal titolo usato per il confronto', () => {
  assert.equal(normalizzaTitoloPerConfronto('Ancora (Live Version)'), 'ancora');
  assert.equal(normalizzaTitoloPerConfronto('Ancora [Remastered Version]'), 'ancora');
  assert.equal(normalizzaTitoloPerConfronto('Ancora - Instrumental'), 'ancora');
  assert.equal(normalizzaTitoloPerConfronto('Ancora — Radio Edit'), 'ancora');
});

test('non altera parole normali che fanno parte del titolo', () => {
  assert.equal(normalizzaTitoloPerConfronto('Live Is Life'), 'live is life');
  assert.equal(normalizzaTitoloPerConfronto('The Remix'), 'the remix');
});

test('riconosce come compatibili titolo base e versione etichettata', () => {
  assert.equal(titoloMusicaleSimile('Ancora', 'Ancora (Live)'), true);
  assert.equal(titoloMusicaleSimile('Ancora', 'Ancora - Remastered'), true);
  assert.equal(titoloMusicaleSimile('Ancora', 'Un altro brano'), false);
});

test('la deduplicazione conserva live e studio come registrazioni distinte', () => {
  const studio = creaChiaveDuplicato({ titolo: 'Ancora', interprete: 'Artista', anno: 1981 });
  const live = creaChiaveDuplicato({ titolo: 'Ancora (Live)', interprete: 'Artista', anno: 1995 });
  assert.notEqual(studio, live);
});
