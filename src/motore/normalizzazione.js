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
