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
import android.graphics.PixelFormat
import android.graphics.Rect
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
import android.widget.Toast

/**
 * The Wispr bubble, modelled on how Wispr Flow works on Android:
 *  - an orange orb floats above ANY keyboard whenever a text box is focused;
 *  - tap it (or hold = push-to-talk) -> it opens into  [X]  [waveform]  [✓];
 *  - ✓ stops, Groq writes it, and the text is typed into the box you were in (retries 3x like Flow);
 *  - if an app refuses insertion, the text is on the clipboard and the orb shows a Paste badge.
 */
class BubbleService : AccessibilityService() {

    companion object {
        @Volatile var instance: BubbleService? = null
    }

    private enum class St { IDLE, REC, WORK, RETRY, PASTE }

    private val h = Handler(Looper.getMainLooper())
    private lateinit var wm: WindowManager
    private lateinit var store: Store
    private lateinit var recorder: Recorder
    private var view: BubbleView? = null
    private val lp = WindowManager.LayoutParams()
    private var shown = false
    private var st = St.IDLE
    private var target: AccessibilityNodeInfo? = null
    private var targetPkg: String? = null
    private var failedId: String? = null
    private var pasteText: String? = null
    private var imeTop = 0
    private var yOff = Int.MIN_VALUE
    private var rightSide = true
    private var hold = false
    private var dragging = false
    private var downZone = BubbleView.Zone.ORB
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
        view = BubbleView(this).apply { setOnTouchListener(touch) }
        lp.width = WindowManager.LayoutParams.WRAP_CONTENT
        lp.height = WindowManager.LayoutParams.WRAP_CONTENT
        lp.type = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
        // Never take focus: the app's text box keeps its cursor, so we can type into it.
        lp.flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
        lp.format = PixelFormat.TRANSLUCENT
        placeSide()
        lp.y = 0
    }

    private var centred = false

    private fun placeSide() {
        centred = false
        lp.gravity = Gravity.TOP or (if (rightSide) Gravity.END else Gravity.START)
        lp.x = dp(6f)
    }

    private fun placeCentre() {
        centred = true
        lp.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
        lp.x = 0
    }

    private fun relayout() { view?.let { v -> if (shown) runCatching { wm.updateViewLayout(v, lp) } } }

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
    private val touch = View.OnTouchListener { v, e ->
        val bv = v as BubbleView
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = e.rawX; downY = e.rawY; startX = lp.x; startY = lp.y
                dragging = false; hold = false
                downZone = bv.zoneAt(e.x)
                if (st != St.REC && st != St.WORK) h.postDelayed(holdRun, 420)
            }
            MotionEvent.ACTION_MOVE -> {
                val dx = e.rawX - downX
                val dy = e.rawY - downY
                if (!dragging && !hold && st != St.REC && Math.hypot(dx.toDouble(), dy.toDouble()) > dp(10f)) {
                    dragging = true
                    h.removeCallbacks(holdRun)
                }
                if (dragging) {
                    lp.x = if (rightSide) startX - dx.toInt() else startX + dx.toInt()
                    lp.y = startY + dy.toInt()
                    relayout()
                }
            }
            MotionEvent.ACTION_UP -> {
                h.removeCallbacks(holdRun)
                when {
                    // push-to-talk: release = type it; release over X = cancel
                    hold -> { hold = false; if (bv.zoneAt(e.x) == BubbleView.Zone.CANCEL) cancelRec() else stopRec() }
                    dragging -> { dragging = false; snap() }
                    else -> tap(downZone)
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

    private fun tap(zone: BubbleView.Zone) {
        when (st) {
            St.IDLE -> startRec()
            St.REC -> when (zone) {
                BubbleView.Zone.CANCEL -> cancelRec()
                BubbleView.Zone.DONE -> stopRec()
                else -> {} // like Flow: the waveform itself does nothing
            }
            St.WORK -> toast("Writing it down…")
            St.RETRY -> failedId?.let { retryItem(it) }
            St.PASTE -> pasteAgain()
        }
    }

    private fun snap() {
        val sw = screenW()
        val w = view?.width ?: 0
        val left = if (rightSide) sw - lp.x - w else lp.x
        rightSide = left + w / 2 > sw / 2
        placeSide()
        yOff = lp.y - imeTop
        getSharedPreferences("bubble_pos", MODE_PRIVATE).edit().putBoolean("right", rightSide).putInt("yoff", yOff).apply()
        relayout()
    }

    // ---------- when to show ----------
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        h.removeCallbacks(evalRun)
        h.postDelayed(evalRun, 90)
    }

    override fun onInterrupt() {}

    private val evalRun = Runnable { evaluate() }

    fun refresh() { h.post(evalRun) }

    private fun imeWindow(): AccessibilityWindowInfo? =
        try { windows.firstOrNull { it.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD } } catch (e: Exception) { null }

    private fun evaluate() {
        if (view == null) return
        val ime = imeWindow()
        if (ime != null) {
            val r = Rect()
            ime.getBoundsInScreen(r)
            if (r.top > 0) imeTop = r.top
        }
        if (st == St.REC || st == St.WORK || st == St.RETRY) { show(); return }
        if (!store.bool("bubble") || ime == null) {
            if (st == St.PASTE && ime == null) { /* keep Paste visible until it times out */ show(); return }
            hide()
            return
        }
        val focus = focusedEditable()
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
        val v = view ?: return
        if (!dragging) {
            val size = dp(68f)
            val base = if (imeTop > 0) imeTop else screenH() - dp(320f)
            val off = if (yOff == Int.MIN_VALUE || st == St.REC) -size - dp(6f) else yOff
            lp.y = (base + off).coerceIn(dp(40f), maxOf(dp(40f), screenH() - size))
        }
        if (!shown) {
            try { wm.addView(v, lp); shown = true } catch (e: Exception) { /* overlay not ready yet */ }
        } else if (!dragging) {
            relayout()
        }
    }

    private fun hide() {
        val v = view ?: return
        if (shown) {
            runCatching { wm.removeView(v) }
            shown = false
        }
    }

    // ---------- recording ----------
    private val levelRun = object : Runnable {
        override fun run() {
            if (st != St.REC) return
            view?.pushLevel(recorder.level())
            h.postDelayed(this, 50)
        }
    }
    private val maxRun = Runnable { stopRec() }

    private fun startRec() {
        if (!Perms.mic(this)) { hold = false; toast("Allow the microphone for Wispr first"); openApp("mic"); return }
        if (store.apiKey.isBlank()) { hold = false; toast("Open Wispr and add your Groq key first"); openApp(null); return }
        rememberTarget()
        goForeground()
        if (!recorder.start()) {
            stopFg()
            hold = false
            toast("Mic is busy in another app")
            return
        }
        Beep.play(this, true)
        setState(St.REC)
        h.post(levelRun)
        h.postDelayed(maxRun, 15 * 60 * 1000L)
    }

    private fun stopTimers() {
        h.removeCallbacks(levelRun)
        h.removeCallbacks(maxRun)
    }

    private fun stopRec() {
        if (st != St.REC) return
        stopTimers()
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
        stopTimers()
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

    // ---------- typing it in (Flow-style: find the box right before inserting, verify, retry 3x) ----------
    private fun deliver(text: String) {
        Clip.copy(this, text) // always on the clipboard too, so nothing is ever lost
        tryInsert(text, 0)
    }

    private fun tryInsert(text: String, attempt: Int) {
        val node = findTarget()
        if (node == null) {
            if (attempt < 3) { h.postDelayed({ tryInsert(text, attempt + 1) }, 250L * (attempt + 1)); return }
            fallbackPaste(text); return
        }
        val before = readText(node)
        val (s, e) = selection(node, before)
        val pad = if (before != null && s > 0 && !before[s - 1].isWhitespace()) " " else ""
        val piece = pad + text
        Clip.copy(this, piece)
        val pasted = node.performAction(AccessibilityNodeInfo.ACTION_PASTE)
        h.postDelayed({
            val after = readText(node.also { runCatching { it.refresh() } })
            val changed = after != null && after != before && after.contains(text.take(24))
            val unreadable = before == null && after == null
            when {
                changed -> done(text)
                pasted && unreadable -> done(text)            // app hides its text (some WebViews): trust the paste
                setTextFallback(node, before, s, e, piece) -> done(text)
                attempt < 3 -> h.postDelayed({ tryInsert(text, attempt + 1) }, 250L * (attempt + 1))
                else -> fallbackPaste(text)
            }
        }, 160)
    }

    private fun setTextFallback(node: AccessibilityNodeInfo, before: String?, s: Int, e: Int, piece: String): Boolean {
        val cur = before ?: return false
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

    @Suppress("UNUSED_PARAMETER")
    private fun done(text: String) {
        pasteText = null
        setState(St.IDLE)
        evaluate()
    }

    private fun fallbackPaste(text: String) {
        pasteText = text
        setState(St.PASTE)
        show()
        toast("Copied. Tap the text box, then tap the bubble to paste (or long-press → Paste)")
        h.postDelayed({ if (st == St.PASTE && pasteText == text) { pasteText = null; setState(St.IDLE); evaluate() } }, 15000)
    }

    private fun pasteAgain() {
        val t = pasteText ?: return
        if (findTarget() == null) { toast("Tap the text box first, then tap the bubble"); return }
        tryInsert(t, 3)
    }

    /** Text currently in the box; "" if it only shows its placeholder; null if the app hides it. */
    private fun readText(n: AccessibilityNodeInfo): String? {
        if (Build.VERSION.SDK_INT >= 26 && n.isShowingHintText) return ""
        val t = n.text?.toString() ?: return null
        val hint = if (Build.VERSION.SDK_INT >= 26) n.hintText?.toString() else null
        return if (hint != null && t == hint) "" else t
    }

    private fun selection(n: AccessibilityNodeInfo, cur: String?): Pair<Int, Int> {
        val len = cur?.length ?: 0
        var s = n.textSelectionStart
        if (s < 0 || s > len) s = len
        var e = n.textSelectionEnd
        if (e < s || e > len) e = s
        return s to e
    }

    private fun editable(n: AccessibilityNodeInfo?): AccessibilityNodeInfo? = n?.takeIf { it.isEditable && it.isEnabled && !it.isPassword }

    /** Remember the box the user was typing in when recording started. */
    private fun rememberTarget() {
        val n = focusedEditable()
        target = n
        targetPkg = n?.packageName?.toString()
    }

    /** Focused text box, searched across every window (keyboard overlays can hide it from rootInActiveWindow). */
    private fun focusedEditable(): AccessibilityNodeInfo? {
        editable(runCatching { findFocus(AccessibilityNodeInfo.FOCUS_INPUT) }.getOrNull())?.let { return it }
        val ws = runCatching { windows }.getOrNull() ?: return null
        for (w in ws) {
            if (w.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD || w.type == AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY) continue
            val root = runCatching { w.root }.getOrNull() ?: continue
            editable(runCatching { root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) }.getOrNull())?.let { return it }
        }
        return null
    }

    /** The box to type into right now: the focused one, else the one remembered at start (same app only). */
    private fun findTarget(): AccessibilityNodeInfo? {
        val f = focusedEditable()
        if (f != null) {
            if (f.packageName?.toString() == packageName) return null
            return f
        }
        val t = target ?: return null
        val alive = runCatching { t.refresh() }.getOrDefault(false)
        return if (alive && editable(t) != null && t.packageName?.toString() == targetPkg) t else null
    }

    // ---------- look ----------
    private fun setState(s: St) {
        st = s
        val v = view ?: return
        val before = lp.gravity
        if (s == St.REC) placeCentre() else if (centred) placeSide()
        v.setMode(
            when (s) {
                St.IDLE -> BubbleView.Mode.IDLE
                St.REC -> BubbleView.Mode.REC
                St.WORK -> BubbleView.Mode.WORK
                St.RETRY -> BubbleView.Mode.RETRY
                St.PASTE -> BubbleView.Mode.PASTE
            }
        )
        if (before != lp.gravity) relayout()
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
