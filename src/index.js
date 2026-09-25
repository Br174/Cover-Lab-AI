import { cercaVersioni, cercaAncoraVersioni } from './motore/motore.js';
import { eseguiArchivioVivo } from './motore/archivio-vivo.js';
import { eseguiScopertaMultifonte } from './motore/orchestratore-multifonte.js';
import { descriviPolicyFontiMedia } from './motore/policy-fonti-media.js';
import { riepilogoPianoEvoluzione } from './motore/piano-evoluzione.js';
import { descriviRegistaAI } from './motore/regista-ai.js';
import { interpretaRicercaLibera } from './motore/ricerca-libera.js';
import { applicaAutocontrollo } from './motore/self-check.js';
import { accodaArchivioVivo, paginaVersioniArchiviate } from './dati/archivio-vivo.js';
import { leggiSaluteFonti } from './dati/salute-fonti.js';
import { migraMultifonteLab, statoMultifonteLab } from './dati/lab-migra-multifonte.js';

const INTESTAZIONI = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

function json(dati, stato = 200) {
  return new Response(JSON.stringify(dati, null, 2), { status: stato, headers: INTESTAZIONI });
}

function errore(messaggio, stato = 400, dettagli = null) {
  return json({ stato: 'errore', messaggio, dettagli }, stato);
}

async function leggiRicerca(request, modalitaForzata = null) {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    throw new Error('JSON_NON_VALIDO');
  }

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
  if (!parametri.approfondisci && (daMemoria || risultato?.ricercaMultifonteNecessaria === true)) {
    programma(ctx, eseguiScopertaMultifonte(
      originaleDaRisultato(risultato, parametri.titolo, parametri.artista),
      env,
      { massimoStrategie: 1 }
    ));
  }
}

function statoMotore(env, fonti = null) {
  return {
    stato: 'operativo',
    versione: env.VERSIONE_MOTORE || '0.7.0',
    archivioVivo: 'predisposto',
    motoreMultifonte: 'predisposto',
    registaAI: descriviRegistaAI(),
    autocontrolloRisultati: 'predisposto',
    ricercaLiberaDiagnostica: 'predisposta',
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

    if (request.method === 'GET' && url.pathname === '/stato') {
      let fonti = [];
      try {
        fonti = await leggiSaluteFonti(env.DB);
      } catch (e) {
        console.error(e);
      }
      return json(statoMotore(env, fonti));
    }

    // Endpoint LAB temporanei: restano solo finche il collaudo remoto multi-fonte e bloccato dall'anteprima Cloudflare.
    if (request.method === 'GET' && url.pathname === '/__lab-multifonte-migra') {
      try {
        return json(await migraMultifonteLab(env.DB));
      } catch (e) {
        return errore('Migrazione multi-fonte LAB non completata.', 500, e?.message || 'Errore non specificato');
      }
    }

    if (request.method === 'GET' && url.pathname === '/__lab-multifonte-prova') {
      try {
        return json(await eseguiScopertaMultifonte({
          titolo: 'Sapore di sale',
          artista: 'Gino Paoli',
          compositore: 'Gino Paoli',
          anno: 1963,
          lingua: 'ita',
          paese: 'IT'
        }, env, { massimoStrategie: 1 }));
      } catch (e) {
        return errore('Prova multi-fonte LAB non completata.', 500, e?.message || 'Errore non specificato');
      }
    }

    if (request.method === 'GET' && url.pathname === '/__lab-multifonte-stato') {
      try {
        return json(await statoMultifonteLab(env.DB, 'sapore di sale::gino paoli'));
      } catch (e) {
        return errore('Stato multi-fonte LAB non disponibile.', 500, e?.message || 'Errore non specificato');
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/versioni') {
      const titolo = String(url.searchParams.get('titolo') || '').trim();
      const artista = String(url.searchParams.get('artista') || '').trim();
      const ordine = url.searchParams.get('ordine') === 'desc' ? 'desc' : 'asc';
      const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
      if (!titolo || !artista) return errore('Titolo e artista sono obbligatori.');

      try {
        const pagina = await paginaVersioniArchiviate(env.DB, {
          titolo,
          artista,
          ordine,
          offset,
          limite: 20
        });
        programma(ctx, accodaArchivioVivo(env.DB, {
          titolo,
          artista,
          priorita: 95,
          motivo: 'consultazione Music Lab'
        }));
        return json(pagina);
      } catch (e) {
        console.error(e);
        return errore('Non è stato possibile leggere l archivio.', 500, e?.message || 'Errore non specificato');
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
            messaggio: 'La ricerca è troppo generica per identificare con sicurezza una sola composizione. Aggiungere il titolo o l artista.',
            ricercaLibera: {
              testo: query,
              interpretazione
            },
            versioni: [],
            versioniIndividuate: 0
          }, 422);
        }

        const parametri = {
          titolo: interpretazione.titolo,
          artista: interpretazione.artista,
          ordine,
          approfondisci: false
        };
        const risultato = applicaAutocontrollo(await cercaVersioni(parametri, env));
        programmaApprofondimenti(ctx, risultato, parametri, env, 'ricerca diagnostica manuale Cover Lab');

        return json({
          ...risultato,
          ricercaLibera: {
            testo: query,
            interpretazione
          }
        });
      } catch (e) {
        console.error(e);
        return errore('La ricerca libera non è stata completata.', 502, e?.message || 'Errore non specificato');
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
        const risultato = applicaAutocontrollo(await cercaAncoraVersioni({ titolo, artista, ordine, offset }, env));
        programma(ctx, accodaArchivioVivo(env.DB, {
          titolo,
          artista,
          priorita: 95,
          motivo: 'continuazione richiesta Music Lab'
        }));
        if (risultato.ricercaMultifonteNecessaria === true) {
          programma(ctx, eseguiScopertaMultifonte(
            originaleDaRisultato(risultato, titolo, artista),
            env,
            { massimoStrategie: 1 }
          ));
        }
        return json(risultato);
      } catch (e) {
        console.error(e);
        return errore('Non è stato possibile continuare la ricerca.', 502, e?.message || 'Errore non specificato');
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

      if (!parametri.titolo) return errore('Il titolo del brano è obbligatorio.');
      if (!parametri.artista) return errore("L'artista è obbligatorio nella prima versione del motore.");

      try {
        const risultato = applicaAutocontrollo(await cercaVersioni(parametri, env));
        programmaApprofondimenti(ctx, risultato, parametri, env);
        return json(risultato);
      } catch (e) {
        console.error(e);
        return errore('La ricerca non è stata completata.', 502, e?.message || 'Errore non specificato');
      }
    }

    return errore('Percorso non disponibile.', 404);
  },

  async scheduled(controller, env, ctx) {
    programma(ctx, eseguiArchivioVivo(env));
  }
};
