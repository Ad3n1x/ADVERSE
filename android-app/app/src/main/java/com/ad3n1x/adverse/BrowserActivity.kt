package com.ad3n1x.adverse

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.*
import android.widget.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

class BrowserActivity : Activity() {
    companion object {
        const val EXTRA_URL = "com.ad3n1x.adverse.EXTRA_URL"
        private const val API = "https://adverse-api-7yim.onrender.com/api/v1/public-search/check-link"
        private const val HOME = "https://adverse-web.onrender.com/"
        private const val PREFS = "adverse_browser"
        private const val MAX_TABS = 3
        private const val BG = 0xFF0B1220.toInt()
        private const val SURFACE = 0xFF111C2E.toInt()
        private const val RAISED = 0xFF18263A.toInt()
        private const val TEXT = 0xFFF8FAFC.toInt()
        private const val MUTED = 0xFFA8B5C7.toInt()
        private const val ACCENT = 0xFF65E6C0.toInt()
    }

    private data class Tab(var url: String = HOME, var title: String = "New tab", var view: WebView? = null)
    private val tabs = mutableListOf<Tab>()
    private val bookmarks = mutableListOf<Pair<String, String>>()
    private val history = mutableListOf<Pair<String, String>>()
    private lateinit var prefs: android.content.SharedPreferences
    private lateinit var host: FrameLayout
    private lateinit var address: EditText
    private lateinit var status: TextView
    private lateinit var progress: ProgressBar
    private lateinit var tabCount: Button
    private lateinit var backButton: Button
    private lateinit var forwardButton: Button
    private var active = 0
    private var saverMode = "Standard Saver"
    private var desktopMode = false
    private var blocked = 0
    private var savedKb = 0L
    private val client = OkHttpClient.Builder().callTimeout(15, TimeUnit.SECONDS).build()
    private val ads = setOf("doubleclick.net","googlesyndication.com","google-analytics.com","adservice.google.com","connect.facebook.net","criteo.com","adnxs.com","amazon-adsystem.com","rubiconproject.com","pubmatic.com","outbrain.com","taboola.com","hotjar.com","segment.io","mixpanel.com","amplitude.com","scorecardresearch.com","quantserve.com","appsflyer.com","clarity.ms","analytics.tiktok.com")
    private val fonts = setOf("fonts.googleapis.com","fonts.gstatic.com","use.typekit.net","fast.fonts.net")
    private val heavy = setOf("giphy.com","tenor.com","gfycat.com","v.redd.it")
    private val current: Tab? get() = tabs.getOrNull(active)
    private val web: WebView? get() = current?.view

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
        window.statusBarColor = BG
        window.navigationBarColor = BG
        loadLists()
        buildUi()
        val incoming = intent.getStringExtra(EXTRA_URL) ?: intent.dataString.orEmpty()
        val restored = state?.getStringArrayList("tabs")
        if (restored != null) {
            restored.take(MAX_TABS).forEach { tabs.add(Tab(it)) }
            active = state.getInt("active", 0).coerceIn(0, (tabs.size - 1).coerceAtLeast(0))
        } else if (incoming.isNotBlank()) tabs.add(Tab(incoming))
        else {
            runCatching {
                val a = JSONArray(prefs.getString("open_tabs", "[]"))
                for (i in 0 until minOf(a.length(), MAX_TABS)) tabs.add(Tab(a.getString(i)))
            }
        }
        if (tabs.isEmpty()) tabs.add(Tab())
        showTab()
    }

    private fun buildUi() {
        val root = LinearLayout(this).apply { orientation = 1; setBackgroundColor(BG); setPadding(8, 7, 8, 4) }
        val top = LinearLayout(this).apply { orientation = 0; gravity = android.view.Gravity.CENTER_VERTICAL }
        val back = button("‹", 40) { if (web?.canGoBack() == true) web?.goBack() else finish() }
        address = EditText(this).apply {
            hint = "Search or enter website"; setSingleLine(true); textSize = 14f
            setPadding(12, 0, 8, 0); setTextColor(TEXT); setHintTextColor(MUTED)
            backgroundTintList = ColorStateList.valueOf(ACCENT)
            imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_GO
            setOnEditorActionListener { _, action, _ ->
                if (action == android.view.inputmethod.EditorInfo.IME_ACTION_GO) { navigate(text.toString()); true } else false
            }
        }
        val go = button("Go", 48) { navigate(address.text.toString()) }
        tabCount = button("1", 42) { showTabs() }
        top.addView(back); top.addView(address, LinearLayout.LayoutParams(0, 46, 1f)); top.addView(go); top.addView(tabCount)
        root.addView(top)
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100; progressTintList = ColorStateList.valueOf(ACCENT); visibility = View.GONE
        }
        root.addView(progress, LinearLayout.LayoutParams(-1, 3))
        val tools = LinearLayout(this).apply { orientation = 0; gravity = android.view.Gravity.CENTER_VERTICAL }
        val saver = Spinner(this)
        val modes = listOf("Standard Saver", "Ultra Saver", "Emergency Text Mode")
        saver.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, modes)
        saver.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(p: AdapterView<*>?) {}
            override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) {
                if (saverMode != modes[pos]) { saverMode = modes[pos]; updateStatus(); web?.reload() }
            }
        }
        tools.addView(saver, LinearLayout.LayoutParams(0, 42, 1f))
        tools.addView(button("Desktop", 82) { toggleDesktop() })
        root.addView(tools)
        status = TextView(this).apply { setTextColor(ACCENT); textSize = 10f; setPadding(5, 2, 5, 6) }
        root.addView(status)
        host = FrameLayout(this).apply { setBackgroundColor(Color.WHITE) }
        root.addView(host, LinearLayout.LayoutParams(-1, 0, 1f))
        val bottom = LinearLayout(this).apply { orientation = 0; setPadding(0, 3, 0, 2) }
        backButton = button("Back", 0) { if (web?.canGoBack() == true) web?.goBack() }
        forwardButton = button("Forward", 0) { if (web?.canGoForward() == true) web?.goForward() }
        val home = button("Home", 0) { navigate(HOME) }
        val save = button("☆ Save", 0) { saveBookmark() }
        val menu = button("•••", 0) { showMenu() }
        listOf(backButton, forwardButton, home, save, menu).forEach { bottom.addView(it, LinearLayout.LayoutParams(0, 44, 1f)) }
        root.addView(bottom)
        setContentView(root)
        updateStatus()
    }

    private fun button(label: String, width: Int, action: () -> Unit): Button =
        Button(this).apply {
            text = label; isAllCaps = false; textSize = 11f; setTextColor(TEXT)
            backgroundTintList = ColorStateList.valueOf(RAISED)
            setOnClickListener { action() }
            if (width > 0) layoutParams = LinearLayout.LayoutParams(dp(width), 46)
        }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun makeWebView(tab: Tab): WebView = WebView(this).apply {
        setBackgroundColor(Color.WHITE)
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.mediaPlaybackRequiresUserGesture = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.blockNetworkImage = saverMode == "Emergency Text Mode"
        settings.userAgentString = WebSettings.getDefaultUserAgent(this@BrowserActivity)
        if (desktopMode) applyDesktop(settings)
        if (android.os.Build.VERSION.SDK_INT >= 26) settings.safeBrowsingEnabled = true
        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (!request.isForMainFrame) return request.url.scheme != "http" && request.url.scheme != "https"
                navigate(request.url.toString()); return true
            }
            override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                if (view === web) { progress.progress = 0; progress.visibility = View.VISIBLE; status.text = "Loading page…" }
            }
            override fun onPageFinished(view: WebView, url: String) {
                tab.url = url
                tab.title = view.title?.takeIf { it.isNotBlank() } ?: Uri.parse(url).host.orEmpty()
                if (view === web) {
                    address.setText(url); progress.visibility = View.GONE
                    backButton.isEnabled = view.canGoBack(); forwardButton.isEnabled = view.canGoForward()
                    updateStatus()
                }
                if (saverMode != "Standard Saver") view.evaluateJavascript("document.querySelectorAll('video,audio').forEach(e=>{e.pause();e.preload='none';e.autoplay=false})", null)
                if (saverMode == "Emergency Text Mode") view.evaluateJavascript("document.querySelectorAll('img,video,audio,iframe').forEach(e=>e.style.visibility='hidden')", null)
                addHistory(tab.title, url); persistTabs()
            }
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val u = request.url; val h = u.host?.lowercase().orEmpty(); val p = u.path?.lowercase().orEmpty()
                val ad = ads.any { h == it || h.endsWith("." + it) } || h.startsWith("ads.")
                val font = saverMode != "Standard Saver" && (fonts.any { h == it || h.endsWith("." + it) } || p.endsWith(".woff") || p.endsWith(".woff2"))
                val media = saverMode != "Standard Saver" && heavy.any { h == it || h.endsWith("." + it) }
                val emergency = saverMode == "Emergency Text Mode" && Regex(".*\\.(png|jpe?g|gif|webp|svg|mp4|webm|mp3|wav|woff2?)(\\?.*)?$").matches(p)
                if (ad || font || media || emergency) {
                    synchronized(this@BrowserActivity) { blocked++; savedKb += if (media || emergency) 175 else 35 }
                    runOnUiThread { updateStatus() }
                    return WebResourceResponse("text/plain", "utf-8", 403, "Blocked by ADVERSE DataSaver", emptyMap(), ByteArrayInputStream(ByteArray(0)))
                }
                return super.shouldInterceptRequest(view, request)
            }
        }
        webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, value: Int) {
                if (view === web) { progress.progress = value; progress.visibility = if (value in 1..99) View.VISIBLE else View.GONE }
            }
            override fun onReceivedTitle(view: WebView, title: String?) { if (!title.isNullOrBlank()) tab.title = title }
        }
    }

    private fun showTab() {
        if (tabs.isEmpty()) tabs.add(Tab())
        active = active.coerceIn(0, tabs.lastIndex)
        val tab = tabs[active]
        if (tab.view == null) tab.view = makeWebView(tab)
        host.removeAllViews()
        (tab.view?.parent as? android.view.ViewGroup)?.removeView(tab.view)
        host.addView(tab.view, FrameLayout.LayoutParams(-1, -1))
        address.setText(tab.view?.url ?: "")
        tabCount.text = tabs.size.toString()
        backButton.isEnabled = tab.view?.canGoBack() == true
        forwardButton.isEnabled = tab.view?.canGoForward() == true
        if (tab.view?.url.isNullOrBlank()) tab.view?.loadUrl(tab.url, mapOf("Save-Data" to "on"))
        updateStatus()
    }

    private fun newTab() {
        if (tabs.size >= MAX_TABS) {
            Toast.makeText(this, "Maximum of three tabs on this device to protect memory.", Toast.LENGTH_LONG).show(); return
        }
        tabs.add(Tab()); active = tabs.lastIndex; showTab(); persistTabs()
    }

    private fun showTabs() {
        val labels = tabs.mapIndexed { i, t -> (if (i == active) "● " else "") + t.title + "\n" + t.url }.toMutableList()
        labels.add("+ New tab")
        AlertDialog.Builder(this).setTitle("Tabs (" + tabs.size + "/" + MAX_TABS + ")")
            .setItems(labels.toTypedArray()) { _, which ->
                if (which == tabs.size) newTab()
                else AlertDialog.Builder(this).setTitle(tabs[which].title)
                    .setItems(arrayOf("Switch to tab", "Close tab")) { _, action ->
                        if (action == 0) { active = which; showTab() } else closeTab(which)
                    }.show()
            }.setNegativeButton("Done", null).show()
    }

    private fun closeTab(index: Int) {
        if (tabs.size == 1) {
            tabs[0].view?.loadUrl(HOME); tabs[0].url = HOME; tabs[0].title = "New tab"
        } else {
            tabs.removeAt(index).view?.let { it.stopLoading(); it.destroy() }
            if (index < active) active-- else if (index == active) active = minOf(active, tabs.lastIndex)
        }
        showTab(); persistTabs()
    }

    private fun showMenu() {
        val items = arrayOf("New tab", "Bookmarks", "Browsing history", "Share page", "Reload", "Clear browsing data")
        AlertDialog.Builder(this).setTitle("ADVERSE browser").setItems(items) { _, i ->
            when (i) {
                0 -> newTab()
                1 -> showList("Bookmarks", bookmarks, true)
                2 -> showList("History", history, false)
                3 -> sharePage()
                4 -> web?.reload()
                5 -> clearData()
            }
        }.show()
    }

    private fun showList(title: String, list: List<Pair<String, String>>, saved: Boolean) {
        if (list.isEmpty()) { AlertDialog.Builder(this).setTitle(title).setMessage("Nothing here yet.").setPositiveButton("OK", null).show(); return }
        AlertDialog.Builder(this).setTitle(title).setItems(list.map { it.first + "\n" + it.second }.toTypedArray()) { _, i ->
            val item = list[i]
            if (saved) AlertDialog.Builder(this).setTitle(item.first).setItems(arrayOf("Open", "Remove bookmark")) { _, a ->
                if (a == 0) navigate(item.second) else { bookmarks.remove(item); saveBookmarks() }
            }.show() else navigate(item.second)
        }.setNegativeButton("Close", null).show()
    }

    private fun saveBookmark() {
        val url = web?.url ?: current?.url ?: return
        if (bookmarks.any { it.second == url }) { Toast.makeText(this, "Already bookmarked", Toast.LENGTH_SHORT).show(); return }
        bookmarks.add(0, (web?.title?.takeIf { it.isNotBlank() } ?: Uri.parse(url).host.orEmpty()) to url)
        while (bookmarks.size > 100) bookmarks.removeAt(bookmarks.lastIndex)
        saveBookmarks(); Toast.makeText(this, "Bookmark saved", Toast.LENGTH_SHORT).show()
    }

    private fun addHistory(title: String, url: String) {
        if (url.isBlank() || url == "about:blank") return
        history.removeAll { it.second == url }
        history.add(0, title to url)
        while (history.size > 200) history.removeAt(history.lastIndex)
        saveHistory()
    }

    private fun sharePage() {
        val url = web?.url ?: current?.url ?: return
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, url) }, "Share page"))
    }

    private fun toggleDesktop() {
        desktopMode = !desktopMode
        tabs.forEach { it.view?.settings?.let { s -> applyDesktop(s) } }
        Toast.makeText(this, if (desktopMode) "Desktop site enabled. Reload to apply." else "Mobile site enabled. Reload to apply.", Toast.LENGTH_SHORT).show()
    }

    private fun applyDesktop(s: WebSettings) {
        s.userAgentString = if (desktopMode) WebSettings.getDefaultUserAgent(this).replace(Regex("Android.*"), "X11; Linux x86_64").replace("Mobile", "")
        else WebSettings.getDefaultUserAgent(this)
        s.useWideViewPort = desktopMode; s.loadWithOverviewMode = desktopMode
    }

    private fun clearData() {
        AlertDialog.Builder(this).setTitle("Clear browsing data?")
            .setMessage("This clears history, cookies and cache. Bookmarks remain.")
            .setNegativeButton("Cancel", null).setPositiveButton("Clear") { _, _ ->
                history.clear(); saveHistory()
                tabs.forEach { it.view?.clearHistory(); it.view?.clearCache(true) }
                CookieManager.getInstance().removeAllCookies(null); CookieManager.getInstance().flush()
                Toast.makeText(this, "Browsing data cleared", Toast.LENGTH_SHORT).show()
            }.show()
    }

    private fun navigate(raw: String) {
        val value = raw.trim()
        if (value.isBlank()) return
        val candidate = if (value.contains("://")) value else if (value.contains(" ") || !value.contains(".")) {
            "https://www.google.com/search?q=" + URLEncoder.encode(value, "UTF-8")
        } else "https://" + value
        val uri = runCatching { Uri.parse(candidate) }.getOrNull()
        if (uri == null || (uri.scheme != "http" && uri.scheme != "https") || uri.host.isNullOrBlank() || uri.userInfo != null) {
            Toast.makeText(this, "Enter a valid web address or search term", Toast.LENGTH_LONG).show(); return
        }
        address.setText(candidate); status.text = "Checking destination…"; progress.visibility = View.VISIBLE
        Thread {
            var warning = ""
            try {
                val body = JSONObject().put("url", candidate).toString().toRequestBody("application/json".toMediaType())
                val req = Request.Builder().url(API).post(body).header("Accept", "application/json").build()
                client.newCall(req).execute().use { res ->
                    if (!res.isSuccessful) warning = "ADVERSE could not verify this destination."
                    else {
                        val d = JSONObject(res.body?.string().orEmpty()).optJSONObject("data") ?: JSONObject()
                        if (d.optString("status", "not_confirmed") != "reachable") warning = "This destination could not be confirmed as reachable. " + d.optString("note")
                    }
                }
            } catch (_: Exception) { warning = "The link check is unavailable right now." }
            val h = uri.host?.lowercase().orEmpty()
            val flags = mutableListOf<String>()
            if (uri.scheme != "https") flags.add("The connection is not encrypted (HTTP).")
            if (h.startsWith("xn--") || h.split(".").any { it.startsWith("xn--") }) flags.add("The domain uses encoded international characters.")
            if (h.matches(Regex("\\d{1,3}(\\.\\d{1,3}){3}"))) flags.add("The address uses a raw IP address.")
            if (listOf("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly").contains(h)) flags.add("This is a shortened link.")
            if (flags.isNotEmpty()) warning = listOf(warning, flags.joinToString(" ")).filter { it.isNotBlank() }.joinToString(" ")
            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                if (warning.isNotBlank()) AlertDialog.Builder(this).setTitle("Link safety notice")
                    .setMessage(warning + "\n\nChecks are advisory and cannot detect every threat. Continue only if you trust the source.")
                    .setNegativeButton("Go back") { _, _ -> progress.visibility = View.GONE }
                    .setPositiveButton("Open anyway") { _, _ -> openUrl(candidate) }.show()
                else openUrl(candidate)
            }
        }.start()
    }

    private fun openUrl(url: String) {
        val tab = current ?: return
        if (tab.view == null) tab.view = makeWebView(tab)
        host.removeAllViews()
        (tab.view?.parent as? android.view.ViewGroup)?.removeView(tab.view)
        host.addView(tab.view, FrameLayout.LayoutParams(-1, -1))
        tab.url = url; tab.view?.loadUrl(url, mapOf("Save-Data" to "on"))
    }

    private fun updateStatus() {
        if (::status.isInitialized) status.text = saverMode + " • " + blocked + " blocked • estimated " + savedKb + " KB saved • link checks are advisory"
    }

    private fun loadLists() {
        runCatching {
            val a = JSONArray(prefs.getString("bookmarks", "[]"))
            for (i in 0 until a.length()) { val o = a.getJSONObject(i); bookmarks.add(o.optString("title") to o.optString("url")) }
        }
        runCatching {
            val a = JSONArray(prefs.getString("history", "[]"))
            for (i in 0 until a.length()) { val o = a.getJSONObject(i); history.add(o.optString("title") to o.optString("url")) }
        }
    }

    private fun saveBookmarks() {
        val a = JSONArray(); bookmarks.forEach { a.put(JSONObject().put("title", it.first).put("url", it.second)) }
        prefs.edit().putString("bookmarks", a.toString()).apply()
    }
    private fun saveHistory() {
        val a = JSONArray(); history.forEach { a.put(JSONObject().put("title", it.first).put("url", it.second)) }
        prefs.edit().putString("history", a.toString()).apply()
    }
    private fun persistTabs() {
        val a = JSONArray(); tabs.forEach { a.put(it.view?.url ?: it.url) }
        prefs.edit().putString("open_tabs", a.toString()).apply()
    }

    override fun onSaveInstanceState(out: Bundle) {
        out.putStringArrayList("tabs", ArrayList(tabs.map { it.view?.url ?: it.url }))
        out.putInt("active", active); super.onSaveInstanceState(out)
    }
    override fun onPause() { persistTabs(); tabs.forEach { it.view?.onPause() }; super.onPause() }
    override fun onResume() { super.onResume(); tabs.forEach { it.view?.onResume() } }
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (web?.canGoBack() == true) web?.goBack() else if (tabs.size > 1) closeTab(active) else super.onBackPressed()
    }
    override fun onDestroy() {
        tabs.forEach { it.view?.let { v -> v.stopLoading(); v.destroy() } }
        super.onDestroy()
    }
}
