import { generaPianoScopertaConIA, interpretaRisultatiSorgenteConIA } from '../fonti/ia-scoperta.js';
import { providerScoperta } from '../fonti/provider-registry.js';
import { leggiConfigurazioneArchivioVivo } from '../dati/archivio-vivo.js';
import { riapriScopertaSeScaduta } from '../dati/freschezza-scoperta.js';
import { verificaCandidatiMultifonte } from './verifica-candidati.js';
import { eseguiRicercaProvider } from './source-router.js';
import { creaAgendaAutointerrogazione } from './regista-ai.js';
import {
  generaStrategieDeterministiche,
  generaStrategieFallback,
  ricercaSospettosamentePovera
} from './strategie-base.js';
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
  const strategieGiaUsate = await leggiStrategieNote(db, chiave);
  const candidatiGiaNoti = await leggiCandidatiNoti(db, chiave, 300);
  const agenda = creaAgendaAutointerrogazione({
    originale,
    giro: Number(stato?.giri_ia || 0),
    candidatiGiaNoti,
    domandePerGiro: 8
  });

  const piano = await generaPianoScopertaConIA({
    ...originale,
    strategieGiaUsate,
    candidatiGiaNoti,
    agenda
  }, env);

  if (!piano.disponibile) {
    const strategieNuoveFallback = await salvaStrategieScoperta(db, chiave, piano.strategie || []);
    return {
      stato: piano.strategie?.length ? 'fallback_senza_ia' : 'ia_non_disponibile',
      strategieNuove: strategieNuoveFallback,
      candidatiNuovi: 0,
      agendaDomande: agenda.domande.length,
      domandeEsplorate: piano.domandeEsplorate || [],
      esaurita: false
    };
  }
  if (piano.errore) {
    return {
      stato: 'errore_ia',
      errore: piano.errore,
      strategieNuove: 0,
      candidatiNuovi: 0,
      agendaDomande: agenda.domande.length,
      esaurita: false
    };
  }

  const strategieNuove = await salvaStrategieScoperta(db, chiave, piano.strategie || []);
  let candidatiNuovi = 0;
  for (const candidato of piano.candidati || []) {
    const esisteva = await esisteCandidatoScoperta(db, chiave, candidato);
    await salvaCandidatoScoperta(db, chiave, candidato, 'ia_regista');
    if (!esisteva) candidatiNuovi += 1;
  }

  // Una singola agenda puo risultare temporaneamente satura, ma non chiude mai
  // la ricerca globale della composizione. I giri successivi cambiano agenda.
  await registraGiroIA(db, chiave, { esaurita: false });
  return {
    stato: piano.recupero ? 'ok_con_fallback' : 'ok',
    strategieNuove,
    candidatiNuovi,
    agendaDomande: agenda.domande.length,
    domandeEsplorate: piano.domandeEsplorate || [],
    nuoveDomande: piano.nuoveDomande || [],
    agendaEsaurita: piano.esaurita === true,
    recupero: piano.recupero || null,
    avviso: piano.avviso || null,
    esaurita: false
  };
}

async function prossimeStrategiePerProvider(db, chiave, provider, limite) {
  const alias = [...new Set([provider.id, ...(provider.aliasStrategia || [])])];
  const tutte = [];
  for (const nome of alias) {
    const trovate = await prossimeStrategieProvider(db, chiave, nome, limite);
    tutte.push(...trovate);
  }
  const uniche = new Map();
  for (const strategia of tutte) {
    if (!uniche.has(strategia.id)) uniche.set(strategia.id, strategia);
  }
  return [...uniche.values()]
    .sort((a, b) => Number(b.priorita || 0) - Number(a.priorita || 0))
    .slice(0, limite);
}

function statoStrategiaDopoErrore(esito) {
  const codice = Number(esito?.codiceErrore);
  const limitato = ['limitato_temporaneamente', 'quota_esaurita', 'sospeso_circuit_breaker'].includes(esito?.stato)
    || [403, 429].includes(codice)
    || Boolean(esito?.codiceGestore)
    || esito?.saltato;
  if (limitato) return 'attesa_provider';
  if (esito?.stato === 'timeout' || [408, 425, 500, 502, 503, 504].includes(codice)) return 'continua';
  return 'errore';
}

