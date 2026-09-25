import test from 'node:test';
import assert from 'node:assert/strict';
import { cercaVersioni } from '../src/motore/motore.js';

function rispostaJson(dati) {
  return { ok: true, status: 200, async json() { return dati; } };
}

test('flusso completo di una nuova composizione senza database', async () => {
  const richieste = [];
  const fetchFn = async (url) => {
    richieste.push(url);
    if (url.includes('/work/?query=')) {
      return rispostaJson({ works: [{ id: 'work-1', score: 100, title: 'Sapore di sale', language: 'ita' }] });
    }
    if (url.includes('/work/work-1?')) {
      return rispostaJson({
        id: 'work-1', title: 'Sapore di sale', language: 'ita',
        relations: [{ type: 'composer', artist: { name: 'Gino Paoli' } }]
      });
    }
    if (url.includes('/recording?work=work-1')) {
      return rispostaJson({
        'recording-count': 3,
        recordings: [
          {
            id: 'rec-originale', title: 'Sapore di sale',
            'artist-credit': [{ name: 'Gino Paoli' }], releases: [{ date: '1963' }],
            relations: [{ type: 'performance', work: { id: 'work-1' }, attributes: [] }]
          },
          {
            id: 'rec-cover', title: 'Sapore di sale',
            'artist-credit': [{ name: 'Interprete X' }], releases: [{ date: '1970' }],
            relations: [{ type: 'performance', work: { id: 'work-1' }, attributes: ['cover'] }]
          },
          {
            id: 'rec-live', title: 'Sapore di sale',
            'artist-credit': [{ name: 'Interprete Y' }], releases: [{ date: '1980' }],
            relations: [{ type: 'performance', work: { id: 'work-1' }, attributes: ['live'] }]
          }
        ]
      });
    }
    throw new Error(`URL inatteso: ${url}`);
  };

  const risultato = await cercaVersioni(
    { titolo: 'Sapore di sale', artista: 'Gino Paoli', ordine: 'asc' },
    { VERSIONE_MOTORE: '0.2.0' },
    { fetchFn }
  );

  assert.equal(risultato.stato, 'pronto');
  assert.equal(risultato.composizione.titolo, 'Sapore di sale');
  assert.equal(risultato.composizione.anno, 1963);
  assert.equal(risultato.composizione.metodoIndividuazione, 'opera per titolo e artista');
  assert.equal(risultato.versioniIndividuate, 3);
  assert.deepEqual(risultato.versioni.map(v => v.tipo), ['originale', 'cover', 'live']);
  assert.deepEqual(risultato.versioni.map(v => v.anno), [1963, 1970, 1980]);
  assert.equal(richieste.length, 3);
});

test('non si ferma alla prima registrazione priva di relazione con una opera', async () => {
  const richieste = [];
  const fetchFn = async (url) => {
    richieste.push(url);
    if (url.includes('/work/?query=') && url.includes('artist')) {
      return rispostaJson({ works: [] });
    }
    if (url.includes('/recording/?query=')) {
      return rispostaJson({ recordings: [
        { id: 'r1', score: 100, title: 'Brano', 'artist-credit': [{ name: 'Artista' }] },
        { id: 'r2', score: 100, title: 'Brano', 'artist-credit': [{ name: 'Artista' }] },
        { id: 'r3', score: 100, title: 'Brano', 'artist-credit': [{ name: 'Artista' }] }
      ] });
    }
    if (url.includes('/recording/r1?') || url.includes('/recording/r2?')) {
      const id = url.includes('/r1?') ? 'r1' : 'r2';
      return rispostaJson({ id, title: 'Brano', 'artist-credit': [{ name: 'Artista' }], releases: [{ date: '1970' }], relations: [] });
    }
    if (url.includes('/recording/r3?')) {
      return rispostaJson({
        id: 'r3', title: 'Brano', 'artist-credit': [{ name: 'Artista' }], releases: [{ date: '1968' }],
        relations: [{ type: 'performance', work: { id: 'w3', title: 'Brano' }, attributes: [] }]
      });
    }
    if (url.includes('/work/w3?')) {
      return rispostaJson({ id: 'w3', title: 'Brano', language: 'ita', relations: [{ type: 'composer', artist: { name: 'Autore' } }] });
    }
    if (url.includes('/recording?work=w3')) {
      return rispostaJson({
        'recording-count': 2,
        recordings: [
          { id: 'r3', title: 'Brano', 'artist-credit': [{ name: 'Artista' }], releases: [{ date: '1968' }], relations: [{ type: 'performance', work: { id: 'w3' }, attributes: [] }] },
          { id: 'c1', title: 'Brano', 'artist-credit': [{ name: 'Coverista' }], releases: [{ date: '1972' }], relations: [{ type: 'performance', work: { id: 'w3' }, attributes: ['cover'] }] }
        ]
      });
    }
    if (url.includes('/work/?query=')) return rispostaJson({ works: [] });
    throw new Error(`URL inatteso: ${url}`);
  };

  const risultato = await cercaVersioni(
    { titolo: 'Brano', artista: 'Artista' },
    { VERSIONE_MOTORE: '0.2.0' },
    { fetchFn }
  );

  assert.equal(risultato.stato, 'pronto');
  assert.equal(risultato.composizione.idMusicBrainz, 'w3');
  assert.equal(risultato.composizione.metodoIndividuazione, 'registrazione collegata a opera');
  assert.equal(risultato.composizione.anno, 1968);
  assert.equal(risultato.versioniIndividuate, 2);
  assert.ok(richieste.some(u => u.includes('/recording/r1?')));
  assert.ok(richieste.some(u => u.includes('/recording/r2?')));
  assert.ok(richieste.some(u => u.includes('/recording/r3?')));
});

