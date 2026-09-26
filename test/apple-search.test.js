import test from 'node:test';
import assert from 'node:assert/strict';
import { cercaNelCatalogoApple, statoProviderApple } from '../src/fonti/apple-search.js';

function rispostaJson(corpo, stato = 200) {
  return {
    ok: stato >= 200 && stato < 300,
    status: stato,
    async json() { return corpo; }
  };
}

test('Apple e disponibile senza chiave API', () => {
  const stato = statoProviderApple();
  assert.equal(stato.disponibile, true);
  assert.equal(stato.provider, 'apple_catalogo');
});

test('Apple normalizza i risultati musicali nel formato interno', async () => {
  let urlUsato = '';
  const fetchFn = async (url) => {
    urlUsato = String(url);
    return rispostaJson({
      resultCount: 2,
      results: [
        {
          kind: 'song',
          trackId: 123,
          trackName: 'Sapore di sale',
          artistName: 'Interprete di prova',
          collectionName: 'Album prova',
          releaseDate: '1970-01-02T00:00:00Z',
          country: 'ITA',
          primaryGenreName: 'Pop',
          trackViewUrl: 'https://music.apple.com/test'
        },
        { kind: 'feature-movie', trackName: 'Da ignorare', artistName: 'X' }
      ]
    });
  };

  const risultato = await cercaNelCatalogoApple({
    query: 'Sapore di sale cover',
    paeseRicerca: 'IT',
    limite: 50
  }, fetchFn);

  assert.match(urlUsato, /itunes\.apple\.com\/search/);
  assert.match(urlUsato, /media=music/);
  assert.match(urlUsato, /entity=song/);
  assert.equal(risultato.provider, 'apple_catalogo');
  assert.equal(risultato.elementi.length, 1);
  assert.deepEqual(risultato.elementi[0], {
    idEsterno: '123',
    titolo: 'Sapore di sale',
    interprete: 'Interprete di prova',
    album: 'Album prova',
    dataPubblicazione: '1970-01-02T00:00:00Z',
    paese: 'ITA',
    genere: 'Pop',
    indirizzo: 'https://music.apple.com/test',
    descrizione: 'Interprete di prova — Sapore di sale — Album prova — Pop',
    autoreCanale: 'Interprete di prova'
  });
});

test('Apple espone lo stato HTTP in caso di errore', async () => {
  const fetchFn = async () => rispostaJson({}, 503);
  await assert.rejects(
    () => cercaNelCatalogoApple({ query: 'test' }, fetchFn),
    errore => errore?.status === 503 && /503/.test(errore.message)
  );
});
