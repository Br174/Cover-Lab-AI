import { normalizzaTesto } from './normalizzazione.js';

function fonti(versione = {}) {
  return new Set((versione.fonti || [])
    .map(f => normalizzaTesto(f?.fonte))
    .filter(Boolean));
}

export function classificaNaturaVersione(versione = {}) {
  const tipo = normalizzaTesto(versione.tipo || versione.tipoProposto || '');
  const sorgenti = fonti(versione);
  const haApple = sorgenti.has('apple catalogo') || sorgenti.has('apple_catalogo') || sorgenti.has('apple');
  const haYouTube = sorgenti.has('youtube');
  const haMusicBrainz = Boolean(versione.idMusicBrainz) || sorgenti.has('musicbrainz');
  const haAnno = Number.isInteger(Number(versione.anno)) && Number(versione.anno) > 1800;

  if (tipo === 'live') {
    return {
      categoria: 'performance_registrata',
      etichetta: 'Performance registrata',
      affidabilita: 96,
      motivo: 'La versione e classificata come esecuzione live.'
    };
  }

  if (haApple) {
    return {
      categoria: 'incisione_pubblicata',
      etichetta: 'Incisione / pubblicazione',
      affidabilita: 98,
      motivo: 'La versione compare in un catalogo discografico strutturato.'
    };
  }

  if (haMusicBrainz && haAnno && !['dubbio', 'karaoke'].includes(tipo)) {
    return {
      categoria: 'incisione_pubblicata',
      etichetta: 'Incisione / pubblicazione',
      affidabilita: 88,
      motivo: 'Registrazione strutturata con data di pubblicazione/registrazione disponibile.'
    };
  }

  if (haYouTube && !haApple && !haMusicBrainz) {
    return {
      categoria: 'da_classificare',
      etichetta: 'Riferimento online da verificare',
      affidabilita: 45,
      motivo: 'La presenza su YouTube da sola non dimostra una pubblicazione discografica.'
    };
  }

  return {
    categoria: 'da_classificare',
    etichetta: 'Natura da verificare',
    affidabilita: 35,
    motivo: 'Le prove disponibili non bastano ancora a distinguere pubblicazione e performance.'
  };
}

export function applicaNaturaVersione(versione = {}) {
  const natura = classificaNaturaVersione(versione);
  return {
    ...versione,
    naturaVersione: natura.categoria,
    etichettaNaturaVersione: natura.etichetta,
    affidabilitaNaturaVersione: natura.affidabilita,
    motivoNaturaVersione: natura.motivo
  };
}
