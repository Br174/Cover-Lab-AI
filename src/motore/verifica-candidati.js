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
import {
  individuaConflittiTraCandidatoEVerifica,
  salvaConflittiVersione
} from '../dati/conflitti-versione.js';
import { verificaCandidatoSuMusicBrainz } from '../fonti/musicbrainz-verifica.js';

function limita(n, min = 0, max = 100) {
  const v = Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

export function valutaProveCandidato(candidato, fonti = [], verificaStrutturata = null, soglia = 90) {
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

  if (providerIndipendenti.size >= 2 && base >= 70) {
    const affidabilita = Math.min(96, base + 15 + Math.min(6, (providerIndipendenti.size - 2) * 3));
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
    affidabilita: Math.min(89, Math.max(base, providerIndipendenti.size * 15)),
    motivo: providerIndipendenti.size
      ? 'Le prove disponibili non raggiungono ancora la soglia di verifica.'
      : 'Candidato ancora privo di una fonte reale sufficiente.',
    metodo: 'in_attesa'
  };
}

function versioneDaCandidato(candidato, affidabilita) {
  return {
    titolo: candidato.titolo,
    interprete: candidato.interprete,
    anno: candidato.anno,
    lingua: candidato.lingua,
    paese: candidato.paese,
    tipo: candidato.tipo_proposto || 'cover',
    affidabilita,
    statoVerifica: 'verificato_multifonte',
    derivazione: false,
    derivazioneTradotta: candidato.tipo_proposto === 'adattamento'
  };
}

async function migrazioneVerificaDisponibile(db) {
  try {
    await db.prepare('SELECT affidabilita_verificata, versione_id FROM candidati_scoperta LIMIT 1').all();
    await db.prepare('SELECT id FROM crediti_versione LIMIT 1').all();
    return true;
  } catch (e) {
    const messaggio = String(e?.message || '');
    if (messaggio.includes('no such column') || messaggio.includes('no such table')) return false;
    throw e;
  }
}

export async function verificaCandidatiMultifonte({ titolo, artista }, env, opzioni = {}) {
  const db = env?.DB;
  if (!db || !titolo || !artista) return { stato: 'dati_insufficienti', esaminati: 0, promossi: 0 };
  if (!(await migrazioneVerificaDisponibile(db))) {
    return { stato: 'migrazione_verifica_non_applicata', esaminati: 0, promossi: 0 };
  }

  const composizione = await trovaComposizione(db, titolo, artista);
  if (!composizione) return { stato: 'composizione_non_archiviata', esaminati: 0, promossi: 0 };

  const limite = Math.max(1, Math.min(5, Number(opzioni.limite || 2)));
  const soglia = Math.max(80, Math.min(100, Number(opzioni.soglia || 90)));
  const candidati = await candidatiDaVerificare(db, composizione.chiave_ricerca, limite);
  if (!candidati.length) return { stato: 'nessun_candidato', esaminati: 0, promossi: 0 };

  const opereDerivate = await opereCollegateComposizione(db, composizione.id);
  const esiti = [];
  let promossi = 0;

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

    const valutazione = valutaProveCandidato(candidato, fonti, strutturata, soglia);
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
        affidabilita: valutazione.affidabilita
      });
      continue;
    }

    const versione = strutturata?.verificato
      ? {
          ...versioneDaCandidato(candidato, valutazione.affidabilita),
          ...strutturata.versione,
          affidabilita: valutazione.affidabilita
        }
      : versioneDaCandidato(candidato, valutazione.affidabilita);

    const versioneId = await salvaVersioneVerificata(db, composizione.id, versione);
    const fontiFinali = [...fonti];
    if (strutturata?.fonte) fontiFinali.push(strutturata.fonte);
    await salvaFontiVersione(db, versioneId, fontiFinali);

    let conflitti = [];
    if (strutturata?.verificato && strutturata?.versione) {
      conflitti = individuaConflittiTraCandidatoEVerifica(candidato, strutturata.versione, fonti);
      await salvaConflittiVersione(db, versioneId, conflitti);
    }

    const crediti = [...(strutturata?.crediti || [])];
    if (composizione.compositore) {
      for (const nome of String(composizione.compositore).split(',').map(x => x.trim()).filter(Boolean)) {
        crediti.push({ ruolo: 'compositore', nome, fonte: 'musicbrainz' });
      }
    }
    if (!crediti.some(c => c.ruolo === 'interprete') && candidato.interprete) {
      crediti.push({ ruolo: 'interprete', nome: candidato.interprete, fonte: candidato.prima_origine || null });
    }
    await salvaCreditiVersione(db, versioneId, crediti);

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
      stato: 'verificato',
      affidabilita: valutazione.affidabilita,
      statoVerifica: versione.statoVerifica || 'verificato_multifonte',
      conflittiAperti: conflitti.length,
      versioneId,
      metodo: valutazione.metodo
    });
  }

  return {
    stato: 'ok',
    esaminati: candidati.length,
    promossi,
    esiti
  };
}
