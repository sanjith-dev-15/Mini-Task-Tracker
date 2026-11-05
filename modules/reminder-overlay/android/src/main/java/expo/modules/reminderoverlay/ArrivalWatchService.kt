package expo.modules.reminderoverlay

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/**
 * Foreground service ("Location reminders on") that keeps location fixes coming
 * with the app closed and the screen off, and hands each one to [ArrivalWatch].
 *
 * Battery: coarse network fixes every minute while far from every reminder;
 * GPS every ~15 s once within [ArrivalWatch]'s near distance of one.
 */
class ArrivalWatchService : Service() {
  private lateinit var client: FusedLocationProviderClient
  /** Current request mode; null → none yet. */
  private var precise: Boolean? = null

  private val callback = object : LocationCallback() {
    override fun onLocationResult(result: LocationResult) {
      val loc = result.lastLocation ?: return
      // Every reminder done or removed — no reason to keep running.
      if (ArrivalWatch.targets(this@ArrivalWatchService).isEmpty()) {
        stopSelf()
        return
      }
      val near = ArrivalWatch.onFix(this@ArrivalWatchService, loc)
      if (near != precise) request(near)
    }
  }

  override fun onCreate() {
    super.onCreate()
    client = LocationServices.getFusedLocationProviderClient(this)
    instance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Must go foreground first, even when about to stop (startForegroundService contract).
    if (!goForeground() || ArrivalWatch.targets(this).isEmpty()) {
      stopSelf()
      return START_NOT_STICKY
    }
    request(false)
    return START_STICKY
  }

  /** Targets changed: start over from a coarse request (the next fix re-decides). */
  internal fun refresh() {
    main.post {
      if (ArrivalWatch.targets(this).isEmpty()) stopSelf() else request(false)
    }
  }

  private fun goForeground(): Boolean =
    try {
      val n = ArrivalNotice.watching(this)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
      } else {
        startForeground(NOTIFICATION_ID, n)
      }
      true
    } catch (_: Exception) {
      // Not allowed right now (started from the background, or no location grant).
      false
    }

  private fun request(precise: Boolean) {
    this.precise = precise
    client.removeLocationUpdates(callback)
    val req =
      if (precise) {
        LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 15_000)
          .setMinUpdateIntervalMillis(5_000)
          .build()
      } else {
        LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 60_000)
          .setMinUpdateIntervalMillis(30_000)
          .build()
      }
    try {
      client.requestLocationUpdates(req, callback, Looper.getMainLooper())
    } catch (_: SecurityException) {
      stopSelf()
    }
  }

  override fun onDestroy() {
    client.removeLocationUpdates(callback)
    if (instance === this) instance = null
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    private const val NOTIFICATION_ID = 7301
    private val main = Handler(Looper.getMainLooper())
    @Volatile private var instance: ArrivalWatchService? = null

    val isRunning: Boolean
      get() = instance != null

    /** Start (or refresh) the watcher. Must first be called while the app is in the foreground. */
    fun start(ctx: Context): Boolean {
      instance?.let {
        it.refresh()
        return true
      }
      return try {
        val intent = Intent(ctx, ArrivalWatchService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent) else ctx.startService(intent)
        true
      } catch (_: Exception) {
        false
      }
    }

    fun stop(ctx: Context) {
      ctx.stopService(Intent(ctx, ArrivalWatchService::class.java))
    }
  }
}
