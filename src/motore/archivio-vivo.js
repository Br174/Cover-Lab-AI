import { cercaVersioni } from './motore.js';
import { eseguiScopertaMultifonte } from './orchestratore-multifonte.js';
import {
  leggiConfigurazioneArchivioVivo,
  prossimeVociArchivioVivo,
  segnaVoceInEsecuzione,
  segnaVoceCompletata,
  segnaVoceErrore,
  contaVersioniArchiviate,
  registraScansioneArchivioVivo
} from '../dati/archivio-vivo.js';

function numero(valore, ripiego) {
  const n = Number(valore);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : ripiego;
}

export async function eseguiArchivioVivo(env, opzioni = {}) {
  const db = env.DB;
  if (!db) return { stato: 'database_non_collegato', elaborate: 0 };

  const configurazione = await leggiConfigurazioneArchivioVivo(db);
  if (!Object.keys(configurazione).length) {
    return { stato: 'migrazione_non_applicata', elaborate: 0 };
  }
  if (String(configurazione.abilitato || '1') !== '1') {
    return { stato: 'disabilitato', elaborate: 0 };
  }

  const massimo = Math.min(
    5,
    numero(opzioni.massimoVoci || configurazione.voci_per_giro || env.ARCHIVIO_VIVO_VOCI_PER_GIRO, 1)
  );
  const ricontrolloOre = numero(configurazione.ricontrollo_ore || env.ARCHIVIO_VIVO_RICONTROLLO_ORE, 168);
  const ritentaOre = numero(configurazione.ritenta_errore_ore || env.ARCHIVIO_VIVO_RITENTA_ORE, 6);
  const voci = await prossimeVociArchivioVivo(db, massimo);
  const esiti = [];

  for (const voce of voci) {
    const inizio = Date.now();
    const prima = await contaVersioniArchiviate(db, voce.titolo, voce.artista || '');
    await segnaVoceInEsecuzione(db, voce.id);

    try {
      const risultato = await cercaVersioni({
        titolo: voce.titolo,
        artista: voce.artista || '',
        ordine: 'asc',
        approfondisci: true
      }, env);

      let multifonte = { stato: 'non_eseguita' };
      if (risultato?.stato === 'pronto') {
        try {
          multifonte = await eseguiScopertaMultifonte({
            titolo: risultato?.composizione?.titolo || voce.titolo,
            artista: risultato?.composizione?.artista || voce.artista || '',
            compositore: risultato?.composizione?.compositore || null,
            anno: risultato?.composizione?.anno || null,
            lingua: risultato?.composizione?.lingua || voce.lingua || null,
            paese: voce.paese || null
          }, env);
        } catch (e) {
          multifonte = {
            stato: 'errore_non_bloccante',
            errore: String(e?.message || 'Errore multi-fonte non specificato').slice(0, 500)
          };
        }
      }

      const dopo = await contaVersioniArchiviate(db, voce.titolo, voce.artista || '');
      const nuove = Math.max(0, dopo - prima);
      const cursore = {
        ultimoOffset: risultato?.prossimoOffset ?? null,
        analisiCompleta: Boolean(risultato?.analisiCompleta),
        opereDerivateIndividuate: Number(risultato?.opereDerivateIndividuate || 0),
        multifonte: {
          stato: multifonte?.stato || null,
          candidatiTotali: Number(multifonte?.candidatiTotali || 0),
          fontiTotali: Number(multifonte?.fontiTotali || 0),
          giriIA: Number(multifonte?.giriIA || 0),
          youtube: multifonte?.provider?.youtube?.stato || null
        },
        aggiornatoIl: new Date().toISOString()
      };

      await segnaVoceCompletata(db, voce.id, ricontrolloOre, cursore);
      await registraScansioneArchivioVivo(db, {
        voce,
        stato: risultato?.stato || 'completata',
        candidati: Number(risultato?.totaleRegistrazioniCollegate || risultato?.versioniIndividuate || 0),
        versioniIndividuate: Number(risultato?.versioniIndividuate || 0),
        nuoveOAggiornate: nuove,
        durataMs: Date.now() - inizio,
        dettaglio: JSON.stringify({
          provenienza: risultato?.provenienza || null,
          analisiCompleta: risultato?.analisiCompleta ?? null,
          prossimoOffset: risultato?.prossimoOffset ?? null,
          multifonte
        })
      });

      esiti.push({
        titolo: voce.titolo,
        artista: voce.artista,
        stato: risultato?.stato || 'completata',
        archiviatePrima: prima,
        archiviateDopo: dopo,
        nuove,
        multifonte,
        durataMs: Date.now() - inizio
      });
    } catch (e) {
      const messaggio = e?.message || 'Errore non specificato';
      await segnaVoceErrore(db, voce.id, messaggio, ritentaOre);
      await registraScansioneArchivioVivo(db, {
        voce,
        stato: 'errore',
        durataMs: Date.now() - inizio,
        dettaglio: messaggio
      });
      esiti.push({
        titolo: voce.titolo,
        artista: voce.artista,
        stato: 'errore',
        errore: messaggio,
        durataMs: Date.now() - inizio
      });
    }
  }

  return {
    stato: 'ok',
    elaborate: esiti.length,
    esiti
  };
}
