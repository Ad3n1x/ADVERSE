package com.ad3n1x.adverse

// Native Compose client for the ADVERSE public-search API.

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.content.SharedPreferences
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.Request
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

private val Ink = Color(0xFF0B1220)
private val Surface = Color(0xFF111C2E)
private val Raised = Color(0xFF18263A)
private val Stroke = Color(0xFF2A3B52)
private val White = Color(0xFFF8FAFC)
private val Muted = Color(0xFFA8B5C7)
private val Blue = Color(0xFF3B82F6)
private val BlueSoft = Color(0xFF93C5FD)
private val Cyan = Color(0xFF22D3EE)
private val Green = Color(0xFF34D399)
private const val API_BASE = "https://adverse-api-7yim.onrender.com/api/v1"

private data class Account(val email: String, val displayName: String, val role: String)
private class PersistentCookieJar(private val prefs: SharedPreferences) : CookieJar {
    private var cookies: List<Cookie> = load()
    @Synchronized override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val next = (this.cookies.filter { old -> cookies.none { it.name == old.name && it.domain == old.domain && it.path == old.path } } + cookies)
            .filter { !it.persistent || it.expiresAt > System.currentTimeMillis() }
        this.cookies = next
        val array = JSONArray()
        next.forEach { cookie ->
            array.put(JSONObject().apply {
                put("name", cookie.name); put("value", cookie.value); put("domain", cookie.domain)
                put("path", cookie.path); put("expiresAt", cookie.expiresAt); put("secure", cookie.secure)
                put("httpOnly", cookie.httpOnly); put("hostOnly", cookie.hostOnly); put("persistent", cookie.persistent)
            })
        }
        prefs.edit().putString("cookies", array.toString()).apply()
    }
    @Synchronized override fun loadForRequest(url: HttpUrl): List<Cookie> {
        cookies = cookies.filter { !it.persistent || it.expiresAt > System.currentTimeMillis() }
        return cookies.filter { cookie ->
            (if (cookie.hostOnly) url.host == cookie.domain else url.host == cookie.domain || url.host.endsWith("." + cookie.domain)) &&
                url.encodedPath.startsWith(cookie.path) && (!cookie.secure || url.isHttps)
        }
    }
    @Synchronized fun clear() { cookies = emptyList(); prefs.edit().remove("cookies").apply() }
    private fun load(): List<Cookie> = runCatching {
        val array = JSONArray(prefs.getString("cookies", "[]"))
        (0 until array.length()).mapNotNull { i ->
            val o = array.getJSONObject(i)
            val b = Cookie.Builder().name(o.getString("name")).value(o.getString("value")).path(o.optString("path", "/"))
            if (o.optBoolean("hostOnly", true)) b.hostOnlyDomain(o.getString("domain")) else b.domain(o.getString("domain"))
            if (o.optBoolean("persistent")) b.expiresAt(o.optLong("expiresAt"))
            if (o.optBoolean("secure")) b.secure()
            if (o.optBoolean("httpOnly")) b.httpOnly()
            b.build()
        }
    }.getOrDefault(emptyList())
}

private data class LinkCheckResult(val title: String, val finalUrl: String, val status: String, val note: String)

