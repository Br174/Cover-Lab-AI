import test from 'node:test';
import assert from 'node:assert/strict';
import { elencaRegistrazioniOpera } from '../src/fonti/musicbrainz.js';

function rispostaJson(dati) {
  return { ok: true, status: 200, headers: { get: () => null }, async json() { return dati; } };
}

test('MusicBrainz usa la data piu antica documentata e non quella di una ristampa', async () => {
  const fetchFn = async url => {
    assert.match(String(url), /inc=artist-credits\+work-rels\+releases/);
    return rispostaJson({
      'recording-count': 1,
      recordings: [{
        id: 'rec-ancora',
        title: 'Ancora',
        'artist-credit': [{ name: 'Eduardo De Crescenzo' }],
        'first-release-date': '2019-01-01',
        releases: [
          { id: 'ristampa', date: '2019-01-01' },
          { id: 'prima-pubblicazione', date: '1981-02-01' }
        ],
        relations: [{ type: 'performance', work: { id: 'work-ancora' }, attributes: [] }]
      }]
    });
  };

  const risultato = await elencaRegistrazioniOpera('work-ancora', fetchFn, 100, 0, {
    titolo: 'Ancora', lingua: 'ita'
  });

  assert.equal(risultato.registrazioni.length, 1);
  assert.equal(risultato.registrazioni[0].anno, 1981);
  assert.equal(risultato.registrazioni[0].interprete, 'Eduardo De Crescenzo');
});
