import { individuaComposizione, elencaRegistrazioniOpera, approfondisciOpereDerivate } from '../fonti/musicbrainz.js';
import { creaRegistroProvider } from '../fonti/provider-registry.js';
import { classificaDaMetadati, applicaAdattamentoSeNecessario } from './classificazione.js';
import { deduplicaVersioni } from './deduplicazione.js';
import { verificaCandidatiConIA } from './verifica-intelligente.js';
import { normalizzaTesto } from './normalizzazione.js';
import { eseguiOperazioneProvider } from './source-router.js';
import { leggiConfigurazioneArchivioVivo } from '../dati/archivio-vivo.js';
import { trovaComposizione, salvaComposizione, salvaVersioni, caricaVersioni, registraRicerca, salvaOpereCollegate } from '../dati/archivio.js';

function composizioneDaRiga(riga) {
  return {
    id: riga.id,
    titolo: riga.titolo_canonico,
    artista: riga.artista_originale,
    compositore: riga.compositore,
    anno: riga.anno_originale,
    lingua: riga.lingua_originale,
    paese: riga.paese_origine,
    idMusicBrainz: riga.id_musicbrainz
  };
}

function ordina(versioni, ordine) {
  const segno = String(ordine).toLowerCase() === 'desc' ? -1 : 1;
  return [...versioni].sort((a, b) => {
    if (a.anno == null && b.anno != null) return 1;
    if (a.anno != null && b.anno == null) return -1;
    if (a.anno !== b.anno) return ((a.anno || 0) - (b.anno || 0)) * segno;
    return a.interprete.localeCompare(b.interprete, 'it');
  });
}

function completaAnnoOriginale(scoperta, registrazioni, artistaRichiesto) {
  if (scoperta.annoOriginale) return scoperta;
  const artista = normalizzaTesto(artistaRichiesto);
  const anni = (registrazioni || [])
    .filter(r => normalizzaTesto(r.interprete) === artista)
    .map(r => Number(r.anno || 0))
    .filter(a => a > 0);
  if (anni.length) scoperta.annoOriginale = Math.min(...anni);
  return scoperta;
}

function classificaElenco(elenco, riferimento) {
  return elenco.map(candidato => {
    const base = classificaDaMetadati(candidato, riferimento);
    const finale = applicaAdattamentoSeNecessario(base, candidato, riferimento);
    return {
      ...candidato,
      tipo: finale.tipo,
      affidabilita: finale.affidabilita,
      motivoClassificazione: finale.motivo,
      statoVerifica: finale.affidabilita >= 90 ? 'verificato_metadati' : 'da_verificare'
    };
  });
}

async function configurazioneSicura(db) {
  try {
    return await leggiConfigurazioneArchivioVivo(db);
  } catch {
    return {};
  }
}

function fetchConSegnale(fetchFn, signal) {
  return (url, opzioni = {}) => fetchFn(url, { ...opzioni, ...(signal ? { signal } : {}) });
}

async function usaMusicBrainz({ db, env, configurazione, fetchFn, operazione, contaRisultati }) {
  const provider = creaRegistroProvider(env).get('musicbrainz');
  return eseguiOperazioneProvider({
    db,
    provider,
    configurazione,
    operazione: ({ signal }) => operazione(fetchConSegnale(fetchFn, signal)),
    contaRisultati
  });
}

async function memoriaDegradata(db, riga, ordine, inizio, motivo) {
  if (!riga) return null;
  const versioni = await caricaVersioni(db, riga.id, ordine);
  return {
    stato: 'pronto',
    provenienza: 'memoria dei risultati - fonte esterna degradata',
    composizione: composizioneDaRiga(riga),
    versioniIndividuate: versioni.length,
    versioni,
    durataMs: Date.now() - inizio,
    analisiCompleta: false,
    approfondimentoDisponibile: true,
    aggiornamentoInAttesa: true,
    motivoAggiornamentoInAttesa: motivo || 'Fonte esterna temporaneamente non disponibile.'
  };
}

function rispostaRicercaIncompleta(titolo, artista, inizio, motivo) {
  return {
    stato: 'ricerca_incompleta',
    provenienza: 'ricerca multi-fonte necessaria',
    composizione: { titolo, artista },
    versioniIndividuate: 0,
    versioni: [],
    durataMs: Date.now() - inizio,
    analisiCompleta: false,
    approfondimentoDisponibile: true,
    ricercaMultifonteNecessaria: true,
    motivo: motivo || 'La fonte strutturata non ha fornito dati sufficienti.'
  };
}

