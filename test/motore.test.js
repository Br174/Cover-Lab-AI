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
    if (url.includes('/recording/?query=')) {
      return rispostaJson({ recordings: [{ id: 'rec-originale', score: 100 }] });
    }
    if (url.includes('/recording/rec-originale?')) {
      return rispostaJson({
        id: 'rec-originale',
        title: 'Sapore di sale',
        'artist-credit': [{ name: 'Gino Paoli' }],
        releases: [{ date: '1963-06-01' }],
        relations: [{ type: 'performance', work: { id: 'work-1', title: 'Sapore di sale' }, attributes: [] }]
      });
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
    { VERSIONE_MOTORE: '0.1.0' },
    { fetchFn }
  );

  assert.equal(risultato.stato, 'pronto');
  assert.equal(risultato.composizione.titolo, 'Sapore di sale');
  assert.equal(risultato.versioniIndividuate, 3);
  assert.deepEqual(risultato.versioni.map(v => v.tipo), ['originale', 'cover', 'live']);
  assert.deepEqual(risultato.versioni.map(v => v.anno), [1963, 1970, 1980]);
  assert.equal(richieste.length, 4);
});

test('riconosce e approfondisce una versione tradotta come adattamento', async () => {
  const fetchFn = async (url) => {
    if (url.includes('/recording/?query=')) {
      return rispostaJson({ recordings: [{ id: 'rec-originale', score: 100 }] });
    }
    if (url.includes('/recording/rec-originale?')) {
      return rispostaJson({
        id: 'rec-originale', title: 'Canzone', 'artist-credit': [{ name: 'Artista A' }],
        releases: [{ date: '1965' }],
        relations: [{ type: 'performance', work: { id: 'work-base', title: 'Canzone' }, attributes: [] }]
      });
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
    if (url.includes('/recording/?query=')) return rispostaJson({ recordings: [{ id: 'r0', score: 100 }] });
    if (url.includes('/recording/r0?')) return rispostaJson({
      id: 'r0', title: 'Brano lungo', 'artist-credit': [{ name: 'A' }], releases: [{ date: '1960' }],
      relations: [{ type: 'performance', work: { id: 'w0' }, attributes: [] }]
    });
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
