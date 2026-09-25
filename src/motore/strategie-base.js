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

  // YouTube e' una fonte di scoperta. Non viene usato per cercare apposta
  // il video di una cover trovata altrove: queste query appartengono al giro
  // autonomo di scoperta YouTube del motore.
  aggiungi(elenco, viste, 'youtube', `${titolo} ${artista}`, 100, lingua, paese);
  aggiungi(elenco, viste, 'youtube', `${titolo} cover`, 96, lingua, paese);
  aggiungi(elenco, viste, 'youtube', `${titolo} ${artista} cover`, 94, lingua, paese);

  // Cataloghi: Apple oggi, altri cataloghi potranno condividere lo stesso
  // concetto di strategia senza cambiare il cervello centrale.
  aggiungi(elenco, viste, 'cataloghi', `${titolo} ${artista}`, 100, lingua, paese);
  aggiungi(elenco, viste, 'cataloghi', titolo, 88, lingua, paese);

  // Archivi pubblici: fonte informativa, mai sorgente di riproduzione in Cover Lab.
  aggiungi(elenco, viste, 'internet_archive', `${titolo} ${artista}`, 92, lingua, paese);
  aggiungi(elenco, viste, 'internet_archive', `${titolo} cover`, 84, lingua, paese);

  if (compositore && normalizzaTesto(compositore) !== normalizzaTesto(artista)) {
    aggiungi(elenco, viste, 'youtube', `${titolo} ${compositore}`, 90, lingua, paese);
    aggiungi(elenco, viste, 'cataloghi', `${titolo} ${compositore}`, 90, lingua, paese);
    aggiungi(elenco, viste, 'internet_archive', `${titolo} ${compositore}`, 82, lingua, paese);
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
