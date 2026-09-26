import test from 'node:test';
import assert from 'node:assert/strict';
import { valutaAmmissioneArchivio } from '../src/motore/ammissione-archivio.js';

test('una relazione strutturata verificata entra in archivio', () => {
  const esito = valutaAmmissioneArchivio({
    versione: {
      titolo: 'Sapore di sale', interprete: 'Artista X', idOperaMusicBrainz: 'work-1',
      affidabilita: 99, statoVerifica: 'verificato_musicbrainz', tipo: 'cover'
    },
    fonti: [{ fonte: 'musicbrainz' }],
    verificaStrutturata: { verificato: true }
  });
  assert.equal(esito.ammessa, true);
  assert.equal(esito.statoArchivio, 'archiviata');
});

test('una relazione dubbia al 70 percento non entra in archivio', () => {
  const esito = valutaAmmissioneArchivio({
    versione: {
      titolo: 'Titolo dubbio', interprete: 'Artista X',
      affidabilita: 70, statoVerifica: 'da_verificare', tipo: 'dubbio'
    },
    fonti: [{ fonte: 'youtube' }]
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
    fonti: [{ fonte: 'musicbrainz' }]
  });
  assert.equal(esito.ammessa, false);
  assert.equal(esito.statoArchivio, 'riferimento_originale');
});

test('un video YouTube verificato dall AI puo entrare anche se i crediti sono ancora incompleti', () => {
  const esito = valutaAmmissioneArchivio({
    versione: {
      titolo: 'Sapore di sale', interprete: 'Artista X', affidabilita: 92,
      statoVerifica: 'verificato_ai_su_fonte', tipo: 'cover'
    },
    fonti: [{ fonte: 'youtube', idEsterno: 'video-1' }],
    creditiVersione: [{ ruolo: 'interprete', nome: 'Artista X', fonte: 'youtube' }]
  });
  assert.equal(esito.ammessa, true);
  assert.equal(esito.statoArchivio, 'archiviata');
  assert.equal(esito.arricchimentoProgressivo, true);
});

test('Wikipedia come fonte attendibile puo documentare una cover senza obbligare crediti completi', () => {
  const esito = valutaAmmissioneArchivio({
    versione: {
      titolo: 'Sapore di sale', interprete: 'Rita Pavone', affidabilita: 92,
      statoVerifica: 'verificato_fonte_affidabile', tipo: 'cover'
    },
    fonti: [{ fonte: 'wikipedia', indirizzo: 'https://it.wikipedia.org/wiki/Sapore_di_sale' }]
  });
  assert.equal(esito.ammessa, true);
});

test('un credito AI non blocca l archivio ed e dichiarato come arricchimento', () => {
  const esito = valutaAmmissioneArchivio({
    versione: {
      titolo: 'Titolo adattato', interprete: 'Artista Y', affidabilita: 94,
      statoVerifica: 'verificato_ai_su_fonte', tipo: 'adattamento'
    },
    fonti: [{ fonte: 'youtube' }],
    creditiVersione: [{ ruolo: 'adattatore', nome: 'Autore Z', fonte: 'ai_arricchimento' }]
  });
  assert.equal(esito.ammessa, true);
  assert.equal(esito.creditiDaAI, 1);
});

test('l AI da sola senza alcuna fonte reale non puo creare una cover in archivio', () => {
  const esito = valutaAmmissioneArchivio({
    versione: {
      titolo: 'Cover inventata', interprete: 'Artista Y', affidabilita: 99,
      statoVerifica: 'verificato_ai_su_fonte', tipo: 'cover'
    },
    fonti: [],
    creditiVersione: [{ ruolo: 'autore', nome: 'Nome AI', fonte: 'ai_arricchimento' }]
  });
  assert.equal(esito.ammessa, false);
  assert.match(esito.motivo, /fonte reale/i);
});
