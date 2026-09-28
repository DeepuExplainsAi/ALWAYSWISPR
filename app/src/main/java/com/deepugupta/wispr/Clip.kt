/*
 * Wispr by Deepu Gupta
 * Copyright (c) 2026 Deepu Gupta. All rights reserved.
 * Proprietary software. Unauthorised copying, modification, re-branding or redistribution is prohibited.
 */
package com.deepugupta.wispr

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Handler
import android.os.Looper

object Clip {
    fun copy(ctx: Context, text: String): Boolean {
        val app = ctx.applicationContext
        val r = Runnable {
            try {
                app.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("Wispr", text))
            } catch (e: Exception) {
                // ignore
            }
        }
        if (Looper.myLooper() == Looper.getMainLooper()) r.run() else Handler(Looper.getMainLooper()).post(r)
        return true
    }
}
