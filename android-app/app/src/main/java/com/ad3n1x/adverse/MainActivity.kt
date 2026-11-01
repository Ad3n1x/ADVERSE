package com.ad3n1x.adverse

// Native Compose client for the ADVERSE public-search API.

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

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

private data class LinkCheckResult(val title: String, val finalUrl: String, val status: String, val note: String)\n\nprivate data class SearchResult(
    val title: String, val url: String, val excerpt: String,
    val publisher: String, val status: String, val note: String
) {
    fun json() = JSONObject().apply {
        put("title", title); put("url", url); put("excerpt", excerpt)
        put("publisher", publisher); put("status", status); put("note", note)
    }
    companion object {
        fun parse(o: JSONObject) = SearchResult(
            o.optString("title", o.optString("url")),
            o.optString("url"), o.optString("excerpt"),
            o.optString("publisher", o.optString("provider", "Public source")),
            o.optJSONObject("linkCheck")?.optString("status") ?: o.optString("status", "not_checked"),
            o.optJSONObject("linkCheck")?.optString("note") ?: o.optString("note")
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
    val prefs = remember { context.getSharedPreferences("adverse_native", 0) }
    val client = remember { OkHttpClient() }
    val scope = rememberCoroutineScope()
    val focus = LocalFocusManager.current
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf(emptyList<SearchResult>()) }
    var saved by remember { mutableStateOf(loadSaved(prefs)) }
    var history by remember { mutableStateOf(loadHistory(prefs)) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var emptyMessage by remember { mutableStateOf("") }
    var tab by remember { mutableStateOf("Search") }

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
        focus.clearFocus()
        loading = true; error = ""; emptyMessage = ""
        scope.launch {
            try {
                val data = withContext(Dispatchers.IO) {
                    val url = (API_BASE + "/public-search").toHttpUrl().newBuilder()
                        .addQueryParameter("q", clean).build()
                    val request = Request.Builder().url(url).header("Accept", "application/json").get().build()
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
                    listOf("Search", "Saved", "History").forEach { item ->
                        NavigationBarItem(
                            selected = tab == item,
                            onClick = { tab = item; error = ""; emptyMessage = "" },
                            icon = { Text(when (item) { "Search" -> "⌕"; "Saved" -> "☆"; else -> "◷" }, fontSize = 22.sp) },
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
                            Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 15.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text("${results.size} results", color = White, fontWeight = FontWeight.SemiBold)
                                Spacer(Modifier.weight(1f))
                                Text("LINK STATUS IS NOT A TRUST SCORE", color = Muted, fontSize = 8.sp)
                            }
                            LazyColumn(
                                modifier = Modifier.weight(1f),
                                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 14.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                items(results, key = { it.url }) { item ->
                                    ResultCard(item, saved.any { it.url == item.url }, { toggle ->
                                        saved = if (toggle) (listOf(item) + saved.filterNot { it.url == item.url }).take(100)
                                        else saved.filterNot { it.url == item.url }
                                        saveLocal()
                                    }, { openUrl(item.url) })
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
            lineHeight = 18.sp, modifier = Modifier.padding(top = 7.dp), maxLines = 3, overflow = TextOverflow.Ellipsis)
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
