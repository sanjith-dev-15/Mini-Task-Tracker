package expo.modules.reminderoverlay

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * The "Reminder nearby" card, drawn as a system overlay window so it appears on
 * top of any app (or the home screen). Mirrors `src/components/arrival-modal.tsx`.
 * Several arrivals queue up and show one after another. All window work happens
 * on the main thread.
 */
internal object OverlayWindow {
  data class Entry(
    val id: String,
    val title: String,
    val subtitle: String,
    val notes: String,
    /** Deep link opened by the "Open" button. */
    val url: String,
    /** null → follow the system dark-mode setting. */
    val dark: Boolean?,
  )

  private const val PREFS = "reminder-overlay"
  private const val DONE_KEY = "done"

  private val main = Handler(Looper.getMainLooper())
  private val queue = ArrayDeque<Entry>()
  private var current: Entry? = null
  private var view: View? = null
  private var appContext: Context? = null

  /** Set by the module so JS (when running) hears about "Mark done" right away. */
  var onDone: ((String) -> Unit)? = null

  fun show(ctx: Context, entry: Entry) {
    main.post {
      appContext = ctx.applicationContext
      if (current?.id == entry.id || queue.any { it.id == entry.id }) return@post
      queue.addLast(entry)
      if (current == null) showNext()
    }
  }

  fun dismiss(id: String) {
    main.post {
      queue.removeAll { it.id == id }
      if (current?.id == id) close()
    }
  }

  fun takeDone(ctx: Context): List<String> {
    val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val ids = prefs.getStringSet(DONE_KEY, emptySet())?.toList() ?: emptyList()
    prefs.edit().remove(DONE_KEY).apply()
    return ids
  }

  /* ---------------------------------------------------------------- queue */

