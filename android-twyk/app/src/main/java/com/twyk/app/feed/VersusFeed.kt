@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package com.twyk.app.feed

import android.content.Context
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
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
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import coil.compose.AsyncImage
import com.twyk.app.Config
import com.twyk.app.R
import com.twyk.app.absoluteUrl
import com.twyk.app.data.Post
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.SaveRequest
import com.twyk.app.data.Session
import com.twyk.app.data.Votes
import com.twyk.app.ui.sharePost
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

// ─────────────────────────────────────────────────────────────────────────────
// Feed vertical con reproductor NATIVO (Media3/ExoPlayer). Cada publicación se
// renderiza SEGÚN SU FORMATO:
//   · versus / "carousel"  -> carrusel horizontal A↔B, cada vídeo a PANTALLA
//                             COMPLETA (sin franja negra). Doble toque para votar.
//   · duet                 -> pantalla partida (horizontal: A arriba / B abajo;
//                             vertical: A izq / B der). Doble toque en un lado vota.
//
// La UI (cabecera, columna social, barra inferior) replica la de la WEB.
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun VersusFeed(
    onOpenComments: (String) -> Unit,
    onRequireAuth: () -> Unit,
    onOpenProfile: (String) -> Unit,
    vm: FeedViewModel = viewModel(),
) {
    val posts by vm.posts.collectAsState()
    val context = LocalContext.current
    val dataSourceFactory = remember { VideoCache.cacheDataSourceFactory(context) }

    if (posts.isEmpty()) {
        Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
            Text("Cargando…", color = Color.White)
        }
        return
    }

    val pagerState = rememberPagerState(pageCount = { posts.size })

    LaunchedEffect(pagerState.currentPage, posts.size) {
        if (posts.size - pagerState.currentPage <= 3) vm.loadMore()
    }

    VerticalPager(
        state = pagerState,
        beyondViewportPageCount = 1,
        modifier = Modifier.fillMaxSize().background(Color.Black).statusBarsPadding(),
    ) { page ->
        val post = posts[page]
        val active = page == pagerState.currentPage
        if (post.type == "duet") {
            DuetPage(
                post, active, dataSourceFactory,
                onVote = { vm.vote(post.id, it) },
                onComments = { onOpenComments(post.id) },
                onRequireAuth = onRequireAuth,
                onOpenProfile = onOpenProfile,
            )
        } else {
            CarouselPage(
                post, active, dataSourceFactory,
                onVote = { vm.vote(post.id, it) },
                onComments = { onOpenComments(post.id) },
                onRequireAuth = onRequireAuth,
                onOpenProfile = onOpenProfile,
            )
        }
    }
}

private fun buildPlayer(
    context: Context,
    factory: CacheDataSource.Factory,
    url: String?,
    muted: Boolean,
): ExoPlayer {
    val player = ExoPlayer.Builder(context)
        .setMediaSourceFactory(DefaultMediaSourceFactory(factory))
        .build()
    absoluteUrl(url)?.let { player.setMediaItem(MediaItem.fromUri(it)) }
    player.repeatMode = Player.REPEAT_MODE_ONE
    player.volume = if (muted) 0f else 1f
    player.playWhenReady = false
    player.prepare()
    return player
}

