package expo.modules.reminderoverlay

import java.net.InetAddress
import java.util.concurrent.TimeUnit
import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject

/**
 * Expands a shared short link (maps.app.goo.gl/…) to the full Google Maps URL.
 *
 * Some Indian ISPs (Jio among them) answer DNS for `*.goo.gl` with a blocked
 * address, so the JS `fetch` in `src/lib/maps-link.ts` never gets past the
 * short link. Here `goo.gl` hosts are looked up through Google's
 * DNS-over-HTTPS instead, then the redirects are followed by hand.
 */
internal object LinkExpander {
  private const val UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

  private val doh = OkHttpClient.Builder().callTimeout(6, TimeUnit.SECONDS).build()

  private val dns = object : Dns {
    override fun lookup(hostname: String): List<InetAddress> {
      if (hostname == "goo.gl" || hostname.endsWith(".goo.gl")) {
        val viaDoh = try {
          dohLookup(hostname)
        } catch (_: Exception) {
          emptyList()
        }
        if (viaDoh.isNotEmpty()) return viaDoh
      }
      return Dns.SYSTEM.lookup(hostname)
    }
  }

  private val client = OkHttpClient.Builder()
    .dns(dns)
    .followRedirects(false)
    .followSslRedirects(false)
    .callTimeout(10, TimeUnit.SECONDS)
    .build()

  /** A records for `host` from dns.google's JSON API. */
  private fun dohLookup(host: String): List<InetAddress> {
    val req = Request.Builder().url("https://dns.google/resolve?name=$host&type=A").build()
    doh.newCall(req).execute().use { res ->
      val body = res.body?.string() ?: return emptyList()
      val answers = JSONObject(body).optJSONArray("Answer") ?: return emptyList()
      val out = ArrayList<InetAddress>()
      for (i in 0 until answers.length()) {
        val a = answers.optJSONObject(i) ?: continue
        // type 1 = A record; `data` is an IP literal, so no further lookup.
        if (a.optInt("type") == 1) out.add(InetAddress.getByName(a.optString("data")))
      }
      return out
    }
  }

  /** Follows up to 5 redirects and returns the last URL (null if the first request fails). */
  fun expand(url: String): String? {
    var current = url
    repeat(5) {
      val req = Request.Builder().url(current).header("User-Agent", UA).build()
      val next = try {
        client.newCall(req).execute().use { res ->
          if (!res.isRedirect) return current
          res.header("Location")?.let { res.request.url.resolve(it)?.toString() }
        }
      } catch (_: Exception) {
        return if (current == url) null else current
      }
      current = next ?: return current
    }
    return current
  }
}
