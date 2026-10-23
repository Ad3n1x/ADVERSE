package com.ad3n1x.adverse

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import android.widget.FrameLayout
import android.view.Gravity
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.graphics.Color

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var progress: ProgressBar
    private lateinit var splashOverlay: FrameLayout
    private val homeUrl = "https://adverse-web.onrender.com/"
    private val nativeUserAgentMarker = " ADVERSENativeAndroid/1"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(11, 13, 16)
        window.navigationBarColor = Color.rgb(11, 13, 16)
        window.decorView.systemUiVisibility = 0

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.rgb(11, 13, 16))
        webView = WebView(this)
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal)
        progress.max = 100
        progress.progressTintList = android.content.res.ColorStateList.valueOf(Color.rgb(185, 245, 107))
        progress.indeterminateTintList = android.content.res.ColorStateList.valueOf(Color.rgb(185, 245, 107))

        root.addView(webView, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))
        val progressParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, dp(3), Gravity.TOP
        )
        root.addView(progress, progressParams)

        // Native welcome screen stays above the WebView until the first page is ready.
        splashOverlay = createWelcomeScreen()
        root.addView(splashOverlay, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))
        setContentView(root)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.loadsImagesAutomatically = true
        webView.settings.javaScriptCanOpenWindowsAutomatically = false
        webView.settings.setSupportMultipleWindows(false)
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.settings.setGeolocationEnabled(false)
        webView.settings.safeBrowsingEnabled = true
        // UI hint only, not an authentication or security mechanism.
        val defaultUserAgent = webView.settings.userAgentString.orEmpty()
        if (!defaultUserAgent.contains("ADVERSENativeAndroid/1")) {
            webView.settings.userAgentString = defaultUserAgent + nativeUserAgentMarker
        }
        webView.isVerticalScrollBarEnabled = false
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "https" || uri.scheme == "http") return false
                return true
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                progress.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                // Enforce APK-only cleanup in the native wrapper as well as the web UI.
                // This prevents a stale/cached website bundle from showing download/install promo content.
                val hideAppPromotion = """
                    (function() {
                      var style = document.getElementById('adverse-native-app-cleanup');
                      if (!style) {
                        style = document.createElement('style');
                        style.id = 'adverse-native-app-cleanup';
                        style.textContent = '.adverse-home-download, .find-footer { display: none !important; }';
                        (document.head || document.documentElement).appendChild(style);
                      }
                      document.querySelectorAll('.adverse-home-download, .find-footer').forEach(function(el) {
                        el.style.setProperty('display', 'none', 'important');
                        el.setAttribute('aria-hidden', 'true');
                      });
                      return true;
                    })();
                """.trimIndent()
                view?.evaluateJavascript(hideAppPromotion) {
                    progress.visibility = View.GONE
                    if (::splashOverlay.isInitialized) {
                        splashOverlay.animate()
                            .alpha(0f)
                            .setDuration(220)
                            .withEndAction {
                                (splashOverlay.parent as? FrameLayout)?.removeView(splashOverlay)
                            }
                            .start()
                    }
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true && ::splashOverlay.isInitialized) {
                    splashOverlay.animate().alpha(0f).setDuration(180).withEndAction {
                        (splashOverlay.parent as? FrameLayout)?.removeView(splashOverlay)
                    }.start()
                }
            }
        }

        handleIntent(intent)
    }

    private fun createWelcomeScreen(): FrameLayout {
        val overlay = FrameLayout(this)
        overlay.setBackgroundColor(Color.rgb(11, 13, 16))

        val content = LinearLayout(this)
        content.orientation = LinearLayout.VERTICAL
        content.gravity = Gravity.CENTER
        content.setPadding(dp(24), dp(24), dp(24), dp(24))

        val logo = ImageView(this)
        logo.setImageResource(R.drawable.adverse_fingerprint)
        logo.contentDescription = "ADVERSE fingerprint logo"
        logo.scaleType = ImageView.ScaleType.FIT_CENTER
        content.addView(logo, LinearLayout.LayoutParams(dp(88), dp(88)).apply {
            bottomMargin = dp(20)
        })

        val title = TextView(this)
        title.text = "ADVERSE"
        title.setTextColor(Color.rgb(244, 247, 251))
        title.textSize = 25f
        title.letterSpacing = 0.16f
        title.gravity = Gravity.CENTER
        content.addView(title, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        val subtitle = TextView(this)
        subtitle.text = "FIND ANYTHING"
        subtitle.setTextColor(Color.rgb(185, 245, 107))
        subtitle.textSize = 11f
        subtitle.letterSpacing = 0.22f
        subtitle.gravity = Gravity.CENTER
        content.addView(subtitle, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(7) })

        val spinner = ProgressBar(this)
        spinner.indeterminateTintList = android.content.res.ColorStateList.valueOf(Color.rgb(185, 245, 107))
        content.addView(spinner, LinearLayout.LayoutParams(dp(28), dp(28)).apply {
            topMargin = dp(30)
        })

        val loading = TextView(this)
        loading.text = "Preparing your workspace…"
        loading.setTextColor(Color.rgb(154, 163, 174))
        loading.textSize = 12f
        loading.gravity = Gravity.CENTER
        content.addView(loading, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(12) })

        overlay.addView(content, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
            Gravity.CENTER
        ))
        return overlay
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val incoming = when (intent?.action) {
            Intent.ACTION_VIEW -> intent.dataString
            Intent.ACTION_SEND -> intent.getStringExtra(Intent.EXTRA_TEXT)?.let(::extractUrl)
            else -> null
        }
        val safeUrl = validateWebUrl(incoming)
        webView.loadUrl(safeUrl ?: homeUrl)
    }

    private fun extractUrl(text: String): String? {
        val match = Regex("""https?://[^\s<>"']+""", RegexOption.IGNORE_CASE).find(text) ?: return null
        return match.value.trimEnd(',', '.', ';', ')', '!', '?')
    }

    private fun validateWebUrl(value: String?): String? {
        if (value.isNullOrBlank()) return null
        return try {
            val uri = Uri.parse(value)
            if ((uri.scheme == "https" || uri.scheme == "http") && !uri.host.isNullOrBlank()) uri.toString() else null
        } catch (_: Exception) {
            null
        }
    }

    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