// ── Publicación VERSUS (carrusel horizontal A↔B a pantalla completa) ──────────
@Composable
private fun CarouselPage(
    post: Post,
    isActive: Boolean,
    dataSourceFactory: CacheDataSource.Factory,
    onVote: (String) -> Unit,
    onComments: () -> Unit,
    onRequireAuth: () -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    val context = LocalContext.current
    val playerA = remember(post.id) { buildPlayer(context, dataSourceFactory, post.sideA?.videoUrl, muted = false) }
    val playerB = remember(post.id) { buildPlayer(context, dataSourceFactory, post.sideB?.videoUrl, muted = false) }
    DisposableEffect(post.id) {
        onDispose { playerA.release(); playerB.release() }
    }

    val sidePager = rememberPagerState(pageCount = { 2 })
    var voted by remember(post.id) { mutableStateOf<String?>(null) }
    var votes by remember(post.id) { mutableStateOf(post.votes ?: Votes()) }

    // Solo el lado VISIBLE de la publicación ACTIVA reproduce (con audio).
    LaunchedEffect(isActive, sidePager.currentPage) {
        if (isActive) {
            if (sidePager.currentPage == 0) {
                playerB.pause(); playerA.volume = 1f; playerA.play()
            } else {
                playerA.pause(); playerB.volume = 1f; playerB.play()
            }
        } else {
            playerA.pause(); playerB.pause()
        }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        HorizontalPager(state = sidePager, modifier = Modifier.fillMaxSize()) { p ->
            VideoSurface(
                player = if (p == 0) playerA else playerB,
                modifier = Modifier.fillMaxSize(),
            ) {
                val s = if (p == 0) "a" else "b"
                if (voted == null) { voted = s; votes = bump(votes, s); onVote(s) }
            }
        }

        HeaderOverlay(post, onOpenProfile)
        SocialRail(post, votes, voted, onComments, onRequireAuth)
        Dots(active = sidePager.currentPage)
        if (voted == null) VoteHint("Desliza para comparar · doble toque para votar")
    }
}

// ── Publicación DUET (pantalla partida) ───────────────────────────────────────
@Composable
private fun DuetPage(
    post: Post,
    isActive: Boolean,
    dataSourceFactory: CacheDataSource.Factory,
    onVote: (String) -> Unit,
    onComments: () -> Unit,
    onRequireAuth: () -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    val context = LocalContext.current
    val playerA = remember(post.id) { buildPlayer(context, dataSourceFactory, post.sideA?.videoUrl, muted = false) }
    val playerB = remember(post.id) { buildPlayer(context, dataSourceFactory, post.sideB?.videoUrl, muted = true) }
    DisposableEffect(post.id) {
        onDispose { playerA.release(); playerB.release() }
    }

    LaunchedEffect(isActive) {
        if (isActive) { playerA.play(); playerB.play() } else { playerA.pause(); playerB.pause() }
    }

    var voted by remember(post.id) { mutableStateOf<String?>(null) }
    var votes by remember(post.id) { mutableStateOf(post.votes ?: Votes()) }
    val isHorizontal = (post.layout ?: "horizontal") == "horizontal"

    val voteA: () -> Unit = { if (voted == null) { voted = "a"; votes = bump(votes, "a"); onVote("a") } }
    val voteB: () -> Unit = { if (voted == null) { voted = "b"; votes = bump(votes, "b"); onVote("b") } }

    // Borde de color en el lado VOTADO (igual que el "ring" de la web).
    fun ring(side: String): Modifier =
        if (voted == side) Modifier.border(2.dp, if (side == "a") Color(0xFFA855F7) else Color(0xFF3B82F6)) else Modifier

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (isHorizontal) {
            Column(Modifier.fillMaxSize()) {
                VideoSurface(playerA, Modifier.weight(1f).fillMaxWidth().then(ring("a")), onVoteA = voteA)
                Box(Modifier.fillMaxWidth().height(2.dp).background(Color.White.copy(alpha = 0.3f)))
                VideoSurface(playerB, Modifier.weight(1f).fillMaxWidth().then(ring("b")), onVoteA = voteB)
            }
        } else {
            Row(Modifier.fillMaxSize()) {
                VideoSurface(playerA, Modifier.weight(1f).fillMaxHeight().then(ring("a")), onVoteA = voteA)
                Box(Modifier.fillMaxHeight().width(2.dp).background(Color.White.copy(alpha = 0.3f)))
                VideoSurface(playerB, Modifier.weight(1f).fillMaxHeight().then(ring("b")), onVoteA = voteB)
            }
        }

        HeaderOverlay(post, onOpenProfile)
        SocialRail(post, votes, voted, onComments, onRequireAuth)
        if (voted == null) VoteHint("Doble toque para votar")
    }
}

// ── Superficie de vídeo (PlayerView nativo) + doble toque para votar ──────────
@Composable
private fun VideoSurface(
    player: ExoPlayer,
    modifier: Modifier = Modifier,
    onVoteA: () -> Unit,
) {
    Box(
        modifier
            .background(Color.Black)
            .pointerInput(Unit) { detectTapGestures(onDoubleTap = { onVoteA() }) },
    ) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    useController = false
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                    setShutterBackgroundColor(android.graphics.Color.BLACK)
                    this.player = player
                }
            },
            update = { it.player = player },
            modifier = Modifier.fillMaxSize(),
        )
    }
}

