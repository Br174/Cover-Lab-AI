import test from 'node:test';
import assert from 'node:assert/strict';
import { generaPianoScopertaConIA } from '../src/fonti/ia-scoperta.js';

test('se il primo piano ha solo strategie il Regista esegue un secondo passaggio di candidati non certificati', async () => {
  let chiamate = 0;
  const env = {
    MODELLO_CLASSIFICAZIONE: 'modello-test',
    AI: {
      async run() {
        chiamate += 1;
        if (chiamate === 1) {
          return {
            response: {
              domandeEsplorate: ['italia'],
              strategie: [{ provider: 'cataloghi', query: 'Brano cover', priorita: 90 }],
              candidati: [],
              nuoveDomande: [],
              esaurita: false
            }
          };
        }
        return {
          response: {
            candidati: [
              { titolo: 'Brano', interprete: 'Artista cover', anno: 1975, tipo: 'cover', affidabilita: 99 },
              { titolo: 'Brano', interprete: 'Artista originale', anno: 1970, tipo: 'originale', affidabilita: 99 }
            ],
            strategie: []
          }
        };
      }
    }
  };

  const piano = await generaPianoScopertaConIA({
    titolo: 'Brano',
    artista: 'Artista originale',
    agenda: { domande: [{ id: 'italia', domanda: 'Quali cover italiane?', obiettivo: 'versioni italiane' }] },
    strategieGiaUsate: [],
    candidatiGiaNoti: []
  }, env);

  assert.equal(chiamate, 2);
  assert.equal(piano.candidati.length, 1, 'l originale esatto deve essere escluso dal recupero');
  assert.equal(piano.candidati[0].interprete, 'Artista cover');
  assert.ok(piano.candidati[0].affidabilita <= 70, 'una ipotesi di recupero resta ben sotto la soglia di certificazione');
  assert.equal(piano.recupero, 'recupero_candidati_specifici');
  assert.ok(piano.strategie.some(s => s.provider === 'cataloghi' && /Artista cover/.test(s.query)));
});

test('il recupero non ripropone candidati gia noti', async () => {
  let chiamate = 0;
  const env = {
    AI: {
      async run() {
        chiamate += 1;
        if (chiamate === 1) return { response: { strategie: [], candidati: [], esaurita: false } };
        return { response: { candidati: [{ titolo: 'Brano', interprete: 'Gia noto', tipo: 'cover', affidabilita: 60 }] } };
      }
    }
  };

  const piano = await generaPianoScopertaConIA({
    titolo: 'Brano', artista: 'Originale',
    candidatiGiaNoti: [{ titolo: 'Brano', interprete: 'Gia noto' }],
    agenda: { domande: [{ id: 'interpreti', domanda: 'Altri interpreti?', obiettivo: 'interpreti' }] }
  }, env);

  assert.equal(piano.candidati.length, 0);
});
