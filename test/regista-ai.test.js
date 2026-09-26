import test from 'node:test';
import assert from 'node:assert/strict';
import { creaAgendaAutointerrogazione, descriviRegistaAI } from '../src/motore/regista-ai.js';

test('il regista AI crea una vera agenda di autointerrogazione musicale', () => {
  const agenda = creaAgendaAutointerrogazione({
    originale: {
      titolo: 'Sapore di sale',
      artista: 'Gino Paoli',
      anno: 1963,
      lingua: 'it',
      paese: 'IT'
    },
    giro: 0,
    candidatiGiaNoti: [],
    domandePerGiro: 8
  });

  assert.equal(agenda.principio, 'prima_autointerrogazione_poi_conferme_esterne');
  assert.equal(agenda.composizione.titolo, 'Sapore di sale');
  assert.ok(agenda.domande.length >= 4);
  assert.ok(agenda.domande.some(d => d.id === 'italia'));
  assert.ok(agenda.domande.some(d => d.id === 'francia'));
  assert.ok(agenda.domande.every(d => String(d.domanda || '').includes('?')));
});

test('i giri successivi cambiano prospettiva invece di chiudere la ricerca globale', () => {
  const primo = creaAgendaAutointerrogazione({ giro: 0, domandePerGiro: 4 });
  const secondo = creaAgendaAutointerrogazione({ giro: 1, domandePerGiro: 4 });

  assert.notDeepEqual(
    primo.domande.map(d => d.id),
    secondo.domande.map(d => d.id)
  );
});

test('il regista formula domande mirate quando mancano metadati di un candidato', () => {
  const agenda = creaAgendaAutointerrogazione({
    giro: 0,
    domandePerGiro: 8,
    candidatiGiaNoti: [
      { titolo: 'Versione X', interprete: 'Artista X', anno: null, lingua: null, paese: null }
    ]
  });

  const testo = agenda.domande.map(d => d.domanda).join(' ');
  assert.match(testo, /anno corretto/i);
  assert.match(testo, /lingua/i);
  assert.match(testo, /paese/i);
});

test('il regista non impone alcun limite totale alle cover', () => {
  const descrizione = descriviRegistaAI();
  assert.equal(descrizione.limiteTotaleCover, null);
  assert.match(descrizione.limite, /singola_tornata/);
});
