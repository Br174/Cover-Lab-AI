import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPACITA_PROVIDER,
  elencoProvider,
  providerScoperta,
  trovaProviderPerStrategia
} from '../src/fonti/provider-registry.js';

test('il registro contiene MusicBrainz, YouTube, Apple, Internet Archive e Wikipedia', () => {
  const providers = elencoProvider({});
  const ids = providers.map(p => p.id);
  assert.ok(ids.includes('musicbrainz'));
  assert.ok(ids.includes('youtube'));
  assert.ok(ids.includes('apple_catalogo'));
  assert.ok(ids.includes('internet_archive'));
  assert.ok(ids.includes('wikipedia'));
});

test('solo i provider di scoperta espongono cerca', () => {
  const providers = providerScoperta({});
  assert.ok(providers.length >= 4);
  for (const provider of providers) {
    assert.ok(provider.capacita.includes(CAPACITA_PROVIDER.SCOPERTA));
    assert.equal(typeof provider.cerca, 'function');
    assert.equal(typeof provider.stato, 'function');
    assert.equal(typeof provider.creaFonte, 'function');
    assert.equal(typeof provider.preparaCandidato, 'function');
  }
});

test('la strategia cataloghi viene instradata verso Apple', () => {
  const provider = trovaProviderPerStrategia('cataloghi', {});
  assert.equal(provider?.id, 'apple_catalogo');
});

test('la strategia YouTube resta associata al provider YouTube', () => {
  const provider = trovaProviderPerStrategia('youtube', { YOUTUBE_API_KEY: 'x' });
  assert.equal(provider?.id, 'youtube');
  assert.equal(provider?.stato().disponibile, true);
});

test('Internet Archive e un provider di scoperta separato', () => {
  const provider = trovaProviderPerStrategia('internet_archive', {});
  assert.equal(provider?.id, 'internet_archive');
  assert.equal(provider?.stato().disponibile, true);
});

test('Wikipedia e una fonte di scoperta separata e senza chiave', () => {
  const provider = trovaProviderPerStrategia('wikipedia', {});
  assert.equal(provider?.id, 'wikipedia');
  assert.equal(provider?.stato().disponibile, true);
});