test('riconosce e approfondisce una versione tradotta come adattamento', async () => {
  const fetchFn = async (url) => {
    if (url.includes('/work/?query=')) {
      return rispostaJson({ works: [{ id: 'work-base', score: 100, title: 'Canzone', language: 'ita' }] });
    }
    if (url.includes('/work/work-base?')) {
      return rispostaJson({
        id: 'work-base', title: 'Canzone', language: 'ita',
        relations: [
          { type: 'composer', artist: { name: 'Autore' } },
          { type: 'other version', direction: 'forward', attributes: ['translated'], work: { id: 'work-es', title: 'Canción' } }
        ]
      });
    }
    if (url.includes('/recording?work=work-base')) {
      return rispostaJson({
        'recording-count': 1,
        recordings: [{
          id: 'rec-originale', title: 'Canzone', 'artist-credit': [{ name: 'Artista A' }],
          releases: [{ date: '1965' }],
          relations: [{ type: 'performance', work: { id: 'work-base' }, attributes: [] }]
        }]
      });
    }
    if (url.includes('/work/work-es?')) {
      return rispostaJson({ id: 'work-es', title: 'Canción', language: 'spa', relations: [] });
    }
    if (url.includes('/recording?work=work-es')) {
      return rispostaJson({
        'recording-count': 1,
        recordings: [{
          id: 'rec-es', title: 'Canción', 'artist-credit': [{ name: 'Artista B' }],
          releases: [{ date: '1970' }],
          relations: [{ type: 'performance', work: { id: 'work-es' }, attributes: ['cover'] }]
        }]
      });
    }
    throw new Error(`URL inatteso: ${url}`);
  };

  const risultato = await cercaVersioni(
    { titolo: 'Canzone', artista: 'Artista A', ordine: 'asc', approfondisci: true },
    { VERSIONE_MOTORE: '0.2.0', MASSIMO_OPERE_DERIVATE_PER_GIRO: '2' },
    { fetchFn }
  );

  assert.equal(risultato.versioniIndividuate, 2);
  const adattamento = risultato.versioni.find(v => v.idMusicBrainz === 'rec-es');
  assert.ok(adattamento);
  assert.equal(adattamento.tipo, 'adattamento');
  assert.equal(adattamento.lingua, 'spa');
  assert.equal(risultato.opereDerivateIndividuate, 1);
  assert.equal(risultato.opereDerivateAnalizzate.length, 1);
});

test('se ci sono oltre 100 registrazioni espone il prossimo offset', async () => {
  const fetchFn = async (url) => {
    if (url.includes('/work/?query=')) return rispostaJson({ works: [{ id: 'w0', score: 100, title: 'Brano lungo', language: 'ita' }] });
    if (url.includes('/work/w0?')) return rispostaJson({ id: 'w0', title: 'Brano lungo', language: 'ita', relations: [] });
    if (url.includes('/recording?work=w0')) return rispostaJson({
      'recording-count': 240,
      recordings: Array.from({ length: 100 }, (_, i) => ({
        id: `r${i}`, title: 'Brano lungo', 'artist-credit': [{ name: i === 0 ? 'A' : `Interprete ${i}` }],
        releases: [{ date: String(1960 + (i % 50)) }],
        relations: [{ type: 'performance', work: { id: 'w0' }, attributes: i === 0 ? [] : ['cover'] }]
      }))
    });
    throw new Error(`URL inatteso: ${url}`);
  };
  const r = await cercaVersioni({ titolo: 'Brano lungo', artista: 'A' }, { VERSIONE_MOTORE: '0.2.0' }, { fetchFn });
  assert.equal(r.prossimoOffset, 100);
  assert.equal(r.analisiCompleta, false);
});
