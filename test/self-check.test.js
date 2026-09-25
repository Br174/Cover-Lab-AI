import test from 'node:test';
import assert from 'node:assert/strict';
import { analizzaQualitaRisultato, applicaAutocontrollo } from '../src/motore/self-check.js';

test('zero risultati pronti non viene trattato come conclusione definitiva', () => {
  const esito = applicaAutocontrollo({
    stato: 'pronto',
    versioniIndividuate: 0,
    versioni: []
  });
  assert.equal(esito.autocontrollo.richiedeApprofondimento, true);
  assert.equal(esito.ricercaMultifonteNecessaria, true);
  assert.ok(esito.autocontrollo.anomalie.some(a => a.codice === 'zero_versioni_da_non_considerare_definitivo'));
});

test('conflitti irrisolti richiedono approfondimento', () => {
  const controllo = analizzaQualitaRisultato({
    stato: 'pronto',
    versioniIndividuate: 1,
    versioni: [
      { titolo: 'A', interprete: 'B', anno: 1970, lingua: 'it', haConflitti: true, conflittiAperti: 1 }
    ]
  });
  assert.equal(controllo.richiedeApprofondimento, true);
  assert.ok(controllo.anomalie.some(a => a.codice === 'dati_in_indagine'));
});

test('una risposta coerente multifonte passa il controllo', () => {
  const controllo = analizzaQualitaRisultato({
    stato: 'pronto',
    versioniIndividuate: 2,
    versioni: [
      { titolo: 'A', interprete: 'X', anno: 1970, lingua: 'it', fonti: [{ fonte: 'musicbrainz' }, { fonte: 'apple' }] },
      { titolo: 'A', interprete: 'Y', anno: 1972, lingua: 'it', fonti: [{ fonte: 'youtube' }] }
    ]
  });
  assert.equal(controllo.stato, 'ok');
  assert.equal(controllo.richiedeApprofondimento, false);
});

test('molti risultati tutti dalla stessa fonte attivano controllo ulteriore', () => {
  const versioni = Array.from({ length: 5 }, (_, i) => ({
    titolo: `Versione ${i}`,
    interprete: `Artista ${i}`,
    anno: 1970 + i,
    lingua: 'it',
    fonti: [{ fonte: 'catalogo_unico' }]
  }));
  const controllo = analizzaQualitaRisultato({ stato: 'pronto', versioniIndividuate: 5, versioni });
  assert.equal(controllo.richiedeApprofondimento, true);
  assert.ok(controllo.anomalie.some(a => a.codice === 'copertura_monofonte'));
});
