import { cercaSuYouTube, statoProviderYouTube } from './youtube.js';
import { cercaNelCatalogoApple, statoProviderApple } from './apple-search.js';

export const CAPACITA_PROVIDER = Object.freeze({
  SCOPERTA: 'scoperta',
  IDENTITA: 'identita',
  REGISTRAZIONI: 'registrazioni',
  VERIFICA: 'verifica'
});

function descriptorMusicBrainz() {
  return {
    id: 'musicbrainz',
    nome: 'MusicBrainz',
    priorita: 100,
    affidabilitaBase: 95,
    capacita: [CAPACITA_PROVIDER.IDENTITA, CAPACITA_PROVIDER.REGISTRAZIONI, CAPACITA_PROVIDER.VERIFICA],
    aliasStrategia: ['musicbrainz'],
    paginaUnica: false,
    stato() {
      return { provider: 'musicbrainz', disponibile: true, stato: 'configurato_senza_chiave' };
    }
  };
}

function descriptorYouTube(env, opzioni = {}) {
  return {
    id: 'youtube',
    nome: 'YouTube',
    priorita: 90,
    affidabilitaBase: 65,
    capacita: [CAPACITA_PROVIDER.SCOPERTA],
    aliasStrategia: ['youtube'],
    paginaUnica: false,
    stato() {
      return { provider: 'youtube', ...statoProviderYouTube(env) };
    },
    async cerca({ query, lingua = null, paese = null, cursore = null, limite = 50 } = {}, controllo = {}) {
      return cercaSuYouTube({
        query,
        lingua,
        paese,
        pageToken: cursore,
        maxResults: limite
      }, env, opzioni.fetchYouTubeFn || fetch, controllo.signal || null);
    }
  };
}

function descriptorApple(env, opzioni = {}) {
  return {
    id: 'apple_catalogo',
    nome: 'Catalogo Apple',
    priorita: 80,
    affidabilitaBase: 80,
    capacita: [CAPACITA_PROVIDER.SCOPERTA],
    aliasStrategia: ['cataloghi', 'apple', 'apple_catalogo'],
    paginaUnica: true,
    stato() {
      return statoProviderApple();
    },
    async cerca({ query, paese = null, limite = 50 } = {}, controllo = {}) {
      const risultato = await cercaNelCatalogoApple({
        query,
        paeseRicerca: paese || 'IT',
        limite
      }, opzioni.fetchAppleFn || fetch, controllo.signal || null);
      return {
        disponibile: true,
        stato: 'ok',
        provider: 'apple_catalogo',
        query,
        elementi: risultato.elementi || [],
        prossimoCursore: null,
        precedenteCursore: null,
        totaleStimato: Number(risultato.totale || 0),
        risultatiPerPagina: Number((risultato.elementi || []).length)
      };
    }
  };
}

export function creaRegistroProvider(env = {}, opzioni = {}) {
  const providers = [
    descriptorMusicBrainz(env, opzioni),
    descriptorYouTube(env, opzioni),
    descriptorApple(env, opzioni)
  ];
  return new Map(providers.map(provider => [provider.id, provider]));
}

export function elencoProvider(env = {}, opzioni = {}) {
  return [...creaRegistroProvider(env, opzioni).values()]
    .sort((a, b) => Number(b.priorita || 0) - Number(a.priorita || 0));
}

export function providerScoperta(env = {}, opzioni = {}) {
  return elencoProvider(env, opzioni)
    .filter(provider => provider.capacita.includes(CAPACITA_PROVIDER.SCOPERTA) && typeof provider.cerca === 'function');
}

export function trovaProviderPerStrategia(nomeStrategia, env = {}, opzioni = {}) {
  const nome = String(nomeStrategia || '').trim().toLowerCase();
  if (!nome) return null;
  return providerScoperta(env, opzioni).find(provider =>
    provider.id === nome || (provider.aliasStrategia || []).includes(nome)
  ) || null;
}
