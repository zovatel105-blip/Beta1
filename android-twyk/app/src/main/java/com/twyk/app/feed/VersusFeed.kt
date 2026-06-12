@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package com.twyk.app.feed

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.HowToVote
import androidx.compose.material.icons.filled.Share
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
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
// ─────────────────────────────────────────────────────────────────────────────
@Composable
fun VersusFeed(
    onOpenComments: (String) -> Unit,
    onRequireAuth: () -> Unit,
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
        modifier = Modifier.fillMaxSize().background(Color.Black),
    ) { page ->
        val post = posts[page]
        val active = page == pagerState.currentPage
        if (post.type == "duet") {
            DuetPage(
                post, active, dataSourceFactory,
                onVote = { vm.vote(post.id, it) },
                onComments = { onOpenComments(post.id) },
                onRequireAuth = onRequireAuth,
            )
        } else {
            CarouselPage(
                post, active, dataSourceFactory,
                onVote = { vm.vote(post.id, it) },
                onComments = { onOpenComments(post.id) },
                onRequireAuth = onRequireAuth,
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

        val sideKey = if (sidePager.currentPage == 0) "a" else "b"
        LabelChip(
            text = if (voted != null) "${sideKey.uppercase()}  ${pctFor(votes, sidePager.currentPage)}%" else sideKey.uppercase(),
            highlighted = voted == sideKey,
            modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(12.dp),
        )

        HeaderOverlay(post)
        SocialRail(post, votes, voted, onComments, onRequireAuth)
        Dots(active = sidePager.currentPage)
        if (voted == null) VoteHint()
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

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (isHorizontal) {
            Column(Modifier.fillMaxSize()) {
                VideoSurface(playerA, Modifier.weight(1f).fillMaxWidth(), onVoteA = voteA)
                Box(Modifier.fillMaxWidth().height(2.dp).background(Color.White.copy(alpha = 0.3f)))
                VideoSurface(playerB, Modifier.weight(1f).fillMaxWidth(), onVoteA = voteB)
            }
        } else {
            Row(Modifier.fillMaxSize()) {
                VideoSurface(playerA, Modifier.weight(1f).fillMaxHeight(), onVoteA = voteA)
                Box(Modifier.fillMaxHeight().width(2.dp).background(Color.White.copy(alpha = 0.3f)))
                VideoSurface(playerB, Modifier.weight(1f).fillMaxHeight(), onVoteA = voteB)
            }
        }

        LabelChip(
            text = if (voted != null) "A  ${pctFor(votes, 0)}%" else "A",
            highlighted = voted == "a",
            modifier = Modifier.align(Alignment.TopStart).statusBarsPadding().padding(12.dp),
        )
        LabelChip(
            text = if (voted != null) "B  ${pctFor(votes, 1)}%" else "B",
            highlighted = voted == "b",
            modifier = Modifier
                .align(if (isHorizontal) Alignment.CenterStart else Alignment.TopEnd)
                .padding(12.dp),
        )

        HeaderOverlay(post)
        SocialRail(post, votes, voted, onComments, onRequireAuth)
        if (voted == null) VoteHint()
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
private fun BoxScope.HeaderOverlay(post: Post) {
    val author = post.sideA?.author ?: post.author
    Column(
        Modifier
            .align(Alignment.TopStart)
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.55f), Color.Transparent)))
            .statusBarsPadding()
            .padding(start = 14.dp, end = 80.dp, top = 10.dp, bottom = 28.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
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
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.width(10.dp))
            Box(
                Modifier
                    .border(1.dp, Color.White, RoundedCornerShape(8.dp))
                    .padding(horizontal = 10.dp, vertical = 3.dp),
            ) {
                Text("Seguir", color = Color.White, fontSize = 12.sp)
            }
        }
        val desc = post.sideA?.description ?: post.description
        if (!desc.isNullOrBlank()) {
            Spacer(Modifier.height(6.dp))
            Text(desc, color = Color.White, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
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
    Column(
        Modifier
            .align(Alignment.BottomEnd)
            .navigationBarsPadding()
            .padding(end = 10.dp, bottom = 92.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        val total = votes.a + votes.b
        val voteTint = when (voted) {
            "a" -> Color(0xFFA855F7)
            "b" -> Color(0xFF3B82F6)
            else -> Color.White
        }
        RailItem(Icons.Filled.HowToVote, label(total, "Votar"), voteTint) { /* votar = doble toque en el vídeo */ }
        RailItem(Icons.Filled.ChatBubbleOutline, label(post.stats?.comments ?: 0, "Comentar"), Color.White) { onComments() }
        RailItem(Icons.Filled.Share, label(post.stats?.shares ?: 0, "Compartir"), Color.White) { sharePost(context, post) }
        RailItem(
            if (saved) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
            label(post.stats?.saves ?: 0, "Guardar"),
            if (saved) Color(0xFFFACC15) else Color.White,
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
    }
}

@Composable
private fun RailItem(icon: ImageVector, text: String, tint: Color, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable { onClick() },
    ) {
        Icon(icon, contentDescription = text, tint = tint, modifier = Modifier.size(32.dp))
        Spacer(Modifier.height(3.dp))
        Text(text, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun BoxScope.Dots(active: Int) {
    Row(
        Modifier
            .align(Alignment.BottomCenter)
            .navigationBarsPadding()
            .padding(bottom = 88.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        for (i in 0..1) {
            Box(
                Modifier
                    .size(width = if (i == active) 16.dp else 6.dp, height = 6.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(if (i == active) Color.White else Color.White.copy(alpha = 0.4f)),
            )
        }
    }
}

@Composable
private fun BoxScope.VoteHint() {
    Box(
        Modifier
            .align(Alignment.TopCenter)
            .statusBarsPadding()
            .padding(top = 14.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(Color.Black.copy(alpha = 0.45f))
            .padding(horizontal = 12.dp, vertical = 5.dp),
    ) {
        Text("Desliza para comparar · doble toque para votar", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun LabelChip(text: String, highlighted: Boolean, modifier: Modifier = Modifier) {
    Box(
        modifier
            .clip(RoundedCornerShape(14.dp))
            .background(if (highlighted) Color(0xCCA855F7) else Color(0x8C000000))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(text, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
private fun bump(v: Votes, side: String): Votes =
    if (side == "a") v.copy(a = v.a + 1) else v.copy(b = v.b + 1)

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
