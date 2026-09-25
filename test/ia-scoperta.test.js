import test from 'node:test';
import assert from 'node:assert/strict';
import { generaPianoScopertaConIA, interpretaRisultatiSorgenteConIA } from '../src/fonti/ia-scoperta.js';

test('l IA genera strategie multi-fonte e mantiene i candidati come ipotesi', async () => {
  const env = {
    MODELLO_CLASSIFICAZIONE: 'modello-test',
    AI: {
      async run() {
        return {
          response: {
            strategie: [
              { provider: 'youtube', query: 'Sapore di sale cover', lingua: 'it', priorita: 95 },
              { provider: 'internet_archive', query: '"Sapore di sale" adaptation', priorita: 80 },
              { provider: 'non-ammesso', query: 'da scartare', priorita: 100 }
            ],
            candidati: [
              {
                titolo: 'Sapore di sale', interprete: 'Interprete X', anno: 1970,
                lingua: 'it', paese: 'IT', tipo: 'cover', affidabilita: 99
              }
            ],
            esaurita: false
          }
        };
      }
    }
  };

  const piano = await generaPianoScopertaConIA({
    titolo: 'Sapore di sale',
    artista: 'Gino Paoli',
    lingua: 'ita',
    strategieGiaUsate: [],
    candidatiGiaNoti: []
  }, env);

  assert.equal(piano.disponibile, true);
  assert.equal(piano.esaurita, false);
  assert.equal(piano.strategie.length, 2);
  assert.deepEqual(piano.strategie.map(s => s.provider), ['youtube', 'internet_archive']);
  assert.equal(piano.candidati.length, 1);
  assert.equal(piano.candidati[0].interprete, 'Interprete X');
  assert.equal(piano.candidati[0].affidabilita, 80, 'un ipotesi IA non puo superare 80 senza fonte');
});

test('l IA filtra i risultati di una sorgente senza certificare automaticamente', async () => {
  const env = {
    MODELLO_CLASSIFICAZIONE: 'modello-test',
    AI: {
      async run() {
        return {
          response: {
            risultati: [
              {
                indice: 0, correlato: true, titolo: 'Sapore di sale',
                interprete: 'Artista Cover', anno: 1982, lingua: 'it',
                tipo: 'cover', affidabilita: 97, motivo: 'titolo e descrizione coerenti'
              },
              { indice: 1, correlato: false }
            ]
          }
        };
      }
    }
  };

  const elementi = [
    { titolo: 'Sapore di sale - cover', descrizione: 'cover di Gino Paoli', autoreCanale: 'A', idEsterno: 'v1' },
    { titolo: 'Video non correlato', descrizione: '', autoreCanale: 'B', idEsterno: 'v2' }
  ];
  const risultati = await interpretaRisultatiSorgenteConIA(
    { titolo: 'Sapore di sale', artista: 'Gino Paoli' },
    elementi,
    env
  );

  assert.equal(risultati.length, 1);
  assert.equal(risultati[0].indice, 0);
  assert.equal(risultati[0].interprete, 'Artista Cover');
  assert.equal(risultati[0].affidabilita, 85, 'anche il filtro di sorgente resta candidato da verificare');
});
