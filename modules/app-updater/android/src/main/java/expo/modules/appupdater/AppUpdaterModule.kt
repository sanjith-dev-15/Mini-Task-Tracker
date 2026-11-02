package expo.modules.appupdater

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android-only bridge for the in-app updater:
 * - `getVersion()` reports the installed versionCode / versionName.
 * - `installApk()` hands a downloaded APK (a content:// URI from expo-file-system's
 *   FileProvider) to the system package installer.
 * Checking for and downloading updates stays in JS (`@/lib/app-update`).
 */
class AppUpdaterModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AppUpdater")

    Function("getVersion") {
      @Suppress("DEPRECATION")
      val info = context.packageManager.getPackageInfo(context.packageName, 0)
      val code =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode
        else @Suppress("DEPRECATION") info.versionCode.toLong()
      mapOf("versionCode" to code.toDouble(), "versionName" to (info.versionName ?: ""))
    }

    /** Whether "Install unknown apps" is allowed for this app (always true before Android 8). */
    Function("canInstallPackages") {
      Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()
    }

    /** Opens the "Install unknown apps" toggle for this app. */
    Function("openInstallSettings") {
      val intent =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
        } else {
          Intent(Settings.ACTION_SECURITY_SETTINGS)
        }
      start(intent)
    }

    /** Launches the system installer for the APK at `contentUri`. */
    Function("installApk") { contentUri: String ->
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(Uri.parse(contentUri), "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      start(intent)
    }
  }

  private fun start(intent: Intent) {
    val activity = appContext.currentActivity
    if (activity != null) {
      activity.startActivity(intent)
    } else {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }
}
