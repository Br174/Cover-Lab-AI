import test from 'node:test';
import assert from 'node:assert/strict';
import { individuaComposizione } from '../src/fonti/musicbrainz.js';

function rispostaJson(dati) {
  return { ok: true, status: 200, headers: { get() { return null; } }, async json() { return dati; } };
}

function rispostaErrore(stato) {
  return { ok: false, status: stato, headers: { get() { return null; } }, async json() { return {}; } };
}

test('ritenta automaticamente un errore transitorio MusicBrainz 503', async () => {
  let chiamateRicerca = 0;

  const fetchFn = async (url) => {
    if (url.includes('/work/?query=')) {
      chiamateRicerca += 1;
      if (chiamateRicerca === 1) return rispostaErrore(503);
      return rispostaJson({
        works: [{ id: 'work-1', title: 'Sapore di sale', score: 100, language: 'ita' }]
      });
    }

    if (url.includes('/work/work-1?')) {
      return rispostaJson({
        id: 'work-1',
        title: 'Sapore di sale',
        language: 'ita',
        relations: [{ type: 'composer', artist: { name: 'Gino Paoli' } }]
      });
    }

    throw new Error(`URL inatteso: ${url}`);
  };

  const risultato = await individuaComposizione('Sapore di sale', 'Gino Paoli', fetchFn);

  assert.equal(chiamateRicerca, 2);
  assert.equal(risultato.idMusicBrainz, 'work-1');
  assert.equal(risultato.titoloCanonico, 'Sapore di sale');
  assert.equal(risultato.linguaOriginale, 'ita');
});
