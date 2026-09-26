import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretaRicercaLibera } from '../src/motore/ricerca-libera.js';

test('la ricerca libera usa la AI solo per identificare la composizione', async () => {
  let richiesta = null;
  const env = {
    MODELLO_CLASSIFICAZIONE: 'modello-test',
    AI: {
      async run(_modello, payload) {
        richiesta = payload;
        return {
          response: {
            stato: 'risolto',
            titolo: 'Sapore di sale',
            artista: 'Gino Paoli',
            anno: 1963,
            lingua: 'it',
            paese: 'IT',
            confidenzaInterpretazione: 96,
            motivo: 'Composizione identificata'
          }
        };
      }
    }
  };

  const esito = await interpretaRicercaLibera('Gino Paoli, Sapore di sale, 1963', env);
  assert.equal(esito.stato, 'risolto');
  assert.equal(esito.titolo, 'Sapore di sale');
  assert.equal(esito.artista, 'Gino Paoli');
  assert.equal(esito.anno, 1963);
  assert.equal(esito.metodo, 'regista_ai');
  const sistema = richiesta.messages[0].content;
  assert.match(sistema, /NON verifica la cover/i);
});

test('senza AI la forma artista, titolo resta utilizzabile come fallback', async () => {
  const esito = await interpretaRicercaLibera('Gino Paoli, Sapore di sale, 1963', {});
  assert.equal(esito.stato, 'risolto_fallback');
  assert.equal(esito.artista, 'Gino Paoli');
  assert.equal(esito.titolo, 'Sapore di sale');
  assert.equal(esito.anno, 1963);
});

test('una richiesta troppo generica senza AI non viene inventata', async () => {
  const esito = await interpretaRicercaLibera('1963', {});
  assert.equal(esito.stato, 'dati_insufficienti');
  assert.equal(esito.titolo, null);
  assert.equal(esito.artista, null);
  assert.equal(esito.anno, 1963);
});
