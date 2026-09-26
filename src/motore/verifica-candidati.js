import { trovaComposizione } from '../dati/archivio.js';
import {
  candidatiDaVerificare,
  fontiDelCandidato,
  opereCollegateComposizione,
  aggiornaEsitoCandidato
} from '../dati/verifica-candidati.js';
import {
  salvaVersioneVerificata,
  salvaFontiVersione,
  salvaCreditiVersione
} from '../dati/versioni-verificate.js';
import { leggiCreditiComposizione } from '../dati/crediti-composizione.js';
import {
  individuaConflittiTraCandidatoEVerifica,
  salvaConflittiVersione,
  aggiornaIndagineConflitto
} from '../dati/conflitti-versione.js';
import { salvaStrategieScoperta } from '../dati/scoperta.js';
import { verificaCandidatoSuMusicBrainz } from '../fonti/musicbrainz-verifica.js';
import { indagaConflittoConIA } from './indagine-conflitti-ai.js';
import { verificaCandidatoConIA } from './verifica-intelligente.js';
import { valutaAmmissioneArchivio } from './ammissione-archivio.js';

const FONTI_FORTI = new Set([
  'musicbrainz', 'wikipedia', 'wikimedia', 'apple_catalogo',
  'artista_ufficiale', 'etichetta_ufficiale'
]);

function limita(n, min = 0, max = 100) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function valutaProveCandidato(candidato, fonti = [], verificaStrutturata = null, soglia = 90, verificaAI = null) {
  if (verificaStrutturata?.verificato === true) {
    return {
      promosso: true,
      affidabilita: limita(verificaStrutturata.affidabilita || 98),
      motivo: verificaStrutturata.motivo || 'Relazione strutturata verificata.',
      metodo: 'fonte_strutturata'
    };
  }

  const providerIndipendenti = new Set(
    (fonti || []).map(f => String(f?.fonte || '').trim().toLowerCase()).filter(Boolean)
  );
  const base = limita(candidato?.affidabilita_proposta || candidato?.affidabilitaProposta || 0);
  const fonteForte = [...providerIndipendenti].some(p => FONTI_FORTI.has(p));
  const confermataDalPrimoFiltro = candidato?.stato === 'fonte_confermata_ai';

  if (fonteForte && base >= 55) {
    return {
      promosso: true,
      affidabilita: Math.max(soglia, Math.min(96, base + 25)),
      motivo: 'Versione documentata da una fonte attendibile e coerente con la composizione.',
      metodo: 'fonte_affidabile'
    };
  }

  // Regola centrale CoverLab: una singola fonte reale basta quando il PRIMO
  // filtro AI ha gia confrontato quella fonte con la composizione e l ha marcata
  // esplicitamente come coerente. Il solo punteggio, da solo, non basta.
  if (providerIndipendenti.size >= 1 && confermataDalPrimoFiltro && base >= 70) {
    return {
      promosso: true,
      affidabilita: Math.max(soglia, Math.min(96, base + 20)),
      motivo: 'Registrazione trovata su una fonte reale e riconosciuta come coerente con la composizione.',
      metodo: 'fonte_reale_coerente_ai'
    };
  }

  // Una fonte debole, un titolo omonimo o un risultato deterministico possono
  // ancora essere chiariti da un controllo AI supplementare sulla stessa prova.
  if (providerIndipendenti.size >= 1 && verificaAI?.confermato === true && Number(verificaAI.affidabilita || 0) >= 70) {
    return {
      promosso: true,
      affidabilita: Math.max(soglia, Math.min(96, Math.max(base, Number(verificaAI.affidabilita || 0)) + 5)),
      motivo: verificaAI.motivo || 'Fonte reale chiarita dalla verifica intelligente supplementare.',
      metodo: 'fonte_reale_verificata_ai'
    };
  }

  if (providerIndipendenti.size >= 2 && base >= 60) {
    const affidabilita = Math.min(96, base + 20 + Math.min(6, (providerIndipendenti.size - 2) * 3));
    if (affidabilita >= soglia) {
      return {
        promosso: true,
        affidabilita,
        motivo: `Conferma coerente da ${providerIndipendenti.size} fonti indipendenti.`,
        metodo: 'conferma_multifonte'
      };
    }
  }

  return {
    promosso: false,
    affidabilita: Math.min(89, Math.max(base, providerIndipendenti.size * 15, Number(verificaAI?.affidabilita || 0))),
    motivo: providerIndipendenti.size
      ? 'La fonte reale esiste, ma la relazione con la composizione e ancora troppo ambigua.'
      : 'Candidato ancora privo di una fonte reale.',
    metodo: 'in_attesa'
  };
}

