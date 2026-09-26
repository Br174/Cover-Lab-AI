import { cercaVersioni, cercaAncoraVersioni } from './motore/motore.js';
import { eseguiArchivioVivo } from './motore/archivio-vivo.js';
import { eseguiScopertaDiagnosticata } from './motore/scoperta-diagnosticata.js';
import { descriviPolicyFontiMedia } from './motore/policy-fonti-media.js';
import { descriviRegolaArchivio } from './motore/ammissione-archivio.js';
import { riepilogoPianoEvoluzione } from './motore/piano-evoluzione.js';
import { descriviRegistaAI } from './motore/regista-ai.js';
import { interpretaRicercaLibera } from './motore/ricerca-libera.js';
import { applicaAutocontrollo } from './motore/self-check.js';
import { accodaArchivioVivo, paginaVersioniArchiviate } from './dati/archivio-vivo.js';
import { statisticheArchivioCloud, cercaArchivioCloud } from './dati/archivio-cloud.js';
import { diagnosticaComposizione } from './dati/diagnostica.js';
import { aggiungiFontiECrediti } from './dati/dettagli-versioni.js';
import { leggiCreditiComposizione } from './dati/crediti-composizione.js';
import { leggiSaluteFonti } from './dati/salute-fonti.js';
import { paginaArchivioCloud } from './web/archivio-cloud.js';

const INTESTAZIONI = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};
const INTESTAZIONI_HTML = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
};

function json(dati, stato = 200) {
  return new Response(JSON.stringify(dati, null, 2), { status: stato, headers: INTESTAZIONI });
}
function errore(messaggio, stato = 400, dettagli = null) {
  return json({ stato: 'errore', messaggio, dettagli }, stato);
}

async function leggiRicerca(request, modalitaForzata = null) {
  let corpo;
  try { corpo = await request.json(); } catch { throw new Error('JSON_NON_VALIDO'); }
  const titolo = String(corpo?.titolo || '').trim();
  const artista = String(corpo?.artista || '').trim();
  const ordine = corpo?.ordine === 'desc' ? 'desc' : 'asc';
  const approfondisci = modalitaForzata === 'approfondita' || corpo?.approfondisci === true;
  return { titolo, artista, ordine, approfondisci };
}

function programma(ctx, promessa) {
  if (!promessa) return;
  const protetta = Promise.resolve(promessa).catch(e => console.error(e));
  if (ctx?.waitUntil) ctx.waitUntil(protetta);
}

async function creditiComposizione(composizione = {}, env = {}) {
  if (Array.isArray(composizione.crediti) && composizione.crediti.length) return composizione.crediti;
  if (composizione.id && env?.DB) {
    try {
      const persistiti = await leggiCreditiComposizione(env.DB, composizione.id);
      if (persistiti.length) return persistiti;
    } catch (e) { console.error(e); }
  }
  return String(composizione.compositore || '')
    .split(',').map(x => x.trim()).filter(Boolean)
    .map(nome => ({ ruolo: 'compositore', nome, fonte: composizione.idMusicBrainz ? 'musicbrainz' : null }));
}

async function arricchisciRisultato(risultato, env) {
  if (!risultato || typeof risultato !== 'object') return risultato;
  const versioniBase = Array.isArray(risultato.versioni) ? risultato.versioni : [];
  const versioni = await aggiungiFontiECrediti(env?.DB, versioniBase);
  let composizione = risultato.composizione;
  if (composizione) composizione = { ...composizione, crediti: await creditiComposizione(composizione, env) };
  return { ...risultato, composizione, versioni };
}
async function preparaRisultato(risultato, env) {
  return applicaAutocontrollo(await arricchisciRisultato(risultato, env));
}

function originaleDaRisultato(risultato, titolo, artista) {
  const composizione = risultato?.composizione || {};
  return {
    titolo: composizione.titolo || titolo,
    artista: composizione.artista || artista,
    compositore: composizione.compositore || null,
    anno: composizione.anno || null,
    lingua: composizione.lingua || null,
    paese: composizione.paese || null
  };
}

function programmaApprofondimenti(ctx, risultato, parametri, env, motivoCoda = 'richiesta diretta Music Lab') {
  programma(ctx, accodaArchivioVivo(env.DB, {
    titolo: parametri.titolo,
    artista: parametri.artista,
    priorita: 100,
    motivo: motivoCoda
  }));

  const daMemoria = String(risultato?.provenienza || '').startsWith('memoria dei risultati');
  if (!parametri.approfondisci && daMemoria && !risultato?.aggiornamentoInAttesa) {
    programma(ctx, cercaVersioni({ ...parametri, approfondisci: true }, env));
  }

  // Da 0.8.0 ogni richiesta riapre anche la ricerca multifonte: l Archivio Vivo
  // non considera mai definitivo il fatto che una composizione abbia gia risultati.
  if (!parametri.approfondisci) {
    programma(ctx, eseguiScopertaDiagnosticata(
      originaleDaRisultato(risultato, parametri.titolo, parametri.artista),
      env,
      { massimoStrategie: 3, massimoCandidatiVerifica: 5 }
    ));
  }
}

