package expo.modules.kirosecurity

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

class KiroSecurityModule : Module() {
  private var ownedToken: String? = null
  private var receiver: BroadcastReceiver? = null
  private val handler = Handler(Looper.getMainLooper())
  private val context: Context get() = requireNotNull(appContext.reactContext)
  private val clipboard: ClipboardManager get() = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

  private fun clearOwned(token: String): Boolean {
    if (ownedToken != token || clipboard.primaryClipDescription?.label?.toString() != "kiro:$token") return false
    if (Build.VERSION.SDK_INT >= 28) clipboard.clearPrimaryClip()
    else clipboard.setPrimaryClip(ClipData.newPlainText("", ""))
    ownedToken = null
    return true
  }

  override fun definition() = ModuleDefinition {
    Name("KiroSecurity")
    Events("deviceLocked")

    OnCreate {
      receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          if (intent?.action == Intent.ACTION_SCREEN_OFF) sendEvent("deviceLocked", emptyMap<String, Any>())
        }
      }
      val filter = IntentFilter(Intent.ACTION_SCREEN_OFF)
      if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      else context.registerReceiver(receiver, filter)
    }
    OnDestroy {
      receiver?.let { context.unregisterReceiver(it) }
      handler.removeCallbacksAndMessages(null)
    }

    AsyncFunction("copy") { content: String, seconds: Double ->
      val token = UUID.randomUUID().toString()
      val clip = ClipData.newPlainText("kiro:$token", content)
      clip.description.extras = PersistableBundle().apply { putBoolean("android.content.extra.IS_SENSITIVE", true) }
      clipboard.setPrimaryClip(clip)
      ownedToken = token
      handler.removeCallbacksAndMessages(null)
      if (seconds > 0) handler.postDelayed({ clearOwned(token) }, (seconds * 1000).toLong())
      token
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("clearIfOwned") { token: String -> clearOwned(token) }.runOnQueue(Queues.MAIN)

    AsyncFunction("isDeviceLocked") {
      (context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isDeviceLocked
    }.runOnQueue(Queues.MAIN)
  }
}