function versioneDaCandidato(candidato, affidabilita, verificaAI = null, metodo = 'conferma_multifonte') {
  const tipoAI = verificaAI?.confermato ? verificaAI.tipo : null;
  return {
    titolo: candidato.titolo,
    interprete: candidato.interprete,
    anno: candidato.anno,
    lingua: candidato.lingua,
    paese: candidato.paese,
    tipo: tipoAI || candidato.tipo_proposto || 'cover',
    affidabilita,
    statoVerifica: metodo === 'fonte_reale_coerente_ai' || metodo === 'fonte_reale_verificata_ai'
      ? 'verificato_ai_su_fonte'
      : metodo === 'fonte_affidabile'
        ? 'verificato_fonte_affidabile'
        : metodo === 'fonte_strutturata'
          ? 'verificato_fonte_strutturata'
          : 'verificato_multifonte',
    derivazione: false,
    derivazioneTradotta: (tipoAI || candidato.tipo_proposto) === 'adattamento'
  };
}

function originalePerIndagine(composizione) {
  return {
    titolo: composizione.titolo_canonico,
    artista: composizione.artista_originale,
    compositore: composizione.compositore || null,
    anno: composizione.anno_originale || null,
    lingua: composizione.lingua_originale || null,
    paese: composizione.paese_origine || null
  };
}

async function avviaIndaginiConflitti({ db, env, composizione, versione, versioneId, conflitti, limite = 2 }) {
  if (!conflitti?.length) return { avviate: 0, strategieNuove: 0 };
  let avviate = 0;
  let strategieNuove = 0;
  const massimo = Math.max(1, Math.min(5, Number(limite) || 2));
  for (const conflitto of conflitti.slice(0, massimo)) {
    const indagine = await indagaConflittoConIA({
      originale: originalePerIndagine(composizione),
      versione,
      conflitto
    }, env);
    if (!indagine?.disponibile || indagine?.errore) continue;
    const nuove = await salvaStrategieScoperta(db, composizione.chiave_ricerca, indagine.strategie || []);
    const aggiornata = await aggiornaIndagineConflitto(db, versioneId, conflitto, indagine, nuove);
    if (aggiornata) {
      avviate += 1;
      strategieNuove += Number(nuove || 0);
    }
  }
  return { avviate, strategieNuove };
}

async function migrazioneVerificaDisponibile(db) {
  try {
    await db.prepare('SELECT affidabilita_verificata, versione_id FROM candidati_scoperta LIMIT 1').all();
    await db.prepare('SELECT id FROM crediti_versione LIMIT 1').all();
    await db.prepare('SELECT stato_archivio FROM versioni LIMIT 1').all();
    return true;
  } catch (e) {
    const messaggio = String(e?.message || '');
    if (messaggio.includes('no such column') || messaggio.includes('no such table')) return false;
    throw e;
  }
}

function unisciCrediti(...gruppi) {
  const mappa = new Map();
  for (const gruppo of gruppi) {
    for (const c of Array.isArray(gruppo) ? gruppo : []) {
      const ruolo = String(c?.ruolo || '').trim().toLowerCase();
      const nome = String(c?.nome || '').trim();
      if (!ruolo || !nome) continue;
      const chiave = `${ruolo}::${nome.toLocaleLowerCase('it')}`;
      if (!mappa.has(chiave)) mappa.set(chiave, { ...c, ruolo, nome });
    }
  }
  return [...mappa.values()];
}

async function confermaPersistenzaArchivio(db, versioneId, motivoArchivio) {
  if (!db || !versioneId) return { confermata: false, statoArchivio: null };

  await db.prepare(`
    UPDATE versioni
    SET stato_archivio='archiviata',
        motivo_archivio=COALESCE(?2, motivo_archivio),
        data_ammissione_archivio=COALESCE(data_ammissione_archivio, CURRENT_TIMESTAMP),
        data_ultima_verifica=CURRENT_TIMESTAMP
    WHERE id=?1
      AND affidabilita>=90
      AND lower(COALESCE(tipo,'')) NOT IN ('originale','dubbio','non correlato')
      AND lower(COALESCE(stato_verifica,'')) LIKE 'verificato%'
      AND (
        id_opera_musicbrainz IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM fonti_verifica fv
          WHERE fv.versione_id=versioni.id
            AND trim(COALESCE(fv.fonte,''))<>''
        )
      )
  `).bind(versioneId, motivoArchivio || null).run();

  const riga = await db.prepare(`
    SELECT stato_archivio AS statoArchivio,
           affidabilita,
           stato_verifica AS statoVerifica,
           id_opera_musicbrainz AS idOperaMusicBrainz,
           EXISTS(
             SELECT 1 FROM fonti_verifica fv
             WHERE fv.versione_id=versioni.id
               AND trim(COALESCE(fv.fonte,''))<>''
           ) AS haFonteReale
    FROM versioni
    WHERE id=?1
    LIMIT 1
  `).bind(versioneId).first();

  return {
    confermata: riga?.statoArchivio === 'archiviata',
    statoArchivio: riga?.statoArchivio || null,
    affidabilita: Number(riga?.affidabilita || 0),
    statoVerifica: riga?.statoVerifica || null,
    idOperaMusicBrainz: riga?.idOperaMusicBrainz || null,
    haFonteReale: Boolean(Number(riga?.haFonteReale || 0))
  };
}

