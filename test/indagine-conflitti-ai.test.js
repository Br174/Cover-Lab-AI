import test from 'node:test';
import assert from 'node:assert/strict';
import { indagaConflittoConIA } from '../src/motore/indagine-conflitti-ai.js';
import { individuaConflittiTraCandidatoEVerifica } from '../src/dati/conflitti-versione.js';

test('una discordanza genera una indagine AI e strategie di conferma, non una risoluzione automatica', async () => {
  let richiestaAI = null;
  const env = {
    MODELLO_CLASSIFICAZIONE: 'modello-test',
    AI: {
      async run(_modello, richiesta) {
        richiestaAI = richiesta;
        return {
          response: {
            ipotesi: 'Una fonte potrebbe riferirsi a una ristampa mentre l altra alla prima registrazione.',
            domandaVerifica: 'Qual e la data della prima registrazione della versione?',
            strategie: [
              { provider: 'cataloghi', query: 'Artista Versione X first release', priorita: 95 },
              { provider: 'internet_archive', query: 'Artista Versione X 1963 1964', priorita: 80 },
              { provider: 'provider_non_ammesso', query: 'da scartare', priorita: 100 }
            ]
          }
        };
      }
    }
  };

  const esito = await indagaConflittoConIA({
    originale: { titolo: 'Brano originale', artista: 'Autore originale' },
    versione: { titolo: 'Versione X', interprete: 'Artista X' },
    conflitto: {
      campo: 'anno',
      valoreA: '1963',
      fonteA: 'apple_catalogo',
      valoreB: '1964',
      fonteB: 'musicbrainz'
    }
  }, env);

  const sistema = richiestaAI?.messages?.[0]?.content || '';
  assert.match(sistema, /Non dichiarare il conflitto risolto/i);
  assert.equal(esito.disponibile, true);
  assert.match(esito.ipotesi, /ristampa/i);
  assert.equal(esito.strategie.length, 2);
  assert.deepEqual(esito.strategie.map(s => s.provider), ['cataloghi', 'internet_archive']);
  assert.ok(!Object.hasOwn(esito, 'valoreRisolto'));
});

test('senza AI il conflitto resta da verificare e non viene inventata una risposta', async () => {
  const esito = await indagaConflittoConIA({
    originale: { titolo: 'Brano' },
    versione: { titolo: 'Versione' },
    conflitto: { campo: 'anno', valoreA: '1963', valoreB: '1964' }
  }, {});

  assert.equal(esito.disponibile, false);
  assert.deepEqual(esito.strategie, []);
  assert.equal(esito.ipotesi, null);
});

test('lingue equivalenti non generano un falso conflitto', () => {
  const conflitti = individuaConflittiTraCandidatoEVerifica(
    { titolo: 'Versione', interprete: 'Artista', lingua: 'ita', anno: 1963 },
    { titolo: 'Versione', interprete: 'Artista', lingua: 'it', anno: 1963 },
    [{ fonte: 'apple_catalogo' }]
  );
  assert.equal(conflitti.length, 0);
});

test('anni realmente discordanti generano un conflitto da indagare', () => {
  const conflitti = individuaConflittiTraCandidatoEVerifica(
    { titolo: 'Versione', interprete: 'Artista', anno: 1963 },
    { titolo: 'Versione', interprete: 'Artista', anno: 1964 },
    [{ fonte: 'apple_catalogo' }]
  );

  assert.equal(conflitti.length, 1);
  assert.equal(conflitti[0].campo, 'anno');
  assert.equal(conflitti[0].valoreA, '1963');
  assert.equal(conflitti[0].valoreB, '1964');
});
