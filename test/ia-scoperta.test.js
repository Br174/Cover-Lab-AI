import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generaPianoScopertaConIA,
  interpretaRisultatiSorgenteConIA,
  estraiCandidatiDeterministici
} from '../src/fonti/ia-scoperta.js';

test('l IA genera strategie multi-fonte e mantiene i candidati come ipotesi', async () => {
  const env = {
    MODELLO_CLASSIFICAZIONE: 'modello-test',
    AI: {
      async run() {
        return {
          response: {
            strategie: [
              { provider: 'youtube', query: 'Sapore di sale cover', lingua: 'it', priorita: 95 },
              { provider: 'internet_archive', query: '"Sapore di sale" adaptation', priorita: 80 },
              { provider: 'non-ammesso', query: 'da scartare', priorita: 100 }
            ],
            candidati: [
              {
                titolo: 'Sapore di sale', interprete: 'Interprete X', anno: 1970,
                lingua: 'it', paese: 'IT', tipo: 'cover', affidabilita: 99
              }
            ],
            esaurita: false
          }
        };
      }
    }
  };

  const piano = await generaPianoScopertaConIA({
    titolo: 'Sapore di sale',
    artista: 'Gino Paoli',
    lingua: 'ita',
    strategieGiaUsate: [],
    candidatiGiaNoti: []
  }, env);

  assert.equal(piano.disponibile, true);
  assert.equal(piano.esaurita, false);
  assert.equal(piano.strategie.length, 2);
  assert.deepEqual(piano.strategie.map(s => s.provider), ['youtube', 'internet_archive']);
  assert.equal(piano.candidati.length, 1);
  assert.equal(piano.candidati[0].interprete, 'Interprete X');
  assert.equal(piano.candidati[0].affidabilita, 80, 'un ipotesi IA non puo superare 80 senza fonte');
});

test('la AI riceve prima una agenda di autointerrogazione e genera piste da confermare', async () => {
  let richiestaAI = null;
  const env = {
    MODELLO_CLASSIFICAZIONE: 'modello-test',
    AI: {
      async run(_modello, richiesta) {
        richiestaAI = richiesta;
        return {
          response: {
            domandeEsplorate: ['francia'],
            strategie: [
              { provider: 'cataloghi', query: 'Sapore di sale version francaise', lingua: 'fr', priorita: 95 }
            ],
            candidati: [
              { titolo: 'Titre francais', interprete: 'Interprete F', lingua: 'fr', tipo: 'adattamento', affidabilita: 70 }
            ],
            nuoveDomande: ['Chi ha scritto il testo francese?'],
            esaurita: true
          }
        };
      }
    }
  };

  const piano = await generaPianoScopertaConIA({
    titolo: 'Sapore di sale',
    artista: 'Gino Paoli',
    agenda: {
      domande: [
        {
          id: 'francia',
          domanda: 'Quali versioni francesi o francofone conosco, anche con titolo diverso?',
          obiettivo: 'versioni francesi'
        }
      ]
    }
  }, env);

  const sistema = richiestaAI?.messages?.[0]?.content || '';
  const input = JSON.parse(richiestaAI?.messages?.[1]?.content || '{}');
  assert.match(sistema, /PRIMA.*autointerrogarti/i);
  assert.equal(input.agendaAutointerrogazione.length, 1);
  assert.equal(input.agendaAutointerrogazione[0].id, 'francia');
  assert.deepEqual(piano.domandeEsplorate, ['francia']);
  assert.deepEqual(piano.nuoveDomande, ['Chi ha scritto il testo francese?']);
  assert.equal(piano.candidati[0].tipo, 'adattamento');
  assert.equal(piano.esaurita, true, 'esaurita vale solo per la singola agenda e sara interpretata dall orchestratore');
});

test('il parser del Regista recupera anche JSON racchiuso in blocchi markdown', async () => {
  const env = {
    MODELLO_CLASSIFICAZIONE: 'modello-test',
    AI: {
      async run() {
        return {
          response: '```json\n{"domandeEsplorate":["italia"],"strategie":[{"provider":"cataloghi","query":"Sapore di sale cover italiana","priorita":90}],"candidati":[{"titolo":"Sapore di sale","interprete":"Artista Z","tipo":"cover","affidabilita":60}],"nuoveDomande":["Esiste una pubblicazione su album?"],"esaurita":false}\n```'
        };
      }
    }
  };

  const piano = await generaPianoScopertaConIA({
    titolo: 'Sapore di sale', artista: 'Gino Paoli',
    agenda: { domande: [{ id: 'italia', domanda: 'Quali cover italiane?', obiettivo: 'Italia' }] }
  }, env);

  assert.equal(piano.errore, undefined);
  assert.equal(piano.strategie.length, 1);
  assert.equal(piano.candidati[0].interprete, 'Artista Z');
  assert.deepEqual(piano.domandeEsplorate, ['italia']);
});

