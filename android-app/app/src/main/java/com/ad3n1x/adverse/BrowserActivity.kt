package com.ad3n1x.adverse

import android.app.Activity
import android.app.AlertDialog
import android.os.Bundle
import android.graphics.Color
import android.content.res.ColorStateList
import android.net.Uri
import android.view.View
import android.webkit.*
import android.widget.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.util.concurrent.TimeUnit

class BrowserActivity : Activity() {
    companion object {
        const val EXTRA_URL = "com.ad3n1x.adverse.EXTRA_URL"
        private const val API = "https://adverse-api-7yim.onrender.com/api/v1/public-search/check-link"
    }
    private lateinit var web: WebView
    private lateinit var address: EditText
    private lateinit var status: TextView
    private lateinit var progress: ProgressBar
    private lateinit var forwardButton: Button
    private var saverMode = "Standard Saver"
    private var blocked = 0
    private var savedKb = 0L
    private val client = OkHttpClient.Builder().callTimeout(15, TimeUnit.SECONDS).build()
    private val ads = setOf("doubleclick.net","googlesyndication.com","google-analytics.com","adservice.google.com","connect.facebook.net","criteo.com","adnxs.com","amazon-adsystem.com","rubiconproject.com","pubmatic.com","outbrain.com","taboola.com","hotjar.com","segment.io","mixpanel.com","amplitude.com","scorecardresearch.com","quantserve.com","appsflyer.com","clarity.ms","analytics.tiktok.com")
    private val fonts = setOf("fonts.googleapis.com","fonts.gstatic.com","use.typekit.net","fast.fonts.net")
    private val heavy = setOf("giphy.com","tenor.com","gfycat.com","v.redd.it")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(11,18,32); window.navigationBarColor = Color.rgb(16,29,34)
        val root = LinearLayout(this).apply { orientation = 1; setBackgroundColor(Color.rgb(16,29,34)); setPadding(8,8,8,4) }
        val bar = LinearLayout(this).apply { orientation = 0 }
        val back = Button(this).apply { text = "‹"; textSize = 20f; isAllCaps = false; setTextColor(Color.WHITE); backgroundTintList = ColorStateList.valueOf(0xFF18263A.toInt()); setOnClickListener { if (::web.isInitialized && web.canGoBack()) web.goBack() else finish() } }
        address = EditText(this).apply { hint = "Search or enter website"; setSingleLine(true); textSize = 14f; setPadding(12, 0, 8, 0); setTextColor(Color.WHITE); setHintTextColor(0xFFA8B5C7.toInt()); backgroundTintList = ColorStateList.valueOf(0xFF65E6C0.toInt()); imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_GO; setOnEditorActionListener { _, action, _ -> if (action == android.view.inputmethod.EditorInfo.IME_ACTION_GO) { navigate(text.toString()); true } else false } }
        val go = Button(this).apply { text = "Go"; isAllCaps = false; textSize = 11f; setTextColor(Color.WHITE); backgroundTintList = ColorStateList.valueOf(0xFF287F6B.toInt()); setOnClickListener { navigate(address.text.toString()) } }
        bar.addView(back, LinearLayout.LayoutParams(42,48)); bar.addView(address, LinearLayout.LayoutParams(0,48,1f)); bar.addView(go, LinearLayout.LayoutParams(56,48))
        root.addView(bar)
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100; progressTintList = ColorStateList.valueOf(0xFF65E6C0.toInt()); visibility = View.GONE }
        root.addView(progress, LinearLayout.LayoutParams(-1, 3))
        val spinner = Spinner(this)
        val modes = listOf("Standard Saver","Ultra Saver","Emergency Text Mode")
        spinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, modes)
        spinner.onItemSelectedListener = object: AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(p: AdapterView<*>?) {}
            override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) { saverMode = modes[pos]; updateStatus(); if (::web.isInitialized && web.url != null) web.reload() }
        }
        root.addView(spinner)
        status = TextView(this).apply { setTextColor(0xFF9CF2D8.toInt()); textSize = 11f; setPadding(5,5,5,8) }; root.addView(status)
        web = WebView(this).apply {
            settings.javaScriptEnabled = true; settings.domStorageEnabled = true; settings.mediaPlaybackRequiresUserGesture = true
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            if (android.os.Build.VERSION.SDK_INT >= 26) settings.safeBrowsingEnabled = true
            webViewClient = object: WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (request.isForMainFrame) { navigate(request.url.toString()); return true }
                    return request.url.scheme != "http" && request.url.scheme != "https"
                }
                override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) { progress.progress = 0; progress.visibility = View.VISIBLE; status.text = "Loading page…" }
                override fun onPageFinished(view: WebView, url: String) {
                    progress.visibility = View.GONE
                    address.setText(url)
                    if (saverMode != "Standard Saver") evaluateJavascript("document.querySelectorAll('video,audio').forEach(e=>{e.pause();e.preload='none';e.autoplay=false})",null)
                    if (saverMode == "Emergency Text Mode") evaluateJavascript("document.querySelectorAll('img,video,audio,iframe').forEach(e=>e.style.visibility='hidden')",null)
                }
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                    val u = request.url; val h = u.host?.lowercase().orEmpty(); val p = u.path?.lowercase().orEmpty()
                    val ad = ads.any { h == it || h.endsWith("."+it) } || h.startsWith("ads.")
                    val font = saverMode != "Standard Saver" && (fonts.any { h == it || h.endsWith("."+it) } || p.endsWith(".woff") || p.endsWith(".woff2"))
                    val media = saverMode != "Standard Saver" && heavy.any { h == it || h.endsWith("."+it) }
                    val emergency = saverMode == "Emergency Text Mode" && Regex(".*\\.(png|jpe?g|gif|webp|svg|mp4|webm|mp3|wav|woff2?)(\\?.*)?$").matches(p)
                    if (ad || font || media || emergency) {
                        blocked++; savedKb += if (media || emergency) 175 else 35
                        runOnUiThread { updateStatus() }
                        return WebResourceResponse("text/plain","utf-8",403,"Blocked by ADVERSE DataSaver",emptyMap(),ByteArrayInputStream(ByteArray(0)))
                    }
                    return super.shouldInterceptRequest(view,request)
                }
            }
            webChromeClient = object: WebChromeClient() { override fun onProgressChanged(view: WebView, value: Int) { progress.progress = value; progress.visibility = if (value in 1..99) View.VISIBLE else View.GONE } }
        }
        root.addView(web,LinearLayout.LayoutParams(-1,0,1f))
        val bottom = LinearLayout(this).apply { orientation = 0; setPadding(2, 3, 2, 3) }
        val previous = Button(this).apply { text = "Back"; isAllCaps = false; setOnClickListener { if (web.canGoBack()) web.goBack() } }
        forwardButton = Button(this).apply { text = "Forward"; isAllCaps = false; setOnClickListener { if (web.canGoForward()) web.goForward() } }
        val reload = Button(this).apply { text = "Reload"; isAllCaps = false; setOnClickListener { web.reload() } }
        listOf(previous, forwardButton, reload).forEach { button -> button.setTextColor(Color.WHITE); button.backgroundTintList = ColorStateList.valueOf(0xFF20383D.toInt()); bottom.addView(button, LinearLayout.LayoutParams(0, 44, 1f)) }
        root.addView(bottom, LinearLayout.LayoutParams(-1, 48)); setContentView(root); updateStatus()
        val initial = intent.getStringExtra(EXTRA_URL) ?: intent.dataString.orEmpty()
        if (initial.isNotBlank()) navigate(initial)
    }

    private fun updateStatus() {
        if (::status.isInitialized) status.text = saverMode + " • " + blocked + " requests blocked • estimated " + savedKb + " KB saved"
    }

    private fun navigate(raw: String) {
        val candidate = if (raw.trim().contains("://")) raw.trim() else "https://" + raw.trim()
        val uri = runCatching { Uri.parse(candidate) }.getOrNull()
        if (uri == null || (uri.scheme != "http" && uri.scheme != "https") || uri.host.isNullOrBlank() || uri.userInfo != null) {
            Toast.makeText(this,"Enter a valid http or https address",Toast.LENGTH_LONG).show(); return
        }
        address.setText(candidate); status.text = "Checking destination…"; progress.visibility = View.VISIBLE
        Thread {
            var warning = ""
            try {
                val body = JSONObject().put("url",candidate).toString().toRequestBody("application/json".toMediaType())
                val req = Request.Builder().url(API).post(body).header("Accept","application/json").build()
                client.newCall(req).execute().use { res ->
                    if (!res.isSuccessful) warning = "ADVERSE could not verify this destination."
                    else {
                        val d = JSONObject(res.body?.string().orEmpty()).optJSONObject("data") ?: JSONObject()
                        if (d.optString("status","not_confirmed") != "reachable") warning = "This destination could not be confirmed as reachable. " + d.optString("note")
                    }
                }
            } catch (_: Exception) { warning = "The safety check is unavailable right now." }
            val host = uri.host?.lowercase().orEmpty()
            val flags = mutableListOf<String>()
            if (uri.scheme != "https") flags.add("The connection is not encrypted (HTTP).")
            if (host.startsWith("xn--") || host.split(".").any { it.startsWith("xn--") }) flags.add("The domain uses encoded international characters.")
            if (host.matches(Regex("\\d{1,3}(\\.\\d{1,3}){3}"))) flags.add("The address uses a raw IP address.")
            if (listOf("bit.ly","tinyurl.com","t.co","is.gd","cutt.ly").contains(host)) flags.add("This is a shortened link; its final destination may differ.")
            if (flags.isNotEmpty()) warning = listOf(warning,flags.joinToString(" ")).filter { it.isNotBlank() }.joinToString(" ")
            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                if (warning.isNotBlank()) AlertDialog.Builder(this).setTitle("Link safety warning")
                    .setMessage(warning + "\n\nChecks are advisory and cannot detect every threat. Continue only if you trust the source.")
                    .setNegativeButton("Go back") { _, _ -> progress.visibility = View.GONE }.setPositiveButton("Open anyway") { _,_ -> web.loadUrl(candidate,mapOf("Save-Data" to "on")) }.show()
                else web.loadUrl(candidate,mapOf("Save-Data" to "on"))
            }
        }.start()
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() { if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed() }
    override fun onDestroy() { if (::web.isInitialized) { web.stopLoading(); web.destroy() }; super.onDestroy() }
}