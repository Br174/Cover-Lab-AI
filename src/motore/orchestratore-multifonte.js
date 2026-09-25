import { generaPianoScopertaConIA, interpretaRisultatiSorgenteConIA } from '../fonti/ia-scoperta.js';
import { cercaSuYouTube, statoProviderYouTube } from '../fonti/youtube.js';
import { cercaNelCatalogoApple, statoProviderApple } from '../fonti/apple-search.js';
import { leggiConfigurazioneArchivioVivo } from '../dati/archivio-vivo.js';
import { riapriScopertaSeScaduta } from '../dati/freschezza-scoperta.js';
import { verificaCandidatiMultifonte } from './verifica-candidati.js';
import {
  chiaveComposizione,
  assicuraStatoScoperta,
  leggiStatoScoperta,
  leggiStrategieNote,
  leggiCandidatiNoti,
  esisteCandidatoScoperta,
  salvaStrategieScoperta,
  salvaCandidatoScoperta,
  salvaFonteCandidato,
  prossimeStrategieProvider,
  aggiornaStrategia,
  registraGiroIA,
  aggiornaStatisticheScoperta
} from '../dati/scoperta.js';

function intero(valore, ripiego, massimo = 50) {
  const n = Number(valore);
  if (!Number.isFinite(n) || n <= 0) return ripiego;
  return Math.min(massimo, Math.floor(n));
}

async function generaNuovePiste(originale, env, db, chiave) {
  const stato = await leggiStatoScoperta(db, chiave);
  if (Number(stato?.ia_esaurita || 0) === 1) {
    return { stato: 'ia_esaurita', strategieNuove: 0, candidatiNuovi: 0, esaurita: true };
  }

  const strategieGiaUsate = await leggiStrategieNote(db, chiave);
  const candidatiGiaNoti = await leggiCandidatiNoti(db, chiave, 300);
  const piano = await generaPianoScopertaConIA({
    ...originale,
    strategieGiaUsate,
    candidatiGiaNoti
  }, env);

  if (!piano.disponibile) {
    return { stato: 'ia_non_disponibile', strategieNuove: 0, candidatiNuovi: 0, esaurita: false };
  }
  if (piano.errore) {
    return { stato: 'errore_ia', errore: piano.errore, strategieNuove: 0, candidatiNuovi: 0, esaurita: false };
  }

  const strategieNuove = await salvaStrategieScoperta(db, chiave, piano.strategie || []);
  let candidatiNuovi = 0;
  for (const candidato of piano.candidati || []) {
    const esisteva = await esisteCandidatoScoperta(db, chiave, candidato);
    await salvaCandidatoScoperta(db, chiave, candidato, 'ia');
    if (!esisteva) candidatiNuovi += 1;
  }

  await registraGiroIA(db, chiave, { esaurita: piano.esaurita === true });
  return { stato: 'ok', strategieNuove, candidatiNuovi, esaurita: piano.esaurita === true };
}

