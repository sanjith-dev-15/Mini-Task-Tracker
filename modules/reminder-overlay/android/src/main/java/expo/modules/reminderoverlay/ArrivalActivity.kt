package expo.modules.reminderoverlay

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager

/**
 * Hosts the arrival card when the phone is locked or the screen is off: turns
 * the screen on and shows over the lock screen, like an alarm clock. The card
 * itself (and its queue) belongs to [OverlayWindow]; this just gives it a window.
 */
class ArrivalActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    showCard()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    showCard()
  }

  private fun showCard() {
    val card = OverlayWindow.attach(this)
    if (card == null) {
      // Already answered (or shown as an overlay) — e.g. a stale notification tap.
      finish()
      return
    }
    setContentView(card)
  }

  override fun onDestroy() {
    OverlayWindow.detach(this)
    super.onDestroy()
  }

  companion object {
    fun intent(ctx: Context): Intent =
      Intent(ctx, ArrivalActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)

    /**
     * Allowed from the background because the app can draw over other apps;
     * without that, the full-screen notification ([ArrivalNotice]) opens it.
     */
    fun launch(ctx: Context) {
      try {
        ctx.startActivity(intent(ctx))
      } catch (_: Exception) {
        // blocked — the notification still rings through
      }
    }
  }
}
