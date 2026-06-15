package com.twyk.app.ui

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.twyk.app.R
import com.twyk.app.absoluteUrl
import com.twyk.app.data.Challenge
import com.twyk.app.data.Post
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import com.twyk.app.data.VoteRequest
import com.twyk.app.feed.FeedPager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File

private data class Suggestion(val username: String, val name: String, val avatar: String, val meta: String)

private val SUGGESTED = listOf(
    Suggestion("creatorpro", "Creator Pro", "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop", "Te sigue"),
    Suggestion("dancequeen", "Dance Queen", "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop", "Te sigue"),
    Suggestion("gamerx", "Gamer X", "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop", "Sugerido para ti"),
    Suggestion("chefmario", "Chef Mario", "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop", "Te sigue"),
    Suggestion("pianomaster", "Piano Master", "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&h=150&fit=crop", "Sugerido para ti"),
)

// BATALLAS — réplica de CompletedBattlesPage.jsx (Completados) + ActiveChallengesPage.jsx (Activos).
@Composable
fun BattlesScreen(
    onRequireAuth: () -> Unit,
    onChanged: () -> Unit = {},
    onOpenComments: (String) -> Unit = {},
    onOpenProfile: (String) -> Unit = {},
) {
    if (Session.token == null) {
        LoginPrompt("Inicia sesión para ver tus batallas", onRequireAuth, Icons.Filled.EmojiEvents)
        return
    }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var tab by remember { mutableStateOf("completed") }
    var completed by remember { mutableStateOf<List<Post>>(emptyList()) }
    var active by remember { mutableStateOf<List<Challenge>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var pendingAcceptId by remember { mutableStateOf<String?>(null) }

    fun reload() {
        scope.launch {
            loading = true
            completed = runCatching { RetrofitProvider.api.completedBattles().posts.orEmpty() }.getOrDefault(emptyList())
            active = runCatching { RetrofitProvider.api.challenges("to").challenges.orEmpty() }.getOrDefault(emptyList())
            loading = false
        }
    }

    LaunchedEffect(Unit) { reload() }

    val pickResponse = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val cid = pendingAcceptId
        pendingAcceptId = null
        if (cid != null && uri != null) {
            busy = true
            scope.launch {
                runCatching {
                    val part = withContext(Dispatchers.IO) { videoPart(context, "file", uri) }
                    RetrofitProvider.api.acceptChallenge(cid, part)
                }.onSuccess {
                    active = active.filterNot { it.id == cid }
                    onChanged()
                    reload()
                }
                busy = false
            }
        }
    }

    Box(Modifier.fillMaxSize().background(if (tab == "completed" && completed.isEmpty()) TwykBg else Color.Black)) {
        when {
            loading -> Box(Modifier.fillMaxSize().background(TwykBg), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ZincText, strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
            }
            tab == "completed" -> {
                if (completed.isEmpty()) {
                    EmptyCompleted(onCreate = onRequireAuth, onActive = { tab = "active" })
                } else {
                    // Mismo feed nativo de vídeo que la página de inicio (idéntico a la web).
                    FeedPager(
                        posts = completed,
                        onOpenComments = onOpenComments,
                        onRequireAuth = onRequireAuth,
                        onOpenProfile = onOpenProfile,
                        onVote = { id, side -> scope.launch { runCatching { RetrofitProvider.api.vote(VoteRequest(id, side)) } } },
                    )
                }
            }
            else -> {
                if (active.isEmpty()) {
                    EmptyActive()
                } else {
                    val pager = rememberPagerState(pageCount = { active.size })
                    VerticalPager(state = pager, modifier = Modifier.fillMaxSize()) { i ->
                        ActiveChallengeFrame(
                            c = active[i],
                            busy = busy,
                            onAccept = { pendingAcceptId = active[i].id; pickResponse.launch("video/*") },
                            onReject = {
                                val cid = active[i].id
                                scope.launch {
                                    runCatching { RetrofitProvider.api.rejectChallenge(cid) }
                                    active = active.filterNot { it.id == cid }
                                    onChanged()
                                }
                            },
                        )
                    }
                }
            }
        }

        // Header segmentado (encima del contenido)
        BattlesHeader(tab = tab, onSelect = { tab = it })
    }
}

