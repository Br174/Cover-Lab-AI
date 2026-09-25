import { readFileSync } from 'node:fs';
import { normalizzaTesto } from '../src/motore/normalizzazione.js';

const percorsoBenchmark = process.argv[2] || 'test/benchmark/sapore-di-sale.json';
const percorsoRisultato = process.argv[3];
if (!percorsoRisultato) {
  console.error('Uso: node scripts/valuta-benchmark.mjs <benchmark.json> <risultato.json>');
  process.exit(2);
}
const benchmark = JSON.parse(readFileSync(percorsoBenchmark, 'utf8'));
const risultato = JSON.parse(readFileSync(percorsoRisultato, 'utf8'));
const versioni = risultato.versioni || [];

const esiti = benchmark.controlliMinimi.map(atteso => {
  const nome = normalizzaTesto(atteso.interprete);
  const trovato = versioni.find(v => normalizzaTesto(v.interprete).includes(nome) || nome.includes(normalizzaTesto(v.interprete)));
  return {
    atteso: atteso.interprete,
    trovato: Boolean(trovato),
    tipoCorretto: Boolean(trovato && (!atteso.tipoAtteso || trovato.tipo === atteso.tipoAtteso)),
    annoCorretto: Boolean(trovato && (!atteso.anno || !trovato.anno || Math.abs(trovato.anno - atteso.anno) <= 1)),
    trovatoCome: trovato ? `${trovato.interprete} / ${trovato.tipo} / ${trovato.anno ?? 'anno ?'}` : null
  };
});
const trovati = esiti.filter(x => x.trovato).length;
console.log(JSON.stringify({
  brano: benchmark.titolo,
  controlli: esiti.length,
  trovati,
  coperturaPercentuale: Math.round((trovati / esiti.length) * 100),
  esiti
}, null, 2));
