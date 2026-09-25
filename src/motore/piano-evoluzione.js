// Piano ufficiale del motore Cover Lab AI.
// Questo file non e' una semplice nota: rappresenta il perimetro approvato
// delle evoluzioni che devono essere realizzate e mantenute nel motore.

export const PRIORITA_COVER_LAB = Object.freeze([
  'velocita_dei_risultati',
  'quantita_dei_risultati',
  'scansione_web_e_piattaforme_con_risultati_concreti',
  'integrazione_affidabile_con_piu_servizi',
  'affidabilita_reale_delle_cover'
]);

export const STATO_PIANO = Object.freeze({
  IMPLEMENTATA: 'implementata',
  PARZIALE: 'parziale',
  DA_FARE: 'da_fare'
});

export const PIANO_EVOLUZIONE = Object.freeze([
  {
    id: 'provider_standardizzati',
    stato: STATO_PIANO.IMPLEMENTATA,
    obiettivo: 'Tutte le fonti dialogano con il motore tramite un contratto comune e un registro provider.',
    impatto: ['velocita_dei_risultati', 'integrazione_affidabile_con_piu_servizi']
  },
  {
    id: 'source_router',
    stato: STATO_PIANO.IMPLEMENTATA,
    obiettivo: 'Scegliere e ordinare le fonti in base a disponibilita, salute, latenza e utilita.',
    impatto: ['velocita_dei_risultati', 'integrazione_affidabile_con_piu_servizi']
  },
  {
    id: 'circuit_breaker_fallback_retry',
    stato: STATO_PIANO.IMPLEMENTATA,
    obiettivo: 'Una fonte guasta o lenta non deve bloccare la ricerca e non deve produrre falsi zero risultati.',
    impatto: ['velocita_dei_risultati', 'integrazione_affidabile_con_piu_servizi']
  },
  {
    id: 'health_fonti',
    stato: STATO_PIANO.IMPLEMENTATA,
    obiettivo: 'Conoscere lo stato reale di ogni provider: sano, degradato, sospeso o da configurare.',
    impatto: ['velocita_dei_risultati', 'integrazione_affidabile_con_piu_servizi']
  },
  {
    id: 'metriche_provider',
    stato: STATO_PIANO.PARZIALE,
    obiettivo: 'Misurare latenza, errori, resa e risultati utili di ogni fonte per migliorare il routing.',
    impatto: ['velocita_dei_risultati', 'quantita_dei_risultati']
  },
  {
    id: 'ricerca_iterativa_autoespansiva',
    stato: STATO_PIANO.PARZIALE,
    obiettivo: 'Le scoperte devono generare nuove piste, query, lingue, titoli alternativi e ulteriori ricerche fino a saturazione pratica.',
    impatto: ['quantita_dei_risultati', 'scansione_web_e_piattaforme_con_risultati_concreti']
  },
  {
    id: 'strategie_deterministiche_di_base',
    stato: STATO_PIANO.PARZIALE,
    obiettivo: 'Cover Lab deve sapere cercare anche senza AI, usando query di base robuste e prevedibili.',
    impatto: ['quantita_dei_risultati', 'scansione_web_e_piattaforme_con_risultati_concreti']
  },
  {
    id: 'memoria_strategie_e_risultati',
    stato: STATO_PIANO.PARZIALE,
    obiettivo: 'Ricordare cosa e stato cercato, cosa ha funzionato, cosa ha fallito e quali risultati sono gia noti.',
    impatto: ['velocita_dei_risultati', 'quantita_dei_risultati']
  },
  {
    id: 'freshness_intelligente',
    stato: STATO_PIANO.IMPLEMENTATA,
    obiettivo: 'Restituire subito la memoria valida e riaprire periodicamente la ricerca per scoprire novita.',
    impatto: ['velocita_dei_risultati', 'quantita_dei_risultati']
  },
  {
    id: 'anti_zero_risultati',
    stato: STATO_PIANO.PARZIALE,
    obiettivo: 'Zero da una singola fonte non significa zero cover: attivare fonti e strategie alternative prima di concludere.',
    impatto: ['quantita_dei_risultati', 'integrazione_affidabile_con_piu_servizi']
  },
  {
    id: 'verifica_multifonte',
    stato: STATO_PIANO.IMPLEMENTATA,
    obiettivo: 'Una cover deve essere promossa solo quando esistono prove reali sufficienti e coerenti.',
    impatto: ['affidabilita_reale_delle_cover']
  },
  {
    id: 'confidence_e_stato_verifica_separati',
    stato: STATO_PIANO.PARZIALE,
    obiettivo: 'Separare il livello di confidenza dalla condizione oggettiva della verifica.',
    impatto: ['affidabilita_reale_delle_cover']
  },
  {
    id: 'gestione_conflitti',
    stato: STATO_PIANO.DA_FARE,
    obiettivo: 'Registrare e mantenere espliciti i conflitti fra fonti invece di scegliere arbitrariamente un dato.',
    impatto: ['affidabilita_reale_delle_cover']
  },
  {
    id: 'deduplicazione_avanzata',
    stato: STATO_PIANO.PARZIALE,
    obiettivo: 'Distinguere duplicato certo, probabile duplicato e versione realmente distinta senza perdere cover valide.',
    impatto: ['quantita_dei_risultati', 'affidabilita_reale_delle_cover']
  },
  {
    id: 'self_check_risultati',
    stato: STATO_PIANO.DA_FARE,
    obiettivo: 'Controllare automaticamente coerenza, anomalie, regressioni e risultati sospettosamente bassi prima della risposta definitiva.',
    impatto: ['quantita_dei_risultati', 'affidabilita_reale_delle_cover']
  },
  {
    id: 'autodiagnosi_risultati_poveri',
    stato: STATO_PIANO.PARZIALE,
    obiettivo: 'Quando una ricerca produce troppo poco rispetto alle aspettative, capire quale fonte o strategia ha fallito e reagire.',
    impatto: ['quantita_dei_risultati', 'scansione_web_e_piattaforme_con_risultati_concreti']
  },
  {
    id: 'conservazione_dati_grezzi_utili',
    stato: STATO_PIANO.DA_FARE,
    obiettivo: 'Conservare solo i dati grezzi utili e compatti per poter rielaborare risultati senza ripetere inutilmente le chiamate esterne.',
    impatto: ['velocita_dei_risultati', 'affidabilita_reale_delle_cover']
  },
  {
    id: 'espansione_fonti',
    stato: STATO_PIANO.PARZIALE,
    obiettivo: 'Integrare progressivamente piu fonti gratuite e lecite: Apple, YouTube, MusicBrainz, Internet Archive e future fonti Web/cataloghi.',
    impatto: ['quantita_dei_risultati', 'scansione_web_e_piattaforme_con_risultati_concreti', 'integrazione_affidabile_con_piu_servizi']
  },
  {
    id: 'policy_media_music_lab',
    stato: STATO_PIANO.IMPLEMENTATA,
    obiettivo: 'Cover Lab usa le piattaforme per dati e prove, non riproduce o scarica media. Se trova direttamente una cover su YouTube passa anche il riferimento gia trovato a Music Lab; non cerca apposta YouTube per cover scoperte altrove.',
    impatto: ['velocita_dei_risultati', 'integrazione_affidabile_con_piu_servizi']
  }
]);

export function riepilogoPianoEvoluzione() {
  const conteggi = {
    implementate: 0,
    parziali: 0,
    daFare: 0
  };
  for (const voce of PIANO_EVOLUZIONE) {
    if (voce.stato === STATO_PIANO.IMPLEMENTATA) conteggi.implementate += 1;
    else if (voce.stato === STATO_PIANO.PARZIALE) conteggi.parziali += 1;
    else conteggi.daFare += 1;
  }
  return {
    priorita: PRIORITA_COVER_LAB,
    totale: PIANO_EVOLUZIONE.length,
    ...conteggi,
    voci: PIANO_EVOLUZIONE
  };
}
