import { cercaVersioni, cercaAncoraVersioni } from './motore/motore.js';
import { eseguiArchivioVivo } from './motore/archivio-vivo.js';
import { eseguiScopertaMultifonte } from './motore/orchestratore-multifonte.js';
import { accodaArchivioVivo, paginaVersioniArchiviate } from './dati/archivio-vivo.js';

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/') {
      return json({
        servizio: 'Cover Lab AI',
        versione: env.VERSIONE_MOTORE || '0.4.0',
        stato: 'operativo',
        lingua: 'italiano',
        database: env.DB ? 'collegato' : 'da collegare',
        intelligenzaArtificiale: env.AI ? 'collegata' : 'da collegare',
        archivioVivo: 'predisposto',
        motoreMultifonte: 'predisposto',
        youtube: env.YOUTUBE_API_KEY ? 'configurato' : 'chiave_da_configurare',
        lottoMusicLab: 20
      });
    }

    if (request.method === 'GET' && url.pathname === '/stato') {
      return json({
        stato: 'operativo',
        versione: env.VERSIONE_MOTORE || '0.4.0',
        archivioVivo: 'predisposto',
        motoreMultifonte: 'predisposto',
        youtube: env.YOUTUBE_API_KEY ? 'configurato' : 'chiave_da_configurare',
        lottoMusicLab: 20
      });
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

    if (request.method === 'POST' && url.pathname === '/api/cerca-ancora') {
      let corpo;
      try { corpo = await request.json(); } catch { return errore('Il corpo della richiesta deve essere in formato JSON.'); }
      const titolo = String(corpo?.titolo || '').trim();
      const artista = String(corpo?.artista || '').trim();
      const ordine = corpo?.ordine === 'desc' ? 'desc' : 'asc';
      const offset = Math.max(0, Number(corpo?.offset || 100));
      if (!titolo || !artista) return errore('Titolo e artista sono obbligatori.');
      try {
        const risultato = await cercaAncoraVersioni({ titolo, artista, ordine, offset }, env);
        programma(ctx, accodaArchivioVivo(env.DB, {
          titolo,
          artista,
          priorita: 95,
          motivo: 'continuazione richiesta Music Lab'
        }));
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
        const risultato = await cercaVersioni(parametri, env);

        programma(ctx, accodaArchivioVivo(env.DB, {
          titolo: parametri.titolo,
          artista: parametri.artista,
          priorita: 100,
          motivo: 'richiesta diretta Music Lab'
        }));

        // La memoria rende la risposta immediata, ma non congela mai l'archivio:
        // avvia in background sia il controllo strutturato sia nuove piste multi-fonte.
        if (!parametri.approfondisci && risultato?.provenienza === 'memoria dei risultati') {
          programma(ctx, cercaVersioni({ ...parametri, approfondisci: true }, env));
          programma(ctx, eseguiScopertaMultifonte(
            originaleDaRisultato(risultato, parametri.titolo, parametri.artista),
            env,
            { massimoStrategie: 1 }
          ));
        }

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
