@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

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
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
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
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import com.twyk.app.R
import com.twyk.app.absoluteUrl
import com.twyk.app.data.Challenge
import com.twyk.app.data.Post
import com.twyk.app.data.PostEvents
import com.twyk.app.data.QuickChallengeTarget
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import com.twyk.app.data.Stats
import com.twyk.app.data.VoteRequest
import com.twyk.app.feed.FeedPager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File

// BATALLAS — réplica de CompletedBattlesPage.jsx (Completados) + ActiveChallengesPage.jsx (Activos).
@Composable
fun BattlesScreen(
    onRequireAuth: () -> Unit,
    onChanged: () -> Unit = {},
    onOpenComments: (String, String?) -> Unit = { _, _ -> },
    onOpenProfile: (String) -> Unit = {},
    onOpenUpload: () -> Unit = {},
    onChallenge: (QuickChallengeTarget) -> Unit = {},
    // Reporta si la barra de navegación inferior debe verse: en la web,
    // CompletedBattlesPage.jsx SÍ tiene su propia <BottomNav> (barra visible),
    // pero ActiveChallengesPage.jsx y SuggestedUsersPage.jsx NO la tienen (barra
    // oculta) — réplica exacta de esa diferencia, antes inexistente en la app
    // nativa (la barra se veía SIEMPRE, sin importar la pestaña interna).
    onShowNavChange: (Boolean) -> Unit = {},
) {
    if (Session.token == null) {
        LaunchedEffect(Unit) { onShowNavChange(true) }
        LoginPrompt("Sign in to view your battles", onRequireAuth, Icons.Filled.EmojiEvents)
        return
    }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var tab by remember { mutableStateOf("completed") }
    var completed by remember { mutableStateOf<List<Post>>(emptyList()) }
    var active by remember { mutableStateOf<List<Challenge>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var suggestionsOpen by remember { mutableStateOf(false) } // página "Sugeridos" (icono superior izquierdo)

    // Barra de navegación inferior: visible SOLO en "Completados" (igual que
    // CompletedBattlesPage.jsx, que tiene su propia <BottomNav>); oculta en
    // "Activos" y al abrir "Sugeridos" (ActiveChallengesPage.jsx/
    // SuggestedUsersPage.jsx no la tienen).
    LaunchedEffect(tab, suggestionsOpen) { onShowNavChange(tab == "completed" && !suggestionsOpen) }

    fun reload() {
        scope.launch {
            loading = true
            completed = runCatching { RetrofitProvider.api.completedBattles().posts.orEmpty() }.getOrDefault(emptyList())
            active = runCatching { RetrofitProvider.api.challenges("to").challenges.orEmpty() }.getOrDefault(emptyList())
            loading = false
        }
    }

    LaunchedEffect(Unit) { reload() }

    // Comentar/borrar un comentario desde CommentsSheet (abierto sobre este
    // mismo feed de "Completados") actualiza al instante el número junto al
    // icono, sin recargar — mismo patrón que FeedViewModel.
    LaunchedEffect(Unit) {
        PostEvents.commentCountChanged.collect { (id, count) ->
            completed = completed.map { p -> if (p.id == id) p.copy(stats = (p.stats ?: Stats()).copy(comments = count)) else p }
        }
    }

    // Aceptar un reto: si ya trae contenido objetivo (targetVideoUrl/targetImageUrl)
    // no hace falta subir nada (uri=null); si es un reto "de mención", uri es el
    // archivo que el usuario acaba de elegir en ActiveChallengeFrame.
    fun acceptChallenge(c: Challenge, uri: Uri?) {
        busy = true
        scope.launch {
            runCatching {
                val part = uri?.let { withContext(Dispatchers.IO) { videoPart(context, "file", it) } }
                RetrofitProvider.api.acceptChallenge(c.id, part)
            }.onSuccess {
                active = active.filterNot { it.id == c.id }
                onChanged()
                reload()
            }
            busy = false
        }
    }

    Box(Modifier.fillMaxSize().background(if (tab == "completed" && completed.isEmpty()) TwykBg else Color.Black)) {
        // Glow blanco sutil (10%) igual que CompletedBattlesPage.jsx — solo
        // tiene sentido sobre el estado vacío/carga (fondo TwykBg); nunca
        // sobre el feed de vídeo real, para no ensuciar el contenido.
        if (tab == "completed" && completed.isEmpty()) {
            GoldGlow(height = 320.dp, alpha = 0.10f)
        }
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
                        onVote = { id, side, prev -> scope.launch { runCatching { RetrofitProvider.api.vote(VoteRequest(id, side, prev)) } } },
                        onChallenge = onChallenge,
                        hideChallenge = true,
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
                            isActiveCard = i == pager.currentPage,
                            busy = busy,
                            onAccept = { uri -> acceptChallenge(active[i], uri) },
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

        // Header (encima del contenido) — distinto por pestaña, igual que la web.
        BattlesHeader(
            tab = tab,
            pendingCount = active.size,
            onSelect = { tab = it },
            onOpenSuggestions = { suggestionsOpen = true },
            onOpenUpload = onOpenUpload,
        )
    }

    if (suggestionsOpen) {
        SuggestedUsersScreen(
            onClose = { suggestionsOpen = false },
            onOpenProfile = onOpenProfile,
            onChallenge = { onChallenge(it); suggestionsOpen = false },
            onRequireAuth = onRequireAuth,
        )
    }
}

@Composable
private fun BattlesHeader(
    tab: String,
    pendingCount: Int,
    onSelect: (String) -> Unit,
    onOpenSuggestions: () -> Unit,
    onOpenUpload: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.65f), Color.Transparent)))
            .statusBarsPadding().padding(horizontal = 16.dp, top = 8.dp, bottom = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        // Izquierda: sugerencias (solo en "Completados", igual que la web).
        if (tab == "completed") {
            Box(
                Modifier.size(36.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.06f)).border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape)
                    .clickable { onOpenSuggestions() },
                contentAlignment = Alignment.Center,
            ) { Icon(ImageVector.vectorResource(R.drawable.ic_user_plus), "User suggestions", tint = Color.White, modifier = Modifier.size(18.dp)) }
        } else {
            Spacer(Modifier.size(36.dp))
        }

        Row(
            Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.06f)).border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(50)).padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            SegBtn("Completed", tab == "completed") { onSelect("completed") }
            SegBtn("Active", tab == "active") { onSelect("active") }
        }

        // Derecha: añadir reto ("Completados") o contador de pendientes ("Activos").
        if (tab == "completed") {
            Box(
                Modifier.size(36.dp).clip(CircleShape).background(Color.White)
                    .clickable { onOpenUpload() },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Add, "add challenge", tint = Color.Black, modifier = Modifier.size(20.dp)) }
        } else if (pendingCount > 0) {
            Row(
                Modifier.height(36.dp).clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.4f)).border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(50)).padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(ImageVector.vectorResource(R.drawable.ic_swords), null, tint = Color.White, modifier = Modifier.size(14.dp))
                Text(if (pendingCount > 99) "99+" else pendingCount.toString(), color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
        } else {
            Spacer(Modifier.size(36.dp))
        }
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
private fun ActiveChallengeFrame(c: Challenge, isActiveCard: Boolean, busy: Boolean, onAccept: (Uri?) -> Unit, onReject: () -> Unit) {
    // Reto "de mención" (sin contenido objetivo previo): el retado debe subir
    // su respuesta ANTES (o al momento) de aceptar — igual que en la web.
    val needsResponse = c.targetVideoUrl.isNullOrBlank() && c.targetImageUrl.isNullOrBlank()
    val aIsImage = c.challengerMediaType == "image" || (c.challengerVideoUrl.isNullOrBlank() && !c.challengerImageUrl.isNullOrBlank())
    val requiredMime = if (aIsImage) "image/*" else "video/*"
    val requiredLabel = if (aIsImage) "photo" else "video"

    var responseUri by remember(c.id) { mutableStateOf<Uri?>(null) }
    var pendingAutoAccept by remember(c.id) { mutableStateOf(false) }
    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            responseUri = uri
            if (pendingAutoAccept) { pendingAutoAccept = false; onAccept(uri) }
        } else {
            pendingAutoAccept = false
        }
    }

    val aUrl = c.challengerVideoUrl ?: c.challengerImageUrl
    val bUrl = if (needsResponse) responseUri?.toString() else (c.targetVideoUrl ?: c.targetImageUrl)
    val bIsImage = if (needsResponse) false else (c.targetMediaType == "image" || (c.targetVideoUrl.isNullOrBlank() && !c.targetImageUrl.isNullOrBlank()))
    val bIsLocalUri = needsResponse && responseUri != null

    val pager = rememberPagerState(pageCount = { 2 })

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
            if (page == 0) {
                ChallengeMediaBox(
                    url = aUrl, posterUrl = c.challengerPosterUrl, isImage = aIsImage, isLocalUri = false,
                    isVisible = isActiveCard && pager.currentPage == 0,
                    modifier = Modifier.fillMaxSize(),
                )
            } else if (bUrl != null) {
                ChallengeMediaBox(
                    url = bUrl, posterUrl = if (needsResponse) null else c.targetPosterUrl, isImage = bIsImage, isLocalUri = bIsLocalUri,
                    isVisible = isActiveCard && pager.currentPage == 1,
                    modifier = Modifier.fillMaxSize(),
                )
            } else {
                // Lado B sin media (reto de mención): zona para subir la respuesta.
                Box(
                    Modifier.fillMaxSize().background(Color(0xFF18181B)).clickable { pickFile.launch(requiredMime) },
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            Modifier.size(64.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.04f)).border(1.dp, Color.White.copy(alpha = 0.15f), CircleShape),
                            contentAlignment = Alignment.Center,
                        ) { Icon(Icons.Filled.Movie, null, tint = ZincText, modifier = Modifier.size(28.dp)) }
                        Spacer(Modifier.height(14.dp))
                        Text("Upload your $requiredLabel", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                        Spacer(Modifier.height(4.dp))
                        Text("This challenge was made with a $requiredLabel — reply with a $requiredLabel", color = ZincText, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 32.dp))
                    }
                }
            }
        }

        // Etiqueta del lado visible (A/B) + botón "Change" si es mi respuesta ya subida.
        Row(
            Modifier.align(Alignment.TopStart).statusBarsPadding().padding(start = 16.dp, top = 64.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 10.dp, vertical = 4.dp),
            ) {
                Text(
                    if (pager.currentPage == 0) "@${c.from?.username ?: "rival"}" else "@${c.to?.username ?: "you"}",
                    color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                )
            }
            if (pager.currentPage == 1 && needsResponse && responseUri != null) {
                Spacer(Modifier.width(8.dp))
                Box(
                    Modifier.clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.55f)).border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(50))
                        .clickable { pickFile.launch(requiredMime) }.padding(horizontal = 12.dp, vertical = 4.dp),
                ) { Text("Change", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold) }
            }
        }

        // Panel inferior de acciones — degradado a todo el ancho (SIN tarjeta
        // redondeada con borde: la web usa un overlay `bottom-0` con gradiente,
        // no un "marco" flotante). Incluye los puntitos del carrusel ARRIBA del
        // todo (igual que la web: los indicadores van ABAJO, no en la cabecera).
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.85f))))
                .navigationBarsPadding().padding(start = 16.dp, end = 16.dp, top = 28.dp, bottom = 20.dp),
        ) {
            // Puntitos del carrusel A/B (abajo, réplica de la web).
            Row(
                Modifier.align(Alignment.CenterHorizontally).padding(bottom = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                for (i in 0..1) {
                    Box(
                        Modifier.size(width = if (pager.currentPage == i) 20.dp else 3.dp, height = 3.dp)
                            .clip(RoundedCornerShape(1.5.dp)).background(if (pager.currentPage == i) Color.White else Color.White.copy(alpha = 0.4f)),
                    )
                }
            }
            Column(Modifier.fillMaxWidth()) {
                c.message?.takeIf { it.isNotBlank() }?.let {
                    Text("“$it”", color = Color.White.copy(alpha = 0.75f), fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(10.dp))
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("@${c.from?.username ?: "rival"}", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text("VS", color = Color.White.copy(alpha = 0.8f), fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp))
                    Text("@${c.to?.username ?: "you"}", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
                }
                if (needsResponse) {
                    Spacer(Modifier.height(10.dp))
                    Box(
                        Modifier.fillMaxWidth().height(40.dp).clip(RoundedCornerShape(50)).border(1.dp, Color.White.copy(alpha = 0.20f), RoundedCornerShape(50))
                            .clickable(enabled = !busy) { pickFile.launch(requiredMime) },
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Icon(Icons.Filled.Movie, null, tint = Color.White, modifier = Modifier.size(15.dp))
                            Text(
                                if (responseUri != null) "Change my $requiredLabel" else "Upload my $requiredLabel",
                                color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(
                        Modifier.weight(1f).height(44.dp).clip(RoundedCornerShape(50)).background(if (busy) Color.White.copy(alpha = 0.6f) else Color.White)
                            .clickable(enabled = !busy) {
                                if (needsResponse && responseUri == null) {
                                    pendingAutoAccept = true
                                    pickFile.launch(requiredMime)
                                } else {
                                    onAccept(responseUri)
                                }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            if (busy) CircularProgressIndicator(color = Color.Black, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                            else Icon(Icons.Filled.Check, null, tint = Color.Black, modifier = Modifier.size(16.dp))
                            Text(
                                if (needsResponse && responseUri == null) "Upload & accept" else "Accept challenge",
                                color = Color.Black, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                    Box(
                        Modifier.size(44.dp).clip(CircleShape).border(1.dp, Color.White.copy(alpha = 0.20f), CircleShape).clickable(enabled = !busy) { onReject() },
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.Close, "reject", tint = Color.White, modifier = Modifier.size(18.dp)) }
                }
            }
        }
    }
}

// Caja de media (vídeo real con ExoPlayer o imagen) para cada lado A/B del
// reto — réplica del carrusel de vídeos de ActiveChallengesPage.jsx. Solo
// reproduce (acquire) cuando `isVisible` es true (tarjeta activa Y lado
// visible del carrusel horizontal); el resto libera el reproductor.
@Composable
private fun ChallengeMediaBox(
    url: String?,
    posterUrl: String?,
    isImage: Boolean,
    isLocalUri: Boolean,
    isVisible: Boolean,
    modifier: Modifier = Modifier,
) {
    val mediaUrl = if (isLocalUri) url else absoluteUrl(url)
    Box(modifier.background(Color.Black)) {
        when {
            mediaUrl == null -> {
                val absPoster = absoluteUrl(posterUrl)
                if (absPoster != null) {
                    AsyncImage(model = absPoster, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                }
            }
            isImage -> {
                AsyncImage(model = mediaUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            }
            else -> {
                val context = LocalContext.current
                val player = remember(mediaUrl) {
                    ExoPlayer.Builder(context).build().apply {
                        setMediaItem(MediaItem.fromUri(mediaUrl))
                        repeatMode = Player.REPEAT_MODE_ONE
                        volume = 0f
                        playWhenReady = false
                        prepare()
                    }
                }
                DisposableEffect(mediaUrl) { onDispose { player.release() } }
                // El lado VISIBLE reproduce CON audio; el otro va en silencio y
                // pausado (antes el volumen estaba fijo a 0f -> nunca se oía nada
                // en Retos activos, bug reportado).
                LaunchedEffect(isVisible) {
                    if (isVisible) { player.volume = 1f; player.play() } else { player.volume = 0f; player.pause() }
                }
                AndroidView(
                    factory = { ctx ->
                        PlayerView(ctx).apply {
                            useController = false
                            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                            setShutterBackgroundColor(android.graphics.Color.BLACK)
                        }
                    },
                    update = { it.player = player },
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }
}

@Composable
private fun EmptyCompleted(onCreate: () -> Unit, onActive: () -> Unit) {
    Column(
        Modifier.fillMaxSize().statusBarsPadding().padding(horizontal = 24.dp, vertical = 96.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            Modifier.size(80.dp)
                // Glow blanco alrededor (réplica de boxShadow '0 0 48px -14px
                // rgba(255,255,255,0.45)' de la web) — spot/ambient blancos.
                .shadow(24.dp, CircleShape, spotColor = Color.White, ambientColor = Color.White)
                .clip(CircleShape).background(Color.White.copy(alpha = 0.03f)).border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape),
            contentAlignment = Alignment.Center,
        ) { Icon(ImageVector.vectorResource(R.drawable.ic_trophy), null, tint = Color.White, modifier = Modifier.size(36.dp)) }
        Spacer(Modifier.height(22.dp))
        Text("No completed challenges yet", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(10.dp))
        Text("Create your first challenge and start competing. Winners will appear here.", color = ZincText, fontSize = 15.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(28.dp))
        Box(
            Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(50)).background(Color.White).clickable { onCreate() },
            contentAlignment = Alignment.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Filled.Add, null, tint = Color.Black, modifier = Modifier.size(18.dp))
                Text("Create a challenge", color = Color.Black, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        Spacer(Modifier.height(12.dp))
        Box(
            Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(50)).border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(50)).clickable { onActive() },
            contentAlignment = Alignment.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(ImageVector.vectorResource(R.drawable.ic_swords), null, tint = Color.White, modifier = Modifier.size(18.dp))
                Text("See active challenges", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Medium)
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
        Text("No active challenges", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text("When someone challenges you, the request will appear here for you to accept or reject.", color = ZincText, fontSize = 15.sp, textAlign = TextAlign.Center)
    }
}

private fun videoPart(context: Context, name: String, uri: Uri): MultipartBody.Part {
    val input = context.contentResolver.openInputStream(uri) ?: throw IllegalStateException("Could not open the video")
    val file = File.createTempFile("twyk_accept_", ".mp4", context.cacheDir)
    file.outputStream().use { out -> input.use { it.copyTo(out) } }
    val body = file.asRequestBody("video/*".toMediaTypeOrNull())
    return MultipartBody.Part.createFormData(name, file.name, body)
}