export async function cercaVersioni({ titolo, artista, ordine = 'asc', approfondisci = false }, env, opzioni = {}) {
  const inizio = Date.now();
  const db = env.DB;
  const versioneAlgoritmo = env.VERSIONE_MOTORE || '0.6.1';
  const fetchFn = opzioni.fetchFn || fetch;
  const configurazione = await configurazioneSicura(db);

  const giaNota = await trovaComposizione(db, titolo, artista);
  if (giaNota && !approfondisci) {
    const versioni = await caricaVersioni(db, giaNota.id, ordine);
    const durataMs = Date.now() - inizio;
    await registraRicerca(db, {
      titolo, artista, composizioneId: giaNota.id, candidati: versioni.length,
      risultatiValidi: versioni.length, durataMs, versioneAlgoritmo, provenienza: 'memoria'
    });
    return {
      stato: 'pronto',
      provenienza: 'memoria dei risultati',
      composizione: composizioneDaRiga(giaNota),
      versioniIndividuate: versioni.length,
      versioni,
      durataMs,
      analisiCompleta: true,
      approfondimentoDisponibile: false
    };
  }

  const esitoScoperta = await usaMusicBrainz({
    db,
    env,
    configurazione,
    fetchFn,
    operazione: fetchControllato => individuaComposizione(titolo, artista, fetchControllato),
    contaRisultati: scoperta => scoperta ? 1 : 0
  });

  if (esitoScoperta.stato !== 'ok') {
    const memoria = await memoriaDegradata(db, giaNota, ordine, inizio, esitoScoperta.errore || esitoScoperta.stato);
    if (memoria) return memoria;
    return rispostaRicercaIncompleta(
      titolo,
      artista,
      inizio,
      esitoScoperta.errore || 'MusicBrainz temporaneamente non disponibile.'
    );
  }

  const scoperta = esitoScoperta.valore;
  if (!scoperta) {
    return rispostaRicercaIncompleta(
      titolo,
      artista,
      inizio,
      'MusicBrainz non ha identificato con sufficiente certezza la composizione; servono le fonti alternative.'
    );
  }

  const esitoElenco = await usaMusicBrainz({
    db,
    env,
    configurazione,
    fetchFn,
    operazione: fetchControllato => elencaRegistrazioniOpera(scoperta.idMusicBrainz, fetchControllato, 100, 0, {
      titolo: scoperta.titoloCanonico,
      lingua: scoperta.linguaOriginale
    }),
    contaRisultati: elenco => Number(elenco?.registrazioni?.length || 0)
  });

  if (esitoElenco.stato !== 'ok') {
    const memoria = await memoriaDegradata(db, giaNota, ordine, inizio, esitoElenco.errore || esitoElenco.stato);
    if (memoria) return memoria;
    return rispostaRicercaIncompleta(
      titolo,
      artista,
      inizio,
      esitoElenco.errore || 'MusicBrainz non ha completato l elenco delle registrazioni.'
    );
  }

  const elencoBase = esitoElenco.valore;
  completaAnnoOriginale(scoperta, elencoBase.registrazioni, artista);

  const riferimento = {
    titolo: scoperta.titoloCanonico,
    artista: scoperta.artistaOriginale,
    anno: scoperta.annoOriginale,
    lingua: scoperta.linguaOriginale
  };

  let candidati = [...elencoBase.registrazioni];
  let opereAnalizzate = [];

  if (approfondisci && scoperta.opereDerivate?.length) {
    const esitoExtra = await usaMusicBrainz({
      db,
      env,
      configurazione,
      fetchFn,
      operazione: fetchControllato => approfondisciOpereDerivate(
        scoperta.opereDerivate,
        fetchControllato,
        Number(env.MASSIMO_OPERE_DERIVATE_PER_GIRO || 2)
      ),
      contaRisultati: extra => Number(extra?.registrazioni?.length || 0)
    });
    if (esitoExtra.stato === 'ok') {
      candidati.push(...(esitoExtra.valore?.registrazioni || []));
      opereAnalizzate = esitoExtra.valore?.opereAnalizzate || [];
    }
  }

  let versioni = classificaElenco(candidati, riferimento);
  if (approfondisci) {
    versioni = await verificaCandidatiConIA(
      versioni,
      riferimento,
      env,
      Number(env.MASSIMO_CANDIDATI_IA_PER_GIRO || 12)
    );
  }
  versioni = deduplicaVersioni(versioni).filter(v => v.tipo !== 'non correlato');
  versioni = ordina(versioni, ordine);

  const composizioneId = await salvaComposizione(db, scoperta, titolo, artista) || scoperta.idMusicBrainz;
  await salvaOpereCollegate(db, composizioneId, scoperta.opereDerivate || []);
  await salvaVersioni(db, composizioneId, versioni);

  const durataMs = Date.now() - inizio;
  await registraRicerca(db, {
    titolo, artista, composizioneId, candidati: candidati.length,
    risultatiValidi: versioni.length, durataMs, versioneAlgoritmo,
    provenienza: approfondisci ? 'ricerca approfondita' : 'nuova ricerca'
  });

  return {
    stato: 'pronto',
    provenienza: approfondisci ? 'ricerca approfondita' : 'nuova ricerca',
    composizione: {
      id: composizioneId,
      titolo: scoperta.titoloCanonico,
      artista: scoperta.artistaOriginale,
      compositore: scoperta.compositore,
      anno: scoperta.annoOriginale,
      lingua: scoperta.linguaOriginale,
      idMusicBrainz: scoperta.idMusicBrainz,
      metodoIndividuazione: scoperta.metodoIndividuazione || null
    },
    versioniIndividuate: versioni.length,
    versioni,
    durataMs,
    analisiCompleta: elencoBase.totale <= 100 && (!scoperta.opereDerivate?.length || approfondisci),
    totaleRegistrazioniCollegate: elencoBase.totale,
    versioniStranierePotenziali: scoperta.opereDerivate?.filter(o => o.tradotta).length || 0,
    opereDerivateIndividuate: scoperta.opereDerivate?.length || 0,
    opereDerivateAnalizzate: opereAnalizzate,
    approfondimentoDisponibile: Boolean(scoperta.opereDerivate?.length) && !approfondisci,
    prossimoOffset: elencoBase.registrazioni.length < elencoBase.totale ? elencoBase.registrazioni.length : null
  };
}

