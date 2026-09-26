import test from 'node:test';
import assert from 'node:assert/strict';
import { elencaRegistrazioniOpera } from '../src/fonti/musicbrainz.js';
import { azzeraStatoGestoreLimitiPerTest } from '../src/motore/gestore-limiti-fonti.js';

function rispostaJson(dati) {
  return {
    ok: true,
    status: 200,
    headers: { get() { return null; } },
    async json() { return dati; }
  };
}

test('ogni registrazione MusicBrainz porta la prova esplicita recording verso work', async () => {
  azzeraStatoGestoreLimitiPerTest();
  const idOpera = 'work-sapore';
  const fetchFn = async (url) => {
    assert.match(String(url), /recording\?work=work-sapore/);
    return rispostaJson({
      'recording-count': 1,
      recordings: [{
        id: 'recording-cover-1',
        title: 'Sapore di sale',
        'first-release-date': '1964-01-01',
        'artist-credit': [{ name: 'Interprete Test' }],
        relations: [{ type: 'performance', work: { id: idOpera, title: 'Sapore di sale' }, attributes: ['cover'] }]
      }]
    });
  };

  const esito = await elencaRegistrazioniOpera(idOpera, fetchFn, 100, 0, {
    titolo: 'Sapore di sale',
    lingua: 'ita',
    crediti: [{ ruolo: 'compositore', nome: 'Gino Paoli', fonte: 'musicbrainz' }]
  });

  assert.equal(esito.totale, 1);
  assert.equal(esito.registrazioni.length, 1);
  const versione = esito.registrazioni[0];
  assert.equal(versione.stessaComposizione, true);
  assert.equal(versione.idOperaMusicBrainz, idOpera);
  assert.equal(versione.creditiOpera[0].nome, 'Gino Paoli');
  assert.deepEqual(versione.fonti, [{
    fonte: 'musicbrainz',
    idEsterno: 'recording-cover-1',
    indirizzo: 'https://musicbrainz.org/recording/recording-cover-1',
    nota: 'Registrazione collegata all opera MusicBrainz work-sapore'
  }]);
});