private data class SearchResult(
    val title: String, val url: String, val excerpt: String,
    val publisher: String, val status: String, val note: String,
    val finalUrl: String = "", val why: String = "", val warnings: String = "",
    val corroboration: String = ""
) {
    fun json() = JSONObject().apply {
        put("title", title); put("url", url); put("excerpt", excerpt)
        put("publisher", publisher); put("status", status); put("note", note)
        put("finalUrl", finalUrl); put("why", why); put("warnings", warnings)
        put("corroboration", corroboration)
    }
    companion object {
        private fun joined(array: JSONArray?): String = array?.let { (0 until it.length()).map { i -> it.optString(i) }.filter { it.isNotBlank() }.joinToString(" · ") }.orEmpty()
        fun parse(o: JSONObject) = SearchResult(
            o.optString("title", o.optString("url")),
            o.optString("url"), o.optString("excerpt"),
            o.optString("publisher", o.optString("provider", "Public source")),
            o.optJSONObject("linkCheck")?.optString("status") ?: o.optString("status", "not_checked"),
            o.optJSONObject("linkCheck")?.optString("note") ?: o.optString("note"),
            o.optJSONObject("linkCheck")?.optString("finalUrl").orEmpty(),
            joined(o.optJSONObject("whyThisResult")?.optJSONArray("signals")),
            joined(o.optJSONObject("linkSignals")?.optJSONArray("signals")),
            o.optJSONObject("corroboration")?.optInt("independentMatches")?.let { if (it > 0) "$it similar results from other domains (not fact verification)" else "" }.orEmpty()
        )
    }
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = android.graphics.Color.rgb(11, 18, 32)
        window.navigationBarColor = android.graphics.Color.rgb(11, 18, 32)
        window.decorView.systemUiVisibility = 0
        setContent { AdverseApp { value ->
            runCatching {
                val uri = Uri.parse(value)
                if (uri.scheme == "https" || uri.scheme == "http") startActivity(Intent(Intent.ACTION_VIEW, uri))
            }
        } }
    }
}

