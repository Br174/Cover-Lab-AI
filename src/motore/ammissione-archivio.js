const STATI_NON_CERTI = new Set([
  'da_verificare',
  'verifica_parziale',
  'dubbio',
  'in_attesa',
  'verifica_crediti_insufficiente'
]);

const FONTI_FORTI = new Set([
  'musicbrainz',
  'wikipedia',
  'wikimedia',
  'apple_catalogo',
  'artista_ufficiale',
  'etichetta_ufficiale'
]);

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

  if (tipo === 'originale') {
    return {
      ammessa: false,
      statoArchivio: 'riferimento_originale',
      motivo: 'Registrazione originale conservata come riferimento, non conteggiata tra le cover archiviate.'
    };
  }

  if (tipo === 'dubbio' || tipo === 'non correlato' || affidabilita < 90 || !verificaAbbastanzaForte(versione, verificaStrutturata)) {
    return {
      ammessa: false,
      statoArchivio: 'in_verifica',
      motivo: 'La relazione con l opera non ha ancora un livello di verifica sufficiente.'
    };
  }

  const provider = fontiIndipendenti(fonti);
  if (!provider.size) {
    return {
      ammessa: false,
      statoArchivio: 'in_verifica',
      motivo: 'Manca ancora una fonte reale che documenti l esistenza della versione.'
    };
  }

  const fonteForte = [...provider].some(p => FONTI_FORTI.has(p));
  const relazioneStrutturata = Boolean(
    verificaStrutturata?.verificato === true ||
    versione.idOperaMusicBrainz ||
    versione.id_opera_musicbrainz ||
    versione.stessaComposizione === true ||
    versione.derivazione === true ||
    versione.derivazioneTradotta === true
  );
  const creditiTotali = [...(creditiVersione || []), ...(creditiComposizione || [])].filter(c => c?.nome);
  const creditiAI = creditiTotali.filter(c => String(c?.fonte || '').toLowerCase() === 'ai_arricchimento').length;

  let motivo;
  if (relazioneStrutturata) {
    motivo = 'Relazione con l opera verificata da una fonte strutturata.';
  } else if (fonteForte) {
    motivo = 'Versione documentata da una fonte attendibile e verificata dal motore.';
  } else if (provider.has('youtube')) {
    motivo = 'Versione documentata da YouTube e confermata dalla verifica intelligente del motore.';
  } else {
    motivo = `Versione confermata dal motore su ${provider.size} fonte/i reali.`;
  }

  if (!creditiTotali.length) {
    motivo += ' I crediti mancanti saranno arricchiti progressivamente e non bloccano l Archivio.';
  } else if (creditiAI > 0) {
    motivo += ` ${creditiAI} credito/i sono stati aggiunti come arricchimento AI e restano rivalidabili.`;
  }

  return {
    ammessa: true,
    statoArchivio: 'archiviata',
    motivo,
    creditiDisponibili: creditiTotali.length,
    creditiDaAI: creditiAI,
    arricchimentoProgressivo: true
  };
}

export function descriviRegolaArchivio() {
  return {
    regola: 'fonte_reale_verifica_e_arricchimento_progressivo',
    sogliaMinimaAffidabilita: 90,
    originaliConteggiatiComeCover: false,
    creditiMancantiBloccanoArchivio: false,
    fontiForti: [...FONTI_FORTI],
    youtube: 'ammissibile_dopo_verifica_intelligente',
    creditiAI: 'ammessi_come_arricchimento_rivalidabile',
    candidatiNonAmmessi: 'solo_senza_fonte_reale_o_con_relazione_ancora_dubbia'
  };
}
