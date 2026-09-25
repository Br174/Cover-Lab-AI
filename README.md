# Cover Lab AI

Cover Lab AI è un progetto autonomo che individua, classifica e cataloga le diverse versioni di una composizione musicale. Restituisce dati strutturati; non riproduce musica, non apre video e non duplica le funzioni di Music Lab.

## Principi

- interfaccia e messaggi in italiano;
- inglesismi musicali ammessi: cover, live, remix, karaoke;
- risposta rapida: i risultati già noti arrivano dalla memoria dei risultati; una nuova ricerca punta a un primo risultato utile in circa 3–5 secondi;
- ricerca progressiva: primo blocco rapido, approfondimento delle versioni straniere/adattate, poi eventuale “Cerca ancora”;
- database progressivo: ciò che è già stato analizzato non viene ricalcolato inutilmente;
- separazione completa da Music Lab; Music Lab interrogherà questa API in seguito;
- infrastruttura prevista: Cloudflare Workers + D1 + Workers AI nel piano gratuito;
- fonti esterne modulari: MusicBrainz è la prima fonte tecnica e non viene considerata un catalogo completo;
- l'IA viene usata come secondo verificatore soprattutto per i casi dubbi, non per reinventare dati già affidabili.

## Versione motore 0.2

### Ricerca rapida
`POST /api/ricerca`

```json
{
  "titolo": "Sapore di sale",
  "artista": "Gino Paoli",
  "ordine": "asc"
}
```

Restituisce il primo nucleo di versioni e segnala se esistono opere derivate/adattate da approfondire.

### Approfondimento versioni straniere
`POST /api/approfondisci`

Usa le relazioni tra opere per individuare traduzioni/adattamenti e sottopone all'IA soltanto i candidati incerti.

### Cerca ancora
`POST /api/cerca-ancora`

```json
{
  "titolo": "Sapore di sale",
  "artista": "Gino Paoli",
  "ordine": "asc",
  "offset": 100
}
```

Continua la scansione senza ripartire da zero.

### Stato
`GET /stato`

## Struttura

- `src/fonti/`: fonti pubbliche intercambiabili;
- `src/motore/`: normalizzazione, classificazione, deduplicazione, verifica IA;
- `src/dati/`: accesso al database D1;
- `migrations/`: schema SQL e successive evoluzioni;
- `test/`: controlli automatici;
- `test/benchmark/`: campioni musicali reali per misurare la copertura;
- `android/`: app laboratorio Android in Kotlin.

## Android

L'app laboratorio contiene:
- titolo e artista;
- ordinamento cronologico crescente/decrescente;
- memoria locale dei risultati già visualizzati;
- filtro versioni in altre lingue;
- approfondimento automatico delle versioni straniere;
- comando “Cerca ancora” quando esistono altri blocchi.

Non contiene player, ricerca video o funzioni di Music Lab.

## Configurazione Cloudflare

1. `npm install`
2. `npm run db:crea` — crea `cover-lab-ai-db` in Europa occidentale e inserisce automaticamente l'identificativo in Wrangler.
3. `npm run db:migra`
4. `npm run pubblica`

La creazione D1 richiede che Wrangler sia autenticato sull'account Cloudflare.

## Stato corrente

- motore 0.2 pronto localmente;
- 17 test automatici superati;
- riconoscimento opere derivate/tradotte predisposto;
- Workers AI predisposto come verificatore dei casi dubbi;
- database D1 con migrazione per opere collegate e traduzioni;
- app Android laboratorio predisposta in Kotlin;
- benchmark iniziale “Sapore di sale” predisposto;
- pubblicazione Cloudflare e compilazione APK non ancora eseguite perché manca ancora il collegamento operativo al nuovo Worker/repository del progetto.
