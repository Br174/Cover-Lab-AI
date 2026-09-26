import test from 'node:test';
import assert from 'node:assert/strict';
import { valutaProveCandidato } from '../src/motore/verifica-candidati.js';
import { verificaCandidatoSuMusicBrainz } from '../src/fonti/musicbrainz-verifica.js';

test('un candidato proposto solo dalla IA non viene promosso', () => {
  const esito = valutaProveCandidato({ affidabilita_proposta: 80 }, [], null, 90, { confermato: true, affidabilita: 99 });
  assert.equal(esito.promosso, false);
  assert.ok(esito.affidabilita < 90);
});

test('una fonte forte come Wikipedia puo bastare se il candidato e coerente', () => {
  const esito = valutaProveCandidato(
    { affidabilita_proposta: 68 },
    [{ fonte: 'wikipedia' }],
    null,
    90
  );
  assert.equal(esito.promosso, true);
  assert.equal(esito.metodo, 'fonte_affidabile');
  assert.ok(esito.affidabilita >= 90);
});

test('YouTube da solo richiede la conferma AI', () => {
  const candidato = { affidabilita_proposta: 72 };
  const senzaAI = valutaProveCandidato(candidato, [{ fonte: 'youtube' }], null, 90, null);
  assert.equal(senzaAI.promosso, false);

  const conAI = valutaProveCandidato(candidato, [{ fonte: 'youtube' }], null, 90, {
    confermato: true,
    affidabilita: 86,
    motivo: 'Il video e coerente con una cover della composizione.'
  });
  assert.equal(conAI.promosso, true);
  assert.equal(conAI.metodo, 'youtube_verificato_ai');
  assert.ok(conAI.affidabilita >= 90);
});

test('due fonti indipendenti possono superare la soglia senza contare duplicati della stessa piattaforma', () => {
  const candidato = { affidabilita_proposta: 78 };
  const unaFonte = valutaProveCandidato(candidato, [
    { fonte: 'youtube' },
    { fonte: 'youtube' }
  ], null, 90);
  assert.equal(unaFonte.promosso, false);

  const dueFonti = valutaProveCandidato(candidato, [
    { fonte: 'youtube' },
    { fonte: 'catalogo_indipendente' }
  ], null, 90);
  assert.equal(dueFonti.promosso, true);
  assert.ok(dueFonti.affidabilita >= 90);
});

test('una relazione strutturata verificata prevale senza dipendere dalla IA', () => {
  const esito = valutaProveCandidato(
    { affidabilita_proposta: 10 },
    [],
    { verificato: true, affidabilita: 99, motivo: 'stessa opera' },
    90
  );
  assert.equal(esito.promosso, true);
  assert.equal(esito.affidabilita, 99);
  assert.equal(esito.metodo, 'fonte_strutturata');
});

test('MusicBrainz verifica solo la registrazione collegata alla composizione richiesta', async () => {
  const risposte = [
    {
      ok: true,
      json: async () => ({
        recordings: [{
          id: 'rec-1',
          title: 'Brano test',
          score: 100,
          'artist-credit': [{ name: 'Artista cover' }]
        }]
      })
    },
    {
      ok: true,
      json: async () => ({
        id: 'rec-1',
        title: 'Brano test',
        'artist-credit': [{ name: 'Artista cover' }],
        'first-release-date': '1972-01-01',
        relations: [{
          type: 'performance',
          attributes: ['cover'],
          work: { id: 'opera-originale', title: 'Brano test' }
        }]
      })
    }
  ];
  let indice = 0;
  const fetchFn = async () => risposte[indice++];

  const esito = await verificaCandidatoSuMusicBrainz({
    titolo: 'Brano test',
    interprete: 'Artista cover',
    idOperaOriginale: 'opera-originale',
    opereDerivate: []
  }, fetchFn);

  assert.equal(esito.verificato, true);
  assert.equal(esito.versione.idMusicBrainz, 'rec-1');
  assert.equal(esito.versione.idOperaMusicBrainz, 'opera-originale');
  assert.equal(esito.versione.tipo, 'cover');
  assert.equal(esito.versione.anno, 1972);
});

test('MusicBrainz non certifica una registrazione collegata a una opera diversa non nota', async () => {
  const risposte = [
    {
      ok: true,
      json: async () => ({
        recordings: [{
          id: 'rec-2',
          title: 'Stesso titolo',
          score: 100,
          'artist-credit': [{ name: 'Altro artista' }]
        }]
      })
    },
    {
      ok: true,
      json: async () => ({
        id: 'rec-2',
        title: 'Stesso titolo',
        'artist-credit': [{ name: 'Altro artista' }],
        relations: [{
          type: 'performance',
          work: { id: 'opera-diversa', title: 'Stesso titolo' }
        }]
      })
    }
  ];
  let indice = 0;
  const fetchFn = async () => risposte[indice++];

  const esito = await verificaCandidatoSuMusicBrainz({
    titolo: 'Stesso titolo',
    interprete: 'Altro artista',
    idOperaOriginale: 'opera-originale',
    opereDerivate: []
  }, fetchFn);

  assert.equal(esito.verificato, false);
  assert.equal(esito.stato, 'non_confermato');
});
