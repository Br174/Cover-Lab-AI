import test from 'node:test';
import assert from 'node:assert/strict';
import { verificaCandidatiConIA } from '../src/motore/verifica-intelligente.js';

test('usa l IA solo per migliorare un candidato dubbio senza inventare dati', async () => {
  const versioni = [{
    idMusicBrainz: 'x1', titolo: 'Titolo', interprete: 'Altro', anno: 1975,
    lingua: null, tipo: 'dubbio', affidabilita: 70, stessaComposizione: true,
    attributi: []
  }];
  const env = {
    MODELLO_CLASSIFICAZIONE: '@cf/zai-org/glm-4.7-flash',
    AI: {
      async run() {
        return { response: JSON.stringify({ risultati: [{ indice: 0, tipo: 'cover', affidabilita: 91, motivo: 'stessa composizione e altro interprete' }] }) };
      }
    }
  };
  const r = await verificaCandidatiConIA(versioni, { titolo: 'Titolo', artista: 'Originale' }, env);
  assert.equal(r[0].tipo, 'cover');
  assert.equal(r[0].affidabilita, 91);
  assert.equal(r[0].anno, 1975);
  assert.equal(r[0].statoVerifica, 'verificato_ia');
});

test('se l IA fallisce conserva la classificazione precedente', async () => {
  const versioni = [{ titolo: 'X', interprete: 'Y', tipo: 'dubbio', affidabilita: 61 }];
  const env = { AI: { async run() { throw new Error('quota'); } } };
  const r = await verificaCandidatiConIA(versioni, { titolo: 'X', artista: 'Z' }, env);
  assert.deepEqual(r, versioni);
});
