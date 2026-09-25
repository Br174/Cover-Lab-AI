import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POLICY_FONTI_MEDIA,
  applicaPolicyMusicLab,
  creaRiferimentiMusicLab,
  descriviPolicyFontiMedia
} from '../src/motore/policy-fonti-media.js';

test('Cover Lab non riproduce o scarica media e Music Lab resta responsabile della riproduzione', () => {
  assert.equal(POLICY_FONTI_MEDIA.coverLabRiproduceMedia, false);
  assert.equal(POLICY_FONTI_MEDIA.coverLabScaricaMedia, false);
  assert.equal(POLICY_FONTI_MEDIA.ricercaYouTubeAggiuntivaPerTrovareLaRiproduzione, false);
  assert.equal(POLICY_FONTI_MEDIA.musicLabGestisceRiproduzione, true);
});

test('solo una fonte YouTube gia trovata diventa riferimento operativo per Music Lab', () => {
  const riferimenti = creaRiferimentiMusicLab([
    {
      fonte: 'apple_catalogo',
      idEsterno: '12345',
      indirizzo: 'https://music.apple.com/it/album/esempio/12345'
    },
    {
      fonte: 'musicbrainz',
      idEsterno: 'mb-recording-1',
      indirizzo: 'https://musicbrainz.org/recording/mb-recording-1'
    },
    {
      fonte: 'internet_archive',
      idEsterno: 'archive-item-1',
      indirizzo: 'https://archive.org/details/archive-item-1'
    },
    {
      fonte: 'youtube',
      idEsterno: 'abc123XYZ',
      indirizzo: 'https://www.youtube.com/watch?v=abc123XYZ',
      dataVerifica: '2026-09-25 20:00:00'
    }
  ]);

  assert.equal(riferimenti.length, 1);
  assert.deepEqual(riferimenti[0], {
    fonte: 'youtube',
    idEsterno: 'abc123XYZ',
    url: 'https://www.youtube.com/watch?v=abc123XYZ',
    tipoRisorsa: 'video_youtube',
    origine: 'scoperto_direttamente_da_cover_lab',
    dataVerifica: '2026-09-25 20:00:00'
  });
});

test('il riferimento YouTube puo essere ricavato dal link gia incontrato senza eseguire nuove ricerche', () => {
  const riferimenti = creaRiferimentiMusicLab([
    {
      fonte: 'youtube',
      indirizzo: 'https://youtu.be/Video987'
    }
  ]);

  assert.equal(riferimenti.length, 1);
  assert.equal(riferimenti[0].idEsterno, 'Video987');
  assert.equal(riferimenti[0].url, 'https://youtu.be/Video987');
});

test('Apple o altre fonti non generano mai un riferimento di riproduzione YouTube', () => {
  const versione = applicaPolicyMusicLab({
    id: 'versione-1',
    titolo: 'Esempio',
    interprete: 'Artista',
    fonti: [
      { fonte: 'apple_catalogo', idEsterno: '1', indirizzo: 'https://music.apple.com/esempio' },
      { fonte: 'web', indirizzo: 'https://example.com/esempio' }
    ]
  });

  assert.deepEqual(versione.riferimentiMusicLab, []);
  assert.equal(versione.fonti.length, 2);
});

test('la policy dichiarata vieta la ricerca YouTube supplementare solo per ottenere il video', () => {
  const policy = descriviPolicyFontiMedia();
  assert.equal(policy.youtube.puoEssereFonteDiScoperta, true);
  assert.equal(policy.youtube.ricercaSupplementareSoloPerTrovareIlVideo, false);
  assert.equal(policy.altreFonti.riferimentoDirettoPerRiproduzione, false);
  assert.equal(policy.riproduzione, 'gestita_da_music_lab');
});