@Composable
private fun AdverseApp(openUrl: (String) -> Unit) {
    val context = LocalContext.current
    val prefs = remember {
        val masterKey = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(
            context, "adverse_native_secure", masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }
    val client = remember { OkHttpClient.Builder().cookieJar(PersistentCookieJar(prefs)).callTimeout(45, TimeUnit.SECONDS).build() }
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf(emptyList<SearchResult>()) }
    var saved by remember { mutableStateOf(loadSaved(prefs)) }
    var history by remember { mutableStateOf(loadHistory(prefs)) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var emptyMessage by remember { mutableStateOf("") }
    var urlToCheck by remember { mutableStateOf("") }
    var checkingLink by remember { mutableStateOf(false) }
    var linkCheck by remember { mutableStateOf<LinkCheckResult?>(null) }
    var linkError by remember { mutableStateOf("") }
    var tab by remember { mutableStateOf("Search") }
    var searchMode by remember { mutableStateOf("web") }
    var suggestions by remember { mutableStateOf(emptyList<String>()) }
    var statusFilter by remember { mutableStateOf("all") }
    var account by remember { mutableStateOf<Account?>(null) }
    var authMode by remember { mutableStateOf("login") }
    var authEmail by remember { mutableStateOf("") }
    var authPassword by remember { mutableStateOf("") }
    var authDisplayName by remember { mutableStateOf("") }
    var authMessage by remember { mutableStateOf("") }
    var authBusy by remember { mutableStateOf(false) }
    var authError by remember { mutableStateOf("") }
    var authChecked by remember { mutableStateOf(false) }
    var visualDescription by remember { mutableStateOf("") }
    var visualBusy by remember { mutableStateOf(false) }

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            visualBusy = true; error = ""; emptyMessage = ""; visualDescription = ""
            scope.launch {
                try {
                    val payload = withContext(Dispatchers.IO) {
                        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                            ?: throw IOException("Could not read that image.")
                        if (bytes.size > 5 * 1024 * 1024) throw IOException("Choose an image smaller than 5 MB.")
                        val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
                        val dataUrl = "data:" + mime + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
                        val body = JSONObject().put("imageDataUrl", dataUrl).put("mediaType", "image")
                            .put("userQuestion", "Find related public images and videos.")
                            .toString().toRequestBody("application/json".toMediaType())
                        val request = Request.Builder().url(API_BASE + "/public-search/visual-match").post(body)
                            .header("Accept", "application/json").build()
                        client.newCall(request).execute().use { response ->
                            val raw = response.body?.string().orEmpty()
                            if (!response.isSuccessful) {
                                val message = runCatching { JSONObject(raw).getJSONObject("error").optString("message") }.getOrNull()
                                throw IOException(message ?: "Visual search is unavailable.")
                            }
                            JSONObject(raw)
                        }
                    }
                    val array = payload.optJSONArray("data") ?: JSONArray()
                    results = (0 until array.length()).mapNotNull { i -> runCatching { SearchResult.parse(array.getJSONObject(i)) }.getOrNull() }
                    visualDescription = payload.optJSONObject("meta")?.optString("description").orEmpty()
                    searchMode = "web"
                    query = "Visual matches"
                    if (results.isEmpty()) emptyMessage = "No related public images or videos were found."
                } catch (e: Exception) { error = e.message ?: "Visual search failed." }
                finally { visualBusy = false }
            }
        }
    }
    fun saveLocal() {
        prefs.edit().putString("saved", JSONArray().apply { saved.forEach { put(it.json()) } }.toString()).apply()
    }
    fun saveHistory() {
        prefs.edit().putString("history", JSONArray().apply { history.forEach { put(it) } }.toString()).apply()
    }
    fun search(term: String) {
        val clean = term.trim()
        if (clean.length < 2) { error = "Enter at least two characters."; return }
        query = clean
        suggestions = emptyList()
        focus.clearFocus()
        loading = true; error = ""; emptyMessage = ""; statusFilter = "all"
        scope.launch {
            try {
                val data = withContext(Dispatchers.IO) {
                    val route = if (searchMode == "web") "/public-search" else "/public-search/media"
                    val builder = (API_BASE + route).toHttpUrl().newBuilder().addQueryParameter("q", clean)
                    if (searchMode != "web") builder.addQueryParameter("type", searchMode)
                    val request = Request.Builder().url(builder.build()).header("Accept", "application/json").get().build()
                    client.newCall(request).execute().use { response ->
                        val raw = response.body?.string().orEmpty()
                        if (!response.isSuccessful) {
                            val message = runCatching { JSONObject(raw).getJSONObject("error").optString("message") }.getOrNull()
                            throw IOException(message ?: "Search is temporarily unavailable.")
                        }
                        val array = JSONObject(raw).optJSONArray("data") ?: JSONArray()
                        (0 until array.length()).mapNotNull { i ->
                            runCatching { SearchResult.parse(array.getJSONObject(i)) }.getOrNull()
                        }
                    }
                }
                results = data
                history = (listOf(clean) + history.filterNot { it.equals(clean, true) }).take(12)
                saveHistory()
                if (data.isEmpty()) emptyMessage = "No results came back from the available public sources. Try another phrase."
            } catch (e: Exception) {
                results = emptyList()
                error = e.message ?: "Could not search right now."
            } finally { loading = false }
        }
    }
    fun submitAuth() {
        authBusy = true; authError = ""; authMessage = ""
        scope.launch {
            try {
                if (authMode == "forgot") {
                    val message = withContext(Dispatchers.IO) {
                        val payload = JSONObject().put("email", authEmail.trim())
                        val request = Request.Builder().url(API_BASE + "/auth/forgot-password")
                            .post(payload.toString().toRequestBody("application/json".toMediaType()))
                            .header("Accept", "application/json").build()
                        client.newCall(request).execute().use { response ->
                            val raw = response.body?.string().orEmpty()
                            if (!response.isSuccessful) throw IOException("Could not request a password reset.")
                            JSONObject(raw).optJSONObject("data")?.optString("message")
                                ?: "If an account exists, reset instructions will be sent."
                        }
                    }
                    authMessage = message
                    return@launch
                }
                val signedIn = withContext(Dispatchers.IO) {
                    val payload = JSONObject().put("email", authEmail.trim()).put("password", authPassword)
                    if (authMode == "register") payload.put("displayName", authDisplayName.trim())
                    val request = Request.Builder().url(API_BASE + "/auth/" + authMode)
                        .post(payload.toString().toRequestBody("application/json".toMediaType()))
                        .header("Accept", "application/json").build()
                    client.newCall(request).execute().use { response ->
                        val raw = response.body?.string().orEmpty()
                        if (!response.isSuccessful) {
                            val message = runCatching { JSONObject(raw).getJSONObject("error").optString("message") }.getOrNull()
                            throw IOException(message ?: "Account request failed.")
                        }
                        val data = JSONObject(raw).optJSONObject("data") ?: JSONObject()
                        Account(data.optString("email"), data.optString("displayName"), data.optString("role", "user"))
                    }
                }
                account = signedIn
                authPassword = ""
                authMessage = "Signed in successfully."
                tab = "Search"
            } catch (e: Exception) { authError = e.message ?: "Could not sign in." }
            finally { authBusy = false }
        }
    }
    fun logout() {
        scope.launch {
            withContext(Dispatchers.IO) {
                val request = Request.Builder().url(API_BASE + "/auth/logout")
                    .post("{}".toRequestBody("application/json".toMediaType())).build()
                runCatching { client.newCall(request).execute().close() }
            }
            (client.cookieJar as? PersistentCookieJar)?.clear()
            account = null
            authMessage = "You have been signed out."
        }
    }
    LaunchedEffect(Unit) {
        val current = withContext(Dispatchers.IO) {
            val request = Request.Builder().url(API_BASE + "/auth/me").header("Accept", "application/json").get().build()
            runCatching {
                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) null else {
                        val data = JSONObject(response.body?.string().orEmpty()).optJSONObject("data") ?: JSONObject()
                        Account(data.optString("email"), data.optString("displayName"), data.optString("role", "user"))
                    }
                }
            }.getOrNull()
        }
        account = current
        authChecked = true
    }
    LaunchedEffect(query, tab) {
        if (tab != "Search" || query.trim().length < 2) { suggestions = emptyList(); return@LaunchedEffect }
        delay(280)
        val found = withContext(Dispatchers.IO) {
            val url = (API_BASE + "/public-search/suggestions").toHttpUrl().newBuilder()
                .addQueryParameter("q", query.trim()).build()
            val request = Request.Builder().url(url).header("Accept", "application/json").get().build()
            runCatching {
                client.newCall(request).execute().use { response ->
                    val array = if (response.isSuccessful) JSONObject(response.body?.string().orEmpty()).optJSONArray("data") ?: JSONArray() else JSONArray()
                    (0 until array.length()).mapNotNull { i -> array.optJSONObject(i)?.optString("query")?.takeIf { it.isNotBlank() } }
                }
            }.getOrDefault(emptyList())
        }
        suggestions = found
    }

    fun checkLink() {
        val candidate = urlToCheck.trim()
        if (candidate.isBlank()) { linkError = "Paste a public website URL first."; return }
        checkingLink = true; linkError = ""; linkCheck = null
        scope.launch {
            try {
                val checked = withContext(Dispatchers.IO) {
                    val body = JSONObject().put("url", candidate).toString().toRequestBody("application/json".toMediaType())
                    val request = Request.Builder().url("$API_BASE/public-search/check-link")
                        .post(body).header("Accept", "application/json").build()
                    client.newCall(request).execute().use { response ->
                        val raw = response.body?.string().orEmpty()
                        if (!response.isSuccessful) {
                            val message = runCatching { JSONObject(raw).getJSONObject("error").optString("message") }.getOrNull()
                            throw IOException(message ?: "This URL could not be checked.")
                        }
                        val data = JSONObject(raw).optJSONObject("data") ?: JSONObject()
                        LinkCheckResult(data.optString("title"), data.optString("finalUrl"),
                            data.optString("status", "not_confirmed"), data.optString("note"))
                    }
                }
                linkCheck = checked
            } catch (e: Exception) { linkError = e.message ?: "Could not check this URL." }
            finally { checkingLink = false }
        }
    }

    MaterialTheme(colorScheme = darkColorScheme(
        primary = Blue, onPrimary = White, secondary = Cyan,
        background = Ink, surface = Surface, onSurface = White,
        onBackground = White, surfaceVariant = Raised, onSurfaceVariant = Muted,
        outline = Stroke
    )) {
        Scaffold(
            containerColor = Ink,
            bottomBar = {
                NavigationBar(containerColor = Surface, contentColor = White) {
                    listOf("Search", "Saved", "History", "Account").forEach { item ->
                        NavigationBarItem(
                            selected = tab == item,
                            onClick = { tab = item; error = ""; emptyMessage = "" },
                            icon = { Text(when (item) { "Search" -> "⌕"; "Saved" -> "☆"; "History" -> "◷"; else -> "●" }, fontSize = 22.sp) },
                            label = { Text(item) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = BlueSoft, selectedTextColor = BlueSoft,
                                indicatorColor = Blue.copy(alpha = .18f),
                                unselectedIconColor = Muted, unselectedTextColor = Muted
                            )
                        )
                    }
                }
            }
        ) { inset ->
            Column(Modifier.fillMaxSize().background(Ink).padding(inset).statusBarsPadding()) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Image(painterResource(R.drawable.adverse_fingerprint), "ADVERSE fingerprint", Modifier.size(42.dp))
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text("ADVERSE", color = White, fontSize = 17.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
                        Text("FIND ANYTHING", color = BlueSoft, fontSize = 9.sp, letterSpacing = 2.sp)
                    }
                    Spacer(Modifier.weight(1f))
                    Text("PUBLIC SEARCH", color = Muted, fontSize = 9.sp, letterSpacing = 1.sp)
                }

                when (tab) {
                    "Search" -> {
                        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
                            Spacer(Modifier.height(20.dp))
                            Text("Search the web.", color = White, fontSize = 30.sp, fontWeight = FontWeight.Bold, letterSpacing = (-1).sp)
                            Text("Find useful sources. Open the originals.", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 7.dp, bottom = 20.dp))
                            OutlinedTextField(
                                value = query, onValueChange = { query = it },
                                modifier = Modifier.fillMaxWidth(),
                                placeholder = { Text("Search anything online", color = Muted) },
                                singleLine = true, shape = RoundedCornerShape(15.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = Blue, unfocusedBorderColor = Stroke,
                                    focusedTextColor = White, unfocusedTextColor = White,
                                    cursorColor = Cyan, focusedContainerColor = Surface,
                                    unfocusedContainerColor = Surface
                                ),
                                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                                keyboardActions = KeyboardActions(onSearch = { search(query) })
                            )
                            Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                listOf("web", "images", "videos", "people").forEach { mode ->
                                    FilterChip(
                                        selected = searchMode == mode,
                                        onClick = { searchMode = mode; results = emptyList(); suggestions = emptyList() },
                                        label = { Text(mode.replaceFirstChar { it.uppercase() }, fontSize = 11.sp) },
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = Blue.copy(alpha = .2f),
                                            selectedLabelColor = BlueSoft,
                                            labelColor = Muted
                                        )
                                    )
                                }
                            }
                            if (suggestions.isNotEmpty()) {
                                Column(Modifier.fillMaxWidth().padding(top = 5.dp).background(Raised, RoundedCornerShape(12.dp)).padding(6.dp)) {
                                    suggestions.forEach { suggestion ->
                                        Text(suggestion, color = BlueSoft, fontSize = 12.sp,
                                            modifier = Modifier.fillMaxWidth().clickable { search(suggestion) }.padding(10.dp))
                                    }
                                }
                            }
                            OutlinedButton(
                                onClick = { imagePicker.launch("image/*") },
                                enabled = !visualBusy,
                                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = Cyan),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Stroke)
                            ) {
                                if (visualBusy) CircularProgressIndicator(Modifier.size(16.dp), color = Cyan, strokeWidth = 2.dp)
                                else Text("Search using an image")
                            }
                            Button(
                                onClick = { search(query) }, enabled = !loading,
                                modifier = Modifier.fillMaxWidth().padding(top = 11.dp).height(49.dp),
                                shape = RoundedCornerShape(13.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Blue, contentColor = White)
                            ) {
                                if (loading) CircularProgressIndicator(Modifier.size(18.dp), color = White, strokeWidth = 2.dp)
                                else Text("Search", fontWeight = FontWeight.SemiBold)
                            }
                            Spacer(Modifier.height(20.dp))
                            Text("CHECK A LINK", color = BlueSoft, fontSize = 10.sp, letterSpacing = 1.5.sp, fontWeight = FontWeight.Bold)
                            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                OutlinedTextField(
                                    value = urlToCheck, onValueChange = { urlToCheck = it },
                                    modifier = Modifier.weight(1f), singleLine = true,
                                    placeholder = { Text("https://example.com", color = Muted, fontSize = 12.sp) },
                                    shape = RoundedCornerShape(12.dp),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = Cyan, unfocusedBorderColor = Stroke,
                                        focusedTextColor = White, unfocusedTextColor = White,
                                        focusedContainerColor = Surface, unfocusedContainerColor = Surface
                                    ),
                                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                                    keyboardActions = KeyboardActions(onDone = { checkLink() })
                                )
                                Spacer(Modifier.width(8.dp))
                                Button(onClick = { checkLink() }, enabled = !checkingLink,
                                    contentPadding = PaddingValues(horizontal = 13.dp, vertical = 12.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = Raised)) {
                                    if (checkingLink) CircularProgressIndicator(Modifier.size(16.dp), color = Cyan, strokeWidth = 2.dp)
                                    else Text("Check", color = White, fontSize = 12.sp)
                                }
                            }
                            if (linkError.isNotBlank()) Text(linkError, color = Color(0xFFFCA5A5), fontSize = 11.sp, modifier = Modifier.padding(top = 7.dp))
                            linkCheck?.let { checked ->
                                Column(Modifier.fillMaxWidth().padding(top = 8.dp).background(Raised, RoundedCornerShape(12.dp)).padding(12.dp)) {
                                    Text(if (checked.status == "reachable") "PAGE RESPONDED" else "NOT CONFIRMED",
                                        color = if (checked.status == "reachable") Green else Color(0xFFFBBF24), fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                    if (checked.title.isNotBlank()) Text(checked.title, color = White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
                                    Text(checked.note, color = Muted, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp))
                                    if (checked.finalUrl.startsWith("http")) Text("Open checked page ↗", color = BlueSoft, fontSize = 11.sp,
                                        modifier = Modifier.clickable { openUrl(checked.finalUrl) }.padding(top = 7.dp))
                                }
                            }
                            if (error.isNotBlank()) Text(error, color = Color(0xFFFCA5A5), fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp))
                            if (emptyMessage.isNotBlank()) Text(emptyMessage, color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp))
                        }
                        if (results.isNotEmpty()) {
                        if (visualDescription.isNotBlank()) {
                            Text("VISUAL DESCRIPTION", color = Cyan, fontSize = 9.sp, letterSpacing = 1.3.sp,
                                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
                            Text(visualDescription, color = Muted, fontSize = 12.sp,
                                modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
                        }
                            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 15.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text("${results.size} results", color = White, fontWeight = FontWeight.SemiBold)
                                Spacer(Modifier.weight(1f))
                                Text("LINK STATUS IS NOT A TRUST SCORE", color = Muted, fontSize = 8.sp)
                            }
                            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                listOf("all", "reachable", "not_confirmed", "not_checked").forEach { status ->
                                    FilterChip(
                                        selected = statusFilter == status,
                                        onClick = { statusFilter = status },
                                        label = { Text(when(status) { "all" -> "All"; "reachable" -> "Reachable"; "not_confirmed" -> "Unconfirmed"; else -> "Unchecked" }, fontSize = 10.sp) },
                                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Blue.copy(alpha = .2f), selectedLabelColor = BlueSoft, labelColor = Muted)
                                    )
                                }
                            }
                            LazyColumn(
                                modifier = Modifier.weight(1f),
                                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 14.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                items(results.filter { statusFilter == "all" || it.status == statusFilter }, key = { it.url }) { item ->
                                    ResultCard(item, saved.any { it.url == item.url }, { toggle ->
                                        saved = if (toggle) (listOf(item) + saved.filterNot { it.url == item.url }).take(100)
                                        else saved.filterNot { it.url == item.url }
                                        saveLocal()
                                    }, { openUrl(item.finalUrl.ifBlank { item.url }) })
                                }
                            }
                        } else if (!loading && history.isNotEmpty()) {
                            Column(Modifier.padding(horizontal = 20.dp, vertical = 24.dp)) {
                                Text("RECENT SEARCHES", color = Muted, fontSize = 10.sp, letterSpacing = 1.5.sp)
                                history.take(5).forEach { term ->
                                    Text(term, color = BlueSoft, fontSize = 13.sp,
                                        modifier = Modifier.fillMaxWidth().clickable { search(term) }.padding(vertical = 11.dp))
                                }
                            }
                        }
                    }
                    "Account" -> {
                        Column(Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 18.dp)) {
                            Text("Your account", color = White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                            Text("Sign in to use your ADVERSE account across supported features.", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp, bottom = 18.dp))
                            if (!authChecked) {
                                CircularProgressIndicator(color = Cyan)
                            } else if (account != null) {
                                Column(Modifier.fillMaxWidth().background(Surface, RoundedCornerShape(16.dp)).padding(16.dp)) {
                                    Text(account!!.displayName.ifBlank { "ADVERSE user" }, color = White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                                    Text(account!!.email, color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 5.dp))
                                    Text("Role: " + account!!.role, color = BlueSoft, fontSize = 11.sp, modifier = Modifier.padding(top = 12.dp))
                                    Text("Your session cookie is stored encrypted on this device.", color = Muted, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
                                }
                                Button(onClick = { logout() }, modifier = Modifier.fillMaxWidth().padding(top = 16.dp), colors = ButtonDefaults.buttonColors(containerColor = Raised)) {
                                    Text("Sign out", color = White)
                                }
                            } else {
                                if (authMode == "register") {
                                    OutlinedTextField(value = authDisplayName, onValueChange = { authDisplayName = it }, modifier = Modifier.fillMaxWidth(), singleLine = true, label = { Text("Display name") })
                                }
                                OutlinedTextField(value = authEmail, onValueChange = { authEmail = it }, modifier = Modifier.fillMaxWidth().padding(top = 10.dp), singleLine = true, label = { Text("Email address") })
                                if (authMode != "forgot") {
                                    OutlinedTextField(value = authPassword, onValueChange = { authPassword = it }, modifier = Modifier.fillMaxWidth().padding(top = 10.dp), singleLine = true, label = { Text("Password (12+ characters)") })
                                }
                                if (authError.isNotBlank()) Text(authError, color = Color(0xFFFCA5A5), fontSize = 12.sp, modifier = Modifier.padding(top = 9.dp))
                                if (authMessage.isNotBlank()) Text(authMessage, color = Green, fontSize = 12.sp, modifier = Modifier.padding(top = 9.dp))
                                Button(onClick = { submitAuth() }, enabled = !authBusy && authEmail.contains("@") && (authMode == "forgot" || authPassword.length >= 12) && (authMode != "register" || authDisplayName.isNotBlank()), modifier = Modifier.fillMaxWidth().padding(top = 15.dp).height(48.dp), colors = ButtonDefaults.buttonColors(containerColor = Blue)) {
                                    if (authBusy) CircularProgressIndicator(Modifier.size(17.dp), color = White, strokeWidth = 2.dp)
                                    else Text(if (authMode == "register") "Create account" else if (authMode == "forgot") "Send reset email" else "Sign in", color = White)
                                }
                                if (authMode == "login") {
                                    TextButton(onClick = { authMode = "register"; authError = ""; authMessage = "" }) { Text("New to ADVERSE? Create an account", color = BlueSoft) }
                                    TextButton(onClick = { authMode = "forgot"; authError = ""; authMessage = "" }) { Text("Forgot password?", color = BlueSoft) }
                                } else {
                                    TextButton(onClick = { authMode = "login"; authError = ""; authMessage = "" }) { Text("Back to sign in", color = BlueSoft) }
                                }
                                Text(if (authMode == "forgot") "If the email belongs to an account, ADVERSE will send reset instructions." else "Passwords must be at least 12 characters. Search, saved links and history remain available without signing in.", color = Muted, fontSize = 11.sp)
                            }
                        }
                    }
                    "Saved" -> {
                        Column(Modifier.padding(horizontal = 20.dp, vertical = 16.dp)) {
                            Text("Saved sources", color = White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                            Text("Your reading list stays on this device.", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp, bottom = 18.dp))
                        }
                        if (saved.isEmpty()) EmptyState("No saved sources yet", "Save a result from Search and it will appear here.")
                        else LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            items(saved, key = { it.url }) { item ->
                                ResultCard(item, true, { _ -> saved = saved.filterNot { it.url == item.url }; saveLocal() }, { openUrl(item.url) })
                            }
                        }
                    }
                    else -> {
                        Column(Modifier.padding(horizontal = 20.dp, vertical = 16.dp)) {
                            Text("Search history", color = White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                            Text("Recent searches on this device.", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp, bottom = 18.dp))
                            history.forEach { term ->
                                Row(
                                    Modifier.fillMaxWidth().clickable { tab = "Search"; search(term) }.padding(vertical = 13.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("◷", color = Cyan, fontSize = 18.sp)
                                    Spacer(Modifier.width(12.dp))
                                    Text(term, color = White, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                                HorizontalDivider(color = Stroke)
                            }
                            TextButton(onClick = { history = emptyList(); saveHistory() }) { Text("Clear history", color = BlueSoft) }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ResultCard(item: SearchResult, isSaved: Boolean, onSave: (Boolean) -> Unit, onOpen: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().background(Surface, RoundedCornerShape(15.dp))
            .clickable { onOpen() }.padding(15.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(item.publisher.ifBlank { "Public source" }, color = Cyan, fontSize = 10.sp,
                modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            val status = when (item.status) {
                "reachable" -> "REACHABLE" to Green
                "not_confirmed" -> "NOT CONFIRMED" to Color(0xFFFBBF24)
                else -> "NOT CHECKED" to Muted
            }
            Text(status.first, color = status.second, fontSize = 8.sp, fontWeight = FontWeight.Bold)
        }
        Text(item.title.ifBlank { item.url }, color = White, fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 9.dp),
            maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (item.excerpt.isNotBlank()) Text(item.excerpt, color = Muted, fontSize = 12.sp,
            lineHeight = 18.sp, modifier = Modifier.padding(top = 7.dp), maxLines = 4, overflow = TextOverflow.Ellipsis)
        if (item.why.isNotBlank()) Text("Why it appeared: " + item.why + ". Retrieval signals are not proof of accuracy.",
            color = BlueSoft, fontSize = 10.sp, modifier = Modifier.padding(top = 8.dp))
        if (item.warnings.isNotBlank()) Text("Check before trusting: " + item.warnings,
            color = Color(0xFFFBBF24), fontSize = 10.sp, modifier = Modifier.padding(top = 6.dp))
        if (item.corroboration.isNotBlank()) Text(item.corroboration,
            color = Muted, fontSize = 10.sp, modifier = Modifier.padding(top = 6.dp))
        if (item.note.isNotBlank()) Text(item.note, color = Muted, fontSize = 10.sp,
            modifier = Modifier.padding(top = 6.dp), maxLines = 3, overflow = TextOverflow.Ellipsis)
        Row(Modifier.fillMaxWidth().padding(top = 9.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Open source ↗", color = BlueSoft, fontSize = 11.sp, modifier = Modifier.weight(1f))
            TextButton(onClick = { onSave(!isSaved) }) { Text(if (isSaved) "Saved ✓" else "Save", color = BlueSoft, fontSize = 11.sp) }
        }
    }
}
@Composable
private fun EmptyState(title: String, body: String) {
    Column(Modifier.fillMaxWidth().padding(34.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("◌", color = Cyan, fontSize = 34.sp)
        Text(title, color = White, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp))
        Text(body, color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
    }
}

private fun loadSaved(prefs: android.content.SharedPreferences): List<SearchResult> = runCatching {
    val array = JSONArray(prefs.getString("saved", "[]"))
    (0 until array.length()).mapNotNull { i -> runCatching { SearchResult.parse(array.getJSONObject(i)) }.getOrNull() }
}.getOrDefault(emptyList())

private fun loadHistory(prefs: android.content.SharedPreferences): List<String> = runCatching {
    val array = JSONArray(prefs.getString("history", "[]"))
    (0 until array.length()).mapNotNull { i -> array.optString(i) }.filter { it.isNotBlank() }
}.getOrDefault(emptyList())
