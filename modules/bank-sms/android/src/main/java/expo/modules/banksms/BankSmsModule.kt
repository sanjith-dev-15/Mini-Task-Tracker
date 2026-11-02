package expo.modules.banksms

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android-only bridge for auto-importing bank alerts into Expenses:
 * - `readInbox()` returns inbox SMS received after a timestamp (needs READ_SMS).
 * - `onChange` fires when the SMS store changes (a new message arrived) while
 *   JS is listening, so the app can re-scan without waiting to be reopened.
 * Parsing stays in JS (`@/lib/bank-sms`).
 */
class BankSmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  private var observer: ContentObserver? = null

  override fun definition() = ModuleDefinition {
    Name("BankSms")

    Events("onChange")

    OnStartObserving {
      if (observer != null || !hasPermission()) return@OnStartObserving
      val o = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean, uri: Uri?) {
          sendEvent("onChange", emptyMap<String, Any>())
        }
      }
      context.contentResolver.registerContentObserver(Telephony.Sms.CONTENT_URI, true, o)
      observer = o
    }

    OnStopObserving {
      unregister()
    }

    OnDestroy {
      unregister()
    }

    Function("hasPermission") {
      hasPermission()
    }

    /** Inbox messages received after `sinceMs`, oldest first, at most `limit`. */
    AsyncFunction("readInbox") { sinceMs: Double, limit: Int ->
      if (!hasPermission()) return@AsyncFunction emptyList<Map<String, Any>>()
      val out = mutableListOf<Map<String, Any>>()
      context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
        "${Telephony.Sms.DATE} > ?",
        arrayOf(sinceMs.toLong().toString()),
        "${Telephony.Sms.DATE} ASC",
      )?.use { c ->
        val addr = c.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val body = c.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val date = c.getColumnIndexOrThrow(Telephony.Sms.DATE)
        while (c.moveToNext() && out.size < limit) {
          out.add(
            mapOf(
              "address" to (c.getString(addr) ?: ""),
              "body" to (c.getString(body) ?: ""),
              "date" to c.getLong(date).toDouble(),
            ),
          )
        }
      }
      out
    }
  }

  private fun hasPermission(): Boolean =
    context.checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED

  private fun unregister() {
    val o = observer ?: return
    observer = null
    try {
      context.contentResolver.unregisterContentObserver(o)
    } catch (_: Exception) {
      // context already gone
    }
  }
}
