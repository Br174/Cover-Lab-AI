import { creaChiaveRicerca } from '../motore/normalizzazione.js';
import { leggiSaluteFonti } from './salute-fonti.js';

async function sicuro(fn, ripiego) {
  try { return await fn(); } catch { return ripiego; }
}

function numerico(v) { return Number(v || 0); }

export async function diagnosticaComposizione(db, titolo, artista = '') {
  if (!db || !titolo) return { stato: 'dati_insufficienti' };
  const chiave = creaChiaveRicerca(titolo, artista);
  const composizione = await sicuro(() => db.prepare(
    'SELECT * FROM composizioni WHERE chiave_ricerca=?1 LIMIT 1'
  ).bind(chiave).first(), null);

  const scoperta = await sicuro(() => db.prepare(
    'SELECT * FROM stato_scoperta_composizione WHERE chiave_composizione=?1 LIMIT 1'
  ).bind(chiave).first(), null);

  const strategie = await sicuro(async () => {
    const r = await db.prepare(`
      SELECT provider, query, lingua, paese, stato, priorita,
             pagine_analizzate AS pagineAnalizzate,
             candidati_trovati AS candidatiTrovati,
             ultimo_errore AS ultimoErrore,
             creata_il AS creataIl, aggiornata_il AS aggiornataIl
      FROM strategie_scoperta
      WHERE chiave_composizione=?1
      ORDER BY datetime(aggiornata_il) DESC, priorita DESC
      LIMIT 100
    `).bind(chiave).all();
    return r.results || [];
  }, []);

  const riepilogoProvider = {};
  for (const s of strategie) {
    const id = s.provider || 'sconosciuto';
    const p = riepilogoProvider[id] || {
      provider: id, queryGenerate: 0, pagineAnalizzate: 0,
      candidatiTrovati: 0, errori: 0, stati: {}
    };
    p.queryGenerate += 1;
    p.pagineAnalizzate += numerico(s.pagineAnalizzate);
    p.candidatiTrovati += numerico(s.candidatiTrovati);
    if (s.ultimoErrore) p.errori += 1;
    p.stati[s.stato || 'sconosciuto'] = (p.stati[s.stato || 'sconosciuto'] || 0) + 1;
    riepilogoProvider[id] = p;
  }

  const statiCandidati = await sicuro(async () => {
    const r = await db.prepare(`
      SELECT stato, COUNT(*) AS totale
      FROM candidati_scoperta
      WHERE chiave_composizione=?1
      GROUP BY stato ORDER BY totale DESC
    `).bind(chiave).all();
    return r.results || [];
  }, []);

  const fontiCandidati = await sicuro(async () => {
    const r = await db.prepare(`
      SELECT fc.fonte, COUNT(*) AS proveCandidato,
             COUNT(DISTINCT fc.candidato_id) AS candidatiSupportati
      FROM fonti_candidato fc
      JOIN candidati_scoperta c ON c.id=fc.candidato_id
      WHERE c.chiave_composizione=?1
      GROUP BY fc.fonte ORDER BY proveCandidato DESC
    `).bind(chiave).all();
    return r.results || [];
  }, []);

  const fontiArchivio = composizione ? await sicuro(async () => {
    const r = await db.prepare(`
      SELECT f.fonte, COUNT(*) AS proveArchivio,
             COUNT(DISTINCT f.versione_id) AS versioniConfermate
      FROM fonti_verifica f
      JOIN versioni v ON v.id=f.versione_id
      WHERE v.composizione_id=?1 AND v.stato_archivio='archiviata'
      GROUP BY f.fonte ORDER BY versioniConfermate DESC, proveArchivio DESC
    `).bind(composizione.id).all();
    return r.results || [];
  }, []) : [];

  const creditiFonti = composizione ? await sicuro(async () => {
    const r = await db.prepare(`
      SELECT fonte, SUM(totale) AS creditiForniti FROM (
        SELECT COALESCE(cv.fonte,'non_indicata') AS fonte, COUNT(*) AS totale
        FROM crediti_versione cv
        JOIN versioni v ON v.id=cv.versione_id
        WHERE v.composizione_id=?1 AND v.stato_archivio='archiviata'
        GROUP BY COALESCE(cv.fonte,'non_indicata')
        UNION ALL
        SELECT COALESCE(cc.fonte,'non_indicata') AS fonte, COUNT(*) AS totale
        FROM crediti_composizione cc
        WHERE cc.composizione_id=?1
        GROUP BY COALESCE(cc.fonte,'non_indicata')
      ) GROUP BY fonte ORDER BY creditiForniti DESC
    `).bind(composizione.id).all();
    return r.results || [];
  }, []) : [];

  const archivio = composizione ? await sicuro(() => db.prepare(`
    SELECT
      SUM(CASE WHEN stato_archivio='archiviata' THEN 1 ELSE 0 END) AS archiviate,
      SUM(CASE WHEN stato_archivio<>'archiviata' THEN 1 ELSE 0 END) AS inVerifica
    FROM versioni WHERE composizione_id=?1
  `).bind(composizione.id).first(), null) : null;

  const ultimeScansioni = await sicuro(async () => {
    const r = await db.prepare(`
      SELECT stato, candidati, versioni_individuate AS versioniIndividuate,
             nuove_o_aggiornate AS nuoveOAggiornate, durata_ms AS durataMs,
             dettaglio, iniziata_il AS iniziataIl, completata_il AS completataIl
      FROM scansioni_archivio_vivo
      WHERE chiave_ricerca=?1
      ORDER BY datetime(iniziata_il) DESC LIMIT 10
    `).bind(chiave).all();
    return r.results || [];
  }, []);

  const tracceRegista = await sicuro(async () => {
    const r = await db.prepare(`
      SELECT giro, agenda_json AS agendaJson,
             domande_esplorate_json AS domandeEsplorateJson,
             nuove_domande_json AS nuoveDomandeJson,
             strategie_json AS strategieJson, creata_il AS creataIl
      FROM tracce_regista_ai
      WHERE chiave_composizione=?1
      ORDER BY datetime(creata_il) DESC LIMIT 10
    `).bind(chiave).all();
    return (r.results || []).map(x => ({
      giro: numerico(x.giro),
      agenda: parseJson(x.agendaJson),
      domandeEsplorate: parseJson(x.domandeEsplorateJson),
      nuoveDomande: parseJson(x.nuoveDomandeJson),
      strategie: parseJson(x.strategieJson),
      creataIl: x.creataIl
    }));
  }, []);

  const saluteProvider = await sicuro(() => leggiSaluteFonti(db), []);

  const contributi = new Map();
  const prendi = fonte => {
    const id = String(fonte || 'non_indicata');
    if (!contributi.has(id)) contributi.set(id, {
      fonte: id, proveCandidato: 0, candidatiSupportati: 0,
      proveArchivio: 0, versioniConfermate: 0, creditiForniti: 0,
      haContribuitoAllArchivio: false
    });
    return contributi.get(id);
  };
  for (const x of fontiCandidati) Object.assign(prendi(x.fonte), {
    proveCandidato: numerico(x.proveCandidato), candidatiSupportati: numerico(x.candidatiSupportati)
  });
  for (const x of fontiArchivio) Object.assign(prendi(x.fonte), {
    proveArchivio: numerico(x.proveArchivio), versioniConfermate: numerico(x.versioniConfermate)
  });
  for (const x of creditiFonti) prendi(x.fonte).creditiForniti = numerico(x.creditiForniti);
  for (const x of contributi.values()) {
    x.haContribuitoAllArchivio = x.versioniConfermate > 0 || x.creditiForniti > 0;
  }

  return {
    stato: 'pronto',
    chiaveComposizione: chiave,
    composizione: composizione ? {
      id: composizione.id,
      titolo: composizione.titolo_canonico,
      artista: composizione.artista_originale,
      idMusicBrainz: composizione.id_musicbrainz
    } : null,
    archivio: {
      archiviate: numerico(archivio?.archiviate),
      inVerifica: numerico(archivio?.inVerifica)
    },
    registaAI: {
      giri: numerico(scoperta?.giri_ia),
      candidatiTotali: numerico(scoperta?.candidati_totali),
      fontiTotali: numerico(scoperta?.fonti_totali),
      ultimaGenerazione: scoperta?.ultima_generazione_ia || null,
      tracce: tracceRegista
    },
    provider: Object.values(riepilogoProvider),
    saluteProvider,
    strategie,
    statiCandidati,
    fonti: [...contributi.values()].sort((a,b) => Number(b.haContribuitoAllArchivio)-Number(a.haContribuitoAllArchivio) || b.versioniConfermate-a.versioniConfermate),
    ultimeScansioni
  };
}

function parseJson(v) {
  if (!v) return [];
  try { return JSON.parse(v); } catch { return []; }
}
