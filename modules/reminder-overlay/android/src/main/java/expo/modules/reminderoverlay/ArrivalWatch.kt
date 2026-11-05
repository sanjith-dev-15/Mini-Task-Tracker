package expo.modules.reminderoverlay

import android.content.Context
import android.location.Location
import org.json.JSONArray

/**
 * Native arrival check for location reminders. JS hands over the located,
 * not-done reminders ([setTargets]); [ArrivalWatchService] feeds every location
 * fix to [onFix], which alerts for each reminder the phone has just entered.
 *
 * All of it runs in native code, straight from the location callback — no JS,
 * no JobScheduler — so it still works with the screen off (in Doze, Android
 * holds back the jobs expo-task-manager uses to wake the JS task).
 */
internal object ArrivalWatch {
  private const val PREFS = "arrival-watch"
  private const val TARGETS = "targets"
  /** Reminder ids the phone is currently inside (already alerted for this visit). */
  private const val INSIDE = "inside"
  /** Switch to GPS once a reminder's edge is this close (metres). */
  private const val NEAR_M = 2_000f
  /** Don't trust a fix vaguer than this for an arrival, whatever the radius. */
  private const val MIN_ACCURACY_M = 150f

  data class Target(val entry: OverlayWindow.Entry, val lat: Double, val lng: Double, val radius: Float)

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** Stores the targets; returns false when they're unchanged. */
  fun setTargets(ctx: Context, json: String): Boolean {
    val p = prefs(ctx)
    if (p.getString(TARGETS, null) == json) return false
    p.edit().putString(TARGETS, json).apply()
    return true
  }

  fun clear(ctx: Context) {
    prefs(ctx).edit().remove(TARGETS).remove(INSIDE).apply()
  }

  fun remove(ctx: Context, id: String) {
    val arr = raw(ctx) ?: return
    val kept = JSONArray()
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      if (o.optString("id") != id) kept.put(o)
    }
    prefs(ctx).edit().putString(TARGETS, kept.toString()).apply()
  }

  private fun raw(ctx: Context): JSONArray? =
    try {
      prefs(ctx).getString(TARGETS, null)?.let { JSONArray(it) }
    } catch (_: Exception) {
      null
    }

  fun targets(ctx: Context): List<Target> {
    val arr = raw(ctx) ?: return emptyList()
    val out = ArrayList<Target>(arr.length())
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      val id = o.optString("id")
      if (id.isEmpty()) continue
      out.add(
        Target(
          OverlayWindow.Entry(
            id = id,
            title = o.optString("title"),
            subtitle = o.optString("subtitle"),
            notes = o.optString("notes"),
            url = o.optString("url"),
            dark = if (o.has("dark") && !o.isNull("dark")) o.optBoolean("dark") else null,
            notify = true,
          ),
          o.optDouble("lat"),
          o.optDouble("lng"),
          o.optDouble("radius", 500.0).toFloat(),
        ),
      )
    }
    return out
  }

  /**
   * Checks one fix against every target and alerts for new arrivals.
   * Returns true when some reminder is close enough to want precise fixes.
   */
  fun onFix(ctx: Context, loc: Location): Boolean {
    val list = targets(ctx)
    val p = prefs(ctx)
    val inside = (p.getStringSet(INSIDE, emptySet()) ?: emptySet()).toMutableSet()
    inside.retainAll(list.map { it.entry.id }.toSet())

    val accuracy = if (loc.hasAccuracy()) loc.accuracy else Float.MAX_VALUE
    val d = FloatArray(1)
    var near = false
    for (t in list) {
      Location.distanceBetween(loc.latitude, loc.longitude, t.lat, t.lng, d)
      val dist = d[0]
      if (dist - t.radius - minOf(accuracy, 5_000f) < NEAR_M) near = true
      val id = t.entry.id
      if (dist <= t.radius && accuracy <= maxOf(t.radius, MIN_ACCURACY_M)) {
        if (inside.add(id)) OverlayWindow.show(ctx, t.entry)
      } else if (dist > t.radius * 1.2f + minOf(accuracy, t.radius)) {
        // A little slack (and the fix's own error) so GPS jitter at the edge
        // doesn't count as leaving and arriving again.
        inside.remove(id)
      }
    }
    p.edit().putStringSet(INSIDE, inside).apply()
    return near
  }
}
