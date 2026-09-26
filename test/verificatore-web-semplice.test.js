import test from 'node:test';
import assert from 'node:assert/strict';
import { valutaProveCandidato } from '../src/motore/verifica-candidati.js';
import { cercaSuDeezer, statoProviderDeezer } from '../src/fonti/deezer.js';
import { cercaSuWebEditoriale, statoProviderWebEditoriale } from '../src/fonti/gdelt-web.js';
import { creaRegistroProvider } from '../src/fonti/provider-registry.js';
import { regolaFonte } from '../src/motore/gestore-limiti-fonti.js';

test('una fonte reale marcata coerente dal primo filtro AI basta per la conferma', () => {
  const esito = valutaProveCandidato(
    {
      affidabilita_proposta: 78,
      tipo_proposto: 'cover',
      stato: 'fonte_confermata_ai'
    },
    [{ fonte: 'deezer', idEsterno: '123' }],
    null,
    90,
    null
  );
  assert.equal(esito.promosso, true);
  assert.equal(esito.metodo, 'fonte_reale_coerente_ai');
  assert.ok(esito.affidabilita >= 90);
});

test('un risultato con buon punteggio ma senza marchio di coerenza non passa da solo', () => {
  const esito = valutaProveCandidato(
    {
      affidabilita_proposta: 82,
      tipo_proposto: 'cover',
      stato: 'da_verificare'
    },
    [{ fonte: 'deezer', idEsterno: '123' }],
    null,
    90,
    null
  );
  assert.equal(esito.promosso, false);
});

test('la sola memoria AI resta fuori anche se porta il marchio per errore ma non ha una fonte', () => {
  const esito = valutaProveCandidato(
    {
      affidabilita_proposta: 95,
      tipo_proposto: 'cover',
      stato: 'fonte_confermata_ai'
    },
    [],
    null,
    90,
    null
  );
  assert.equal(esito.promosso, false);
});

test('una fonte reale ambigua puo essere chiarita dal controllo AI supplementare', () => {
  const esito = valutaProveCandidato(
    {
      affidabilita_proposta: 60,
      tipo_proposto: 'dubbio',
      stato: 'da_verificare'
    },
    [{ fonte: 'internet_archive', idEsterno: 'x' }],
    null,
    90,
    { confermato: true, affidabilita: 88, motivo: 'La pagina identifica chiaramente interprete e composizione.' }
  );
  assert.equal(esito.promosso, true);
  assert.equal(esito.metodo, 'fonte_reale_verificata_ai');
});

test('Deezer e disponibile senza chiave e conserva provenienza e metadati', async () => {
  assert.equal(statoProviderDeezer().disponibile, true);
  const fetchFn = async url => {
    assert.match(String(url), /api\.deezer\.com\/search\/track/);
    return {
      ok: true,
      json: async () => ({
        total: 1,
        data: [{
          id: 42,
          title: 'Ancora',
          duration: 230,
          link: 'https://www.deezer.com/track/42',
          isrc: 'ITABC1234567',
          artist: { name: 'Interprete Test' },
          album: { title: 'Album Test' }
        }]
      })
    };
  };
  const pagina = await cercaSuDeezer({ query: 'Ancora Interprete Test' }, fetchFn);
  assert.equal(pagina.elementi.length, 1);
  assert.equal(pagina.elementi[0].fonte, 'deezer');
  assert.equal(pagina.elementi[0].interprete, 'Interprete Test');
  assert.equal(pagina.elementi[0].isrc, 'ITABC1234567');
});

test('il verificatore editoriale usa GDELT DOC e restituisce URL di provenienza', async () => {
  assert.equal(statoProviderWebEditoriale().disponibile, true);
  const fetchFn = async url => {
    const u = new URL(String(url));
    assert.equal(u.pathname, '/api/v2/doc/doc');
    assert.equal(u.searchParams.get('mode'), 'artlist');
    assert.equal(u.searchParams.get('timespan'), '1y');
    return {
      ok: true,
      json: async () => ({
        articles: [{
          url: 'https://giornale.example/articolo-cover',
          title: 'Interprete Test incide Ancora',
          domain: 'giornale.example',
          seendate: '20260920T120000Z',
          language: 'Italian'
        }]
      })
    };
  };
  const pagina = await cercaSuWebEditoriale({ query: '"Ancora" "Interprete Test"' }, fetchFn);
  assert.equal(pagina.elementi.length, 1);
  assert.equal(pagina.elementi[0].fonte, 'web_editoriale');
  assert.equal(pagina.elementi[0].indirizzo, 'https://giornale.example/articolo-cover');
});

test('registro e gestore centrale conoscono le nuove fonti pubbliche', () => {
  const registro = creaRegistroProvider({});
  assert.ok(registro.has('deezer'));
  assert.ok(registro.has('web_editoriale'));
  assert.equal(regolaFonte('deezer')?.apiKey, 'non richiesta per la ricerca pubblica usata qui');
  assert.equal(regolaFonte('web_editoriale')?.apiKey, 'non richiesta');
});
