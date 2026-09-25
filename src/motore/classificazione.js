import { normalizzaTesto, testoSimile } from './normalizzazione.js';

const TIPI = new Set([
  'cover', 'adattamento', 'live', 'strumentale', 'remix', 'karaoke',
  'originale', 'duplicato', 'non correlato', 'dubbio'
]);

export function normalizzaTipo(tipo) {
  const t = normalizzaTesto(tipo).replace(/\s+/g, ' ');
  return TIPI.has(t) ? t : 'dubbio';
}

export function classificaDaMetadati(candidato, originale) {
  const attributi = (candidato.attributi || []).map(normalizzaTesto);
  const titolo = normalizzaTesto(candidato.titolo);
  const interprete = normalizzaTesto(candidato.interprete);
  const titoloOriginale = normalizzaTesto(originale.titolo);
  const artistaOriginale = normalizzaTesto(originale.artista);

  if (attributi.includes('karaoke') || titolo.includes('karaoke')) {
    return { tipo: 'karaoke', affidabilita: 98, motivo: 'metadato karaoke' };
  }
  if (attributi.includes('instrumental') || attributi.includes('strumentale') || titolo.includes('instrumental')) {
    return { tipo: 'strumentale', affidabilita: 96, motivo: 'metadato strumentale' };
  }
  if (attributi.includes('live') || titolo.includes(' live')) {
    return { tipo: 'live', affidabilita: 95, motivo: 'metadato live' };
  }
  if (titolo.includes('remix') || attributi.includes('remix')) {
    return { tipo: 'remix', affidabilita: 92, motivo: 'metadato remix' };
  }

  const stessoArtista = interprete === artistaOriginale && artistaOriginale.length > 0;
  const titoloCompatibile = testoSimile(titolo, titoloOriginale);

  if (stessoArtista && titoloCompatibile) {
    const primoAnno = Number(originale.anno || 0);
    const anno = Number(candidato.anno || 0);
    const vicinoAllOriginale = !primoAnno || !anno || anno <= primoAnno + 1;
    return {
      tipo: vicinoAllOriginale ? 'originale' : 'live',
      affidabilita: vicinoAllOriginale ? 94 : 72,
      motivo: vicinoAllOriginale ? 'stesso interprete e periodo originale' : 'stesso interprete, registrazione successiva'
    };
  }

  if (attributi.includes('cover')) {
    return { tipo: 'cover', affidabilita: 99, motivo: 'relazione esplicita di cover' };
  }

  if (candidato.stessaComposizione && interprete !== artistaOriginale) {
    return { tipo: 'cover', affidabilita: 90, motivo: 'registrazione collegata alla stessa composizione' };
  }

  if (candidato.stessaComposizione) {
    return { tipo: 'dubbio', affidabilita: 70, motivo: 'stessa composizione, tipo non determinato' };
  }

  return { tipo: 'non correlato', affidabilita: 25, motivo: 'relazione con la composizione non verificata' };
}

export function applicaAdattamentoSeNecessario(classificazione, candidato, originale) {
  if (!candidato.stessaComposizione) return classificazione;
  const lingua = normalizzaTesto(candidato.lingua);
  const linguaOriginale = normalizzaTesto(originale.lingua);
  const titoloDiverso = !testoSimile(candidato.titolo, originale.titolo);
  const linguaDiversa = lingua && linguaOriginale && lingua !== linguaOriginale;

  if (candidato.derivazioneTradotta || linguaDiversa || titoloDiverso && candidato.derivazione) {
    return { tipo: 'adattamento', affidabilita: Math.max(classificazione.affidabilita, 92), motivo: 'versione adattata della stessa composizione' };
  }
  return classificazione;
}
