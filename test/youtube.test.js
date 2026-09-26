import test from 'node:test';
import assert from 'node:assert/strict';
import { cercaSuYouTube, statoProviderYouTube } from '../src/fonti/youtube.js';

test('YouTube resta in attesa se la chiave non e configurata', async () => {
  assert.deepEqual(statoProviderYouTube({}), {
    disponibile: false,
    stato: 'chiave_da_configurare'
  });

  const risultato = await cercaSuYouTube({ query: 'Sapore di sale cover' }, {});
  assert.equal(risultato.disponibile, false);
  assert.equal(risultato.stato, 'chiave_da_configurare');
  assert.deepEqual(risultato.elementi, []);
});

test('YouTube interpreta una pagina e conserva il cursore successivo', async () => {
  let urlRichiesto = '';
  const fetchFn = async (url) => {
    urlRichiesto = url;
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          nextPageToken: 'PAGINA_2',
          pageInfo: { totalResults: 123, resultsPerPage: 2 },
          items: [
            {
              id: { videoId: 'abc123' },
              snippet: {
                title: 'Sapore di sale - cover',
                description: 'Una cover del brano',
                channelTitle: 'Canale A',
                channelId: 'canale-a',
                publishedAt: '2020-01-02T03:04:05Z'
              }
            },
            {
              id: { videoId: 'def456' },
              snippet: {
                title: 'Sapore di sale live',
                description: 'Versione live',
                channelTitle: 'Canale B',
                channelId: 'canale-b',
                publishedAt: '2021-02-03T04:05:06Z'
              }
            }
          ]
        };
      }
    };
  };

  const risultato = await cercaSuYouTube({
    query: 'Sapore di sale cover',
    lingua: 'it',
    paese: 'IT',
    pageToken: 'PAGINA_1',
    maxResults: 50
  }, { YOUTUBE_API_KEY: 'chiave-test' }, fetchFn);

  assert.equal(risultato.stato, 'ok');
  assert.equal(risultato.elementi.length, 2);
  assert.equal(risultato.elementi[0].idEsterno, 'abc123');
  assert.equal(risultato.prossimoCursore, 'PAGINA_2');
  assert.equal(risultato.totaleStimato, 123);
  assert.match(urlRichiesto, /maxResults=50/);
  assert.match(urlRichiesto, /relevanceLanguage=it/);
  assert.match(urlRichiesto, /regionCode=IT/);
  assert.match(urlRichiesto, /pageToken=PAGINA_1/);
});
