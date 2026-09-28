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

class GroqError(message: String, val retryable: Boolean, val auth: Boolean = false) : Exception(message)

/** Talks to Groq over HTTPS only. The key is sent in a header and is never logged. */
object Groq {
    private const val BASE = "https://api.groq.com/openai/v1/"
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .callTimeout(180, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private fun exec(req: Request): String {
        val (code, body) = try {
            http.newCall(req).execute().use { r -> r.code to r.body?.string().orEmpty() }
        } catch (e: IOException) {
            throw GroqError("Couldn't reach Groq. Check your internet.", true)
        }
        if (code in 200..299) return body
        val apiMsg = runCatching { JSONObject(body).getJSONObject("error").getString("message") }.getOrNull()
        throw when (code) {
            401, 403 -> GroqError("Groq didn't accept your key. Check it in Settings.", false, auth = true)
            429 -> GroqError("Groq rate limit hit.", true)
            408, in 500..599 -> GroqError("Groq is busy right now.", true)
            else -> GroqError(apiMsg ?: "Groq error $code", false)
        }
    }

    fun verify(key: String) {
        exec(Request.Builder().url(BASE + "models").header("Authorization", "Bearer $key").get().build())
    }

    fun transcribe(key: String, audio: ByteArray, model: String, lang: String): String {
        val b = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", "speech.m4a", audio.toRequestBody("audio/mp4".toMediaType()))
            .addFormDataPart("model", model)
            .addFormDataPart("response_format", "json")
            .addFormDataPart("temperature", "0")
        if (lang != "auto" && lang != "or") b.addFormDataPart("language", lang)
        if (lang == "hi") b.addFormDataPart("prompt", Prompts.HI_HINT)
        val req = Request.Builder().url(BASE + "audio/transcriptions")
            .header("Authorization", "Bearer $key").post(b.build()).build()
        val body = exec(req)
        return try { JSONObject(body).optString("text").trim() } catch (e: Exception) { throw GroqError("Groq sent a bad reply.", true) }
    }

    fun chat(key: String, model: String, system: String, text: String): String {
        val msgs = JSONArray()
            .put(JSONObject().put("role", "system").put("content", system))
            .put(JSONObject().put("role", "user").put("content", "<dictation>\n$text\n</dictation>"))
        val payload = JSONObject().put("model", model).put("temperature", 0.2).put("messages", msgs).toString()
        val req = Request.Builder().url(BASE + "chat/completions")
            .header("Authorization", "Bearer $key")
            .post(payload.toRequestBody("application/json".toMediaType())).build()
        val body = exec(req)
        var out = try {
            JSONObject(body).getJSONArray("choices").getJSONObject(0).getJSONObject("message").optString("content")
        } catch (e: Exception) { throw GroqError("Groq sent a bad reply.", true) }
        out = out.replace(Regex("</?dictation>"), "").replace(Regex("<think>[\\s\\S]*?</think>"), "").trim()
        val quoted = out.length > 1 && (out.first() == '"' || out.first() == '“') && (out.last() == '"' || out.last() == '”')
        if (quoted && !(text.startsWith("\"") || text.startsWith("“"))) out = out.substring(1, out.length - 1).trim()
        return out.ifEmpty { text }
    }
}