export async function cercaAncoraVersioni({ titolo, artista, ordine = 'asc', offset = 100 }, env, opzioni = {}) {
  const inizio = Date.now();
  const db = env.DB;
  if (!db) throw new Error('Il database centrale non è ancora collegato.');

  const nota = await trovaComposizione(db, titolo, artista);
  if (!nota?.id_musicbrainz) throw new Error('La composizione deve essere cercata almeno una volta prima di usare Cerca ancora.');

  const fetchFn = opzioni.fetchFn || fetch;
  const configurazione = await configurazioneSicura(db);
  const riferimento = {
    titolo: nota.titolo_canonico,
    artista: nota.artista_originale,
    anno: nota.anno_originale,
    lingua: nota.lingua_originale
  };

  const esitoElenco = await usaMusicBrainz({
    db,
    env,
    configurazione,
    fetchFn,
    operazione: fetchControllato => elencaRegistrazioniOpera(
      nota.id_musicbrainz,
      fetchControllato,
      100,
      Math.max(0, Number(offset) || 0),
      { titolo: nota.titolo_canonico, lingua: nota.lingua_originale }
    ),
    contaRisultati: elenco => Number(elenco?.registrazioni?.length || 0)
  });

  if (esitoElenco.stato !== 'ok') {
    const tutte = await caricaVersioni(db, nota.id, ordine);
    return {
      stato: 'pronto',
      provenienza: 'memoria dei risultati - continuazione in attesa',
      composizione: composizioneDaRiga(nota),
      versioniIndividuate: tutte.length,
      versioni: tutte,
      nuoveVersioniNelGiro: 0,
      durataMs: Date.now() - inizio,
      analisiCompleta: false,
      prossimoOffset: Math.max(0, Number(offset) || 0),
      aggiornamentoInAttesa: true,
      motivoAggiornamentoInAttesa: esitoElenco.errore || esitoElenco.stato
    };
  }

  const elenco = esitoElenco.valore;
  let nuove = classificaElenco(elenco.registrazioni, riferimento);
  nuove = await verificaCandidatiConIA(
    nuove,
    riferimento,
    env,
    Number(env.MASSIMO_CANDIDATI_IA_PER_GIRO || 12)
  );
  nuove = deduplicaVersioni(nuove).filter(v => v.tipo !== 'non correlato');
  await salvaVersioni(db, nota.id, nuove);

  const tutte = await caricaVersioni(db, nota.id, ordine);
  const nuovoOffset = Math.max(0, Number(offset) || 0) + elenco.registrazioni.length;
  const prossimoOffset = nuovoOffset < elenco.totale ? nuovoOffset : null;
  const durataMs = Date.now() - inizio;

  await registraRicerca(db, {
    titolo, artista, composizioneId: nota.id, candidati: elenco.registrazioni.length,
    risultatiValidi: nuove.length, durataMs,
    versioneAlgoritmo: env.VERSIONE_MOTORE || '0.6.1', provenienza: 'cerca ancora'
  });

  return {
    stato: 'pronto',
    provenienza: 'cerca ancora',
    composizione: composizioneDaRiga(nota),
    versioniIndividuate: tutte.length,
    versioni: tutte,
    nuoveVersioniNelGiro: nuove.length,
    durataMs,
    analisiCompleta: prossimoOffset == null,
    prossimoOffset
  };
}
