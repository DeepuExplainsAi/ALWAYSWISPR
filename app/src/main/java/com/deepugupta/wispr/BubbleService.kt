/*
 * Wispr by Deepu Gupta
 * Copyright (c) 2026 Deepu Gupta. All rights reserved.
 * Proprietary software. Unauthorised copying, modification, re-branding or redistribution is prohibited.
 */
package com.deepugupta.wispr

import android.accessibilityservice.AccessibilityService
import android.annotation.SuppressLint
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Toast

/**
 * The Wispr bubble. Works with ANY keyboard (Gboard, SwiftKey, Samsung...):
 * it appears when a keyboard opens, tap = start/stop, hold = push-to-talk.
 * The spoken text is copied AND pasted straight into the text box you were typing in.
 */
class BubbleService : AccessibilityService() {

    companion object {
        @Volatile var instance: BubbleService? = null
        private val C_IDLE = 0xFFE0492F.toInt()
        private val C_REC = 0xFFD92D20.toInt()
        private val C_WORK = 0xFF55534D.toInt()
        private val C_RETRY = 0xFFD97706.toInt()
        private val C_PASTE = 0xFF2563EB.toInt()
    }

    private enum class St { IDLE, REC, WORK, RETRY, PASTE }

    private val h = Handler(Looper.getMainLooper())
    private lateinit var wm: WindowManager
    private lateinit var store: Store
    private lateinit var recorder: Recorder
    private var root: LinearLayout? = null
    private lateinit var bubble: FrameLayout
    private lateinit var ring: PulseRingView
    private lateinit var icon: ImageView
    private lateinit var spinner: ProgressBar
    private lateinit var cancelBtn: ImageView
    private lateinit var bg: GradientDrawable
    private val lp = WindowManager.LayoutParams()
    private var shown = false
    private var st = St.IDLE
    private var target: AccessibilityNodeInfo? = null
    private var failedId: String? = null
    private var pasteText: String? = null
    private var imeTop = 0
    private var yOff = Int.MIN_VALUE
    private var rightSide = true
    private var hold = false
    private var dragging = false
    private var downX = 0f
    private var downY = 0f
    private var startX = 0
    private var startY = 0
    private val storeListener: () -> Unit = { refresh() }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        store = Store.get(this)
        recorder = Recorder(applicationContext)
        val sp = getSharedPreferences("bubble_pos", MODE_PRIVATE)
        rightSide = sp.getBoolean("right", true)
        yOff = sp.getInt("yoff", Int.MIN_VALUE)
        Notif.ensure(this)
        buildViews()
        store.addListener(storeListener)
    }

    private fun dp(v: Float): Int = (v * resources.displayMetrics.density + 0.5f).toInt()

    private fun buildViews() {
        val size = dp(52f)
        bg = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(C_IDLE)
            setStroke(dp(2f), 0x40FFFFFF)
        }
        icon = ImageView(this).apply {
            setImageResource(R.drawable.ic_b_mic)
            setColorFilter(Color.WHITE)
        }
        spinner = ProgressBar(this).apply {
            isIndeterminate = true
            visibility = View.GONE
            indeterminateTintList = ColorStateList.valueOf(Color.WHITE)
        }
        bubble = FrameLayout(this).apply {
            background = bg
            elevation = dp(6f).toFloat()
            contentDescription = "Start Wispr dictation"
            addView(icon, FrameLayout.LayoutParams(dp(26f), dp(26f), Gravity.CENTER))
            addView(spinner, FrameLayout.LayoutParams(dp(28f), dp(28f), Gravity.CENTER))
        }
        ring = PulseRingView(this)
        val stageSize = dp(96f)
        val stage = FrameLayout(this).apply {
            addView(ring, FrameLayout.LayoutParams(stageSize, stageSize))
            addView(bubble, FrameLayout.LayoutParams(size, size, Gravity.CENTER))
        }
        cancelBtn = ImageView(this).apply {
            setImageResource(R.drawable.ic_b_close)
            setColorFilter(Color.WHITE)
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(0xE6333333.toInt()) }
            setPadding(dp(7f), dp(7f), dp(7f), dp(7f))
            visibility = View.GONE
            contentDescription = "Cancel"
            setOnClickListener { cancelRec() }
        }
        root = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(6f), dp(6f), dp(6f), dp(6f))
            addView(cancelBtn, LinearLayout.LayoutParams(dp(34f), dp(34f)).apply { marginEnd = dp(8f) })
            addView(stage, LinearLayout.LayoutParams(stageSize, stageSize))
        }
        lp.width = WindowManager.LayoutParams.WRAP_CONTENT
        lp.height = WindowManager.LayoutParams.WRAP_CONTENT
        lp.type = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
        lp.flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
        lp.format = PixelFormat.TRANSLUCENT
        lp.gravity = Gravity.TOP or (if (rightSide) Gravity.END else Gravity.START)
        lp.x = dp(8f)
        lp.y = 0
        bubble.setOnTouchListener(touch)
    }

    // ---------- gestures ----------
    private val holdRun = Runnable {
        if (dragging) return@Runnable
        when (st) {
            St.IDLE -> { hold = true; startRec() }
            St.RETRY, St.PASTE -> { failedId = null; pasteText = null; setState(St.IDLE); evaluate() }
            else -> {}
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private val touch = View.OnTouchListener { _, e ->
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = e.rawX; downY = e.rawY; startX = lp.x; startY = lp.y
                dragging = false; hold = false
                h.postDelayed(holdRun, 450)
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = e.rawX - downX
                val dy = e.rawY - downY
                if (!dragging && !hold && Math.hypot(dx.toDouble(), dy.toDouble()) > dp(10f)) {
                    dragging = true
                    h.removeCallbacks(holdRun)
                }
                if (dragging) {
                    lp.x = if (rightSide) startX - dx.toInt() else startX + dx.toInt()
                    lp.y = startY + dy.toInt()
                    root?.let { v -> runCatching { wm.updateViewLayout(v, lp) } }
                }
            }
            MotionEvent.ACTION_UP -> {
                h.removeCallbacks(holdRun)
                when {
                    hold -> { hold = false; stopRec() }
                    dragging -> { dragging = false; snap() }
                    else -> tap()
                }
            }
            MotionEvent.ACTION_CANCEL -> {
                h.removeCallbacks(holdRun)
                dragging = false
                if (hold) { hold = false; stopRec() }
            }
        }
        true
    }

    private fun tap() {
        when (st) {
            St.IDLE -> startRec()
            St.REC -> stopRec()
            St.WORK -> toast("Writing it down…")
            St.RETRY -> failedId?.let { retryItem(it) }
            St.PASTE -> pasteAgain()
        }
    }

    private fun snap() {
        val sw = screenW()
        val w = root?.width ?: 0
        val left = if (rightSide) sw - lp.x - w else lp.x
        rightSide = left + w / 2 > sw / 2
        lp.gravity = Gravity.TOP or (if (rightSide) Gravity.END else Gravity.START)
        lp.x = dp(8f)
        yOff = lp.y - imeTop
        getSharedPreferences("bubble_pos", MODE_PRIVATE).edit().putBoolean("right", rightSide).putInt("yoff", yOff).apply()
        root?.let { v -> runCatching { wm.updateViewLayout(v, lp) } }
    }

    // ---------- when to show ----------
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        h.removeCallbacks(evalRun)
        h.postDelayed(evalRun, 90)
    }

    override fun onInterrupt() {}

    private val evalRun = Runnable { evaluate() }

    fun refresh() { h.post(evalRun) }

    private fun evaluate() {
        if (root == null) return
        val ime = try { windows.firstOrNull { it.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD } } catch (e: Exception) { null }
        if (ime != null) {
            val r = Rect()
            ime.getBoundsInScreen(r)
            if (r.top > 0) imeTop = r.top
        }
        if (st == St.REC || st == St.WORK || st == St.RETRY) { show(); return }
        if (!store.bool("bubble") || ime == null) {
            if (st == St.PASTE) { pasteText = null; setState(St.IDLE) }
            hide()
            return
        }
        val focus = try { findFocus(AccessibilityNodeInfo.FOCUS_INPUT) } catch (e: Exception) { null }
        if (focus != null && (focus.packageName?.toString() == packageName || focus.isPassword || numeric(focus))) { hide(); return }
        if (focus == null && rootInActiveWindow?.packageName?.toString() == packageName) { hide(); return }
        show()
    }

    private fun numeric(n: AccessibilityNodeInfo): Boolean {
        val c = n.inputType and InputType.TYPE_MASK_CLASS
        return c == InputType.TYPE_CLASS_NUMBER || c == InputType.TYPE_CLASS_PHONE
    }

    private fun screenW(): Int = if (Build.VERSION.SDK_INT >= 30) wm.currentWindowMetrics.bounds.width() else resources.displayMetrics.widthPixels
    private fun screenH(): Int = if (Build.VERSION.SDK_INT >= 30) wm.currentWindowMetrics.bounds.height() else resources.displayMetrics.heightPixels

    private fun show() {
        val v = root ?: return
        if (!dragging) {
            val size = dp(64f)
            val base = if (imeTop > 0) imeTop else screenH() - dp(320f)
            val off = if (yOff == Int.MIN_VALUE) -size - dp(8f) else yOff
            lp.y = (base + off).coerceIn(dp(40f), maxOf(dp(40f), screenH() - size))
        }
        if (!shown) {
            try { wm.addView(v, lp); shown = true } catch (e: Exception) { /* overlay not ready yet */ }
        } else if (!dragging) {
            runCatching { wm.updateViewLayout(v, lp) }
        }
    }

    private fun hide() {
        val v = root ?: return
        if (shown) {
            runCatching { wm.removeView(v) }
            shown = false
        }
    }

    // ---------- recording ----------
    private var pulseAnim: android.animation.ValueAnimator? = null

    /** Smooth breathing pulse while recording: gently scales up, fades a touch, and lifts like a beat. */
    private fun startPulse() {
        stopPulse()
        val a = android.animation.ValueAnimator.ofFloat(0f, 1f)
        a.duration = 620
        a.repeatCount = android.animation.ValueAnimator.INFINITE
        a.repeatMode = android.animation.ValueAnimator.REVERSE
        a.interpolator = android.view.animation.AccelerateDecelerateInterpolator()
        a.addUpdateListener { anim ->
            val f = anim.animatedValue as Float
            val sc = 1f + 0.14f * f
            bubble.scaleX = sc
            bubble.scaleY = sc
            bubble.alpha = 1f - 0.30f * f
            bubble.translationY = -dp(4f) * f
        }
        a.start()
        pulseAnim = a
    }

    private fun stopPulse() {
        pulseAnim?.cancel()
        pulseAnim = null
    }

    private val levelRun = object : Runnable {
        override fun run() {
            if (st != St.REC) return
            ring.setLevel(recorder.level())
            h.postDelayed(this, 70)
        }
    }
    private val maxRun = Runnable { stopRec() }

    private fun startRec() {
        if (!Perms.mic(this)) { toast("Allow the microphone for Wispr first"); openApp("mic"); return }
        if (store.apiKey.isBlank()) { toast("Open Wispr and add your Groq key first"); openApp(null); return }
        target = try { findFocus(AccessibilityNodeInfo.FOCUS_INPUT) } catch (e: Exception) { null }
        goForeground()
        if (!recorder.start()) {
            stopFg()
            hold = false
            toast("Mic is busy in another app")
            return
        }
        Beep.play(this, true)
        setState(St.REC)
        startPulse()
        ring.start()
        h.post(levelRun)
        h.postDelayed(maxRun, 15 * 60 * 1000L)
    }

    private fun resetScale() {
        stopPulse()
        ring.stop()
        h.removeCallbacks(levelRun)
        h.removeCallbacks(maxRun)
        bubble.scaleX = 1f
        bubble.scaleY = 1f
        bubble.alpha = 1f
        bubble.translationY = 0f
    }

    private fun stopRec() {
        if (st != St.REC) return
        resetScale()
        val f = recorder.stop()
        stopFg()
        Beep.play(this, false)
        if (f == null) {
            toast("Too short. Speak a little longer.")
            setState(St.IDLE)
            evaluate()
            return
        }
        setState(St.WORK)
        Engine.submit(this, f, { m -> toast(m) }) { ok, text, id -> onResult(ok, text, id) }
    }

    private fun cancelRec() {
        if (st != St.REC) return
        resetScale()
        recorder.cancel()
        stopFg()
        setState(St.IDLE)
        toast("Discarded")
        evaluate()
    }

    fun retryItem(id: String) {
        h.post {
            if (st == St.REC || st == St.WORK) return@post
            failedId = id
            setState(St.WORK)
            show()
            Engine.retry(this, id, { m -> toast(m) }) { ok, text, rid -> onResult(ok, text, rid) }
        }
    }

    private fun onResult(ok: Boolean, text: String, id: String) {
        if (ok) {
            failedId = null
            Notif.cancelFail(this)
            deliver(text)
        } else if (id.isEmpty()) {
            toast(text)
            setState(St.IDLE)
            evaluate()
        } else {
            failedId = id
            setState(St.RETRY)
            show()
            toast(text)
            Notif.failed(this, id, text)
        }
    }

    // ---------- typing it in ----------
    private fun deliver(text: String) {
        Clip.copy(this, text)
        if (insert(text)) {
            setState(St.IDLE)
            evaluate()
        } else {
            pasteText = text
            setState(St.PASTE)
            show()
            toast("Copied. Tap the text box, then tap the bubble to paste")
            h.postDelayed({ if (st == St.PASTE) { pasteText = null; setState(St.IDLE); evaluate() } }, 12000)
        }
    }

    private fun pasteAgain() {
        val t = pasteText ?: return
        if (insert(t)) {
            pasteText = null
            setState(St.IDLE)
            evaluate()
        } else {
            toast("Tap the text box first, then tap the bubble")
        }
    }

    private fun editable(n: AccessibilityNodeInfo?): AccessibilityNodeInfo? = n?.takeIf { it.isEditable && it.isEnabled }

    /** Copy + paste at the cursor (like Wispr Flow). Falls back to setting the text directly. */
    private fun insert(text: String): Boolean {
        val focused = try { findFocus(AccessibilityNodeInfo.FOCUS_INPUT) } catch (e: Exception) { null }
        val node = editable(focused) ?: editable(target?.takeIf { runCatching { it.refresh() }.getOrDefault(false) }) ?: return false
        val cur = if (Build.VERSION.SDK_INT >= 26 && node.isShowingHintText) "" else node.text?.toString().orEmpty()
        var s = node.textSelectionStart
        if (s < 0 || s > cur.length) s = cur.length
        var e = node.textSelectionEnd
        if (e < s || e > cur.length) e = s
        val pad = if (s > 0 && !cur[s - 1].isWhitespace()) " " else ""
        val piece = pad + text
        Clip.copy(this, piece)
        if (node.performAction(AccessibilityNodeInfo.ACTION_PASTE)) return true
        val nt = cur.substring(0, s) + piece + cur.substring(e)
        val args = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, nt) }
        if (!node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) return false
        val p = s + piece.length
        node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, Bundle().apply {
            putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, p)
            putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, p)
        })
        return true
    }

    // ---------- look ----------
    private fun setState(s: St) {
        st = s
        spinner.visibility = if (s == St.WORK) View.VISIBLE else View.GONE
        icon.visibility = if (s == St.WORK) View.GONE else View.VISIBLE
        cancelBtn.visibility = if (s == St.REC) View.VISIBLE else View.GONE
        when (s) {
            St.IDLE -> { bg.setColor(C_IDLE); icon.setImageResource(R.drawable.ic_b_mic) }
            St.REC -> { bg.setColor(C_REC); icon.setImageResource(R.drawable.ic_b_stop) }
            St.WORK -> bg.setColor(C_WORK)
            St.RETRY -> { bg.setColor(C_RETRY); icon.setImageResource(R.drawable.ic_b_retry) }
            St.PASTE -> { bg.setColor(C_PASTE); icon.setImageResource(R.drawable.ic_b_paste) }
        }
        bubble.contentDescription = when (s) {
            St.IDLE -> "Start Wispr dictation"
            St.REC -> "Stop and type it in"
            St.WORK -> "Writing"
            St.RETRY -> "Retry dictation"
            St.PASTE -> "Paste text"
        }
    }

    // ---------- helpers ----------
    private fun goForeground() {
        try {
            val n = Notif.recording(this)
            if (Build.VERSION.SDK_INT >= 29) startForeground(Notif.ID_REC, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            else startForeground(Notif.ID_REC, n)
        } catch (e: Throwable) {
            // Recording still works from the accessibility service on most phones.
        }
    }

    private fun stopFg() {
        try { stopForeground(Service.STOP_FOREGROUND_REMOVE) } catch (e: Throwable) { /* not in foreground */ }
    }

    private fun openApp(ask: String?) {
        try {
            val i = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (ask != null) i.putExtra("ask", ask)
            startActivity(i)
        } catch (e: Exception) { /* ignore */ }
    }

    private fun toast(m: String) { h.post { Toast.makeText(applicationContext, m, Toast.LENGTH_SHORT).show() } }

    private fun cleanup() {
        if (instance === this) instance = null
        if (::store.isInitialized) store.removeListener(storeListener)
        if (::recorder.isInitialized) recorder.cancel()
        hide()
        h.removeCallbacksAndMessages(null)
    }

    override fun onUnbind(intent: Intent?): Boolean {
        cleanup()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        cleanup()
        super.onDestroy()
    }
}
