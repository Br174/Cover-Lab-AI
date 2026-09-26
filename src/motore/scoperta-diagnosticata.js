import { eseguiScopertaMultifonte } from './orchestratore-multifonte.js';
import { salvaTracciaRegistaAI } from '../dati/tracce-regista.js';

export async function eseguiScopertaDiagnosticata(originale, env, opzioni = {}) {
  const risultato = await eseguiScopertaMultifonte(originale, env, opzioni);
  if (risultato?.chiaveComposizione && risultato?.piano) {
    await salvaTracciaRegistaAI(env?.DB, {
      chiaveComposizione: risultato.chiaveComposizione,
      giro: risultato.giriIA || 0,
      agenda: risultato.piano.domandeEsplorate || [],
      domandeEsplorate: risultato.piano.domandeEsplorate || [],
      nuoveDomande: risultato.piano.nuoveDomande || [],
      strategie: risultato.piano.strategie || []
    });
  }
  return risultato;
}
