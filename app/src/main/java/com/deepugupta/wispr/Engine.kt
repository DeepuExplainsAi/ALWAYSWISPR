/*
 * Wispr by Deepu Gupta
 * Copyright (c) 2026 Deepu Gupta. All rights reserved.
 * Proprietary software. Unauthorised copying, modification, re-branding or redistribution is prohibited.
 */
package com.deepugupta.wispr

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Record -> encrypt audio on disk -> transcribe -> polish/translate.
 * Every network step retries on its own (5 times, backing off, waiting for internet).
 * If everything still fails, the encrypted audio stays saved so the user can tap Retry later.
 */
object Engine {
    private val pool = Executors.newFixedThreadPool(2)
    private val main = Handler(Looper.getMainLooper())
    private val DELAYS = longArrayOf(1500, 3000, 6000, 10000, 15000)
    private val running: MutableSet<String> = ConcurrentHashMap.newKeySet()

    private class NoSpeech : Exception()

    fun io(block: () -> Unit) { pool.execute { block() } }
    private fun post(r: () -> Unit) { main.post { r() } }

    fun submit(ctx: Context, raw: File, onStatus: (String) -> Unit, onDone: (Boolean, String, String) -> Unit) {
        val app = ctx.applicationContext
        pool.execute {
            val st = Store.get(app)
            val id = UUID.randomUUID().toString()
            val saved = try {
                File(st.audioDir, "$id.enc").writeBytes(Crypto.encrypt(raw.readBytes()))
                true
            } catch (e: Exception) {
                false
            } finally {
                raw.delete()
            }
            if (!saved) {
                post { onDone(false, "Couldn't save the recording. Try again.", "") }
            } else {
                st.addItem(JSONObject().put("id", id).put("t", System.currentTimeMillis()).put("status", "pending").put("mode", st.str("mode")))
                work(app, id, onStatus, onDone)
            }
        }
    }

    fun retry(ctx: Context, id: String, onStatus: (String) -> Unit, onDone: (Boolean, String, String) -> Unit) {
        val app = ctx.applicationContext
        pool.execute { work(app, id, onStatus, onDone) }
    }

    private fun work(app: Context, id: String, onStatus: (String) -> Unit, onDone: (Boolean, String, String) -> Unit) {
        if (!running.add(id)) {
            post { onDone(false, "Already working on this one…", id) }
            return
        }
        val st = Store.get(app)
        try {
            val key = st.apiKey
            if (key.isBlank()) throw GroqError("Add your Groq key in the Wispr app first.", false, auth = true)
            val item = st.item(id) ?: throw GroqError("That recording is gone.", false)
            st.patchItem(id) { it.put("status", "pending"); it.remove("err") }
            var raw = item.optString("raw", "")
            if (raw.isEmpty()) {
                val f = File(st.audioDir, "$id.enc")
                if (!f.exists()) throw GroqError("Audio for this one is missing.", false)
                val audio = Crypto.decrypt(f.readBytes())
                val stt = st.str("stt")
                val lang = st.str("lang")
                raw = withRetry(app, onStatus) { Groq.transcribe(key, audio, stt, lang) }
                if (raw.isBlank()) throw NoSpeech()
                val r = raw
                st.patchItem(id) { it.put("raw", r) }
            }
            val text = st.applySpell(shape(app, st, key, raw, onStatus))
            st.patchItem(id) { it.put("status", "ok"); it.put("text", text); it.remove("raw") }
            File(st.audioDir, "$id.enc").delete()
            if (!st.bool("keepHist")) st.removeItem(id)
            post { onDone(true, text, id) }
        } catch (e: NoSpeech) {
            st.removeItem(id)
            post { onDone(false, "Didn't catch that. Try again a bit closer to the mic.", "") }
        } catch (e: Exception) {
            val base = (e as? GroqError)?.message ?: "Something went wrong (${e.javaClass.simpleName})."
            val msg = if (e is GroqError && e.auth) base else "$base Audio saved, tap Retry."
            st.patchItem(id) { it.put("status", "failed"); it.put("err", msg) }
            post { onDone(false, msg, id) }
        } finally {
            running.remove(id)
        }
    }

    /** Polish / translate / romanise. If that step fails, the plain transcript is still delivered. */
    private fun shape(app: Context, st: Store, key: String, raw: String, onStatus: (String) -> Unit): String {
        val mode = st.str("mode")
        val llm = st.str("llm")
        return try {
            var t = when (mode) {
                "polish" -> withRetry(app, onStatus) { Groq.chat(key, llm, Prompts.POLISH, raw) }
                "translate" -> withRetry(app, onStatus) { Groq.chat(key, llm, Prompts.translate(Prompts.langName(st.str("target"))), raw) }
                else -> raw
            }
            if (st.str("script") == "roman" && mode != "translate" && t.any { it.code > 127 }) {
                val src = t
                t = withRetry(app, onStatus) { Groq.chat(key, llm, Prompts.ROMAN, src) }
            }
            t
        } catch (e: GroqError) {
            raw
        }
    }

    private fun <T> withRetry(app: Context, onStatus: (String) -> Unit, block: () -> T): T {
        for (i in DELAYS.indices) {
            try {
                return block()
            } catch (e: GroqError) {
                if (!e.retryable) throw e
                val n = i + 1
                post { onStatus("Network hiccup, retrying $n/${DELAYS.size}…") }
                Thread.sleep(DELAYS[i])
                waitForNet(app, 30_000L)
            }
        }
        return block()
    }

    private fun online(app: Context): Boolean {
        val cm = app.getSystemService(ConnectivityManager::class.java) ?: return true
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun waitForNet(app: Context, maxMs: Long) {
        val end = SystemClock.elapsedRealtime() + maxMs
        while (!online(app) && SystemClock.elapsedRealtime() < end) Thread.sleep(1000)
    }
}