@Composable
private fun BattlesHeader(tab: String, onSelect: (String) -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.65f), Color.Transparent)))
            .statusBarsPadding().padding(horizontal = 16.dp, top = 8.dp, bottom = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Box(
            Modifier.size(36.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.06f)).border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Outlined.PersonAdd, "compartir", tint = Color.White, modifier = Modifier.size(18.dp)) }

        Row(
            Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.06f)).border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(50)).padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            SegBtn("Completados", tab == "completed") { onSelect("completed") }
            SegBtn("Activos", tab == "active") { onSelect("active") }
        }

        Box(
            Modifier.size(36.dp).clip(CircleShape).background(Color.White),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.Add, "añadir", tint = Color.Black, modifier = Modifier.size(20.dp)) }
    }
}

@Composable
private fun SegBtn(label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.clip(RoundedCornerShape(50)).background(if (active) Color.White else Color.Transparent).clickable { onClick() }.padding(horizontal = 16.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = if (active) Color.Black else Color(0xFFD4D4D8), fontSize = 13.sp, fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium)
    }
}

@Composable
private fun CompletedBattleFrame(post: Post) {
    val poster = absoluteUrl(post.posterUrl ?: post.sideA?.posterUrl ?: post.thumbnailUrl ?: post.sideB?.posterUrl)
    val va = post.votes?.a ?: 0
    val vb = post.votes?.b ?: 0
    val total = (va + vb).coerceAtLeast(1)
    val pa = (va * 100 / total)
    val aName = post.sideA?.author?.username ?: post.author?.username ?: "A"
    val bName = post.sideB?.author?.username ?: "B"

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (poster != null) {
            AsyncImage(model = poster, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF1F2937), Color(0xFF0B0B0C)))))
        }
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.35f), Color.Transparent, Color.Black.copy(alpha = 0.75f)))))

        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, bottom = 110.dp),
        ) {
            post.description?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = Color.White, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(10.dp))
            }
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.Black.copy(alpha = 0.40f)).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(18.dp)).padding(14.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("@$aName", color = TwykGold, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text("VS", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp))
                    Text("@$bName", color = TwykBlue, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
                }
                Spacer(Modifier.height(10.dp))
                // Barra de votos A/B
                Row(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(50))) {
                    Box(Modifier.weight((pa.coerceIn(1, 99)).toFloat()).fillMaxHeight().background(TwykPurple))
                    Box(Modifier.weight((100 - pa).coerceIn(1, 99).toFloat()).fillMaxHeight().background(TwykBlue))
                }
                Spacer(Modifier.height(6.dp))
                Row(Modifier.fillMaxWidth()) {
                    Text("$pa%", color = TwykGold, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text("${formatCount(va + vb)} votos", color = ZincText, fontSize = 11.sp)
                    Text("${100 - pa}%", color = TwykBlue, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun ActiveChallengeFrame(c: Challenge, busy: Boolean, onAccept: () -> Unit, onReject: () -> Unit) {
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        // Dos mitades A (retador) / B (tu respuesta)
        Row(Modifier.fillMaxSize()) {
            ChallengeHalf(avatar = c.from?.avatarUrl, label = "A · @${c.from?.username ?: "rival"}", labelColor = TwykGold, tint = TwykPurple, modifier = Modifier.weight(1f).fillMaxHeight())
            ChallengeHalf(avatar = c.to?.avatarUrl, label = "B · @${c.to?.username ?: "tú"}", labelColor = Color.White, tint = TwykBlue, upload = true, onUpload = onAccept, modifier = Modifier.weight(1f).fillMaxHeight())
        }
        // VS central
        Box(
            Modifier.align(Alignment.Center).size(48.dp).clip(CircleShape).background(TwykBg).border(1.dp, Color.White.copy(alpha = 0.15f), CircleShape),
            contentAlignment = Alignment.Center,
        ) { Text("VS", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Black) }

        // Panel inferior de acciones
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(start = 16.dp, end = 16.dp, bottom = 28.dp),
        ) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color.Black.copy(alpha = 0.40f)).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(18.dp)).padding(12.dp),
            ) {
                c.message?.takeIf { it.isNotBlank() }?.let {
                    Text("“$it”", color = Color.White.copy(alpha = 0.75f), fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(10.dp))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(
                        Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(50)).background(if (busy) Color.White.copy(alpha = 0.6f) else Color.White).clickable(enabled = !busy) { onAccept() },
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            if (busy) CircularProgressIndicator(color = Color.Black, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                            else Icon(Icons.Filled.Check, null, tint = Color.Black, modifier = Modifier.size(16.dp))
                            Text("Subir y aceptar", color = Color.Black, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    Box(
                        Modifier.size(44.dp).clip(CircleShape).border(1.dp, Color.White.copy(alpha = 0.20f), CircleShape).clickable(enabled = !busy) { onReject() },
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.Close, "rechazar", tint = Color.White, modifier = Modifier.size(18.dp)) }
                }
            }
        }
    }
}

