package expo.modules.smsreader

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Telephony
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android-only read access to the SMS inbox, used by Expenses ▸ Import from
 * SMS to find bank alerts. Messages are returned to JS for parsing on the
 * device; nothing here stores or sends them anywhere. The READ_SMS runtime
 * permission is requested from JS (PermissionsAndroid).
 */
class SmsReaderModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SmsReader")

    Function("hasPermission") {
      context.checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
    }

    /** Inbox messages received at or after `sinceMs`, newest first, at most `limit`. */
    AsyncFunction("readInbox") { sinceMs: Double, limit: Int ->
      val ctx = context
      if (ctx.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
        throw SecurityException("READ_SMS permission not granted")
      }
      val out = mutableListOf<Map<String, Any?>>()
      ctx.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
        "${Telephony.Sms.DATE} >= ?",
        arrayOf(sinceMs.toLong().toString()),
        "${Telephony.Sms.DATE} DESC",
      )?.use { c ->
        val idCol = c.getColumnIndexOrThrow(Telephony.Sms._ID)
        val addressCol = c.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val bodyCol = c.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val dateCol = c.getColumnIndexOrThrow(Telephony.Sms.DATE)
        while (c.moveToNext() && out.size < limit) {
          out.add(
            mapOf(
              "id" to c.getLong(idCol).toString(),
              "address" to (c.getString(addressCol) ?: ""),
              "body" to (c.getString(bodyCol) ?: ""),
              "date" to c.getLong(dateCol).toDouble(),
            ),
          )
        }
      }
      out
    }
  }
}
