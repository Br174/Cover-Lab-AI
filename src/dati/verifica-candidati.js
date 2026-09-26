export async function candidatiDaVerificare(db, chiaveComposizione, limite = 2) {
  if (!db || !chiaveComposizione) return [];
  const quantita = Math.max(1, Math.min(10, Number(limite) || 2));
  const risultato = await db.prepare(`
    SELECT id, chiave_composizione, chiave_candidato, titolo, interprete,
           anno, lingua, paese, tipo_proposto, affidabilita_proposta,
           stato, prima_origine, numero_fonti
    FROM candidati_scoperta
    WHERE chiave_composizione=?1
      AND stato IN ('da_verificare','verifica_parziale')
    ORDER BY numero_fonti DESC, affidabilita_proposta DESC, prima_scoperta ASC
    LIMIT ?2
  `).bind(chiaveComposizione, quantita).all();
  return risultato.results || [];
}

export async function fontiDelCandidato(db, candidatoId) {
  if (!db || !candidatoId) return [];
  const risultato = await db.prepare(`
    SELECT fonte, id_esterno AS idEsterno, indirizzo,
           titolo_fonte AS titoloFonte, descrizione,
           data_pubblicazione AS dataPubblicazione, data_verifica AS dataVerifica
    FROM fonti_candidato
    WHERE candidato_id=?1
    ORDER BY data_verifica DESC
  `).bind(candidatoId).all();
  return risultato.results || [];
}

export async function opereCollegateComposizione(db, composizioneId) {
  if (!db || !composizioneId) return [];
  const risultato = await db.prepare(`
    SELECT id_musicbrainz AS idMusicBrainz, titolo, lingua,
           tipo_relazione AS tipoRelazione, tradotta, parodia
    FROM opere_collegate
    WHERE composizione_id=?1
  `).bind(composizioneId).all();
  return risultato.results || [];
}

export async function aggiornaEsitoCandidato(db, candidatoId, {
  stato,
  affidabilita = 0,
  motivo = null,
  versioneId = null
}) {
  if (!db || !candidatoId) return;
  try {
    await db.prepare(`
      UPDATE candidati_scoperta
      SET stato=?2,
          affidabilita_verificata=?3,
          motivo_verifica=?4,
          versione_id=?5,
          ultima_verifica=CURRENT_TIMESTAMP
      WHERE id=?1
    `).bind(
      candidatoId,
      stato,
      Math.max(0, Math.min(100, Math.round(Number(affidabilita) || 0))),
      motivo ? String(motivo).slice(0, 1000) : null,
      versioneId || null
    ).run();
  } catch (e) {
    if (String(e?.message || '').includes('no such column')) return;
    throw e;
  }
}
