import { eseguiScopertaMultifonte } from './orchestratore-multifonte.js';
import { creaAgendaAutointerrogazione } from './regista-ai.js';
import { salvaTracciaRegistaAI } from '../dati/tracce-regista.js';

export async function eseguiScopertaDiagnosticata(originale, env, opzioni = {}) {
  const risultato = await eseguiScopertaMultifonte(originale, env, opzioni);
  if (risultato?.chiaveComposizione && risultato?.piano) {
    // Dalla 0.8.0 il piano conserva l agenda effettivamente usata. Il fallback
    // deterministico serve soltanto per leggere senza regressioni tracce prodotte
    // da versioni precedenti che non la restituivano ancora.
    const giroEseguito = Math.max(0, Number(risultato.giriIA || 0) - 1);
    const agendaReale = Array.isArray(risultato.piano.agenda) && risultato.piano.agenda.length
      ? risultato.piano.agenda
      : creaAgendaAutointerrogazione({
          originale,
          giro: giroEseguito,
          candidatiGiaNoti: [],
          domandePerGiro: 8
        }).domande || [];

    await salvaTracciaRegistaAI(env?.DB, {
      chiaveComposizione: risultato.chiaveComposizione,
      giro: Number(risultato.giriIA || 0),
      agenda: agendaReale,
      domandeEsplorate: risultato.piano.domandeEsplorate || [],
      nuoveDomande: risultato.piano.nuoveDomande || [],
      strategie: risultato.piano.strategie || []
    });
  }
  return risultato;
}
