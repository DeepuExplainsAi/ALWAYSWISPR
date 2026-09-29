/*
 * Wispr by Deepu Gupta
 * Copyright (c) 2026 Deepu Gupta. All rights reserved.
 * Proprietary software. Unauthorised copying, modification, re-branding or redistribution is prohibited.
 */
package com.deepugupta.wispr

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * @param retryable network / rate limit / server busy: worth trying again
 * @param auth      the key itself was refused
 * @param modelGone the model id no longer exists on Groq (e.g. Llama 3.3 was shut down 16 Aug 2026)
 * @param badParam  Groq refused an optional request field; retry without it
 */
class GroqError(
    message: String,
    val retryable: Boolean,
    val auth: Boolean = false,
    val modelGone: Boolean = false,
    val badParam: Boolean = false,
    val code: Int = 0
) : Exception(message)

/** Talks to Groq over HTTPS only. The key is sent in a header and is never logged. */
object Groq {
    private const val BASE = "https://api.groq.com/openai/v1/"
    const val DEFAULT_LLM = "openai/gpt-oss-120b"
    const val FAST_LLM = "openai/gpt-oss-20b"
    const val DEFAULT_STT = "whisper-large-v3-turbo"
    const val ACCURATE_STT = "whisper-large-v3"

    /** Model ids Groq has shut down. Old installs that saved one of these are moved to DEFAULT_LLM. */
    val DEAD_LLMS = setOf(
        "llama-3.3-70b-versatile", "llama-3.1-8b-instant", "llama3-70b-8192", "llama3-8b-8192",
        "qwen/qwen3-32b", "meta-llama/llama-4-scout-17b-16e-instruct", "gemma2-9b-it", "mixtral-8x7b-32768"
    )

    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .callTimeout(180, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /**
     * Cleans whatever the user pasted: spaces/new lines in the middle, zero-width characters,
     * quotes, a leading "Bearer ", or a markdown-escaped "gsk\_" (copied from a chat app).
     */
    fun cleanKey(input: String): String {
        var k = input.replace("\\_", "_")
        k = k.replace(Regex("[\\s\\u200B-\\u200F\\u2060\\uFEFF\\u00A0\"'`“”‘’<>]"), "")
        if (k.startsWith("Bearer", ignoreCase = true)) k = k.substring(6)
        val i = k.indexOf("gsk_")
        if (i > 0) k = k.substring(i)
        return k.filter { it.code in 33..126 }
    }

    private fun exec(req: Request): String {
        val (code, body) = try {
            http.newCall(req).execute().use { r -> r.code to r.body.string() }
        } catch (e: IOException) {
            throw GroqError("Couldn't reach Groq. Check your internet.", true)
        }
        if (code in 200..299) return body
        val err = runCatching { JSONObject(body).getJSONObject("error") }.getOrNull()
        val apiMsg = err?.optString("message")?.takeIf { it.isNotBlank() }
        val apiCode = err?.optString("code").orEmpty()
        val low = (apiMsg ?: "").lowercase()
        val modelIssue = apiCode.contains("model") || low.contains("model") &&
            (low.contains("decommission") || low.contains("does not exist") || low.contains("not found") || low.contains("no longer") || low.contains("not have access"))
        throw when {
            code == 401 -> GroqError("Groq didn't accept this key (401). ${apiMsg ?: "It may be deleted or mistyped."} Create a new one at console.groq.com/keys.", false, auth = true, code = code)
            code == 403 -> GroqError("Groq blocked the request (403). ${apiMsg ?: "Your account or network may be restricted."} Turn off VPN / try mobile data.", false, auth = true, code = code)
            code == 429 -> GroqError("Groq rate limit hit. ${apiMsg ?: ""}".trim(), true, code = code)
            code == 413 -> GroqError("Recording too big for Groq. Try a shorter one.", false, code = code)
            code == 408 || code in 500..599 -> GroqError("Groq is busy right now.", true, code = code)
            (code == 404 || code == 400) && modelIssue -> GroqError(apiMsg ?: "Model not available on Groq.", false, modelGone = true, code = code)
            code == 400 && (low.contains("reasoning") || low.contains("property") || low.contains("unsupported") || low.contains("unknown")) ->
                GroqError(apiMsg ?: "Groq rejected an option.", false, badParam = true, code = code)
            else -> GroqError(apiMsg ?: "Groq error $code", false, code = code)
        }
    }

    fun verify(key: String) {
        exec(Request.Builder().url(BASE + "models").header("Authorization", "Bearer $key").get().build())
    }

    fun transcribe(key: String, audio: ByteArray, model: String, lang: String, prompt: String?): String {
        val b = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", "speech.m4a", audio.toRequestBody("audio/mp4".toMediaType()))
            .addFormDataPart("model", model)
            .addFormDataPart("response_format", "json")
            .addFormDataPart("temperature", "0")
        // Whisper has no Odia code; "hinglish" is sent as Hindi (best recognition) and romanised afterwards.
        val wl = when (lang) { "auto", "or" -> null; "hinglish" -> "hi"; else -> lang }
        if (wl != null) b.addFormDataPart("language", wl)
        if (!prompt.isNullOrBlank()) b.addFormDataPart("prompt", prompt)
        val req = Request.Builder().url(BASE + "audio/transcriptions")
            .header("Authorization", "Bearer $key").post(b.build()).build()
        val body = exec(req)
        return try { JSONObject(body).optString("text").trim() } catch (e: Exception) { throw GroqError("Groq sent a bad reply.", true) }
    }

    fun chat(key: String, model: String, system: String, text: String): String = try {
        chatOnce(key, model, system, text, extras = true)
    } catch (e: GroqError) {
        if (e.badParam) chatOnce(key, model, system, text, extras = false) else throw e
    }

    private fun chatOnce(key: String, model: String, system: String, text: String, extras: Boolean): String {
        val msgs = JSONArray()
            .put(JSONObject().put("role", "system").put("content", system))
            .put(JSONObject().put("role", "user").put("content", "<dictation>\n$text\n</dictation>"))
        val p = JSONObject().put("model", model).put("temperature", 0.2).put("messages", msgs)
            .put("max_completion_tokens", 8192)
        if (extras) {
            // gpt-oss models "think" first: keep it short so typing feels instant.
            if (model.startsWith("openai/gpt-oss")) p.put("reasoning_effort", "low")
            if (model.startsWith("qwen/")) p.put("reasoning_format", "hidden")
        }
        val req = Request.Builder().url(BASE + "chat/completions")
            .header("Authorization", "Bearer $key")
            .post(p.toString().toRequestBody("application/json".toMediaType())).build()
        val body = exec(req)
        var out = try {
            JSONObject(body).getJSONArray("choices").getJSONObject(0).getJSONObject("message").optString("content")
        } catch (e: Exception) { throw GroqError("Groq sent a bad reply.", true) }
        out = out.replace(Regex("<think>[\\s\\S]*?</think>"), "").replace(Regex("</?dictation>"), "").trim()
        val quoted = out.length > 1 && (out.first() == '"' || out.first() == '“') && (out.last() == '"' || out.last() == '”')
        if (quoted && !(text.startsWith("\"") || text.startsWith("“"))) out = out.substring(1, out.length - 1).trim()
        if (out.isEmpty()) throw GroqError("Groq sent an empty reply.", true)
        return out
    }
}