test('il parser recupera JSON utile anche dentro wrapper annidati e testo extra', async () => {
  const env = {
    AI: {
      async run() {
        return {
          result: {
            output: [{ text: 'Nota interna ignorata. {"domandeEsplorate":["francia"],"strategie":[{"provider":"cataloghi","query":"Sapore di sale français adaptation","priorita":93}],"candidati":[],"nuoveDomande":[],"esaurita":false} testo finale' }]
          }
        };
      }
    }
  };
  const piano = await generaPianoScopertaConIA({
    titolo: 'Sapore di sale', artista: 'Gino Paoli',
    agenda: { domande: [{ id: 'francia', domanda: 'Versioni francesi?', obiettivo: 'Francia' }] }
  }, env);
  assert.match(piano.avviso || '', /NESSUN_CANDIDATO_SPECIFICO_RECUPERATO/);
  assert.equal(piano.strategie.length, 1);
  assert.equal(piano.strategie[0].provider, 'cataloghi');
  assert.deepEqual(piano.domandeEsplorate, ['francia']);
});

test('se la risposta AI non e interpretabile l agenda genera strategie ma nessun fatto certificato', async () => {
  const env = { AI: { async run() { return { response: 'testo non JSON e nessun fatto strutturato' }; } } };
  const piano = await generaPianoScopertaConIA({
    titolo: 'Sapore di sale', artista: 'Gino Paoli', lingua: 'ita',
    agenda: {
      domande: [
        { id: 'spagna_latam', domanda: 'Quali versioni spagnole?', obiettivo: 'versioni spagnole' },
        { id: 'francia', domanda: 'Quali versioni francesi?', obiettivo: 'versioni francesi' }
      ]
    }
  }, env);
  assert.equal(piano.recupero, 'fallback_agenda');
  assert.match(piano.avviso || '', /RISPOSTA_AI_NON_INTERPRETABILE/);
  assert.match(piano.avviso || '', /NESSUN_CANDIDATO_SPECIFICO_RECUPERATO/);
  assert.ok(piano.strategie.length >= 2);
  assert.equal(piano.candidati.length, 0, 'il fallback non inventa candidati');
  assert.deepEqual(piano.domandeEsplorate, ['spagna_latam', 'francia']);
});

test('l IA riconosce una corrispondenza reale e la marca come coerenza di fonte', async () => {
  const env = {
    MODELLO_CLASSIFICAZIONE: 'modello-test',
    AI: {
      async run() {
        return {
          response: {
            risultati: [
              {
                indice: 0, correlato: true, titolo: 'Sapore di sale',
                interprete: 'Artista Cover', anno: 1982, lingua: 'it',
                tipo: 'cover', affidabilita: 97, motivo: 'titolo, interprete e descrizione coerenti'
              },
              { indice: 1, correlato: false }
            ]
          }
        };
      }
    }
  };

  const elementi = [
    { titolo: 'Sapore di sale - cover', descrizione: 'cover di Gino Paoli', autoreCanale: 'A', idEsterno: 'v1' },
    { titolo: 'Video non correlato', descrizione: '', autoreCanale: 'B', idEsterno: 'v2' }
  ];
  const risultati = await interpretaRisultatiSorgenteConIA(
    { titolo: 'Sapore di sale', artista: 'Gino Paoli' },
    elementi,
    env
  );

  assert.equal(risultati.length, 1);
  assert.equal(risultati[0].indice, 0);
  assert.equal(risultati[0].interprete, 'Artista Cover');
  assert.equal(risultati[0].affidabilita, 90, 'il filtro di fonte puo esprimere una coerenza forte senza certificare da solo la memoria AI');
  assert.equal(risultati[0].coerenzaFonteAI, true);
});

test('il fallback deterministico crea solo una pista quando titolo coincide e interprete e diverso', async () => {
  const elementi = [
    {
      titolo: 'Sapore di sale', interprete: 'Jimmy Fontana',
      dataPubblicazione: '2001-01-01', idEsterno: 'a1'
    },
    {
      titolo: 'Sapore di sale', interprete: 'Gino Paoli',
      dataPubblicazione: '1964-01-01', idEsterno: 'a2'
    },
    { titolo: 'Un altro brano', interprete: 'Altro', idEsterno: 'a3' }
  ];

  const diretto = estraiCandidatiDeterministici(
    { titolo: 'Sapore di sale', artista: 'Gino Paoli' }, elementi
  );
  assert.equal(diretto.length, 1);
  assert.equal(diretto[0].interprete, 'Jimmy Fontana');
  assert.equal(diretto[0].tipo, 'dubbio');
  assert.ok(diretto[0].affidabilita < 90);

  const viaFiltro = await interpretaRisultatiSorgenteConIA(
    { titolo: 'Sapore di sale', artista: 'Gino Paoli' }, elementi, {}
  );
  assert.equal(viaFiltro.length, 1);
  assert.equal(viaFiltro[0].origineDeterministica, true);
});