async function processaYouTube(originale, env, db, chiave, massimoStrategie) {
  const statoProvider = statoProviderYouTube(env);
  const strategie = await prossimeStrategieProvider(db, chiave, 'youtube', massimoStrategie);
  if (!strategie.length) {
    return { provider: 'youtube', stato: statoProvider.stato, strategieElaborate: 0, candidati: 0, fonti: 0 };
  }

  if (!statoProvider.disponibile) {
    for (const strategia of strategie) {
      await aggiornaStrategia(db, strategia.id, {
        stato: 'attesa_provider', cursore: strategia.cursore || null,
        candidatiAggiunti: 0, errore: null, incrementaPagina: false
      });
    }
    return {
      provider: 'youtube', stato: 'chiave_da_configurare', strategieElaborate: 0,
      strategieInAttesa: strategie.length, candidati: 0, fonti: 0
    };
  }

  let strategieElaborate = 0;
  let candidatiSalvati = 0;
  let fontiSalvate = 0;
  for (const strategia of strategie) {
    try {
      const pagina = await cercaSuYouTube({
        query: strategia.query, lingua: strategia.lingua, paese: strategia.paese,
        pageToken: strategia.cursore || null, maxResults: 50
      }, env);
      const interpretati = await interpretaRisultatiSorgenteConIA(originale, pagina.elementi, env);
      for (const candidato of interpretati) {
        const elemento = pagina.elementi[candidato.indice];
        if (!elemento) continue;
        const esisteva = await esisteCandidatoScoperta(db, chiave, candidato);
        const candidatoId = await salvaCandidatoScoperta(db, chiave, candidato, 'youtube');
        if (!candidatoId) continue;
        if (!esisteva) candidatiSalvati += 1;
        await salvaFonteCandidato(db, candidatoId, {
          fonte: 'youtube', idEsterno: elemento.idEsterno, indirizzo: elemento.indirizzo,
          titoloFonte: elemento.titolo, descrizione: elemento.descrizione,
          dataPubblicazione: elemento.dataPubblicazione
        });
        fontiSalvate += 1;
      }
      await aggiornaStrategia(db, strategia.id, {
        stato: pagina.prossimoCursore ? 'continua' : 'esaurita',
        cursore: pagina.prossimoCursore || null, candidatiAggiunti: interpretati.length,
        errore: null, incrementaPagina: true
      });
      strategieElaborate += 1;
    } catch (e) {
      const transitorio = [429, 500, 502, 503, 504].includes(Number(e?.status));
      await aggiornaStrategia(db, strategia.id, {
        stato: transitorio ? 'continua' : 'errore', cursore: strategia.cursore || null,
        candidatiAggiunti: 0, errore: String(e?.message || 'Errore YouTube non specificato').slice(0, 1000),
        incrementaPagina: false
      });
    }
  }
  await aggiornaStatisticheScoperta(db, chiave, 'youtube');
  return { provider: 'youtube', stato: 'ok', strategieElaborate, candidati: candidatiSalvati, fonti: fontiSalvate };
}

async function processaCataloghiApple(originale, env, db, chiave, massimoStrategie, fetchAppleFn = fetch) {
  const statoProvider = statoProviderApple();
  const strategie = await prossimeStrategieProvider(db, chiave, 'cataloghi', Math.min(2, massimoStrategie));
  if (!strategie.length) {
    return { provider: 'apple_catalogo', stato: statoProvider.stato, strategieElaborate: 0, candidati: 0, fonti: 0 };
  }

  let strategieElaborate = 0;
  let candidatiSalvati = 0;
  let fontiSalvate = 0;
  for (const strategia of strategie) {
    try {
      const pagina = await cercaNelCatalogoApple({
        query: strategia.query,
        paeseRicerca: strategia.paese || originale.paese || 'IT',
        limite: 50
      }, fetchAppleFn);
      const interpretati = await interpretaRisultatiSorgenteConIA(originale, pagina.elementi, env);
      for (const candidato of interpretati) {
        const elemento = pagina.elementi[candidato.indice];
        if (!elemento) continue;
        const esisteva = await esisteCandidatoScoperta(db, chiave, candidato);
        const candidatoId = await salvaCandidatoScoperta(db, chiave, {
          ...candidato,
          interprete: candidato.interprete || elemento.interprete,
          anno: candidato.anno || (String(elemento.dataPubblicazione || '').slice(0, 4) || null),
          paese: candidato.paese || elemento.paese || null
        }, 'apple_catalogo');
        if (!candidatoId) continue;
        if (!esisteva) candidatiSalvati += 1;
        await salvaFonteCandidato(db, candidatoId, {
          fonte: 'apple_catalogo',
          idEsterno: elemento.idEsterno,
          indirizzo: elemento.indirizzo,
          titoloFonte: `${elemento.interprete} — ${elemento.titolo}`,
          descrizione: elemento.descrizione,
          dataPubblicazione: elemento.dataPubblicazione
        });
        fontiSalvate += 1;
      }
      await aggiornaStrategia(db, strategia.id, {
        stato: 'esaurita', cursore: null, candidatiAggiunti: interpretati.length,
        errore: null, incrementaPagina: true
      });
      strategieElaborate += 1;
    } catch (e) {
      const transitorio = [429, 500, 502, 503, 504].includes(Number(e?.status));
      await aggiornaStrategia(db, strategia.id, {
        stato: transitorio ? 'continua' : 'errore', cursore: null,
        candidatiAggiunti: 0, errore: String(e?.message || 'Errore Apple Search').slice(0, 1000),
        incrementaPagina: false
      });
    }
  }
  await aggiornaStatisticheScoperta(db, chiave, 'apple_catalogo');
  return { provider: 'apple_catalogo', stato: 'ok', strategieElaborate, candidati: candidatiSalvati, fonti: fontiSalvate };
}

