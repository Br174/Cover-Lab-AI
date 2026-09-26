import { normalizzaTesto } from './normalizzazione.js';

function testo(valore) {
  return String(valore || '').trim().replace(/\s+/g, ' ');
}

function chiaveStrategia(provider, query) {
  return `${String(provider || '').toLowerCase()}::${normalizzaTesto(query)}`;
}

function aggiungi(elenco, viste, provider, query, priorita, lingua = null, paese = null) {
  const q = testo(query);
  if (!provider || !q) return;
  const chiave = chiaveStrategia(provider, q);
  if (viste.has(chiave)) return;
  viste.add(chiave);
  elenco.push({ provider, query: q, priorita, lingua, paese });
}

export function generaStrategieDeterministiche(originale = {}) {
  const titolo = testo(originale.titolo);
  const artista = testo(originale.artista);
  const compositore = testo(originale.compositore);
  const lingua = testo(originale.lingua) || null;
  const paese = testo(originale.paese) || null;
  if (!titolo) return [];

  const elenco = [];
  const viste = new Set();

  // Fonti editoriali/enciclopediche pubbliche.
  aggiungi(elenco, viste, 'wikipedia', titolo, 99, lingua, paese);
  aggiungi(elenco, viste, 'web_editoriale', `"${titolo}" "${artista}"`, 91, lingua, paese);

  // YouTube resta una fonte opzionale di scoperta/verifica quando configurata.
  aggiungi(elenco, viste, 'youtube', `${titolo} ${artista}`, 100, lingua, paese);
  aggiungi(elenco, viste, 'youtube', `${titolo} cover`, 96, lingua, paese);
  aggiungi(elenco, viste, 'youtube', `${titolo} ${artista} cover`, 94, lingua, paese);

  // Cataloghi pubblici: Apple + Deezer sono interrogati separatamente e
  // conservano sempre la loro provenienza.
  aggiungi(elenco, viste, 'cataloghi', `${titolo} ${artista}`, 100, lingua, paese);
  aggiungi(elenco, viste, 'cataloghi', titolo, 88, lingua, paese);
  aggiungi(elenco, viste, 'deezer', `${titolo} ${artista}`, 99, lingua, paese);
  aggiungi(elenco, viste, 'deezer', titolo, 87, lingua, paese);

  // Archivi pubblici: utili come pista, con priorita piu bassa per ridurre falsi positivi.
  aggiungi(elenco, viste, 'internet_archive', `${titolo} ${artista}`, 78, lingua, paese);
  aggiungi(elenco, viste, 'internet_archive', `${titolo} cover`, 70, lingua, paese);

  if (compositore && normalizzaTesto(compositore) !== normalizzaTesto(artista)) {
    aggiungi(elenco, viste, 'web_editoriale', `"${titolo}" "${compositore}"`, 86, lingua, paese);
    aggiungi(elenco, viste, 'deezer', `${titolo} ${compositore}`, 84, lingua, paese);
    aggiungi(elenco, viste, 'cataloghi', `${titolo} ${compositore}`, 84, lingua, paese);
    aggiungi(elenco, viste, 'internet_archive', `${titolo} ${compositore}`, 68, lingua, paese);
  }

  return elenco;
}

export function generaStrategieFallback(originale = {}, providerId, strategieGiaNote = []) {
  const titolo = testo(originale.titolo);
  const artista = testo(originale.artista);
  const compositore = testo(originale.compositore);
  const lingua = testo(originale.lingua) || null;
  const paese = testo(originale.paese) || null;
  if (!titolo || !providerId) return [];

  const giaViste = new Set(
    (strategieGiaNote || []).map(s => chiaveStrategia(s.provider, s.query))
  );
  const elenco = [];
  const viste = new Set(giaViste);
  const provider = String(providerId).toLowerCase();

  if (provider === 'wikipedia') {
    aggiungi(elenco, viste, provider, titolo, 99, lingua, paese);
    return elenco;
  }

  if (provider === 'web_editoriale') {
    aggiungi(elenco, viste, provider, `"${titolo}" "${artista}"`, 95, lingua, paese);
    aggiungi(elenco, viste, provider, `"${titolo}" cover`, 88, lingua, paese);
    aggiungi(elenco, viste, provider, `"${titolo}" versione`, 84, lingua, paese);
    if (compositore && normalizzaTesto(compositore) !== normalizzaTesto(artista)) {
      aggiungi(elenco, viste, provider, `"${titolo}" "${compositore}"`, 82, lingua, paese);
    }
    return elenco;
  }

  const variantiComuni = [
    [titolo, 82],
    [`${titolo} ${artista}`, 90],
    [`${titolo} cover`, 92],
    [`${titolo} version`, 78],
    [`${titolo} versione`, 78]
  ];
  if (compositore && normalizzaTesto(compositore) !== normalizzaTesto(artista)) {
    variantiComuni.push([`${titolo} ${compositore}`, 86]);
  }

  for (const [query, priorita] of variantiComuni) {
    aggiungi(elenco, viste, provider, query, priorita, lingua, paese);
  }

  return elenco;
}

export function ricercaSospettosamentePovera({ risultatiGrezzi = 0, candidatiUtili = 0, soglia = 3 } = {}) {
  const grezzi = Math.max(0, Number(risultatiGrezzi || 0));
  const utili = Math.max(0, Number(candidatiUtili || 0));
  const minimo = Math.max(1, Number(soglia || 3));
  if (grezzi === 0) return true;
  return utili < minimo;
}
