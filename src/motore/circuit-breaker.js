function numero(valore, ripiego) {
  const n = Number(valore);
  return Number.isFinite(n) ? n : ripiego;
}

function dataMs(valore) {
  const ms = valore ? Date.parse(valore) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

export function valutaCircuitBreaker(stato = {}, oraMs = Date.now()) {
  const sospesoFinoMs = dataMs(stato?.sospeso_fino || stato?.sospesoFino);
  if (sospesoFinoMs && sospesoFinoMs > oraMs) {
    return {
      consentito: false,
      stato: 'sospeso',
      sospesoFino: new Date(sospesoFinoMs).toISOString()
    };
  }

  return {
    consentito: true,
    stato: sospesoFinoMs ? 'prova_ripristino' : (stato?.stato || 'disponibile'),
    sospesoFino: sospesoFinoMs ? new Date(sospesoFinoMs).toISOString() : null
  };
}

export function statoDopoSuccesso(stato = {}, { durataMs = 0, risultati = 0 } = {}) {
  const chiamatePrecedenti = Math.max(0, numero(stato?.chiamate_totali, 0));
  const mediaPrecedente = Math.max(0, numero(stato?.latenza_media_ms, 0));
  const durata = Math.max(0, Math.round(numero(durataMs, 0)));
  const chiamateTotali = chiamatePrecedenti + 1;
  const nuovaMedia = chiamateTotali === 1
    ? durata
    : ((mediaPrecedente * chiamatePrecedenti) + durata) / chiamateTotali;

  return {
    stato: 'disponibile',
    erroriConsecutivi: 0,
    sospesoFino: null,
    chiamateTotali,
    erroriTotali: Math.max(0, numero(stato?.errori_totali, 0)),
    risultatiTotali: Math.max(0, numero(stato?.risultati_totali, 0)) + Math.max(0, numero(risultati, 0)),
    latenzaMediaMs: Math.round(nuovaMedia * 100) / 100,
    latenzaMassimaMs: Math.max(Math.max(0, numero(stato?.latenza_massima_ms, 0)), durata),
    ultimaDurataMs: durata
  };
}

export function statoDopoErrore(stato = {}, {
  durataMs = 0,
  sogliaErrori = 3,
  sospensioneMinuti = 30,
  oraMs = Date.now()
} = {}) {
  const chiamatePrecedenti = Math.max(0, numero(stato?.chiamate_totali, 0));
  const mediaPrecedente = Math.max(0, numero(stato?.latenza_media_ms, 0));
  const durata = Math.max(0, Math.round(numero(durataMs, 0)));
  const chiamateTotali = chiamatePrecedenti + 1;
  const nuovaMedia = chiamateTotali === 1
    ? durata
    : ((mediaPrecedente * chiamatePrecedenti) + durata) / chiamateTotali;
  const erroriConsecutivi = Math.max(0, numero(stato?.errori_consecutivi, 0)) + 1;
  const soglia = Math.max(1, Math.round(numero(sogliaErrori, 3)));
  const sospendi = erroriConsecutivi >= soglia;
  const minuti = Math.max(1, Math.round(numero(sospensioneMinuti, 30)));

  return {
    stato: sospendi ? 'sospeso' : 'degradato',
    erroriConsecutivi,
    sospesoFino: sospendi ? new Date(oraMs + minuti * 60_000).toISOString() : null,
    chiamateTotali,
    erroriTotali: Math.max(0, numero(stato?.errori_totali, 0)) + 1,
    risultatiTotali: Math.max(0, numero(stato?.risultati_totali, 0)),
    latenzaMediaMs: Math.round(nuovaMedia * 100) / 100,
    latenzaMassimaMs: Math.max(Math.max(0, numero(stato?.latenza_massima_ms, 0)), durata),
    ultimaDurataMs: durata
  };
}
