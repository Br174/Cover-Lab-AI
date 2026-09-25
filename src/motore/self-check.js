function percentuale(parte, totale) {
  if (!totale) return 0;
  return Math.round((parte / totale) * 100);
}

function fontiVersione(versione = {}) {
  return new Set(
    (versione.fonti || [])
      .map(f => String(f?.fonte || '').trim().toLowerCase())
      .filter(Boolean)
  );
}

export function analizzaQualitaRisultato(risultato = {}) {
  const versioni = Array.isArray(risultato.versioni) ? risultato.versioni : [];
  const anomalie = [];
  let richiedeApprofondimento = false;

  if (risultato.stato === 'ricerca_incompleta') {
    anomalie.push({ codice: 'ricerca_incompleta', gravita: 'alta' });
    richiedeApprofondimento = true;
  }

  if (risultato.stato === 'pronto' && versioni.length === 0) {
    anomalie.push({ codice: 'zero_versioni_da_non_considerare_definitivo', gravita: 'alta' });
    richiedeApprofondimento = true;
  }

  if (Number.isFinite(Number(risultato.versioniIndividuate)) &&
      Number(risultato.versioniIndividuate) !== versioni.length) {
    anomalie.push({
      codice: 'conteggio_risposta_non_coerente',
      gravita: 'media',
      dichiarate: Number(risultato.versioniIndividuate),
      presenti: versioni.length
    });
  }

  if (versioni.length) {
    const senzaAnno = versioni.filter(v => v?.anno == null).length;
    const senzaLingua = versioni.filter(v => !v?.lingua).length;
    const senzaInterprete = versioni.filter(v => !String(v?.interprete || '').trim()).length;
    const conConflitti = versioni.filter(v => v?.haConflitti === true || Number(v?.conflittiAperti || 0) > 0).length;
    const probabiliDuplicati = versioni.filter(v => Array.isArray(v?.possibiliDuplicati) && v.possibiliDuplicati.length > 0).length;

    if (senzaInterprete > 0) {
      anomalie.push({ codice: 'interprete_mancante', gravita: 'alta', quantita: senzaInterprete });
      richiedeApprofondimento = true;
    }
    if (percentuale(senzaAnno, versioni.length) >= 60 && versioni.length >= 3) {
      anomalie.push({ codice: 'anni_spesso_mancanti', gravita: 'bassa', percentuale: percentuale(senzaAnno, versioni.length) });
    }
    if (percentuale(senzaLingua, versioni.length) >= 70 && versioni.length >= 3) {
      anomalie.push({ codice: 'lingue_spesso_mancanti', gravita: 'bassa', percentuale: percentuale(senzaLingua, versioni.length) });
    }
    if (conConflitti > 0) {
      anomalie.push({ codice: 'dati_in_indagine', gravita: 'media', quantita: conConflitti });
      richiedeApprofondimento = true;
    }
    if (probabiliDuplicati > 0) {
      anomalie.push({ codice: 'probabili_duplicati_da_verificare', gravita: 'bassa', quantita: probabiliDuplicati });
    }

    const tutteLeFonti = versioni.map(fontiVersione);
    const conFonti = tutteLeFonti.filter(s => s.size > 0);
    if (versioni.length >= 5 && conFonti.length === versioni.length) {
      const unione = new Set();
      for (const s of conFonti) for (const f of s) unione.add(f);
      if (unione.size === 1) {
        anomalie.push({
          codice: 'copertura_monofonte',
          gravita: 'media',
          fonte: [...unione][0]
        });
        richiedeApprofondimento = true;
      }
    }
  }

  return {
    stato: anomalie.length ? 'attenzione' : 'ok',
    anomalie,
    richiedeApprofondimento,
    versioniControllate: versioni.length
  };
}

export function applicaAutocontrollo(risultato = {}) {
  const autocontrollo = analizzaQualitaRisultato(risultato);
  return {
    ...risultato,
    autocontrollo,
    ricercaMultifonteNecessaria:
      risultato.ricercaMultifonteNecessaria === true || autocontrollo.richiedeApprofondimento
  };
}