export async function verificaCandidatiMultifonte({ titolo, artista }, env, opzioni = {}) {
  const db = env?.DB;
  if (!db || !titolo || !artista) return { stato: 'dati_insufficienti', esaminati: 0, promossi: 0 };
  if (!(await migrazioneVerificaDisponibile(db))) {
    return { stato: 'migrazione_verifica_non_applicata', esaminati: 0, promossi: 0 };
  }

  const composizione = await trovaComposizione(db, titolo, artista);
  if (!composizione) return { stato: 'composizione_non_archiviata', esaminati: 0, promossi: 0 };

  const creditiOriginale = await leggiCreditiComposizione(db, composizione.id);
  const limite = Math.max(1, Math.min(10, Number(opzioni.limite || 5)));
  const soglia = Math.max(80, Math.min(100, Number(opzioni.soglia || 90)));
  const candidati = await candidatiDaVerificare(db, composizione.chiave_ricerca, limite);
  if (!candidati.length) return { stato: 'nessun_candidato', esaminati: 0, promossi: 0 };

  const opereDerivate = await opereCollegateComposizione(db, composizione.id);
  const esiti = [];
  let promossi = 0;
  let indaginiConflittiAvviate = 0;
  let strategieConflittiNuove = 0;
  let arricchimentiAI = 0;

  for (const candidato of candidati) {
    const fonti = await fontiDelCandidato(db, candidato.id);
    let strutturata = null;

    if (composizione.id_musicbrainz && candidato.interprete) {
      try {
        strutturata = await verificaCandidatoSuMusicBrainz({
          titolo: candidato.titolo,
          interprete: candidato.interprete,
          idOperaOriginale: composizione.id_musicbrainz,
          opereDerivate
        }, opzioni.fetchFn || fetch);
      } catch (e) {
        strutturata = {
          stato: 'errore_transitorio',
          verificato: false,
          errore: String(e?.message || 'Errore MusicBrainz').slice(0, 500)
        };
      }
    }

    // Prima decidiamo con cio che e gia stato verificato durante la scoperta.
    // Se una fonte reale + coerenza AI sono sufficienti, il passaggio successivo
    // non ha piu potere di veto: serve per tipo versione e crediti mancanti.
    let valutazione = valutaProveCandidato(candidato, fonti, strutturata, soglia, null);
    let verificaAI = { disponibile: false, confermato: false, crediti: [] };

    if (fonti.length) {
      verificaAI = await verificaCandidatoConIA({
        candidato,
        originale: originalePerIndagine(composizione),
        fonti,
        creditiOriginale
      }, env);
      if (!valutazione.promosso) {
        valutazione = valutaProveCandidato(candidato, fonti, strutturata, soglia, verificaAI);
      }
    }

    if (!valutazione.promosso) {
      await aggiornaEsitoCandidato(db, candidato.id, {
        stato: fonti.length ? 'verifica_parziale' : 'da_verificare',
        affidabilita: valutazione.affidabilita,
        motivo: valutazione.motivo
      });
      esiti.push({
        id: candidato.id,
        titolo: candidato.titolo,
        interprete: candidato.interprete,
        stato: 'in_attesa',
        affidabilita: valutazione.affidabilita,
        verificaAI: verificaAI?.disponibile ? (verificaAI.confermato ? 'coerenza_supplementare' : 'solo_arricchimento') : 'non_disponibile'
      });
      continue;
    }

    const versione = strutturata?.verificato
      ? {
          ...versioneDaCandidato(candidato, valutazione.affidabilita, verificaAI, valutazione.metodo),
          ...strutturata.versione,
          affidabilita: valutazione.affidabilita
        }
      : versioneDaCandidato(candidato, valutazione.affidabilita, verificaAI, valutazione.metodo);

    const fontiFinali = [...fonti];
    if (strutturata?.fonte) fontiFinali.push(strutturata.fonte);

    const creditiEreditati = (creditiOriginale || []).map(c => ({
      ...c,
      nota: c.nota || 'Credito della composizione originale ereditato dalla versione.'
    }));
    const crediti = unisciCrediti(
      strutturata?.crediti || [],
      creditiEreditati,
      verificaAI?.crediti || [],
      candidato.interprete ? [{ ruolo: 'interprete', nome: candidato.interprete, fonte: candidato.prima_origine || null }] : []
    );
    arricchimentiAI += crediti.filter(c => c.fonte === 'ai_arricchimento').length;

    const ammissione = valutaAmmissioneArchivio({
      versione,
      creditiVersione: crediti,
      creditiComposizione: creditiOriginale,
      fonti: fontiFinali,
      verificaStrutturata: strutturata
    });

    if (!ammissione.ammessa) {
      await aggiornaEsitoCandidato(db, candidato.id, {
        stato: 'verifica_parziale',
        affidabilita: valutazione.affidabilita,
        motivo: ammissione.motivo
      });
      esiti.push({
        id: candidato.id,
        titolo: versione.titolo,
        interprete: versione.interprete,
        stato: 'in_verifica_archivio',
        affidabilita: valutazione.affidabilita,
        motivoArchivio: ammissione.motivo,
        metodo: valutazione.metodo
      });
      continue;
    }

    versione.statoArchivio = 'archiviata';
    versione.motivoArchivio = ammissione.motivo;
    const versioneId = await salvaVersioneVerificata(db, composizione.id, versione);
    await salvaFontiVersione(db, versioneId, fontiFinali);
    await salvaCreditiVersione(db, versioneId, crediti);

    const persistenza = await confermaPersistenzaArchivio(db, versioneId, ammissione.motivo);
    if (!persistenza.confermata) {
      const motivoPersistenza = `Persistenza Archivio non confermata dopo il salvataggio: stato=${persistenza.statoArchivio || 'assente'}, fonteReale=${persistenza.haFonteReale ? 'si' : 'no'}, affidabilita=${persistenza.affidabilita || 0}.`;
      await aggiornaEsitoCandidato(db, candidato.id, {
        stato: 'verifica_parziale',
        affidabilita: valutazione.affidabilita,
        motivo: motivoPersistenza
      });
      esiti.push({
        id: candidato.id,
        titolo: versione.titolo,
        interprete: versione.interprete,
        stato: 'persistenza_non_confermata',
        affidabilita: valutazione.affidabilita,
        motivoArchivio: ammissione.motivo,
        persistenza,
        metodo: valutazione.metodo
      });
      continue;
    }

    let conflitti = [];
    let indagineConflitti = { avviate: 0, strategieNuove: 0 };
    if (strutturata?.verificato && strutturata?.versione) {
      conflitti = individuaConflittiTraCandidatoEVerifica(candidato, strutturata.versione, fonti);
      await salvaConflittiVersione(db, versioneId, conflitti);
      indagineConflitti = await avviaIndaginiConflitti({
        db,
        env,
        composizione,
        versione,
        versioneId,
        conflitti,
        limite: opzioni.massimoConflittiIndagine || 2
      });
      indaginiConflittiAvviate += indagineConflitti.avviate;
      strategieConflittiNuove += indagineConflitti.strategieNuove;
    }

    await aggiornaEsitoCandidato(db, candidato.id, {
      stato: 'verificato',
      affidabilita: valutazione.affidabilita,
      motivo: valutazione.motivo,
      versioneId
    });
    promossi += 1;
    esiti.push({
      id: candidato.id,
      titolo: versione.titolo,
      interprete: versione.interprete,
      stato: 'archiviato',
      affidabilita: valutazione.affidabilita,
      statoVerifica: versione.statoVerifica,
      statoArchivio: persistenza.statoArchivio,
      motivoArchivio: ammissione.motivo,
      creditiTotali: crediti.length,
      creditiAI: crediti.filter(c => c.fonte === 'ai_arricchimento').length,
      conflittiRilevati: conflitti.length,
      conflittiInIndagine: indagineConflitti.avviate,
      strategieConflittiNuove: indagineConflitti.strategieNuove,
      versioneId,
      metodo: valutazione.metodo,
      persistenzaConfermata: true
    });
  }

  return {
    stato: 'ok',
    esaminati: candidati.length,
    promossi,
    arricchimentiAI,
    indaginiConflittiAvviate,
    strategieConflittiNuove,
    esiti
  };
}
