/*
 * Wispr by Deepu Gupta
 * Copyright (c) 2026 Deepu Gupta. All rights reserved.
 * Proprietary software. Unauthorised copying, modification, re-branding or redistribution is prohibited.
 */
package com.deepugupta.wispr

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class RetryReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        Notif.cancelFail(ctx)
        val svc = BubbleService.instance
        if (svc != null) {
            svc.retryItem(id)
            return
        }
        val app = ctx.applicationContext
        Engine.retry(app, id, {}) { ok, text, _ ->
            if (ok) {
                Clip.copy(app, text)
                Notif.done(app)
            } else {
                Notif.failed(app, id, text)
            }
        }
    }
}
