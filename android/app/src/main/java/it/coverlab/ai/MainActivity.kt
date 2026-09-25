package it.coverlab.ai

import android.app.Activity
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import kotlin.concurrent.thread

class MainActivity : Activity() {
    private lateinit var ricerca: EditText
    private lateinit var cerca: Button
    private lateinit var cercaAncora: Button
    private lateinit var stato: TextView
    private lateinit var riepilogo: TextView
    private lateinit var elenco: LinearLayout
    private lateinit var ordine: Spinner
    private lateinit var soloAltreLingue: CheckBox
    private var ultimoRisultato: JSONObject? = null
    private var prossimoOffset: Int? = null
    private var titoloRisolto: String? = null
    private var artistaRisolto: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(creaInterfaccia())
    }

    private fun creaInterfaccia(): View {
        val radice = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(18), dp(20), dp(12))
            setBackgroundColor(0xFFFFFFFF.toInt())
        }

        radice.addView(TextView(this).apply {
            text = "Cover Lab AI"
            textSize = 28f
            setTypeface(typeface, Typeface.BOLD)
        })
        radice.addView(TextView(this).apply {
            text = "Prova il motore: cerca una composizione e visualizza le versioni individuate"
            textSize = 14f
            setPadding(0, dp(4), 0, dp(18))
        })

        ricerca = EditText(this).apply {
            hint = "Titolo, artista, anno…"
            setSingleLine(true)
        }
        radice.addView(ricerca, larghezzaPiena())

        val controlli = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        ordine = Spinner(this).apply {
            adapter = ArrayAdapter(
                this@MainActivity,
                android.R.layout.simple_spinner_dropdown_item,
                listOf("Più vecchie prima", "Più nuove prima")
            )
        }
        cerca = Button(this).apply {
            text = "CERCA COVER"
            setOnClickListener { avviaRicerca(false) }
        }
        controlli.addView(ordine, LinearLayout.LayoutParams(0, dp(52), 1f))
        controlli.addView(cerca, LinearLayout.LayoutParams(dp(150), dp(52)))
        radice.addView(controlli, larghezzaPiena())

        soloAltreLingue = CheckBox(this).apply {
            text = "Mostra solo versioni in altre lingue"
            setOnCheckedChangeListener { _, _ -> ultimoRisultato?.let { mostraRisultato(it) } }
        }
        radice.addView(soloAltreLingue)

        stato = TextView(this).apply {
            textSize = 13f
            setPadding(0, dp(8), 0, dp(8))
        }
        riepilogo = TextView(this).apply {
            textSize = 17f
            setTypeface(typeface, Typeface.BOLD)
            setPadding(0, dp(4), 0, dp(8))
        }
        radice.addView(stato)
        radice.addView(riepilogo)

        elenco = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val scorrimento = ScrollView(this).apply { addView(elenco) }
        radice.addView(scorrimento, LinearLayout.LayoutParams(-1, 0, 1f))

        cercaAncora = Button(this).apply {
            text = "CERCA ALTRE VERSIONI"
            visibility = View.GONE
            setOnClickListener { avviaRicerca(true) }
        }
        radice.addView(cercaAncora, larghezzaPiena())
        return radice
    }

    private fun avviaRicerca(continuazione: Boolean) {
        val q = ricerca.text.toString().trim()
        if (!continuazione && q.isEmpty()) {
            Toast.makeText(this, "Scrivere un titolo, un artista o altri dati del brano.", Toast.LENGTH_SHORT).show()
            return
        }
        if (continuazione && (titoloRisolto.isNullOrBlank() || artistaRisolto.isNullOrBlank())) {
            Toast.makeText(this, "Prima eseguire una ricerca.", Toast.LENGTH_SHORT).show()
            return
        }

        if (!continuazione) {
            titoloRisolto = null
            artistaRisolto = null
            caricaDallaMemoria(q)?.let {
                ultimoRisultato = it
                aggiornaIdentitaRisolta(it)
                mostraRisultato(it, "Dalla memoria del telefono")
            }
        }

        cerca.isEnabled = false
        cercaAncora.isEnabled = false
        stato.text = if (continuazione) "Cerco altre versioni…" else "Interpreto la richiesta e cerco le cover…"
        if (!continuazione && ultimoRisultato == null) {
            riepilogo.text = ""
            elenco.removeAllViews()
        }

        val percorso = if (continuazione) "/api/cerca-ancora" else "/api/ricerca-libera"
        val corpo = JSONObject().apply {
            put("ordine", if (ordine.selectedItemPosition == 1) "desc" else "asc")
            if (continuazione) {
                put("titolo", titoloRisolto)
                put("artista", artistaRisolto)
                put("offset", prossimoOffset ?: 100)
            } else {
                put("query", q)
            }
        }

        thread {
            try {
                val risposta = chiamaMotore(percorso, corpo)
                runOnUiThread {
                    cerca.isEnabled = true
                    cercaAncora.isEnabled = true
                    ultimoRisultato = risposta
                    aggiornaIdentitaRisolta(risposta)
                    if (!continuazione) salvaNellaMemoria(q, risposta)
                    mostraRisultato(risposta)
                }
            } catch (e: Exception) {
                runOnUiThread {
                    cerca.isEnabled = true
                    cercaAncora.isEnabled = true
                    if (ultimoRisultato == null) {
                        stato.text = "Ricerca non completata. ${e.message ?: "Errore non specificato"}"
                    } else {
                        stato.text = "Mostro i risultati già disponibili. Aggiornamento non completato."
                    }
                }
            }
        }
    }

    private fun aggiornaIdentitaRisolta(risposta: JSONObject) {
        val composizione = risposta.optJSONObject("composizione") ?: return
        titoloRisolto = composizione.optString("titolo").takeIf { it.isNotBlank() && it != "null" }
        artistaRisolto = composizione.optString("artista").takeIf { it.isNotBlank() && it != "null" }
    }

    private fun chiamaMotore(percorso: String, corpo: JSONObject): JSONObject {
        val base = BuildConfig.COVER_LAB_API_BASE.trimEnd('/')
        if (base.contains("DA_CONFIGURARE")) {
            throw IllegalStateException("Il collegamento Cloudflare non è ancora configurato.")
        }
        val conn = (URL(base + percorso).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 4000
            readTimeout = 12000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }
        conn.outputStream.use { it.write(corpo.toString().toByteArray(Charsets.UTF_8)) }
        val testo = (if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream)
            .bufferedReader().use { it.readText() }
        if (conn.responseCode !in 200..299) {
            val errore = try { JSONObject(testo).optString("messaggio", "Errore del servizio") } catch (_: Exception) { "Errore del servizio" }
            throw IllegalStateException(errore)
        }
        return JSONObject(testo)
    }

    private fun mostraRisultato(risposta: JSONObject, statoForzato: String? = null) {
        val composizione = risposta.optJSONObject("composizione")
        val linguaOriginale = composizione?.optString("lingua")?.takeIf { it.isNotBlank() && it != "null" }
        val versioni = risposta.optJSONArray("versioni") ?: JSONArray()
        val visualizzate = mutableListOf<JSONObject>()
        for (i in 0 until versioni.length()) {
            val v = versioni.optJSONObject(i) ?: continue
            val lingua = v.optString("lingua").takeIf { it.isNotBlank() && it != "null" }
            if (soloAltreLingue.isChecked && (linguaOriginale == null || lingua == null || lingua == linguaOriginale)) continue
            visualizzate += v
        }

        prossimoOffset = if (risposta.has("prossimoOffset") && !risposta.isNull("prossimoOffset")) risposta.optInt("prossimoOffset") else null
        cercaAncora.visibility = if (prossimoOffset != null) View.VISIBLE else View.GONE

        val durata = risposta.optLong("durataMs", 0)
        val interpretazione = risposta.optJSONObject("ricercaLibera")?.optJSONObject("interpretazione")
        val metodo = interpretazione?.optString("metodo")?.takeIf { it.isNotBlank() }
        stato.text = statoForzato ?: buildString {
            append(if (risposta.optString("provenienza").contains("memoria")) "Dalla memoria dei risultati" else "Risultato aggiornato")
            if (durata > 0) append(" · ${durata} ms")
            if (metodo != null) append(" · richiesta interpretata")
        }
        riepilogo.text = "${risposta.optInt("versioniIndividuate", versioni.length())} versioni individuate"
        elenco.removeAllViews()

        if (composizione != null) elenco.addView(creaOriginale(composizione))

        if (visualizzate.isEmpty()) {
            elenco.addView(TextView(this).apply {
                text = if (soloAltreLingue.isChecked) "Nessuna versione in altra lingua ancora individuata." else "Nessuna cover ancora individuata."
                setPadding(0, dp(12), 0, dp(12))
            })
            return
        }

        visualizzate.forEach { v -> elenco.addView(creaRiga(v)) }
    }

    private fun creaOriginale(c: JSONObject): View {
        val blocco = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(10), 0, dp(14))
        }
        blocco.addView(TextView(this).apply {
            text = "ORIGINALE"
            textSize = 12f
            setTypeface(typeface, Typeface.BOLD)
        })
        blocco.addView(TextView(this).apply {
            text = c.optString("artista", "Artista non indicato")
            textSize = 18f
            setTypeface(typeface, Typeface.BOLD)
        })
        blocco.addView(TextView(this).apply {
            text = c.optString("titolo", "Titolo non indicato")
            textSize = 16f
        })
        val dettagli = mutableListOf<String>()
        if (!c.isNull("anno")) dettagli += c.optInt("anno").toString()
        c.optString("lingua").takeIf { it.isNotBlank() && it != "null" }?.let { dettagli += "lingua $it" }
        c.optString("compositore").takeIf { it.isNotBlank() && it != "null" }?.let { dettagli += "autore $it" }
        if (dettagli.isNotEmpty()) blocco.addView(TextView(this).apply {
            text = dettagli.joinToString(" · ")
            textSize = 13f
        })
        return blocco
    }

    private fun creaRiga(v: JSONObject): View {
        val riga = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(11), 0, dp(11))
            setBackgroundResource(android.R.drawable.divider_horizontal_bright)
        }
        val anno = if (v.isNull("anno")) "Anno non disponibile" else v.optInt("anno").toString()
        val tipo = v.optString("tipo", "da verificare")
        val lingua = v.optString("lingua").takeIf { it.isNotBlank() && it != "null" } ?: "lingua non indicata"
        val paese = v.optString("paese").takeIf { it.isNotBlank() && it != "null" }
        val affidabilita = v.optInt("affidabilita", v.optInt("confidenza", 0))
        val statoVerifica = v.optString("statoVerifica").takeIf { it.isNotBlank() && it != "null" }

        riga.addView(TextView(this).apply {
            text = v.optString("interprete", "Interprete non indicato")
            textSize = 17f
            setTypeface(typeface, Typeface.BOLD)
        })
        riga.addView(TextView(this).apply {
            text = v.optString("titolo", "Titolo non indicato")
            textSize = 15f
        })
        riga.addView(TextView(this).apply {
            val parti = mutableListOf(anno, tipo, lingua, "affidabilità $affidabilita%")
            if (paese != null) parti += paese
            text = parti.joinToString(" · ")
            textSize = 13f
        })
        if (statoVerifica != null) riga.addView(TextView(this).apply {
            text = "Verifica: ${statoVerifica.replace('_', ' ')}"
            textSize = 12f
        })

        val fonti = v.optJSONArray("fonti")
        if (fonti != null && fonti.length() > 0) {
            val nomi = mutableListOf<String>()
            for (i in 0 until fonti.length()) {
                val nome = fonti.optJSONObject(i)?.optString("fonte")?.takeIf { it.isNotBlank() }
                if (nome != null && !nomi.contains(nome)) nomi += nome
            }
            if (nomi.isNotEmpty()) riga.addView(TextView(this).apply {
                text = "Fonti: ${nomi.joinToString(", ")}"
                textSize = 12f
            })
        }
        return riga
    }

    private fun chiaveMemoria(query: String): String =
        (query.trim() + "::" + ordine.selectedItemPosition)
            .lowercase(Locale.ITALIAN)
            .replace(Regex("[^a-z0-9àèéìòù: ]"), "")
            .take(180)

    private fun salvaNellaMemoria(query: String, risposta: JSONObject) {
        getSharedPreferences("risultati", MODE_PRIVATE)
            .edit()
            .putString(chiaveMemoria(query), risposta.toString())
            .apply()
    }

    private fun caricaDallaMemoria(query: String): JSONObject? {
        val testo = getSharedPreferences("risultati", MODE_PRIVATE).getString(chiaveMemoria(query), null) ?: return null
        return try { JSONObject(testo) } catch (_: Exception) { null }
    }

    private fun larghezzaPiena() = LinearLayout.LayoutParams(-1, -2)
    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}
