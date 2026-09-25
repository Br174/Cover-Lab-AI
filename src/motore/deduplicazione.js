import { normalizzaTesto } from './normalizzazione.js';

const TIPI_GENERICI = new Set(['', 'cover', 'versione', 'dubbio', 'da verificare', 'non indicato']);
const TIPI_DISTINTIVI = new Set(['live', 'strumentale', 'remix', 'karaoke', 'demo', 'acustica', 'radio edit']);

function testoTipo(versione = {}) {
  return normalizzaTesto(versione.tipo || versione.tipoProposto || '');
}

function annoNumero(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 1800 && n < 2200 ? n : null;
}

function identificatori(versione = {}) {
  const valori = [];
  if (versione.idMusicBrainz) valori.push(`musicbrainz:${versione.idMusicBrainz}`);
  if (versione.videoId) valori.push(`youtube:${versione.videoId}`);
  if (versione.idYouTube) valori.push(`youtube:${versione.idYouTube}`);
  if (versione.trackIdApple) valori.push(`apple:${versione.trackIdApple}`);
  if (versione.idApple) valori.push(`apple:${versione.idApple}`);
  for (const riferimento of versione.riferimentiMusicLab || []) {
    if (riferimento?.fonte === 'youtube' && riferimento?.idEsterno) {
      valori.push(`youtube:${riferimento.idEsterno}`);
    }
  }
  return new Set(valori);
}

function intersezione(a, b) {
  for (const x of a) if (b.has(x)) return x;
  return null;
}

function token(valore) {
  return new Set(normalizzaTesto(valore).split(' ').filter(Boolean));
}

function similaritaToken(a, b) {
  const x = token(a);
  const y = token(b);
  if (!x.size || !y.size) return 0;
  let comuni = 0;
  for (const t of x) if (y.has(t)) comuni += 1;
  const unione = new Set([...x, ...y]).size;
  return unione ? comuni / unione : 0;
}

function tipoIncompatibile(a, b) {
  const ta = testoTipo(a);
  const tb = testoTipo(b);
  if (!ta || !tb || ta === tb) return false;
  if (TIPI_GENERICI.has(ta) || TIPI_GENERICI.has(tb)) return false;
  return TIPI_DISTINTIVI.has(ta) || TIPI_DISTINTIVI.has(tb);
}

export function classificaRelazioneDuplicato(a = {}, b = {}) {
  const titoloA = normalizzaTesto(a.titolo);
  const titoloB = normalizzaTesto(b.titolo);
  const artistaA = normalizzaTesto(a.interprete);
  const artistaB = normalizzaTesto(b.interprete);

  if (!titoloA || !titoloB || !artistaA || !artistaB) {
    return { stato: 'versione_distinta', punteggio: 0, motivi: ['identita_insufficiente'] };
  }

  const idComune = intersezione(identificatori(a), identificatori(b));
  if (idComune) {
    return { stato: 'duplicato_certo', punteggio: 100, motivi: [`identificatore_comune:${idComune}`] };
  }

  if (artistaA !== artistaB) {
    return { stato: 'versione_distinta', punteggio: 0, motivi: ['interprete_diverso'] };
  }

  if (tipoIncompatibile(a, b)) {
    return { stato: 'versione_distinta', punteggio: 20, motivi: ['tipo_di_versione_distinto'] };
  }

  const annoA = annoNumero(a.anno);
  const annoB = annoNumero(b.anno);
  const distanzaAnno = annoA && annoB ? Math.abs(annoA - annoB) : null;

  if (titoloA === titoloB) {
    if (distanzaAnno === null || distanzaAnno <= 1) {
      return {
        stato: 'duplicato_certo',
        punteggio: distanzaAnno === 0 ? 98 : 94,
        motivi: ['titolo_e_interprete_uguali', distanzaAnno === null ? 'anno_mancante' : 'anno_compatibile']
      };
    }
    return {
      stato: 'probabile_duplicato',
      punteggio: Math.max(70, 92 - Math.min(20, distanzaAnno * 2)),
      motivi: ['titolo_e_interprete_uguali', 'anno_distante_da_verificare']
    };
  }

  const somiglianza = similaritaToken(titoloA, titoloB);
  if (somiglianza >= 0.8) {
    return {
      stato: 'probabile_duplicato',
      punteggio: Math.round(60 + somiglianza * 30),
      motivi: ['interprete_uguale', 'titolo_molto_simile']
    };
  }

  return { stato: 'versione_distinta', punteggio: Math.round(somiglianza * 50), motivi: ['titolo_distinto'] };
}

function unisciVersioni(destinazione, sorgente) {
  const piuAffidabile = Number(sorgente.affidabilita || sorgente.confidenza || 0) >
    Number(destinazione.affidabilita || destinazione.confidenza || 0)
    ? sorgente
    : destinazione;
  const altra = piuAffidabile === sorgente ? destinazione : sorgente;

  const fonti = [...(piuAffidabile.fonti || []), ...(altra.fonti || [])];
  const viste = new Set();
  const fontiUniche = fonti.filter(f => {
    const chiave = `${f?.fonte || ''}::${f?.idEsterno || ''}::${f?.indirizzo || ''}`;
    if (viste.has(chiave)) return false;
    viste.add(chiave);
    return true;
  });

  Object.assign(destinazione, {
    ...altra,
    ...piuAffidabile,
    anno: piuAffidabile.anno ?? altra.anno ?? null,
    lingua: piuAffidabile.lingua ?? altra.lingua ?? null,
    paese: piuAffidabile.paese ?? altra.paese ?? null,
    fonti: fontiUniche.length ? fontiUniche : (piuAffidabile.fonti || altra.fonti),
    duplicatiUniti: Number(destinazione.duplicatiUniti || 0) + 1
  });
}

export function deduplicaVersioni(versioni = []) {
  const risultato = [];

  for (const versione of versioni) {
    let unita = false;
    const probabili = [];

    for (let i = 0; i < risultato.length; i += 1) {
      const relazione = classificaRelazioneDuplicato(risultato[i], versione);
      if (relazione.stato === 'duplicato_certo') {
        unisciVersioni(risultato[i], versione);
        unita = true;
        break;
      }
      if (relazione.stato === 'probabile_duplicato') {
        probabili.push({
          indice: i,
          titolo: risultato[i].titolo,
          interprete: risultato[i].interprete,
          anno: risultato[i].anno ?? null,
          punteggio: relazione.punteggio,
          motivi: relazione.motivi
        });
      }
    }

    if (unita) continue;
    if (probabili.length) versione.possibiliDuplicati = probabili;
    risultato.push(versione);
  }

  return risultato;
}
