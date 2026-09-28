/*
 * Wispr by Deepu Gupta
 * Copyright (c) 2026 Deepu Gupta. All rights reserved.
 * Proprietary software. Unauthorised copying, modification, re-branding or redistribution is prohibited.
 */
package com.deepugupta.wispr

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon

object Notif {
    private const val CH = "wispr_status"
    const val ID_REC = 41
    private const val ID_FAIL = 42
    private const val ID_DONE = 43

    private fun nm(ctx: Context): NotificationManager = ctx.getSystemService(NotificationManager::class.java)

    fun ensure(ctx: Context) {
        val nm = nm(ctx)
        if (nm.getNotificationChannel(CH) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CH, "Wispr status", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Listening and retry alerts"
                }
            )
        }
    }

    private fun openApp(ctx: Context): PendingIntent = PendingIntent.getActivity(
        ctx, 0,
        Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    fun recording(ctx: Context): Notification {
        ensure(ctx)
        return Notification.Builder(ctx, CH)
            .setSmallIcon(R.drawable.ic_stat_mic)
            .setContentTitle("Wispr is listening")
            .setContentText("Tap the bubble again to type it in")
            .setOngoing(true)
            .setContentIntent(openApp(ctx))
            .build()
    }

    private fun post(ctx: Context, id: Int, n: Notification) {
        try { nm(ctx).notify(id, n) } catch (e: SecurityException) { /* notifications not allowed */ }
    }

    fun failed(ctx: Context, itemId: String, msg: String) {
        ensure(ctx)
        val retry = PendingIntent.getBroadcast(
            ctx, itemId.hashCode(),
            Intent(ctx, RetryReceiver::class.java).putExtra("id", itemId),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val n = Notification.Builder(ctx, CH)
            .setSmallIcon(R.drawable.ic_stat_mic)
            .setContentTitle("Dictation didn't finish. Audio is saved.")
            .setContentText(msg)
            .setStyle(Notification.BigTextStyle().bigText(msg))
            .setAutoCancel(true)
            .setContentIntent(openApp(ctx))
            .addAction(Notification.Action.Builder(Icon.createWithResource(ctx, R.drawable.ic_stat_retry), "Retry", retry).build())
            .build()
        post(ctx, ID_FAIL, n)
    }

    fun done(ctx: Context) {
        ensure(ctx)
        val n = Notification.Builder(ctx, CH)
            .setSmallIcon(R.drawable.ic_stat_mic)
            .setContentTitle("Recovered")
            .setContentText("Your text is copied. Long-press any text box and Paste.")
            .setAutoCancel(true)
            .setContentIntent(openApp(ctx))
            .build()
        post(ctx, ID_DONE, n)
    }

    fun cancelFail(ctx: Context) { runCatching { nm(ctx).cancel(ID_FAIL) } }
}
