export function normalizzaTesto(valore = '') {
  if (valore === null || valore === undefined) return '';
  return String(valore)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const DESCRITTORI_VERSIONE = [
  'live', 'live version', 'versione live',
  'remix', 'remixed', 'radio edit', 'radio version',
  'remaster', 'remastered', 'remastered version',
  'instrumental', 'instrumental version', 'strumentale', 'versione strumentale',
  'acoustic', 'acoustic version', 'acustica', 'versione acustica',
  'album version', 'single version', 'edit', 'extended version', 'extended mix',
  'karaoke', 'demo', 're recording', 'rerecording', 'new recording'
];

function eDescrittoreVersione(valore) {
  const pulito = normalizzaTesto(valore);
  if (!pulito) return false;
  return DESCRITTORI_VERSIONE.some(d => pulito === d || pulito.startsWith(`${d} `));
}

// Forma usata SOLO per confrontare se due titoli possono riferirsi alla stessa
// composizione. Il titolo originale salvato e la chiave di deduplicazione non
// vengono mai modificati, cosi live/remix/studio restano versioni distinte.
export function normalizzaTitoloPerConfronto(valore = '') {
  let s = String(valore || '').trim();
  if (!s) return '';

  s = s.replace(/\(([^()]*)\)|\[([^\[\]]*)\]/g, (intero, tondo, quadro) => {
    const contenuto = tondo ?? quadro ?? '';
    return eDescrittoreVersione(contenuto) ? ' ' : intero;
  });

  const parti = s.split(/\s[-–—:]\s/);
  while (parti.length > 1 && eDescrittoreVersione(parti[parti.length - 1])) parti.pop();
  return normalizzaTesto(parti.join(' - '));
}

export function creaChiaveRicerca(titolo, artista = '') {
  return `${normalizzaTesto(titolo)}::${normalizzaTesto(artista)}`;
}

export function creaChiaveDuplicato({ titolo = '', interprete = '', anno = null }) {
  return `${normalizzaTesto(titolo)}::${normalizzaTesto(interprete)}::${anno ?? ''}`;
}

export function testoSimile(a, b) {
  const x = normalizzaTesto(a);
  const y = normalizzaTesto(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.includes(y) || y.includes(x);
}

export function titoloMusicaleSimile(a, b) {
  const x = normalizzaTitoloPerConfronto(a);
  const y = normalizzaTitoloPerConfronto(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.includes(y) || y.includes(x);
}
