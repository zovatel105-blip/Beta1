package com.twyk.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.User
import kotlinx.coroutines.delay

// Buscador de USUARIOS — réplica de SearchOverlay.jsx: se abre desde la lupa
// del feed, busca en vivo (debounce) contra GET /api/users?q=... y sin texto
// muestra "Sugerencias" (la misma lista general). Tocar un resultado abre su
// perfil.
@Composable
fun SearchScreen(onClose: () -> Unit, onOpenProfile: (String) -> Unit) {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<User>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    val focusRequester = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
        keyboard?.show()
    }

    // Búsqueda con debounce (250ms, igual que la web).
    LaunchedEffect(query) {
        loading = true
        delay(250)
        val q = query.trim()
        results = runCatching { RetrofitProvider.api.users(q.ifBlank { null }).users.orEmpty() }.getOrDefault(emptyList())
        loading = false
    }

    Box(Modifier.fillMaxSize().background(TwykBg)) {
        Column(Modifier.fillMaxSize()) {
            // ── Cabecera: atrás + campo de búsqueda ──
            Row(
                Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 10.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(36.dp).clip(CircleShape).clickable { onClose() }, contentAlignment = Alignment.Center) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "cerrar búsqueda", tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.size(20.dp))
                }
                Spacer(Modifier.width(6.dp))
                Row(
                    Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.10f)).padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.Search, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Box(Modifier.weight(1f)) {
                        if (query.isEmpty()) Text("Buscar usuarios", color = Color.White.copy(alpha = 0.4f), fontSize = 15.sp)
                        BasicTextField(
                            value = query,
                            onValueChange = { query = it },
                            singleLine = true,
                            textStyle = TextStyle(color = Color.White, fontSize = 15.sp),
                            cursorBrush = SolidColor(Color.White),
                            modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
                        )
                    }
                    if (query.isNotEmpty()) {
                        Box(
                            Modifier.size(20.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.2f))
                                .clickable { query = "" },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Filled.Close, "borrar", tint = Color.White.copy(alpha = 0.8f), modifier = Modifier.size(12.dp))
                        }
                    }
                }
            }

            // ── Resultados ──
            if (query.isBlank()) {
                Text("Sugerencias", color = Color.White.copy(alpha = 0.4f), fontSize = 13.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = 16.dp, top = 8.dp, bottom = 2.dp))
            }
            when {
                loading && results.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
                }
                results.isEmpty() -> Column(
                    Modifier.fillMaxSize().padding(top = 72.dp, start = 24.dp, end = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(Modifier.size(56.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.05f)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Search, null, tint = Color.White.copy(alpha = 0.3f), modifier = Modifier.size(24.dp))
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        if (query.isNotBlank()) "Sin resultados" else "No hay usuarios todavía",
                        color = Color.White.copy(alpha = 0.7f), fontSize = 15.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                    )
                    if (query.isNotBlank()) {
                        Spacer(Modifier.height(4.dp))
                        Text("Prueba con otro nombre o usuario", color = Color.White.copy(alpha = 0.4f), fontSize = 13.sp, textAlign = TextAlign.Center)
                    }
                }
                else -> LazyColumn(contentPadding = PaddingValues(vertical = 4.dp)) {
                    items(results, key = { it.username ?: it.hashCode().toString() }) { u ->
                        SearchResultRow(u) { u.username?.let { onOpenProfile(it) } }
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchResultRow(u: User, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onClick() }.padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TwykAvatar(u.avatarUrl, Modifier.size(44.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    u.name?.takeIf { it.isNotBlank() } ?: u.username ?: "usuario",
                    color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                if (u.verified) {
                    Spacer(Modifier.width(3.dp))
                    Icon(Icons.Filled.Verified, null, tint = Color(0xFF38BDF8), modifier = Modifier.size(14.dp))
                }
            }
            Text("@" + (u.username ?: ""), color = Color.White.copy(alpha = 0.5f), fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}