export async function eseguiScopertaMultifonte(originale, env, opzioni = {}) {
  const db = env?.DB;
  if (!db) return { stato: 'database_non_collegato' };

  let configurazione;
  try {
    configurazione = await leggiConfigurazioneArchivioVivo(db);
  } catch (e) {
    if (String(e?.message || '').includes('no such table')) return { stato: 'migrazione_non_applicata' };
    throw e;
  }
  if (String(configurazione?.multifonte_abilitato || '0') !== '1') return { stato: 'disabilitato' };

  const titolo = String(originale?.titolo || '').trim();
  const artista = String(originale?.artista || '').trim();
  if (!titolo || !artista) return { stato: 'dati_insufficienti' };

  const chiave = chiaveComposizione(titolo, artista);
  try {
    await assicuraStatoScoperta(db, chiave);
  } catch (e) {
    if (String(e?.message || '').includes('no such table')) return { stato: 'migrazione_non_applicata' };
    throw e;
  }

  const freschezza = await riapriScopertaSeScaduta(
    db, chiave, intero(configurazione.multifonte_ricontrollo_ore, 168, 24 * 365)
  );
  const piano = await generaNuovePiste({
    titolo, artista, compositore: originale.compositore || null,
    anno: originale.anno || null, lingua: originale.lingua || null, paese: originale.paese || null
  }, env, db, chiave);

  const massimoStrategie = intero(opzioni.massimoStrategie || configurazione.strategie_provider_per_giro, 2, 10);
  const [youtube, apple] = await Promise.all([
    processaYouTube(originale, env, db, chiave, massimoStrategie),
    processaCataloghiApple(originale, env, db, chiave, massimoStrategie, opzioni.fetchAppleFn || fetch)
  ]);

  let verifica = { stato: 'non_eseguita', esaminati: 0, promossi: 0 };
  try {
    verifica = await verificaCandidatiMultifonte({ titolo, artista }, env, {
      limite: intero(opzioni.massimoCandidatiVerifica || configurazione.candidati_verifica_per_giro, 2, 5),
      soglia: Number(configurazione.soglia_promozione_candidato || 90),
      fetchFn: opzioni.fetchFn
    });
  } catch (e) {
    verifica = { stato: 'errore_non_bloccante', esaminati: 0, promossi: 0,
      errore: String(e?.message || 'Errore verifica candidati').slice(0, 500) };
  }

  const statoFinale = await leggiStatoScoperta(db, chiave);
  return {
    stato: 'ok', chiaveComposizione: chiave, freschezza, piano,
    provider: { youtube, apple }, verifica,
    candidatiTotali: Number(statoFinale?.candidati_totali || 0),
    fontiTotali: Number(statoFinale?.fonti_totali || 0),
    giriIA: Number(statoFinale?.giri_ia || 0),
    iaEsaurita: Number(statoFinale?.ia_esaurita || 0) === 1
  };
}
