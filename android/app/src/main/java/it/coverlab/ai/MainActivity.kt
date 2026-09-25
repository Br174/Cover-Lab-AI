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
    private lateinit var titolo: EditText
    private lateinit var artista: EditText
    private lateinit var cerca: Button
    private lateinit var cercaAncora: Button
    private lateinit var stato: TextView
    private lateinit var riepilogo: TextView
    private lateinit var elenco: LinearLayout
    private lateinit var ordine: Spinner
    private lateinit var soloAltreLingue: CheckBox
    private var ultimoRisultato: JSONObject? = null
    private var prossimoOffset: Int? = null

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
            text = "Trova e ordina le diverse versioni di una composizione"
            textSize = 14f
            setPadding(0, dp(4), 0, dp(18))
        })

        titolo = EditText(this).apply {
            hint = "Titolo del brano"
            setSingleLine(true)
        }
        artista = EditText(this).apply {
            hint = "Artista originale"
            setSingleLine(true)
        }
        radice.addView(titolo, larghezzaPiena())
        radice.addView(artista, larghezzaPiena())

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
            text = "CERCA"
            setOnClickListener { avviaRicerca(false, false) }
        }
        controlli.addView(ordine, LinearLayout.LayoutParams(0, dp(52), 1f))
        controlli.addView(cerca, LinearLayout.LayoutParams(dp(120), dp(52)))
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
            text = "CERCA ANCORA"
            visibility = View.GONE
            setOnClickListener { avviaRicerca(false, true) }
        }
        radice.addView(cercaAncora, larghezzaPiena())
        return radice
    }

    private fun avviaRicerca(approfondita: Boolean, continuazione: Boolean) {
        val t = titolo.text.toString().trim()
        val a = artista.text.toString().trim()
        if (t.isEmpty() || a.isEmpty()) {
            Toast.makeText(this, "Inserire titolo e artista.", Toast.LENGTH_SHORT).show()
            return
        }

        if (!approfondita && !continuazione) {
            caricaDallaMemoria(t, a)?.let {
                ultimoRisultato = it
                mostraRisultato(it, "Dalla memoria del telefono")
            }
        }

        cerca.isEnabled = false
        cercaAncora.isEnabled = false
        stato.text = when {
            continuazione -> "Cerco altre versioni…"
            approfondita -> "Cerco versioni straniere e adattamenti…"
            else -> "Ricerca in corso…"
        }
        if (!approfondita && !continuazione && ultimoRisultato == null) {
            riepilogo.text = ""
            elenco.removeAllViews()
        }

        val percorso = when {
            continuazione -> "/api/cerca-ancora"
            approfondita -> "/api/approfondisci"
            else -> "/api/ricerca"
        }
        val corpo = JSONObject().apply {
            put("titolo", t)
            put("artista", a)
            put("ordine", if (ordine.selectedItemPosition == 1) "desc" else "asc")
            if (continuazione) put("offset", prossimoOffset ?: 100)
        }

        thread {
            try {
                val risposta = chiamaMotore(percorso, corpo)
                runOnUiThread {
                    cerca.isEnabled = true
                    cercaAncora.isEnabled = true
                    ultimoRisultato = risposta
                    salvaNellaMemoria(t, a, risposta)
                    mostraRisultato(risposta)
                    if (!approfondita && !continuazione && risposta.optBoolean("approfondimentoDisponibile")) {
                        avviaRicerca(true, false)
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    cerca.isEnabled = true
                    cercaAncora.isEnabled = true
                    if (ultimoRisultato == null) stato.text = "Ricerca non completata. ${e.message ?: "Errore non specificato"}"
                    else stato.text = "Mostro i risultati già disponibili. Aggiornamento non completato."
                }
            }
        }
    }

    private fun chiamaMotore(percorso: String, corpo: JSONObject): JSONObject {
        val base = BuildConfig.COVER_LAB_API_BASE.trimEnd('/')
        if (base.contains("DA_CONFIGURARE")) {
            throw IllegalStateException("Il collegamento Cloudflare non è ancora configurato.")
        }
        val conn = (URL(base + percorso).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 3500
            readTimeout = 7000
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }
        conn.outputStream.use { it.write(corpo.toString().toByteArray(Charsets.UTF_8)) }
        val testo = (if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream)
            .bufferedReader().use { it.readText() }
        if (conn.responseCode !in 200..299) throw IllegalStateException(JSONObject(testo).optString("messaggio", "Errore del servizio"))
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
        stato.text = statoForzato ?: "${if (risposta.optString("provenienza").contains("memoria")) "Dalla memoria dei risultati" else "Risultato aggiornato"} · ${durata} ms"
        riepilogo.text = "${risposta.optInt("versioniIndividuate", versioni.length())} versioni individuate"
        elenco.removeAllViews()

        if (visualizzate.isEmpty()) {
            elenco.addView(TextView(this).apply {
                text = if (soloAltreLingue.isChecked) "Nessuna versione in altra lingua ancora individuata." else "Nessuna versione individuata."
                setPadding(0, dp(12), 0, dp(12))
            })
            return
        }

        visualizzate.forEach { v -> elenco.addView(creaRiga(v)) }
    }

    private fun creaRiga(v: JSONObject): View {
        val riga = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(11), 0, dp(11))
            setBackgroundResource(android.R.drawable.divider_horizontal_bright)
        }
        val anno = if (v.isNull("anno")) "Anno non disponibile" else v.optInt("anno").toString()
        val tipo = v.optString("tipo", "dubbio")
        val lingua = v.optString("lingua").takeIf { it.isNotBlank() && it != "null" } ?: "lingua non indicata"
        val affidabilita = v.optInt("affidabilita", 0)

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
            text = "$anno · $tipo · $lingua · affidabilità $affidabilita%"
            textSize = 13f
        })
        return riga
    }

    private fun chiaveMemoria(t: String, a: String): String =
        (t.trim() + "::" + a.trim() + "::" + ordine.selectedItemPosition)
            .lowercase(Locale.ITALIAN)
            .replace(Regex("[^a-z0-9àèéìòù: ]"), "")
            .take(180)

    private fun salvaNellaMemoria(t: String, a: String, risposta: JSONObject) {
        getSharedPreferences("risultati", MODE_PRIVATE)
            .edit()
            .putString(chiaveMemoria(t, a), risposta.toString())
            .apply()
    }

    private fun caricaDallaMemoria(t: String, a: String): JSONObject? {
        val testo = getSharedPreferences("risultati", MODE_PRIVATE).getString(chiaveMemoria(t, a), null) ?: return null
        return try { JSONObject(testo) } catch (_: Exception) { null }
    }

    private fun larghezzaPiena() = LinearLayout.LayoutParams(-1, -2)
    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}