async function approfondimentoSincronoDiagnostico(risultato, parametri, env) {
  const povera = Number(risultato?.versioniIndividuate || 0) < 20;
  const daArchivio = String(risultato?.provenienza || '').startsWith('memoria dei risultati');
  if (!povera && !daArchivio) return { risultato, giro: null };

  let giro = null;
  try {
    giro = await eseguiScopertaDiagnosticata(
      originaleDaRisultato(risultato, parametri.titolo, parametri.artista),
      env,
      { massimoStrategie: 2, massimoCandidatiVerifica: 5 }
    );
  } catch (e) {
    giro = { stato: 'errore_non_bloccante', errore: String(e?.message || e).slice(0, 500) };
  }

  if (!daArchivio) return { risultato, giro };

  try {
    const primaIds = new Set((risultato.versioni || []).map(v => v.id).filter(Boolean));
    const aggiornata = await paginaVersioniArchiviate(env.DB, {
      titolo: parametri.titolo,
      artista: parametri.artista,
      ordine: parametri.ordine,
      offset: 0,
      limite: 20
    });
    const versioni = (aggiornata.versioni || []).map(v => ({
      ...v,
      provenienzaRisultato: primaIds.has(v.id) ? 'archivio' : 'ricerca'
    }));
    const nuove = versioni.filter(v => v.provenienzaRisultato === 'ricerca').length;
    return {
      risultato: {
        ...risultato,
        versioni,
        versioniIndividuate: aggiornata.totale,
        prossimoOffset: aggiornata.prossimoOffset,
        conteggioProvenienza: {
          archivio: Math.max(0, versioni.length - nuove),
          ricerca: nuove
        },
        inVerifica: aggiornata.inVerifica
      },
      giro
    };
  } catch {
    return { risultato, giro };
  }
}

