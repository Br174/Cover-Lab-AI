import test from 'node:test';
import assert from 'node:assert/strict';
import { cercaVersioni } from '../src/motore/motore.js';

function rispostaJson(corpo, stato = 200) {
  return {
    ok: stato >= 200 && stato < 300,
    status: stato,
    headers: { get() { return null; } },
    async json() { return corpo; }
  };
}

test('un errore della fonte strutturata non viene trasformato in zero cover definitivo', async () => {
  const fetchFn = async () => rispostaJson({}, 400);
  const risultato = await cercaVersioni({
    titolo: 'Brano di prova',
    artista: 'Artista di prova'
  }, { DB: null, VERSIONE_MOTORE: 'test' }, { fetchFn });

  assert.equal(risultato.stato, 'ricerca_incompleta');
  assert.equal(risultato.ricercaMultifonteNecessaria, true);
  assert.equal(risultato.analisiCompleta, false);
  assert.notEqual(risultato.stato, 'non_trovato');
});

test('zero risultati MusicBrainz richiede fonti alternative invece di dichiarare nessuna cover', async () => {
  const fetchFn = async url => {
    const u = String(url);
    if (u.includes('/work/?query=')) return rispostaJson({ works: [] });
    if (u.includes('/recording/?query=')) return rispostaJson({ recordings: [] });
    return rispostaJson({ works: [] });
  };

  const risultato = await cercaVersioni({
    titolo: 'Titolo rarissimo',
    artista: 'Artista rarissimo'
  }, { DB: null, VERSIONE_MOTORE: 'test' }, { fetchFn });

  assert.equal(risultato.stato, 'ricerca_incompleta');
  assert.equal(risultato.ricercaMultifonteNecessaria, true);
  assert.match(risultato.motivo, /fonti alternative|MusicBrainz/i);
});
