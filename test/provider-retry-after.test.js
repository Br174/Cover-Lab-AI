import test from 'node:test';
import assert from 'node:assert/strict';
import { cercaSuYouTube } from '../src/fonti/youtube.js';
import { cercaSuInternetArchive } from '../src/fonti/internet-archive.js';
import { cercaNelCatalogoApple } from '../src/fonti/apple-search.js';

function rispostaErrore(stato, retryAfter = null, corpo = {}) {
  return {
    ok: false,
    status: stato,
    headers: { get(nome) { return String(nome).toLowerCase() === 'retry-after' ? retryAfter : null; } },
    async json() { return corpo; }
  };
}

test('YouTube propaga Retry-After al gestore centrale', async () => {
  await assert.rejects(
    cercaSuYouTube({ query: 'prova' }, { YOUTUBE_API_KEY: 'test' }, async () =>
      rispostaErrore(429, '17', { error: { message: 'troppi tentativi' } })
    ),
    e => e.status === 429 && e.retryAfter === '17'
  );
});

test('Internet Archive propaga Retry-After al gestore centrale', async () => {
  await assert.rejects(
    cercaSuInternetArchive({ query: 'prova' }, async () => rispostaErrore(429, '23')),
    e => e.status === 429 && e.retryAfter === '23'
  );
});

test('Apple accetta Retry-After anche nel formato data HTTP', async () => {
  const futuro = new Date(Date.now() + 45000).toUTCString();
  await assert.rejects(
    cercaNelCatalogoApple({ query: 'prova' }, async () => rispostaErrore(429, futuro)),
    e => e.status === 429 && Number(e.retryAfterMs) >= 30000 && Number(e.retryAfterMs) <= 60000
  );
});