function statoMotore(env, fonti = null) {
  return {
    stato: 'operativo',
    versione: env.VERSIONE_MOTORE || '0.8.0',
    archivioVivo: 'predisposto',
    archivioCloud: '/archivio',
    archivioCertificato: descriviRegolaArchivio(),
    diagnosticaMotore: 'predisposta',
    motoreMultifonte: 'predisposto',
    registaAI: descriviRegistaAI(),
    autocontrolloRisultati: 'predisposto',
    ricercaLiberaDiagnostica: 'predisposta',
    classificazioneNaturaVersione: 'pubblicazione_performance_da_verificare',
    creditiDettagliati: 'persistenti_e_criterio_di_ammissione',
    nessunLimiteTotaleCover: true,
    sourceRouter: 'predisposto',
    circuitBreaker: 'predisposto',
    verificaCandidati: 'predisposta',
    creditiEFonti: 'predisposti',
    policyFontiMedia: descriviPolicyFontiMedia(),
    pianoEvoluzione: riepilogoPianoEvoluzione(),
    appleCatalogo: 'configurato_senza_chiave',
    youtube: env.YOUTUBE_API_KEY ? 'configurato' : 'chiave_da_configurare',
    ...(fonti ? { fonti } : {}),
    lottoMusicLab: 20
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return json({
        servizio: 'Cover Lab AI',
        lingua: 'italiano',
        database: env.DB ? 'collegato' : 'da collegare',
        intelligenzaArtificiale: env.AI ? 'collegata' : 'da collegare',
        ...statoMotore(env)
      });
    }

    if (request.method === 'GET' && url.pathname === '/archivio') {
      return new Response(paginaArchivioCloud(), { status: 200, headers: INTESTAZIONI_HTML });
    }

    if (request.method === 'GET' && url.pathname === '/stato') {
      let fonti = [];
      try { fonti = await leggiSaluteFonti(env.DB); } catch (e) { console.error(e); }
      return json(statoMotore(env, fonti));
    }

    if (request.method === 'GET' && url.pathname === '/api/archivio/statistiche') {
      try { return json(await statisticheArchivioCloud(env.DB)); }
      catch (e) { return errore('Statistiche Archivio non disponibili.', 500, e?.message || null); }
    }

    if (request.method === 'GET' && url.pathname === '/api/archivio/cerca') {
      const q = String(url.searchParams.get('q') || '').trim();
      if (!q) return errore('Scrivere qualcosa da cercare nell Archivio.');
      try {
        return json(await cercaArchivioCloud(env.DB, q, {
          offset: Math.max(0, Number(url.searchParams.get('offset') || 0)),
          limite: 20
        }));
      } catch (e) { return errore('Ricerca Archivio non completata.', 500, e?.message || null); }
    }

    if (request.method === 'GET' && url.pathname === '/api/diagnostica') {
      const titolo = String(url.searchParams.get('titolo') || '').trim();
      const artista = String(url.searchParams.get('artista') || '').trim();
      if (!titolo) return errore('Il titolo e obbligatorio per la diagnostica.');
      try { return json(await diagnosticaComposizione(env.DB, titolo, artista)); }
      catch (e) { return errore('Diagnostica non disponibile.', 500, e?.message || null); }
    }

    if (request.method === 'GET' && url.pathname === '/api/versioni') {
      const titolo = String(url.searchParams.get('titolo') || '').trim();
      const artista = String(url.searchParams.get('artista') || '').trim();
      const ordine = url.searchParams.get('ordine') === 'desc' ? 'desc' : 'asc';
      const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
      if (!titolo || !artista) return errore('Titolo e artista sono obbligatori.');
      try {
        const pagina = await paginaVersioniArchiviate(env.DB, { titolo, artista, ordine, offset, limite: 20 });
        programma(ctx, accodaArchivioVivo(env.DB, { titolo, artista, priorita: 95, motivo: 'consultazione Music Lab' }));
        return json(pagina);
      } catch (e) {
        console.error(e);
        return errore('Non e stato possibile leggere l archivio.', 500, e?.message || 'Errore non specificato');
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/ricerca-libera') {
      let corpo;
      try { corpo = await request.json(); } catch { return errore('Il corpo della richiesta deve essere in formato JSON.'); }
      const query = String(corpo?.query || corpo?.testo || '').trim();
      const ordine = corpo?.ordine === 'desc' ? 'desc' : 'asc';
      if (!query) return errore('Scrivere un titolo, un artista o altri dati utili per identificare il brano.');

      try {
        const interpretazione = await interpretaRicercaLibera(query, env);
        if (!interpretazione?.titolo || !interpretazione?.artista) {
          return json({
            stato: 'selezione_necessaria',
            messaggio: 'La ricerca e troppo generica per identificare con sicurezza una sola composizione. Aggiungere il titolo o l artista.',
            ricercaLibera: { testo: query, interpretazione },
            versioni: [], versioniIndividuate: 0
          }, 422);
        }

        const parametri = {
          titolo: interpretazione.titolo,
          artista: interpretazione.artista,
          ordine,
          approfondisci: false
        };
        let risultato = await preparaRisultato(await cercaVersioni(parametri, env), env);
        const profonda = await approfondimentoSincronoDiagnostico(risultato, parametri, env);
        risultato = await preparaRisultato(profonda.risultato, env);
        programmaApprofondimenti(ctx, risultato, parametri, env, 'ricerca diagnostica manuale Cover Lab');

        return json({
          ...risultato,
          giroDiagnostico: profonda.giro,
          ricercaLibera: { testo: query, interpretazione }
        });
      } catch (e) {
        console.error(e);
        return errore('La ricerca libera non e stata completata.', 502, e?.message || 'Errore non specificato');
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/cerca-ancora') {
      let corpo;
      try { corpo = await request.json(); } catch { return errore('Il corpo della richiesta deve essere in formato JSON.'); }
      const titolo = String(corpo?.titolo || '').trim();
      const artista = String(corpo?.artista || '').trim();
      const ordine = corpo?.ordine === 'desc' ? 'desc' : 'asc';
      const offset = Math.max(0, Number(corpo?.offset || 100));
      if (!titolo || !artista) return errore('Titolo e artista sono obbligatori.');
      try {
        const risultato = await preparaRisultato(await cercaAncoraVersioni({ titolo, artista, ordine, offset }, env), env);
        programma(ctx, accodaArchivioVivo(env.DB, { titolo, artista, priorita: 95, motivo: 'continuazione richiesta Music Lab' }));
        programma(ctx, eseguiScopertaDiagnosticata(originaleDaRisultato(risultato, titolo, artista), env, {
          massimoStrategie: 3, massimoCandidatiVerifica: 5
        }));
        return json(risultato);
      } catch (e) {
        console.error(e);
        return errore('Non e stato possibile continuare la ricerca.', 502, e?.message || 'Errore non specificato');
      }
    }

    if (request.method === 'POST' && ['/api/ricerca', '/api/approfondisci'].includes(url.pathname)) {
      let parametri;
      try {
        parametri = await leggiRicerca(request, url.pathname === '/api/approfondisci' ? 'approfondita' : null);
      } catch (e) {
        if (e.message === 'JSON_NON_VALIDO') return errore('Il corpo della richiesta deve essere in formato JSON.');
        throw e;
      }
      if (!parametri.titolo) return errore('Il titolo del brano e obbligatorio.');
      if (!parametri.artista) return errore("L'artista e obbligatorio nella prima versione del motore.");
      try {
        const risultato = await preparaRisultato(await cercaVersioni(parametri, env), env);
        programmaApprofondimenti(ctx, risultato, parametri, env);
        return json(risultato);
      } catch (e) {
        console.error(e);
        return errore('La ricerca non e stata completata.', 502, e?.message || 'Errore non specificato');
      }
    }

    return errore('Percorso non disponibile.', 404);
  },

  async scheduled(controller, env, ctx) {
    programma(ctx, eseguiArchivioVivo(env));
  }
};
