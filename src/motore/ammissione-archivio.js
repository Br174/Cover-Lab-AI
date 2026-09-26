const RUOLI_ESSENZIALI = new Set([
  'compositore',
  'paroliere',
  'autore',
  'traduttore',
  'adattatore',
  'arrangiatore'
]);

const STATI_NON_CERTI = new Set([
  'da_verificare',
  'verifica_parziale',
  'dubbio',
  'in_attesa',
  'verifica_crediti_insufficiente'
]);

function normalizzaRuolo(valore = '') {
  return String(valore).trim().toLowerCase().replace(/\s+/g, '_');
}

function creditiEssenziali(crediti = []) {
  return (crediti || []).filter(c =>
    c?.nome && RUOLI_ESSENZIALI.has(normalizzaRuolo(c.ruolo))
  );
}

function fontiIndipendenti(fonti = []) {
  return new Set(
    (fonti || [])
      .map(f => String(f?.fonte || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

function verificaAbbastanzaForte(versione = {}, verificaStrutturata = null) {
  if (verificaStrutturata?.verificato === true) return true;
  const stato = String(versione.statoVerifica || versione.stato_verifica || '').trim().toLowerCase();
  if (!stato) return false;
  if (STATI_NON_CERTI.has(stato)) return false;
  return stato.startsWith('verificato_') || stato === 'verificato';
}

export function valutaAmmissioneArchivio({
  versione = {},
  creditiVersione = [],
  creditiComposizione = [],
  fonti = [],
  verificaStrutturata = null
} = {}) {
  const interprete = String(versione?.interprete || '').trim();
  const titolo = String(versione?.titolo || '').trim();
  const tipo = String(versione?.tipo || '').trim().toLowerCase();
  const affidabilita = Number(versione?.affidabilita || versione?.confidenza || 0);

  if (!titolo || !interprete) {
    return {
      ammessa: false,
      statoArchivio: 'in_verifica',
      motivo: 'Titolo o interprete insufficienti per identificare la versione.'
    };
  }

  // L'originale serve come riferimento della composizione ma non deve gonfiare
  // il conteggio delle cover certificate dell'Archivio.
  if (tipo === 'originale') {
    return {
      ammessa: false,
      statoArchivio: 'riferimento_originale',
      motivo: 'Registrazione originale conservata come riferimento, non conteggiata tra le cover archiviate.'
    };
  }

  if (tipo === 'dubbio' || affidabilita < 90 || !verificaAbbastanzaForte(versione, verificaStrutturata)) {
    return {
      ammessa: false,
      statoArchivio: 'in_verifica',
      motivo: 'La relazione con l opera non ha ancora un livello di verifica sufficiente per l Archivio certificato.'
    };
  }

  const essenzialiVersione = [
    ...creditiEssenziali(creditiVersione),
    ...creditiEssenziali(versione.creditiOpera || []),
    ...creditiEssenziali(versione.crediti || [])
  ];
  const essenzialiComposizione = creditiEssenziali(creditiComposizione);

  const relazioneStrutturata = Boolean(
    verificaStrutturata?.verificato === true ||
    versione.idOperaMusicBrainz ||
    versione.id_opera_musicbrainz ||
    versione.stessaComposizione === true ||
    versione.derivazione === true ||
    versione.derivazioneTradotta === true
  );

  const provider = fontiIndipendenti(fonti);
  const relazioneMultifonte = provider.size >= 2 && affidabilita >= 90;

  if (relazioneStrutturata) {
    const essenziali = [...essenzialiVersione, ...essenzialiComposizione];
    if (!essenziali.length) {
      return {
        ammessa: false,
        statoArchivio: 'in_verifica',
        motivo: 'La relazione con l opera e strutturata, ma mancano ancora crediti essenziali documentati.'
      };
    }
    return {
      ammessa: true,
      statoArchivio: 'archiviata',
      motivo: 'Relazione strutturata verificata con l opera e crediti essenziali documentati.',
      creditiEssenziali: essenziali
    };
  }

  if (relazioneMultifonte && essenzialiVersione.length) {
    return {
      ammessa: true,
      statoArchivio: 'archiviata',
      motivo: `Relazione confermata da ${provider.size} fonti indipendenti e crediti essenziali specifici della versione.`,
      creditiEssenziali: essenzialiVersione
    };
  }

  if (!essenzialiVersione.length) {
    return {
      ammessa: false,
      statoArchivio: 'in_verifica',
      motivo: 'Mancano crediti essenziali specifici della versione e non esiste ancora una relazione strutturata sufficientemente verificata.'
    };
  }

  return {
    ammessa: false,
    statoArchivio: 'in_verifica',
    motivo: 'I crediti esistono, ma il legame con la composizione non e ancora verificato da prove sufficienti.'
  };
}

export function descriviRegolaArchivio() {
  return {
    regola: 'relazione_verificata_e_crediti_essenziali',
    sogliaMinimaAffidabilita: 90,
    originaliConteggiatiComeCover: false,
    ruoliEssenziali: [...RUOLI_ESSENZIALI],
    candidatiNonAmmessi: 'restano_in_verifica_e_non_compaiono_nell_archivio_ufficiale'
  };
}
