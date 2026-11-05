package expo.modules.reminderoverlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build

/**
 * Notifications posted natively: the arrival alert (heads-up, with a
 * full-screen intent so a locked phone opens [ArrivalActivity] like an alarm)
 * and the ongoing "Location reminders on" one for [ArrivalWatchService].
 */
internal object ArrivalNotice {
  private const val ALERT_CHANNEL = "arrival-alerts"
  const val WATCH_CHANNEL = "location-watch"
  private const val TAG = "arrival"

  fun post(ctx: Context, entry: OverlayWindow.Entry) {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(ALERT_CHANNEL) == null) {
      nm.createNotificationChannel(
        NotificationChannel(ALERT_CHANNEL, "Arrival alerts", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Rings when you reach a location reminder"
          // ArrivalAlarm does the sound and vibration.
          setSound(null, null)
          enableVibration(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
      )
    }
    val card = PendingIntent.getActivity(
      ctx,
      entry.id.hashCode(),
      ArrivalActivity.intent(ctx),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val body = if (entry.notes.isBlank()) entry.subtitle else "${entry.subtitle}\n${entry.notes}"
    val n = builder(ctx, ALERT_CHANNEL)
      .setSmallIcon(icon(ctx))
      .setContentTitle(entry.title)
      .setContentText(entry.subtitle)
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setContentIntent(card)
      .setFullScreenIntent(card, true)
      .setAutoCancel(true)
      .build()
    try {
      nm.notify(TAG, entry.id.hashCode(), n)
    } catch (_: SecurityException) {
      // notifications not allowed — the card and alarm still go off
    }
  }

  fun cancel(ctx: Context, id: String) {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.cancel(TAG, id.hashCode())
  }

  fun watching(ctx: Context): Notification {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(WATCH_CHANNEL) == null) {
      nm.createNotificationChannel(
        NotificationChannel(WATCH_CHANNEL, "Location reminders", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Shown while the app watches for your location reminders"
          setShowBadge(false)
        },
      )
    }
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
    val open = launch?.let {
      PendingIntent.getActivity(ctx, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    return builder(ctx, WATCH_CHANNEL)
      .setSmallIcon(icon(ctx))
      .setContentTitle("Location reminders on")
      .setContentText("You'll get an alert when you're near a reminder.")
      .setCategory(Notification.CATEGORY_SERVICE)
      .setOngoing(true)
      .setContentIntent(open)
      .build()
  }

  private fun builder(ctx: Context, channel: String): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(ctx, channel)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(ctx).setPriority(Notification.PRIORITY_MAX)
    }

  /** The monochrome `notification_icon` when the app has one, else the launcher icon. */
  private fun icon(ctx: Context): Int =
    ctx.resources.getIdentifier("notification_icon", "drawable", ctx.packageName)
      .takeIf { it != 0 } ?: ctx.applicationInfo.icon
}