  private fun showNext() {
    val ctx = appContext ?: return
    val entry = queue.removeFirstOrNull() ?: return
    val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val v = build(ctx, entry, queue.size)

    @Suppress("DEPRECATION")
    val type =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        WindowManager.LayoutParams.TYPE_PHONE
      }
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      type,
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.CENTER
      windowAnimations = android.R.style.Animation_Dialog
    }

    try {
      wm.addView(v, params)
      current = entry
      view = v
    } catch (_: Exception) {
      // Permission revoked between the check and now, or the window was rejected.
      current = null
      view = null
    }
  }

  private fun close() {
    val ctx = appContext
    val v = view
    current = null
    view = null
    if (ctx != null && v != null) {
      try {
        (ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(v)
      } catch (_: Exception) {
        // already gone
      }
    }
    showNext()
  }

  /* -------------------------------------------------------------- actions */

  private fun later() = close()

  private fun open(entry: Entry) {
    val ctx = appContext
    close()
    if (ctx == null) return
    try {
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(entry.url))
        .setPackage(ctx.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(intent)
    } catch (_: Exception) {
      ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
        ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ?.let { ctx.startActivity(it) }
    }
  }

  private fun markDone(entry: Entry) {
    val ctx = appContext
    if (ctx != null) {
      // Persist first: JS may not be running (app closed) — it picks these up
      // via takeDone() on the next launch.
      val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val ids = prefs.getStringSet(DONE_KEY, emptySet())?.toMutableSet() ?: mutableSetOf()
      ids.add(entry.id)
      prefs.edit().putStringSet(DONE_KEY, ids).apply()
    }
    close()
    onDone?.invoke(entry.id)
  }

  /* ----------------------------------------------------------------- view */

  private class Palette(
    val card: Int,
    val element: Int,
    val border: Int,
    val text: Int,
    val textSecondary: Int,
    val accent: Int,
  )

  // Keep in step with `src/constants/theme.ts`.
  private val DARK = Palette(
    card = Color.parseColor("#1C1D20"),
    element = Color.parseColor("#2A2B2F"),
    border = Color.parseColor("#2E2F33"),
    text = Color.parseColor("#ECEDEE"),
    textSecondary = Color.parseColor("#B0B4BA"),
    accent = Color.parseColor("#4C93F8"),
  )
  private val LIGHT = Palette(
    card = Color.parseColor("#FFFFFF"),
    element = Color.parseColor("#F0F0F3"),
    border = Color.parseColor("#E4E4E7"),
    text = Color.parseColor("#11181C"),
    textSecondary = Color.parseColor("#60646C"),
    accent = Color.parseColor("#3C87F7"),
  )

  @SuppressLint("SetTextI18n")
  private fun build(ctx: Context, entry: Entry, more: Int): View {
    val dark = entry.dark
      ?: ((ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
        Configuration.UI_MODE_NIGHT_YES)
    val c = if (dark) DARK else LIGHT
    val metrics = ctx.resources.displayMetrics
    fun dp(v: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), metrics).toInt()
    fun rounded(color: Int, radius: Int) = GradientDrawable().apply {
      setColor(color)
      cornerRadius = dp(radius).toFloat()
    }

    // Full-screen scrim. The card stays until Open, Mark done or Later is
    // tapped: taps outside and the back key are swallowed, not treated as "Later".
    val root = object : FrameLayout(ctx) {
      override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) return true
        return super.dispatchKeyEvent(event)
      }
    }
    root.setBackgroundColor(Color.argb(115, 0, 0, 0))
    root.isClickable = true // block touches to the app underneath
    root.isFocusableInTouchMode = true

    val card = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(24), dp(24), dp(24), dp(16))
      background = rounded(c.card, 28).apply { setStroke(1, c.border) }
      elevation = dp(12).toFloat()
      isClickable = true // swallow taps so they don't reach the scrim
    }

    // Tinted disc with a pin glyph.
    val discColor = blend(c.card, c.accent, 0.12f)
    val disc = FrameLayout(ctx).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(discColor)
      }
    }
    disc.addView(PinView(ctx, c.accent, discColor), FrameLayout.LayoutParams(dp(26), dp(26), Gravity.CENTER))
    card.addView(disc, LinearLayout.LayoutParams(dp(52), dp(52)).apply { bottomMargin = dp(12) })

    card.addView(
      TextView(ctx).apply {
        text = entry.title
        setTextColor(c.text)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
      },
      LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT),
    )
    card.addView(
      TextView(ctx).apply {
        text = entry.subtitle
        setTextColor(c.textSecondary)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        gravity = Gravity.CENTER
      },
      LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        .apply { topMargin = dp(8) },
    )

    if (entry.notes.isNotBlank()) {
      val notes = ScrollView(ctx).apply {
        background = rounded(c.element, 14)
        addView(
          TextView(ctx).apply {
            text = entry.notes
            setTextColor(c.text)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setPadding(dp(16), dp(16), dp(16), dp(16))
          },
        )
      }
      card.addView(
        notes,
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
          .apply { topMargin = dp(16) },
      )
      // Cap the notes box height (like the in-app maxHeight: 220).
      notes.viewTreeObserver.addOnGlobalLayoutListener {
        if (notes.height > dp(220)) {
          notes.layoutParams = notes.layoutParams.apply { height = dp(220) }
        }
      }
    }

    fun button(label: String, bg: Int, fg: Int, onTap: () -> Unit) = TextView(ctx).apply {
      text = label
      setTextColor(fg)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      background = rounded(bg, 14)
      isClickable = true
      setOnClickListener { onTap() }
    }

    val actions = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
    actions.addView(
      button("Open", c.element, c.text) { open(entry) },
      LinearLayout.LayoutParams(0, dp(46), 1f).apply { marginEnd = dp(8) },
    )
    actions.addView(
      button("Mark done", c.accent, Color.WHITE) { markDone(entry) },
      LinearLayout.LayoutParams(0, dp(46), 1f),
    )
    card.addView(
      actions,
      LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        .apply { topMargin = dp(24) },
    )

    card.addView(
      TextView(ctx).apply {
        text = if (more > 0) "Later · $more more" else "Later"
        setTextColor(c.textSecondary)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        gravity = Gravity.CENTER
        setPadding(dp(16), dp(10), dp(16), dp(6))
        isClickable = true
        setOnClickListener { later() }
      },
      LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        .apply { topMargin = dp(4) },
    )

    val width = minOf(dp(360), metrics.widthPixels - dp(48))
    root.addView(card, FrameLayout.LayoutParams(width, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
    root.post { root.requestFocus() }
    return root
  }

  private fun blend(base: Int, over: Int, amount: Float): Int {
    fun ch(a: Int, b: Int) = (a + (b - a) * amount).toInt()
    return Color.rgb(
      ch(Color.red(base), Color.red(over)),
      ch(Color.green(base), Color.green(over)),
      ch(Color.blue(base), Color.blue(over)),
    )
  }

  /** A simple filled map pin with a hole, like Ionicons' `location`. */
  private class PinView(ctx: Context, color: Int, private val holeColor: Int) : View(ctx) {
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }
    private val hole = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = holeColor }
    private val path = Path()

    override fun onDraw(canvas: Canvas) {
      val w = width.toFloat()
      val h = height.toFloat()
      val r = w * 0.34f
      val cx = w / 2f
      val cy = h * 0.38f
      path.reset()
      path.addCircle(cx, cy, r, Path.Direction.CW)
      path.moveTo(cx - r * 0.9f, cy + r * 0.45f)
      path.lineTo(cx, h * 0.96f)
      path.lineTo(cx + r * 0.9f, cy + r * 0.45f)
      path.close()
      canvas.drawPath(path, fill)
      canvas.drawCircle(cx, cy, r * 0.42f, hole)
    }
  }
}
