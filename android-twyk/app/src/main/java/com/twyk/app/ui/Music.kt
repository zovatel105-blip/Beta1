package com.twyk.app.ui

import android.media.MediaPlayer
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.twyk.app.data.MusicTrack
import com.twyk.app.data.RetrofitProvider
import kotlinx.coroutines.delay

// Selector de música (iTunes, vía GET /api/music/search del backend) — réplica
// de MusicPicker.jsx: se usa al publicar Versus/1vs1/Retos para adjuntar una
// canción (título/artista/portada/preview de 30s) a la publicación.
@Composable
fun MusicPickerSheet(onClose: () -> Unit, onSelect: (MusicTrack) -> Unit) {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<MusicTrack>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    // Reproductor COMPARTIDO para los previews de 30s (réplica de audioRef en
    // MusicPicker.jsx: 1 solo <audio>, cambiar de canción detiene la
    // anterior automáticamente). Antes no existía ninguna forma de escuchar
    // la canción antes de elegirla.
    var playingId by remember { mutableStateOf<String?>(null) }
    val player = remember { MediaPlayer() }
    DisposableEffect(Unit) { onDispose { runCatching { player.release() } } }

    fun togglePreview(t: MusicTrack) {
        val id = t.id ?: t.previewUrl ?: return
        val url = t.previewUrl
        if (playingId == id) {
            runCatching { player.stop() }
            playingId = null
            return
        }
        if (url.isNullOrBlank()) return
        runCatching {
            player.reset()
            player.setDataSource(url)
            player.setOnPreparedListener { it.start() }
            player.setOnCompletionListener { playingId = null }
            player.setOnErrorListener { _, _, _ -> playingId = null; true }
            player.prepareAsync()
            playingId = id
        }.onFailure { playingId = null }
    }

    // Debounce de 350ms antes de buscar (mismo criterio que SearchOverlay/Search.kt).
    LaunchedEffect(query) {
        val q = query.trim()
        if (q.isEmpty()) {
            results = emptyList()
            loading = false
        } else {
            loading = true
            delay(350)
            results = runCatching { RetrofitProvider.api.searchMusic(q).results.orEmpty() }.getOrDefault(emptyList())
            loading = false
        }
    }

    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).clickable {
            runCatching { player.stop() }; playingId = null; onClose()
        },
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            Modifier.fillMaxWidth().fillMaxHeight(0.75f)
                .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .background(Color(0xFF18181B))
                .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { },
        ) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Añadir música", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                Box(
                    Modifier.size(32.dp).clip(CircleShape).clickable { runCatching { player.stop() }; playingId = null; onClose() },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Close, "cerrar", tint = Color.White.copy(alpha = 0.6f), modifier = Modifier.size(18.dp))
                }
            }
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp).height(44.dp)
                    .clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.05f))
                    .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(50)).padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Filled.Search, null, tint = Color.White.copy(alpha = 0.4f), modifier = Modifier.size(16.dp))
                Box(Modifier.weight(1f)) {
                    if (query.isEmpty()) Text("Buscar canción o artista", color = Color.White.copy(alpha = 0.3f), fontSize = 14.sp)
                    BasicTextField(
                        value = query, onValueChange = { query = it }, singleLine = true,
                        textStyle = TextStyle(color = Color.White, fontSize = 14.sp), cursorBrush = SolidColor(Color.White),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
                    }
                    query.isBlank() -> Text(
                        "Busca una canción para añadirla a tu publicación", color = Color.White.copy(alpha = 0.4f), fontSize = 13.sp,
                        textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 40.dp, start = 32.dp, end = 32.dp),
                    )
                    results.isEmpty() -> Text(
                        "Sin resultados para \"$query\"", color = Color.White.copy(alpha = 0.4f), fontSize = 13.sp,
                        modifier = Modifier.fillMaxWidth().padding(top = 40.dp), textAlign = TextAlign.Center,
                    )
                    else -> LazyColumn(
                        Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        items(results, key = { it.id ?: (it.previewUrl ?: it.title.orEmpty()) }) { t ->
                            MusicRow(
                                t = t,
                                isPlaying = playingId == (t.id ?: t.previewUrl),
                                onTogglePreview = { togglePreview(t) },
                                onClick = { runCatching { player.stop() }; playingId = null; onSelect(t); onClose() },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MusicRow(t: MusicTrack, isPlaying: Boolean, onTogglePreview: () -> Unit, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { onClick() }.padding(vertical = 8.dp, horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(44.dp).clip(RoundedCornerShape(8.dp)).background(Color.White.copy(alpha = 0.06f)), contentAlignment = Alignment.Center) {
            if (!t.artwork.isNullOrBlank()) {
                AsyncImage(model = t.artwork, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else {
                Icon(Icons.Filled.MusicNote, null, tint = Color.White.copy(alpha = 0.3f), modifier = Modifier.size(18.dp))
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(t.title ?: "Sin título", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(t.artist ?: "", color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        // Reproducir/pausar preview de 30s (réplica del botón Play/Pause de
        // MusicPicker.jsx) — antes no existía ningún control de reproducción.
        if (!t.previewUrl.isNullOrBlank()) {
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier.size(32.dp).clip(CircleShape).border(1.dp, Color.White.copy(alpha = 0.15f), CircleShape)
                    .clickable { onTogglePreview() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    if (isPlaying) "pausar" else "reproducir",
                    tint = Color.White, modifier = Modifier.size(16.dp),
                )
            }
        }
    }
}
