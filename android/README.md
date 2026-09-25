# Cover Lab AI - Android

App laboratorio autonoma. Non riproduce musica e non apre video.

Funzioni iniziali:
- titolo + artista;
- ricerca rapida;
- memoria locale dei risultati già visti;
- risultati cronologici, vecchi→nuovi oppure nuovi→vecchi;
- filtro versioni in altre lingue;
- approfondimento automatico delle opere derivate/tradotte dopo il primo risultato;
- pulsante “CERCA ANCORA” solo quando esistono ulteriori blocchi da analizzare;
- testi dell'interfaccia in italiano, salvo gli inglesismi musicali concordati.

Il valore `COVER_LAB_API_BASE` in `app/build.gradle.kts` viene sostituito con l'indirizzo Worker Cloudflare dopo la prima pubblicazione.

Configurazione Android: AGP 9.4.1, compileSdk 37, targetSdk 36, minSdk 23. L'app resta compatibile con Android 11.