// ── Overlays ──────────────────────────────────────────────────────────────────
@Composable
private fun BoxScope.HeaderOverlay(post: Post, onOpenProfile: (String) -> Unit) {
    val author = post.sideA?.author ?: post.author
    val uname = author?.username
    Column(
        Modifier
            .align(Alignment.BottomStart)
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.7f))))
            .navigationBarsPadding()
            .padding(start = 14.dp, end = 80.dp, top = 40.dp, bottom = 78.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.clickable(enabled = uname != null) { uname?.let { onOpenProfile(it) } },
        ) {
            val avatar = absoluteUrl(author?.avatarUrl)
            if (avatar != null) {
                AsyncImage(
                    model = avatar,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(38.dp).clip(CircleShape),
                )
                Spacer(Modifier.width(8.dp))
            }
            Text(
                author?.username ?: author?.name ?: "twyk",
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.width(10.dp))
            Box(
                Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .border(1.dp, Color.White, RoundedCornerShape(8.dp))
                    .padding(horizontal = 12.dp, vertical = 4.dp),
            ) {
                Text("Seguir", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
        }
        val desc = post.sideA?.description ?: post.description
        if (!desc.isNullOrBlank()) {
            Spacer(Modifier.height(6.dp))
            Text(desc, color = Color.White, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun BoxScope.SocialRail(
    post: Post,
    votes: Votes,
    voted: String?,
    onComments: () -> Unit,
    onRequireAuth: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var saved by remember(post.id) { mutableStateOf(false) }
    var menuOpen by remember(post.id) { mutableStateOf(false) }

    val author = post.sideA?.author ?: post.author
    val avatar = absoluteUrl(author?.avatarUrl)

    Column(
        Modifier
            .align(Alignment.BottomEnd)
            .navigationBarsPadding()
            .padding(end = 8.dp, bottom = 64.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        val total = votes.a + votes.b
        val voteTint = when (voted) {
            "a" -> Color(0xFFA855F7)
            "b" -> Color(0xFF3B82F6)
            else -> Color.White
        }
        // Votar (papeleta marcada HUECA, como los demás botones). Votar = doble toque en el vídeo.
        RailItem(ImageVector.vectorResource(R.drawable.ic_vote), label(total, "Votar"), voteTint, size = 36) { }
        // Retar (espadas cruzadas)
        RailItem(ImageVector.vectorResource(R.drawable.ic_swords), "Retar", Color.White, size = 25) {
            if (Session.token == null) onRequireAuth()
        }
        // Comentar (bocadillo redondo, igual que la web)
        RailItem(ImageVector.vectorResource(R.drawable.ic_comment), label(post.stats?.comments ?: 0, "Comentar"), Color.White, size = 25) { onComments() }
        // Compartir (flecha estilo TikTok)
        RailItem(ImageVector.vectorResource(R.drawable.ic_share), label(post.stats?.shares ?: 0, "Compartir"), Color.White, size = 25) { sharePost(context, post) }
        // Guardar (marcador, igual que la web)
        RailItem(
            ImageVector.vectorResource(if (saved) R.drawable.ic_bookmark_filled else R.drawable.ic_bookmark),
            label(post.stats?.saves ?: 0, "Guardar"),
            if (saved) Color(0xFFFACC15) else Color.White,
            size = 25,
        ) {
            if (Session.token == null) {
                onRequireAuth()
            } else {
                scope.launch {
                    runCatching { RetrofitProvider.api.save(SaveRequest(post.id)) }
                        .onSuccess { saved = it.saved }
                        .onFailure { onRequireAuth() }
                }
            }
        }
        // Más opciones (tres puntos finos, igual que la web)
        RailItem(ImageVector.vectorResource(R.drawable.ic_more), "", Color.White, size = 18) { menuOpen = true }
        // Disco de música giratorio
        MusicDisc(avatar)
    }

    if (menuOpen) MoreOptionsSheet(onClose = { menuOpen = false })
}

@Composable
private fun RailItem(icon: ImageVector, label: String, tint: Color, size: Int = 25, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable { onClick() },
    ) {
        Icon(
            icon,
            contentDescription = if (label.isEmpty()) null else label,
            tint = tint,
            modifier = Modifier.size(size.dp),
        )
        if (label.isNotEmpty()) {
            Spacer(Modifier.height(3.dp))
            Text(label, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun MusicDisc(avatar: String?) {
    val transition = rememberInfiniteTransition()
    val angle by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(animation = tween(durationMillis = 6000, easing = LinearEasing)),
    )
    Box(
        Modifier
            .size(40.dp)
            .rotate(angle)
            .clip(CircleShape)
            .border(1.dp, Color.White.copy(alpha = 0.3f), CircleShape)
            .background(Brush.linearGradient(listOf(Color(0xFF3F3F46), Color.Black))),
        contentAlignment = Alignment.Center,
    ) {
        if (avatar != null) {
            AsyncImage(
                model = avatar,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(24.dp).clip(CircleShape),
            )
        }
    }
}

@Composable
private fun BoxScope.Dots(active: Int) {
    Row(
        Modifier
            .align(Alignment.BottomCenter)
            .navigationBarsPadding()
            .padding(bottom = 70.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        for (i in 0..1) {
            Box(
                Modifier
                    .size(width = if (i == active) 16.dp else 3.dp, height = 3.dp)
                    .clip(RoundedCornerShape(1.5.dp))
                    .background(if (i == active) Color.White else Color.White.copy(alpha = 0.4f)),
            )
        }
    }
}

@Composable
private fun BoxScope.VoteHint(text: String) {
    Box(
        Modifier
            .align(Alignment.TopCenter)
            .padding(top = 14.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(Color.Black.copy(alpha = 0.45f))
            .padding(horizontal = 12.dp, vertical = 5.dp),
    ) {
        Text(text, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
    }
}

// Hoja inferior "Más opciones" (igual que la web).
@Composable
private fun MoreOptionsSheet(onClose: () -> Unit) {
    val context = LocalContext.current
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f))
            .clickable(onClick = onClose),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
                .background(Color(0xFF0A0A0B))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { }
                .navigationBarsPadding()
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Box(
                Modifier
                    .align(Alignment.CenterHorizontally)
                    .padding(bottom = 10.dp)
                    .size(width = 40.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color.White.copy(alpha = 0.25f)),
            )
            SheetItem(Icons.Filled.VisibilityOff, "No me interesa", Color.White, onClose)
            SheetItem(Icons.Filled.Link, "Copiar enlace", Color.White) {
                runCatching {
                    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                    cm.setPrimaryClip(android.content.ClipData.newPlainText("twyk", Config.BASE_URL))
                }
                onClose()
            }
            SheetItem(Icons.Filled.Flag, "Reportar", Color(0xFFF87171), onClose)
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(onClick = onClose)
                    .padding(vertical = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("Cancelar", color = Color.White.copy(alpha = 0.7f), fontWeight = FontWeight.Medium, fontSize = 15.sp)
            }
        }
    }
}

@Composable
private fun SheetItem(icon: ImageVector, text: String, tint: Color, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Text(text, color = tint, fontSize = 15.sp)
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
private fun bump(v: Votes, side: String): Votes =
    if (side == "a") v.copy(a = v.a + 1) else v.copy(b = v.b + 1)

@Suppress("unused")
private fun pctFor(votes: Votes, side: Int): Int {
    val total = votes.a + votes.b
    if (total <= 0) return 50
    val v = if (side == 0) votes.a else votes.b
    return (v * 100f / total).roundToInt()
}

private fun label(n: Int, placeholder: String): String = if (n <= 0) placeholder else formatCount(n)

private fun formatCount(n: Int): String = when {
    n >= 1_000_000 -> String.format("%.1f", n / 1_000_000.0).removeSuffix(".0") + "M"
    n >= 1_000 -> String.format("%.1f", n / 1_000.0).removeSuffix(".0") + "K"
    else -> n.toString()
}
