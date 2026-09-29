/*
 * Wispr by Deepu Gupta
 * Copyright (c) 2026 Deepu Gupta. All rights reserved.
 * Proprietary software. Unauthorised copying, modification, re-branding or redistribution is prohibited.
 */
package com.deepugupta.wispr

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.view.View
import android.view.animation.LinearInterpolator

/**
 * The glowing halo around the mic bubble while recording.
 * It breathes continuously on its own, and genuinely swells wider and
 * brighter the louder you actually speak — a live reaction to your voice,
 * not just a canned loop.
 */
class PulseRingView(ctx: Context) : View(ctx) {

    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        color = 0xFFFF7A45.toInt()
    }
    private var phase = 0f   // 0..1, loops continuously — the resting "breath"
    private var level = 0f   // 0..1, smoothed live mic loudness
    private var anim: ValueAnimator? = null

    /** Feed the latest raw mic amplitude (0..1ish) here every ~70ms while recording. */
    fun setLevel(raw: Float) {
        val target = (raw * 2.6f).coerceIn(0f, 1f)
        level += (target - level) * 0.35f
        invalidate()
    }

    fun start() {
        stop()
        val a = ValueAnimator.ofFloat(0f, 1f)
        a.duration = 1100
        a.repeatCount = ValueAnimator.INFINITE
        a.interpolator = LinearInterpolator()
        a.addUpdateListener {
            phase = it.animatedValue as Float
            invalidate()
        }
        a.start()
        anim = a
    }

    fun stop() {
        anim?.cancel()
        anim = null
        phase = 0f
        level = 0f
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (anim == null) return
        val cx = width / 2f
        val cy = height / 2f
        val short = minOf(width, height).toFloat()
        val core = short * 0.19f
        val maxGrow = short * 0.31f
        val reach = 0.5f + level * 0.5f
        val r = core + maxGrow * phase * reach
        val fade = (1f - phase) * (0.25f + level * 0.75f)
        ringPaint.strokeWidth = (5f + level * 5f) * resources.displayMetrics.density
        ringPaint.alpha = (fade * 255f).toInt().coerceIn(0, 255)
        canvas.drawCircle(cx, cy, r, ringPaint)
    }
}
