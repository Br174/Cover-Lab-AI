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

  const essenziali = [
    ...creditiEssenziali(creditiVersione),
    ...creditiEssenziali(creditiComposizione),
    ...creditiEssenziali(versione.creditiOpera || []),
    ...creditiEssenziali(versione.crediti || [])
  ];

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

  if (!essenziali.length) {
    return {
      ammessa: false,
      statoArchivio: 'in_verifica',
      motivo: 'Mancano crediti essenziali che colleghino la versione alla composizione.'
    };
  }

  if (!relazioneStrutturata && !relazioneMultifonte) {
    return {
      ammessa: false,
      statoArchivio: 'in_verifica',
      motivo: 'I crediti esistono, ma il legame con la composizione non è ancora verificato da prove sufficienti.'
    };
  }

  return {
    ammessa: true,
    statoArchivio: 'archiviata',
    motivo: relazioneStrutturata
      ? 'Relazione strutturata con l opera e crediti essenziali verificati.'
      : `Relazione confermata da ${provider.size} fonti indipendenti e crediti essenziali disponibili.`,
    creditiEssenziali: essenziali
  };
}

export function descriviRegolaArchivio() {
  return {
    regola: 'relazione_verificata_e_crediti_essenziali',
    ruoliEssenziali: [...RUOLI_ESSENZIALI],
    candidatiNonAmmessi: 'restano_in_verifica_e_non_compaiono_nell_archivio_ufficiale'
  };
}
