const RUOLI_ESSENZIALI = new Set([
  'compositore',
  'paroliere',
  'autore',
  'traduttore',
  'adattatore',
  'arrangiatore'
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

export function valutaAmmissioneArchivio({
  versione = {},
  creditiVersione = [],
  creditiComposizione = [],
  fonti = [],
  verificaStrutturata = null
} = {}) {
  const interprete = String(versione?.interprete || '').trim();
  const titolo = String(versione?.titolo || '').trim();
  if (!titolo || !interprete) {
    return {
      ammessa: false,
      statoArchivio: 'in_verifica',
      motivo: 'Titolo o interprete insufficienti per identificare la versione.'
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
  const relazioneMultifonte = provider.size >= 2 && Number(versione.affidabilita || 0) >= 90;

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
      motivo: 'Relazione strutturata con l opera e crediti essenziali verificati.',
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
      motivo: 'Mancano crediti essenziali specifici della versione e non esiste ancora una relazione strutturata con l opera.'
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
    ruoliEssenziali: [...RUOLI_ESSENZIALI],
    candidatiNonAmmessi: 'restano_in_verifica_e_non_compaiono_nell_archivio_ufficiale'
  };
}