async function aggiungiFallbackSePovero({
  db,
  chiave,
  originale,
  provider,
  configurazione,
  risultatiGrezzi,
  candidatiUtili
}) {
  if (!ricercaSospettosamentePovera({
    risultatiGrezzi,
    candidatiUtili,
    soglia: intero(configurazione.risultati_minimi_sospetti, 3, 20)
  })) return 0;

  const giaNote = await leggiStrategieNote(db, chiave);
  const fallback = generaStrategieFallback(originale, provider.id, giaNote);
  const perGiro = intero(configurazione.strategie_fallback_per_giro, 3, 10);
  return salvaStrategieScoperta(db, chiave, fallback.slice(0, perGiro));
}

async function processaProviderScoperta(originale, env, db, chiave, provider, massimoStrategie, configurazione) {
  const strategie = await prossimeStrategiePerProvider(db, chiave, provider, massimoStrategie);
  const statoDichiarato = provider.stato?.() || { disponibile: true, stato: 'configurato' };
  if (!strategie.length) {
    return {
      provider: provider.id,
      stato: statoDichiarato.stato || 'nessuna_strategia',
      strategieElaborate: 0,
      candidati: 0,
      fonti: 0,
      risultatiGrezzi: 0,
      candidatiInterpretati: 0,
      strategieFallbackNuove: 0
    };
  }

  let strategieElaborate = 0;
  let candidatiSalvati = 0;
  let fontiSalvate = 0;
  let strategieInAttesa = 0;
  let ultimoStato = statoDichiarato.stato || 'ok';
  let risultatiGrezzi = 0;
  let candidatiInterpretati = 0;
  let strategieFallbackNuove = 0;

  for (const strategia of strategie) {
    const pagina = await eseguiRicercaProvider({
      db,
      provider,
      richiesta: {
        query: strategia.query,
        lingua: strategia.lingua || originale.lingua || null,
        paese: strategia.paese || originale.paese || null,
        cursore: strategia.cursore || null,
        limite: 50
      },
      configurazione
    });

    ultimoStato = pagina.stato || ultimoStato;
    if (pagina.stato !== 'ok' && pagina.stato !== 'configurato') {
      const statoStrategia = statoStrategiaDopoErrore(pagina);
      await aggiornaStrategia(db, strategia.id, {
        stato: statoStrategia,
        cursore: strategia.cursore || null,
        candidatiAggiunti: 0,
        errore: pagina.errore || null,
        incrementaPagina: false
      });
      if (statoStrategia === 'attesa_provider') {
        strategieInAttesa += 1;
        break;
      }
      continue;
    }

    const elementi = Array.isArray(pagina.elementi) ? pagina.elementi : [];
    risultatiGrezzi += elementi.length;
    const interpretati = await interpretaRisultatiSorgenteConIA(originale, elementi, env);
    candidatiInterpretati += interpretati.length;

    for (const candidato of interpretati) {
      const elemento = elementi[candidato.indice];
      if (!elemento) continue;
      const candidatoNormalizzato = typeof provider.preparaCandidato === 'function'
        ? provider.preparaCandidato(candidato, elemento)
        : { ...candidato };
      const esisteva = await esisteCandidatoScoperta(db, chiave, candidatoNormalizzato);
      const candidatoId = await salvaCandidatoScoperta(db, chiave, candidatoNormalizzato, provider.id);
      if (!candidatoId) continue;
      if (!esisteva) candidatiSalvati += 1;
      const fonte = typeof provider.creaFonte === 'function'
        ? provider.creaFonte(elemento, candidatoNormalizzato)
        : null;
      if (fonte) {
        await salvaFonteCandidato(db, candidatoId, fonte);
        fontiSalvate += 1;
      }
    }

    await aggiornaStrategia(db, strategia.id, {
      stato: pagina.prossimoCursore ? 'continua' : 'esaurita',
      cursore: pagina.prossimoCursore || null,
      candidatiAggiunti: interpretati.length,
      errore: null,
      incrementaPagina: true
    });
    strategieElaborate += 1;

    strategieFallbackNuove += await aggiungiFallbackSePovero({
      db,
      chiave,
      originale,
      provider,
      configurazione,
      risultatiGrezzi: elementi.length,
      candidatiUtili: interpretati.length
    });
  }

  await aggiornaStatisticheScoperta(db, chiave, provider.id);
  return {
    provider: provider.id,
    stato: strategieElaborate > 0 ? 'ok' : ultimoStato,
    strategieElaborate,
    strategieInAttesa,
    candidati: candidatiSalvati,
    fonti: fontiSalvate,
    risultatiGrezzi,
    candidatiInterpretati,
    strategieFallbackNuove
  };
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

  const datiOriginale = {
    titolo,
    artista,
    compositore: originale.compositore || null,
    anno: originale.anno || null,
    lingua: originale.lingua || null,
    paese: originale.paese || null
  };

  const freschezza = await riapriScopertaSeScaduta(
    db, chiave, intero(configurazione.multifonte_ricontrollo_ore, 168, 24 * 365)
  );

  const strategieDeterministicheNuove = await salvaStrategieScoperta(
    db,
    chiave,
    generaStrategieDeterministiche(datiOriginale)
  );

  const piano = await generaNuovePiste(datiOriginale, env, db, chiave);

  const massimoStrategie = intero(
    opzioni.massimoStrategie || configurazione.strategie_provider_per_giro,
    2,
    10
  );
  let providers = providerScoperta(env, {
    fetchAppleFn: opzioni.fetchAppleFn,
    fetchYouTubeFn: opzioni.fetchYouTubeFn,
    fetchInternetArchiveFn: opzioni.fetchInternetArchiveFn
  });
  if (String(configurazione.internet_archive_abilitato || '1') !== '1') {
    providers = providers.filter(p => p.id !== 'internet_archive');
  }

  const esitiProvider = await Promise.all(
    providers.map(provider => processaProviderScoperta(
      datiOriginale,
      env,
      db,
      chiave,
      provider,
      massimoStrategie,
      configurazione
    ))
  );
  const provider = Object.fromEntries(esitiProvider.map(esito => [esito.provider, esito]));

  let verifica = { stato: 'non_eseguita', esaminati: 0, promossi: 0 };
  try {
    verifica = await verificaCandidatiMultifonte({ titolo, artista }, env, {
      limite: intero(
        opzioni.massimoCandidatiVerifica || configurazione.candidati_verifica_per_giro,
        2,
        5
      ),
      soglia: Number(configurazione.soglia_promozione_candidato || 90),
      fetchFn: opzioni.fetchFn
    });
  } catch (e) {
    verifica = {
      stato: 'errore_non_bloccante',
      esaminati: 0,
      promossi: 0,
      errore: String(e?.message || 'Errore verifica candidati').slice(0, 500)
    };
  }

  const statoFinale = await leggiStatoScoperta(db, chiave);
  const strategieFallbackNuove = esitiProvider.reduce(
    (somma, esito) => somma + Number(esito.strategieFallbackNuove || 0),
    0
  );

  return {
    stato: 'ok',
    chiaveComposizione: chiave,
    freschezza,
    strategieDeterministicheNuove,
    strategieFallbackNuove,
    antiZeroAttivato: strategieFallbackNuove > 0,
    nessunLimiteTotaleCover: true,
    piano,
    provider,
    verifica,
    candidatiTotali: Number(statoFinale?.candidati_totali || 0),
    fontiTotali: Number(statoFinale?.fonti_totali || 0),
    giriIA: Number(statoFinale?.giri_ia || 0),
    iaEsaurita: false,
    saturazioneTemporaneaAgenda: piano?.agendaEsaurita === true
  };
}