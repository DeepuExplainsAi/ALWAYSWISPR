/*
 * Wispr by Deepu Gupta
 * Copyright (c) 2026 Deepu Gupta. All rights reserved.
 * Proprietary software. Unauthorised copying, modification, re-branding or redistribution is prohibited.
 */
package com.deepugupta.wispr

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.os.SystemClock
import java.io.File

/** 16 kHz mono AAC: about 240 KB per minute, well under Groq's upload limit even for long dictation. */
class Recorder(private val ctx: Context) {
    private var mr: MediaRecorder? = null
    private var file: File? = null
    private var t0 = 0L

    val isRecording: Boolean get() = mr != null

    @Suppress("DEPRECATION")
    private fun newRecorder(): MediaRecorder = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(ctx) else MediaRecorder()

    @Synchronized
    fun start(): Boolean {
        if (mr != null) return true
        val f = File(ctx.cacheDir, "rec_${System.currentTimeMillis()}.m4a")
        val r = newRecorder()
        return try {
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioChannels(1)
            r.setAudioSamplingRate(16000)
            r.setAudioEncodingBitRate(32000)
            r.setOutputFile(f.absolutePath)
            r.prepare()
            r.start()
            mr = r
            file = f
            t0 = SystemClock.elapsedRealtime()
            true
        } catch (e: Exception) {
            runCatching { r.release() }
            f.delete()
            false
        }
    }

    fun level(): Float {
        val r = mr ?: return 0f
        return try { r.maxAmplitude / 32767f } catch (e: Exception) { 0f }
    }

    @Synchronized
    fun stop(): File? {
        val r = mr ?: return null
        mr = null
        val dur = SystemClock.elapsedRealtime() - t0
        val ok = try { r.stop(); true } catch (e: Exception) { false }
        runCatching { r.release() }
        val f = file
        file = null
        if (!ok || dur < 700 || f == null || f.length() < 1200) {
            f?.delete()
            return null
        }
        return f
    }

    @Synchronized
    fun cancel() {
        val r = mr ?: return
        mr = null
        runCatching { r.stop() }
        runCatching { r.release() }
        file?.delete()
        file = null
    }
}
