import { eseguiScopertaMultifonte } from './orchestratore-multifonte.js';
import { creaAgendaAutointerrogazione } from './regista-ai.js';
import { salvaTracciaRegistaAI } from '../dati/tracce-regista.js';

export async function eseguiScopertaDiagnosticata(originale, env, opzioni = {}) {
  const risultato = await eseguiScopertaMultifonte(originale, env, opzioni);
  if (risultato?.chiaveComposizione && risultato?.piano) {
    // Il piano restituito dall orchestratore contiene l esito AI, ma non sempre
    // l elenco completo delle domande che il Regista aveva generato prima della
    // chiamata al modello. Lo ricostruiamo deterministicamente per la traccia,
    // cosi la Diagnostica mostra sempre cosa Cover Lab si e chiesto.
    const giroEseguito = Math.max(0, Number(risultato.giriIA || 0) - 1);
    const agenda = creaAgendaAutointerrogazione({
      originale,
      giro: giroEseguito,
      candidatiGiaNoti: [],
      domandePerGiro: 8
    });

    await salvaTracciaRegistaAI(env?.DB, {
      chiaveComposizione: risultato.chiaveComposizione,
      giro: Number(risultato.giriIA || 0),
      agenda: agenda.domande || [],
      domandeEsplorate: risultato.piano.domandeEsplorate || [],
      nuoveDomande: risultato.piano.nuoveDomande || [],
      strategie: risultato.piano.strategie || []
    });
  }
  return risultato;
}
