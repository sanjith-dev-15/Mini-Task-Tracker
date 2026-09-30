package expo.modules.reminderoverlay

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android-only bridge for location-reminder alerts shown *outside* the app:
 * - `show()` draws the arrival card over whatever app is on screen (needs the
 *   "Display over other apps" permission) — callable from the headless
 *   geofence task while the app is closed.
 * - Helpers to check / request that permission and the battery-optimisation
 *   exemption that keeps geofence events from being dropped.
 */
class ReminderOverlayModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ReminderOverlay")

    Events("onDone")

    OnCreate {
      OverlayWindow.onDone = { id -> sendEvent("onDone", mapOf("id" to id)) }
    }

    OnDestroy {
      OverlayWindow.onDone = null
    }

    Function("canDrawOverlays") {
      Settings.canDrawOverlays(context)
    }

    Function("openOverlaySettings") {
      launch(
        Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")),
        Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION),
      )
    }

    Function("isIgnoringBatteryOptimizations") {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    Function("requestIgnoreBatteryOptimizations") {
      launch(
        Intent(
          Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
          Uri.parse("package:${context.packageName}"),
        ),
        Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
      )
    }

    /** Returns false when the permission is missing (caller should fall back). */
    Function("show") { id: String, title: String, subtitle: String, notes: String, url: String, dark: Boolean? ->
      val ctx = context
      if (!Settings.canDrawOverlays(ctx)) return@Function false
      OverlayWindow.show(ctx, OverlayWindow.Entry(id, title, subtitle, notes, url, dark))
      true
    }

    Function("hide") { id: String ->
      OverlayWindow.dismiss(id)
    }

    /** Reminder ids marked done from the overlay since the last call (then cleared). */
    Function("takeDone") {
      OverlayWindow.takeDone(context)
    }
  }

  /** Start the first intent that resolves — from the current activity when there is one. */
  private fun launch(vararg intents: Intent) {
    val activity = appContext.currentActivity
    for (intent in intents) {
      try {
        if (activity != null) {
          activity.startActivity(intent)
        } else {
          context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        return
      } catch (_: ActivityNotFoundException) {
        // try the next one
      } catch (_: SecurityException) {
        // try the next one
      }
    }
  }
}