@Composable
private fun ChallengeHalf(
    avatar: String?,
    label: String,
    labelColor: Color,
    tint: Color,
    modifier: Modifier,
    upload: Boolean = false,
    onUpload: (() -> Unit)? = null,
) {
    Box(modifier.background(Brush.verticalGradient(listOf(tint.copy(alpha = 0.28f), Color(0xFF0B0B0C))))) {
        Column(Modifier.align(Alignment.Center).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            TwykAvatar(avatar, Modifier.size(72.dp).border(2.dp, Color.White.copy(alpha = 0.15f), CircleShape))
            if (upload) {
                Spacer(Modifier.height(14.dp))
                Box(
                    Modifier.size(54.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.06f)).border(1.dp, Color.White.copy(alpha = 0.15f), CircleShape)
                        .clickable { onUpload?.invoke() },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Movie, null, tint = ZincText, modifier = Modifier.size(24.dp)) }
                Spacer(Modifier.height(8.dp))
                Text("Sube tu vídeo", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
            }
        }
        Box(
            Modifier.align(Alignment.TopStart).statusBarsPadding().padding(start = 12.dp, top = 64.dp).clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 10.dp, vertical = 4.dp),
        ) { Text(label, color = labelColor, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
    }
}

@Composable
private fun EmptyCompleted(onCreate: () -> Unit, onActive: () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().padding(start = 24.dp, end = 24.dp, top = 96.dp, bottom = 120.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(80.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.03f)).border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.EmojiEvents, null, tint = TwykGold, modifier = Modifier.size(36.dp)) }
        Spacer(Modifier.height(22.dp))
        Text("Aún no hay retos completados", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(10.dp))
        Text("Crea tu primer reto y empieza a competir. Los ganadores aparecerán aquí.", color = ZincText, fontSize = 15.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(28.dp))
        Box(
            Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(50)).background(Color.White).clickable { onCreate() },
            contentAlignment = Alignment.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Filled.Add, null, tint = Color.Black, modifier = Modifier.size(18.dp))
                Text("Crear un reto", color = Color.Black, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        Spacer(Modifier.height(12.dp))
        Box(
            Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(50)).border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(50)).clickable { onActive() },
            contentAlignment = Alignment.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(ImageVector.vectorResource(R.drawable.ic_swords), null, tint = Color.White, modifier = Modifier.size(18.dp))
                Text("Ver retos activos", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Medium)
            }
        }
        Spacer(Modifier.height(40.dp))
        Row(
            Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.04f)).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(50)).padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(Icons.Filled.Search, null, tint = ZincText, modifier = Modifier.size(16.dp))
            Text("Buscar creadores", color = ZincText, fontSize = 14.sp)
        }
        Spacer(Modifier.height(26.dp))
        Text("SUGERENCIAS PARA RETAR", color = ZincText, fontSize = 12.sp, fontWeight = FontWeight.Medium, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(6.dp))
        SUGGESTED.forEach { acc ->
            Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                AsyncImage(model = acc.avatar, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(44.dp).clip(CircleShape).border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape))
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(acc.name, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                    Text(acc.meta, color = ZincText, fontSize = 13.sp)
                }
                Row(
                    Modifier.height(32.dp).clip(RoundedCornerShape(50)).border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(50)).clickable { onCreate() }.padding(horizontal = 14.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(ImageVector.vectorResource(R.drawable.ic_swords), null, tint = Color.White, modifier = Modifier.size(14.dp))
                    Text("Retar", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

@Composable
private fun EmptyActive() {
    Column(
        Modifier.fillMaxSize().background(TwykBg).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier.size(80.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.03f)).border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape),
            contentAlignment = Alignment.Center,
        ) { Icon(ImageVector.vectorResource(R.drawable.ic_swords), null, tint = TwykGold, modifier = Modifier.size(36.dp)) }
        Spacer(Modifier.height(22.dp))
        Text("Sin retos activos", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text("Cuando alguien te rete, la solicitud aparecerá aquí para aceptarla o rechazarla.", color = ZincText, fontSize = 15.sp, textAlign = TextAlign.Center)
    }
}

private fun videoPart(context: Context, name: String, uri: Uri): MultipartBody.Part {
    val input = context.contentResolver.openInputStream(uri) ?: throw IllegalStateException("No se pudo abrir el vídeo")
    val file = File.createTempFile("twyk_accept_", ".mp4", context.cacheDir)
    file.outputStream().use { out -> input.use { it.copyTo(out) } }
    val body = file.asRequestBody("video/*".toMediaTypeOrNull())
    return MultipartBody.Part.createFormData(name, file.name, body)
}
