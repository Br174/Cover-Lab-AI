// Regista AI di Cover Lab.
// Genera un'agenda di autointerrogazione prima della ricerca esterna.
// Le risposte dell'AI sono piste da verificare, mai prove definitive.

const ASSI = Object.freeze([
  {
    id: 'italia',
    domanda: 'Quali cover, reinterpretazioni e adattamenti italiani conosco di questa composizione, inclusi titoli alternativi?',
    obiettivo: 'versioni italiane'
  },
  {
    id: 'francia',
    domanda: 'Quali versioni francesi o francofone conosco, anche con titolo tradotto o completamente diverso?',
    obiettivo: 'versioni francesi e francofone'
  },
  {
    id: 'spagna_latam',
    domanda: 'Quali versioni spagnole o latinoamericane conosco, incluse traduzioni, adattamenti e titoli locali?',
    obiettivo: 'versioni spagnole e latinoamericane'
  },
  {
    id: 'area_tedesca',
    domanda: 'Quali versioni tedesche, austriache o svizzere conosco, anche con titoli diversi?',
    obiettivo: 'versioni di area tedesca'
  },
  {
    id: 'uk_usa',
    domanda: 'Quali versioni britanniche, statunitensi o in lingua inglese conosco, inclusi adattamenti e titoli alternativi?',
    obiettivo: 'versioni inglesi e angloamericane'
  },
  {
    id: 'resto_mondo',
    domanda: 'Quali versioni in altri paesi o lingue conosco che potrebbero non comparire nei cataloghi principali?',
    obiettivo: 'versioni internazionali ulteriori'
  },
  {
    id: 'titoli_alternativi',
    domanda: 'Con quali titoli tradotti, adattati o completamente differenti potrebbe essere stata pubblicata la stessa composizione?',
    obiettivo: 'titoli alternativi e traduzioni'
  },
  {
    id: 'interpreti',
    domanda: 'Quali interpreti noti o meno noti hanno inciso, eseguito dal vivo o reinterpretato questa composizione?',
    obiettivo: 'interpreti e registrazioni'
  },
  {
    id: 'crediti',
    domanda: 'Quali traduttori, adattatori, parolieri o altri crediti possono collegare versioni straniere alla composizione originale?',
    obiettivo: 'crediti e relazioni tra opere'
  },
  {
    id: 'varianti',
    domanda: 'Esistono versioni live, strumentali, remix, karaoke o altre varianti rilevanti della stessa composizione?',
    obiettivo: 'varianti della composizione'
  },
  {
    id: 'storiche_recenti',
    domanda: 'Quali versioni storiche o molto recenti potrei trascurare se cercassi solo nei cataloghi piu evidenti?',
    obiettivo: 'copertura temporale ampia'
  },
  {
    id: 'omonimie',
    domanda: 'Quali risultati con titolo simile potrebbero essere brani omonimi e come posso distinguerli dalla stessa composizione?',
    obiettivo: 'riduzione falsi positivi'
  }
]);

function testo(v) {
  return String(v || '').trim();
}

function domandaCandidato(candidato, campo, domanda) {
  const titolo = testo(candidato?.titolo);
  const interprete = testo(candidato?.interprete);
  if (!titolo) return null;
  const soggetto = [interprete, titolo].filter(Boolean).join(' — ');
  return {
    id: `candidato_${campo}_${testo(candidato?.id || candidato?.chiave_candidato || soggetto).slice(0, 80)}`,
    domanda: `${domanda} per la versione ${soggetto}?`,
    obiettivo: `completare ${campo}`,
    candidato: {
      titolo,
      interprete: interprete || null
    }
  };
}

function domandeDatiMancanti(candidati = []) {
  const domande = [];
  for (const c of candidati.slice(0, 40)) {
    if (!c?.interprete) domande.push(domandaCandidato(c, 'interprete', 'Chi e l interprete corretto'));
    if (!c?.anno) domande.push(domandaCandidato(c, 'anno', 'Qual e l anno corretto di pubblicazione o prima registrazione'));
    if (!c?.lingua) domande.push(domandaCandidato(c, 'lingua', 'Qual e la lingua della versione'));
    if (!c?.paese) domande.push(domandaCandidato(c, 'paese', 'A quale paese o mercato e associata la versione'));
  }
  return domande.filter(Boolean);
}

export function creaAgendaAutointerrogazione({
  originale = {},
  giro = 0,
  candidatiGiaNoti = [],
  domandePerGiro = 8
} = {}) {
  const quantita = Math.max(4, Math.min(16, Number(domandePerGiro) || 8));
  const inizio = (Math.max(0, Number(giro) || 0) * quantita) % ASSI.length;
  const generali = [];
  for (let i = 0; i < Math.min(quantita, ASSI.length); i += 1) {
    generali.push(ASSI[(inizio + i) % ASSI.length]);
  }

  const specifiche = domandeDatiMancanti(candidatiGiaNoti);
  const spazioSpecifiche = Math.max(0, Math.min(4, quantita - 4));
  const selezionate = [
    ...generali.slice(0, quantita - spazioSpecifiche),
    ...specifiche.slice(0, spazioSpecifiche)
  ];

  return {
    principio: 'prima_autointerrogazione_poi_conferme_esterne',
    composizione: {
      titolo: testo(originale?.titolo),
      artista: testo(originale?.artista),
      compositore: testo(originale?.compositore) || null,
      anno: originale?.anno || null,
      lingua: testo(originale?.lingua) || null,
      paese: testo(originale?.paese) || null
    },
    giro: Math.max(0, Number(giro) || 0),
    domande: selezionate
  };
}

export function descriviRegistaAI() {
  return {
    ruolo: 'regista_della_ricerca',
    metodo: 'autointerrogazione_guidata',
    usoConoscenzaAI: 'genera_ipotesi_e_piste_da_verificare',
    provaFinale: 'richiede_conferme_reali_da_fonti_esterne',
    limiteTotaleCover: null,
    limite: 'solo_per_singola_tornata_per_proteggere_risorse_e_latenza',
    assiAutointerrogazione: ASSI.map(x => x.id)
  };
}
