export const POLICY_FONTI_MEDIA = Object.freeze({
  coverLabRiproduceMedia: false,
  coverLabScaricaMedia: false,
  piattaformeSonoFontiDiDati: true,
  ricercaYouTubeAggiuntivaPerTrovareLaRiproduzione: false,
  passaRiferimentoDirettoSoloSeGiaTrovato: true,
  musicLabGestisceRiproduzione: true
});

function testo(valore) {
  return String(valore || '').trim();
}

function fonteNormalizzata(fonte) {
  return testo(fonte).toLowerCase().replace(/[\s-]+/g, '_');
}

function idYouTubeDaUrl(indirizzo) {
  const valore = testo(indirizzo);
  if (!valore) return null;
  try {
    const url = new URL(valore);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') return testo(url.pathname.split('/').filter(Boolean)[0]) || null;
    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const daQuery = testo(url.searchParams.get('v'));
      if (daQuery) return daQuery;
      const parti = url.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live'].includes(parti[0]) && parti[1]) return testo(parti[1]);
    }
  } catch {
    return null;
  }
  return null;
}

export function eFonteYouTube(fonte) {
  const nome = fonteNormalizzata(fonte?.fonte || fonte);
  return nome === 'youtube' || nome === 'youtube_music';
}

export function creaRiferimentiMusicLab(fonti = []) {
  const riferimenti = [];
  const visti = new Set();

  for (const fonte of Array.isArray(fonti) ? fonti : []) {
    if (!eFonteYouTube(fonte)) continue;

    const idEsterno = testo(fonte?.idEsterno || fonte?.id_esterno) || idYouTubeDaUrl(fonte?.indirizzo);
    const url = testo(fonte?.indirizzo) || (idEsterno ? `https://www.youtube.com/watch?v=${encodeURIComponent(idEsterno)}` : '');
    if (!idEsterno && !url) continue;

    const chiave = idEsterno ? `youtube:${idEsterno}` : `youtube-url:${url}`;
    if (visti.has(chiave)) continue;
    visti.add(chiave);

    riferimenti.push({
      fonte: 'youtube',
      idEsterno: idEsterno || null,
      url: url || null,
      tipoRisorsa: 'video_youtube',
      origine: 'scoperto_direttamente_da_cover_lab',
      dataVerifica: fonte?.dataVerifica || fonte?.data_verifica || null
    });
  }

  return riferimenti;
}

export function applicaPolicyMusicLab(versione = {}) {
  return {
    ...versione,
    riferimentiMusicLab: creaRiferimentiMusicLab(versione.fonti || [])
  };
}

export function descriviPolicyFontiMedia() {
  return {
    scopoCoverLab: 'raccogliere, verificare e strutturare dati sulle versioni musicali',
    riproduzione: 'gestita_da_music_lab',
    downloadMedia: 'non_previsto',
    usoPiattaforme: 'dati_metadati_e_prove',
    youtube: {
      puoEssereFonteDiScoperta: true,
      riferimentoDirettoAMusicLab: 'solo_se_cover_lab_lo_ha_gia_trovato_durante_la_scoperta',
      ricercaSupplementareSoloPerTrovareIlVideo: false
    },
    altreFonti: {
      riferimentoDirettoPerRiproduzione: false,
      comportamento: 'passa_dati_e_prove_a_music_lab_senza_cercare_apposta_un_video_youtube'
    }
  };
}
