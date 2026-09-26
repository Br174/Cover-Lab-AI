import test from 'node:test';
import assert from 'node:assert/strict';
import { valutaAmmissioneArchivio } from '../src/motore/ammissione-archivio.js';

test('una relazione strutturata verificata con crediti essenziali entra in archivio', () => {
  const esito = valutaAmmissioneArchivio({
    versione: {
      titolo: 'Sapore di sale', interprete: 'Artista X', idOperaMusicBrainz: 'work-1',
      affidabilita: 99, statoVerifica: 'verificato_musicbrainz', tipo: 'cover'
    },
    creditiComposizione: [{ ruolo: 'compositore', nome: 'Gino Paoli', fonte: 'musicbrainz' }],
    verificaStrutturata: { verificato: true }
  });
  assert.equal(esito.ammessa, true);
  assert.equal(esito.statoArchivio, 'archiviata');
});

test('una relazione strutturata ma dubbia al 70 percento non entra in archivio', () => {
  const esito = valutaAmmissioneArchivio({
    versione: {
      titolo: 'Titolo dubbio', interprete: 'Artista X', idOperaMusicBrainz: 'work-1',
      affidabilita: 70, statoVerifica: 'da_verificare', tipo: 'dubbio'
    },
    creditiComposizione: [{ ruolo: 'compositore', nome: 'Autore originale' }]
  });
  assert.equal(esito.ammessa, false);
  assert.equal(esito.statoArchivio, 'in_verifica');
});

test('la registrazione originale resta riferimento e non gonfia il conteggio cover', () => {
  const esito = valutaAmmissioneArchivio({
    versione: {
      titolo: 'Sapore di sale', interprete: 'Gino Paoli', idOperaMusicBrainz: 'work-1',
      affidabilita: 99, statoVerifica: 'verificato_musicbrainz', tipo: 'originale'
    },
    creditiComposizione: [{ ruolo: 'compositore', nome: 'Gino Paoli' }]
  });
  assert.equal(esito.ammessa, false);
  assert.equal(esito.statoArchivio, 'riferimento_originale');
});

test('il solo titolo o un video non bastano senza crediti essenziali', () => {
  const esito = valutaAmmissioneArchivio({
    versione: { titolo: 'Sapore di sale', interprete: 'Artista X', affidabilita: 95, statoVerifica: 'verificato_multifonte', tipo: 'cover' },
    fonti: [{ fonte: 'youtube' }, { fonte: 'internet_archive' }],
    creditiVersione: [{ ruolo: 'interprete', nome: 'Artista X' }]
  });
  assert.equal(esito.ammessa, false);
  assert.equal(esito.statoArchivio, 'in_verifica');
});

test('multifonte senza relazione strutturata richiede crediti specifici della versione', () => {
  const esito = valutaAmmissioneArchivio({
    versione: { titolo: 'Titolo adattato', interprete: 'Artista Y', affidabilita: 95, statoVerifica: 'verificato_multifonte', tipo: 'adattamento' },
    fonti: [{ fonte: 'apple_catalogo' }, { fonte: 'internet_archive' }],
    creditiComposizione: [{ ruolo: 'compositore', nome: 'Autore originale' }]
  });
  assert.equal(esito.ammessa, false);
});

test('multifonte verificata con credito specifico essenziale puo essere ammessa', () => {
  const esito = valutaAmmissioneArchivio({
    versione: { titolo: 'Titolo adattato', interprete: 'Artista Y', affidabilita: 95, statoVerifica: 'verificato_multifonte', tipo: 'adattamento' },
    fonti: [{ fonte: 'apple_catalogo' }, { fonte: 'internet_archive' }],
    creditiVersione: [{ ruolo: 'traduttore', nome: 'Traduttore Z', fonte: 'catalogo' }]
  });
  assert.equal(esito.ammessa, true);
});
