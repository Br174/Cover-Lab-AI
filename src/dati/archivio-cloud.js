function limita(valore, ripiego = 20, massimo = 50) {
  const n = Number(valore);
  if (!Number.isFinite(n) || n <= 0) return ripiego;
  return Math.min(massimo, Math.floor(n));
}

function paroleRicerca(query = '') {
  return String(query)
    .toLocaleLowerCase('it')
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9àèéìòù' ]/gi, ' ')
    .split(/\s+/)
    .map(x => x.trim())
    .filter(x => x.length >= 2)
    .slice(0, 12);
}

export async function statisticheArchivioCloud(db) {
  if (!db) return {
    stato: 'database_non_collegato',
    braniPresenti: 0,
    versioniArchiviate: 0,
    nuoveUltimoAggiornamento: 0,
    ultimoAggiornamento: null
  };

  const totali = await db.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN v.stato_archivio='archiviata' THEN c.id END) AS brani,
      SUM(CASE WHEN v.stato_archivio='archiviata' THEN 1 ELSE 0 END) AS versioni,
      SUM(CASE WHEN v.stato_archivio<>'archiviata' THEN 1 ELSE 0 END) AS in_verifica
    FROM composizioni c
    LEFT JOIN versioni v ON v.composizione_id=c.id
  `).first();

  let ultimo = null;
  try {
    ultimo = await db.prepare(`
      SELECT completata_il AS completataIl, nuove_o_aggiornate AS nuove,
             titolo, artista, stato
      FROM scansioni_archivio_vivo
      WHERE completata_il IS NOT NULL
      ORDER BY datetime(completata_il) DESC
      LIMIT 1
    `).first();
  } catch {
    ultimo = null;
  }

  return {
    stato: 'pronto',
    braniPresenti: Number(totali?.brani || 0),
    versioniArchiviate: Number(totali?.versioni || 0),
    versioniInVerifica: Number(totali?.in_verifica || 0),
    nuoveUltimoAggiornamento: Number(ultimo?.nuove || 0),
    ultimoAggiornamento: ultimo?.completataIl || null,
    ultimoBranoAggiornato: ultimo?.titolo || null,
    ultimoArtistaAggiornato: ultimo?.artista || null
  };
}

export async function cercaArchivioCloud(db, query, { offset = 0, limite = 20 } = {}) {
  if (!db) return { stato: 'database_non_collegato', query, risultati: [] };
  const parole = paroleRicerca(query);
  if (!parole.length) return { stato: 'query_vuota', query, risultati: [] };

  const condizioni = parole.map((_, i) => `
    lower(c.titolo_canonico || ' ' || COALESCE(c.artista_originale,'')) LIKE ?${i + 1}
  `);
  const binds = parole.map(p => `%${p}%`);
  const posizione = Math.max(0, Number(offset) || 0);
  const quantita = limita(limite, 20, 20);

  const sql = `
    SELECT c.id, c.titolo_canonico AS titolo, c.artista_originale AS artista,
           c.anno_originale AS anno, c.lingua_originale AS lingua,
           COUNT(v.id) AS versioniArchiviate,
           MAX(v.data_ammissione_archivio) AS ultimoInserimento
    FROM composizioni c
    JOIN versioni v ON v.composizione_id=c.id AND v.stato_archivio='archiviata'
    WHERE ${condizioni.join(' AND ')}
    GROUP BY c.id, c.titolo_canonico, c.artista_originale, c.anno_originale, c.lingua_originale
    ORDER BY COUNT(v.id) DESC, c.titolo_canonico COLLATE NOCASE
    LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}
  `;

  const risultato = await db.prepare(sql)
    .bind(...binds, quantita, posizione)
    .all();

  return {
    stato: 'pronto',
    query: String(query).trim(),
    offset: posizione,
    limite: quantita,
    risultati: risultato.results || []
  };
}
