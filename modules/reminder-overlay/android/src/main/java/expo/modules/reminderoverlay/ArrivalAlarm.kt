package expo.modules.reminderoverlay

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Rings like an alarm clock when a location reminder fires: the phone's alarm
 * sound on loop (alarm stream, so it plays in silent / vibrate mode too) plus a
 * repeating vibration. Keeps going until the user responds to the arrival card
 * (Open / Mark done / Later / a volume key) or [MAX_MS] passes.
 * Everything runs on the main thread.
 */
internal object ArrivalAlarm {
  private const val MAX_MS = 2 * 60_000L
  /** Buzz 0.8 s, pause 0.6 s, repeat. */
  private val PATTERN = longArrayOf(0, 800, 600)

  private val main = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  /** Keeps the CPU up while ringing — with the screen off it would otherwise sleep mid-alarm. */
  private var wake: PowerManager.WakeLock? = null
  private val timeout = Runnable { stopNow() }

  fun start(ctx: Context) {
    val app = ctx.applicationContext
    main.post { startNow(app) }
  }

  fun stop() {
    main.post { stopNow() }
  }

  private fun startNow(ctx: Context) {
    main.removeCallbacks(timeout)
    main.postDelayed(timeout, MAX_MS)
    if (player != null || vibrator != null) return // already ringing

    if (wake == null) {
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
      wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "goku:arrival-alarm").apply {
        setReferenceCounted(false)
        acquire(MAX_MS + 5_000)
      }
    }

    val attrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()

    val uri = RingtoneManager.getActualDefaultRingtoneUri(ctx, RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    if (uri != null) {
      val p = MediaPlayer()
      try {
        p.setAudioAttributes(attrs)
        p.setDataSource(ctx, uri)
        p.isLooping = true
        p.prepare()
        p.start()
        player = p
      } catch (_: Exception) {
        p.release()
      }
    }

    val v = vibratorOf(ctx)
    if (v != null && v.hasVibrator()) {
      try {
        when {
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ->
            v.vibrate(
              VibrationEffect.createWaveform(PATTERN, 0),
              VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM),
            )
          Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ->
            @Suppress("DEPRECATION")
            v.vibrate(VibrationEffect.createWaveform(PATTERN, 0), attrs)
          else ->
            @Suppress("DEPRECATION")
            v.vibrate(PATTERN, 0)
        }
        vibrator = v
      } catch (_: Exception) {
        // no vibrator access
      }
    }
  }

  private fun stopNow() {
    main.removeCallbacks(timeout)
    player?.let {
      try {
        it.stop()
      } catch (_: Exception) {
      }
      it.release()
    }
    player = null
    vibrator?.cancel()
    vibrator = null
    wake?.let { if (it.isHeld) it.release() }
    wake = null
  }

  private fun vibratorOf(ctx: Context): Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
}
