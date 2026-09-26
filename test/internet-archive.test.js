import test from 'node:test';
import assert from 'node:assert/strict';
import { cercaSuInternetArchive } from '../src/fonti/internet-archive.js';

test('Internet Archive viene interrogato solo tramite ricerca metadati', async () => {
  let urlChiamato = '';
  const fetchFn = async (url) => {
    urlChiamato = String(url);
    return {
      ok: true,
      async json() {
        return {
          response: {
            numFound: 1,
            docs: [{
              identifier: 'esempio-001',
              title: 'Sapore di sale - cover',
              creator: 'Artista Esempio',
              date: '1970-01-01',
              description: 'Registrazione storica',
              mediatype: 'audio'
            }]
          }
        };
      }
    };
  };

  const risultato = await cercaSuInternetArchive({
    query: 'Sapore di sale Gino Paoli',
    limite: 10
  }, fetchFn);

  assert.match(urlChiamato, /advancedsearch\.php/);
  assert.equal(urlChiamato.includes('/download/'), false);
  assert.equal(risultato.elementi.length, 1);
  assert.equal(risultato.elementi[0].idEsterno, 'esempio-001');
  assert.equal(risultato.elementi[0].indirizzo, 'https://archive.org/details/esempio-001');
});
