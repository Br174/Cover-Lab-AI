package it.coverlab.ai

import android.app.Activity
import android.graphics.Typeface
import android.os.Bundle
import android.widget.*
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlin.concurrent.thread

class DiagnosticsActivity : Activity() {
    private lateinit var contenuto: LinearLayout
    private lateinit var stato: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val titolo = intent.getStringExtra("titolo").orEmpty()
        val artista = intent.getStringExtra("artista").orEmpty()
        setContentView(creaInterfaccia(titolo, artista))
        carica(titolo, artista)
    }

    private fun creaInterfaccia(titolo: String, artista: String): LinearLayout {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(16), dp(18), dp(12))
            setBackgroundColor(0xFFFFFFFF.toInt())
        }
        root.addView(TextView(this).apply {
            text = "Diagnostica motore"
            textSize = 25f
            setTypeface(typeface, Typeface.BOLD)
        })
        root.addView(TextView(this).apply {
            text = listOf(artista, titolo).filter { it.isNotBlank() }.joinToString(" — ")
            textSize = 14f
            setPadding(0, dp(3), 0, dp(8))
        })
        stato = TextView(this).apply {
            text = "Leggo fonti, strategie e contributi…"
            textSize = 13f
            setPadding(0, dp(4), 0, dp(8))
        }
        root.addView(stato)
        contenuto = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val scroll = ScrollView(this).apply { addView(contenuto) }
        root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        root.addView(Button(this).apply {
            text = "CHIUDI"
            setOnClickListener { finish() }
        }, LinearLayout.LayoutParams(-1, dp(50)))
        return root
    }

    private fun carica(titolo: String, artista: String) {
        if (titolo.isBlank()) {
            stato.text = "Eseguire prima una ricerca per aprire la diagnostica."
            return
        }
        thread {
            try {
                val base = BuildConfig.COVER_LAB_API_BASE.trimEnd('/')
                val url = "$base/api/diagnostica?titolo=${enc(titolo)}&artista=${enc(artista)}"
                val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 7000
                    readTimeout = 30000
                }
                val testo = (if (conn.responseCode in 200..299) conn.inputStream else conn.errorStream)
                    .bufferedReader().use { it.readText() }
                if (conn.responseCode !in 200..299) throw IllegalStateException("HTTP ${conn.responseCode}")
                val json = JSONObject(testo)
                runOnUiThread { mostra(json) }
            } catch (e: Exception) {
                runOnUiThread { stato.text = "Diagnostica non disponibile: ${e.message ?: "errore"}" }
            }
        }
    }

    private fun mostra(d: JSONObject) {
        contenuto.removeAllViews()
        stato.text = "Diagnostica aggiornata"

        val archivio = d.optJSONObject("archivio")
        sezione("ARCHIVIO CERTIFICATO")
        riga("Versioni archiviate", archivio?.optInt("archiviate", 0)?.toString() ?: "0")
        riga("Versioni ancora in verifica", archivio?.optInt("inVerifica", 0)?.toString() ?: "0")

        val regista = d.optJSONObject("registaAI")
        sezione("REGISTA AI")
        riga("Giri AI", regista?.optInt("giri", 0)?.toString() ?: "0")
        riga("Candidati totali", regista?.optInt("candidatiTotali", 0)?.toString() ?: "0")
        riga("Fonti totali", regista?.optInt("fontiTotali", 0)?.toString() ?: "0")
        val tracce = regista?.optJSONArray("tracce") ?: JSONArray()
        for (i in 0 until minOf(tracce.length(), 5)) {
            val t = tracce.optJSONObject(i) ?: continue
            val giro = t.optInt("giro")
            val agenda = t.optJSONArray("agenda")
            if (agenda != null && agenda.length() > 0) {
                riga("Agenda del Regista · giro $giro", listaTesto(agenda, 10))
            }
            val domande = t.optJSONArray("domandeEsplorate")
            if (domande != null && domande.length() > 0) {
                riga("Domande dichiarate esplorate · giro $giro", listaTesto(domande, 10))
            } else if (agenda != null && agenda.length() > 0) {
                testoSecondario("Giro $giro: l agenda e stata generata, ma il modello non ha dichiarato quali domande ha effettivamente esplorato.")
            }
            val nuove = t.optJSONArray("nuoveDomande")
            if (nuove != null && nuove.length() > 0) riga("Nuove piste", listaTesto(nuove, 10))
        }

        sezione("PROVIDER INTERROGATI")
        val provider = d.optJSONArray("provider") ?: JSONArray()
        if (provider.length() == 0) testoSecondario("Nessuna strategia provider registrata.")
        for (i in 0 until provider.length()) {
            val p = provider.optJSONObject(i) ?: continue
            val stati = p.optJSONObject("stati")?.toString() ?: "{}"
            riga(
                p.optString("provider", "fonte"),
                "query ${p.optInt("queryGenerate")} · pagine ${p.optInt("pagineAnalizzate")} · candidati ${p.optInt("candidatiTrovati")} · errori ${p.optInt("errori")} · stati $stati"
            )
        }

        sezione("SALUTE MOTORE")
        val salute = d.optJSONArray("saluteProvider") ?: JSONArray()
        if (salute.length() == 0) testoSecondario("Nessuno stato di salute provider registrato.")
        for (i in 0 until salute.length()) {
            val p = salute.optJSONObject(i) ?: continue
            val codice = p.opt("codiceUltimoErrore")?.toString()?.takeIf { it.isNotBlank() && it != "null" }
            val sospeso = p.optString("sospesoFino").takeIf { it.isNotBlank() && it != "null" }
            val ultimoErrore = p.optString("ultimoErrore").takeIf { it.isNotBlank() && it != "null" }
            val dettaglio = buildString {
                append("errori consecutivi ${p.optInt("erroriConsecutivi")} · chiamate ${p.optInt("chiamateTotali")} · risultati ${p.optInt("risultatiTotali")}")
                if (codice != null) append(" · HTTP $codice")
                if (sospeso != null) append("\nsospeso fino a $sospeso")
                if (ultimoErrore != null) append("\nultimo errore: $ultimoErrore")
            }
            riga("${p.optString("provider", "fonte")} · ${p.optString("stato", "sconosciuto")}", dettaglio)
        }

        sezione("LIMITI E REGOLE FONTI")
        val gestore = d.optJSONObject("gestoreLimitiRegole")
        val regole = gestore?.optJSONArray("regole") ?: JSONArray()
        if (regole.length() == 0) testoSecondario("Nessuna regola fonte disponibile.")
        for (i in 0 until regole.length()) {
            val r = regole.optJSONObject(i) ?: continue
            val sospeso = r.optString("sospesoFino").takeIf { it.isNotBlank() && it != "null" }
            val ultimoHttp = r.opt("ultimoHttp")?.toString()?.takeIf { it.isNotBlank() && it != "null" && it != "0" }
            val dettaglio = buildString {
                append(r.optString("limiteUfficiale", "limite non numerico documentato"))
                append("\nconcorrenza ${r.optInt("concorrenzaMassima", 1)} · intervallo minimo ${r.optInt("intervalloMinimoMs", 0)} ms")
                val quota = r.opt("quotaGiornaliera")?.toString()?.takeIf { it.isNotBlank() && it != "null" }
                if (quota != null) append(" · quota $quota/giorno")
                append("\npolicy verificata ${r.optString("verificatoIl", "non indicata")}")
                append(" · stato ${r.optString("statoSalute", "non interrogato")}")
                if (ultimoHttp != null) append(" · ultimo HTTP $ultimoHttp")
                if (sospeso != null) append("\nsospeso fino a $sospeso")
                if (r.optBoolean("richiedeRicontrolloPolicy", false)) append("\nRICONTROLLO POLICY RICHIESTO")
            }
            riga(r.optString("nome", r.optString("provider", "fonte")), dettaglio)
        }

        sezione("FONTI: CHI HA CONTRIBUITO DAVVERO")
        val fonti = d.optJSONArray("fonti") ?: JSONArray()
        if (fonti.length() == 0) testoSecondario("Nessun contributo ancora registrato.")
        for (i in 0 until fonti.length()) {
            val f = fonti.optJSONObject(i) ?: continue
            val badge = if (f.optBoolean("haContribuitoAllArchivio")) "CONTRIBUITO" else "SOLO RICERCA"
            riga(
                "${f.optString("fonte")} · $badge",
                "candidati ${f.optInt("candidatiSupportati")} · versioni confermate ${f.optInt("versioniConfermate")} · crediti ${f.optInt("creditiForniti")}"
            )
        }

        sezione("PROVE E INDIRIZZI")
        val prove = d.optJSONArray("prove") ?: JSONArray()
        if (prove.length() == 0) testoSecondario("Nessuna prova indicizzata.")
        for (i in 0 until minOf(prove.length(), 60)) {
            val p = prove.optJSONObject(i) ?: continue
            val indirizzo = p.optString("indirizzo").takeIf { it.isNotBlank() && it != "null" }
            val descrizione = buildString {
                append(p.optString("livello", "prova"))
                append(" · ")
                append(p.optString("interprete", ""))
                if (p.optString("titolo").isNotBlank()) append(" — ${p.optString("titolo")}")
                if (indirizzo != null) append("\n$indirizzo")
            }
            riga(p.optString("fonte", "fonte"), descrizione)
        }

        sezione("QUERY / STRATEGIE")
        val strategie = d.optJSONArray("strategie") ?: JSONArray()
        if (strategie.length() == 0) testoSecondario("Nessuna strategia registrata.")
        for (i in 0 until minOf(strategie.length(), 50)) {
            val s = strategie.optJSONObject(i) ?: continue
            val err = s.optString("ultimoErrore").takeIf { it.isNotBlank() && it != "null" }
            riga(
                s.optString("provider", "provider"),
                "${s.optString("query")}\nstato ${s.optString("stato")} · pagine ${s.optInt("pagineAnalizzate")} · candidati ${s.optInt("candidatiTrovati")}" + (err?.let { "\nerrore: $it" } ?: "")
            )
        }

        sezione("STATO CANDIDATI")
        val stati = d.optJSONArray("statiCandidati") ?: JSONArray()
        for (i in 0 until stati.length()) {
            val s = stati.optJSONObject(i) ?: continue
            riga(s.optString("stato"), s.optInt("totale").toString())
        }
    }

    private fun sezione(titolo: String) {
        contenuto.addView(TextView(this).apply {
            text = titolo
            textSize = 13f
            setTypeface(typeface, Typeface.BOLD)
            setPadding(0, dp(18), 0, dp(5))
        })
    }

    private fun riga(titolo: String, valore: String) {
        contenuto.addView(TextView(this).apply {
            text = "$titolo\n$valore"
            textSize = 13f
            setPadding(0, dp(7), 0, dp(7))
        })
    }

    private fun testoSecondario(t: String) {
        contenuto.addView(TextView(this).apply {
            text = t
            textSize = 12f
            setPadding(0, dp(5), 0, dp(5))
        })
    }

    private fun listaTesto(a: JSONArray, max: Int): String {
        val out = mutableListOf<String>()
        for (i in 0 until minOf(a.length(), max)) {
            val v = a.opt(i)
            out += when (v) {
                is JSONObject -> v.optString("domanda", v.optString("query", v.toString()))
                else -> v?.toString().orEmpty()
            }
        }
        return out.filter { it.isNotBlank() }.joinToString(" · ")
    }

    private fun enc(v: String): String = URLEncoder.encode(v, "UTF-8")
    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}