@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package com.twyk.app.feed

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
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
import com.twyk.app.data.Side

@Composable
fun VersusFeed(vm: FeedViewModel = viewModel()) {
    val posts by vm.posts.collectAsState()
    val context = LocalContext.current
    val dataSourceFactory = remember { VideoCache.cacheDataSourceFactory(context) }

    if (posts.isEmpty()) {
        Box(
            Modifier.fillMaxSize().background(Color.Black),
            contentAlignment = Alignment.Center,
        ) {
            Text("Cargando…", color = Color.White)
        }
        return
    }

    val pagerState = rememberPagerState(pageCount = { posts.size })

    // Scroll infinito: pide mas feed al acercarse al final.
    LaunchedEffect(pagerState.currentPage, posts.size) {
        if (posts.size - pagerState.currentPage <= 3) vm.loadMore()
    }

    VerticalPager(
        state = pagerState,
        // beyondViewportPageCount = 1 -> la pagina vecina se compone y PREPARA por
        // adelantado (buffer listo) = arranque instantaneo al deslizar.
        beyondViewportPageCount = 1,
        modifier = Modifier.fillMaxSize().background(Color.Black),
    ) { page ->
        val post = posts[page]
        VersusPage(
            post = post,
            isActive = page == pagerState.currentPage,
            dataSourceFactory = dataSourceFactory,
            onVote = { side -> vm.vote(post.id, side) },
        )
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

@Composable
private fun VersusPage(
    post: Post,
    isActive: Boolean,
    dataSourceFactory: CacheDataSource.Factory,
    onVote: (String) -> Unit,
) {
    val context = LocalContext.current
    // Un reproductor NATIVO por lado (1vs1 = 2 videos). Lado A con audio, B mute.
    val playerA = remember(post.id) { buildPlayer(context, dataSourceFactory, post.sideA?.videoUrl, muted = false) }
    val playerB = remember(post.id) { buildPlayer(context, dataSourceFactory, post.sideB?.videoUrl, muted = true) }

    DisposableEffect(post.id) {
        onDispose {
            playerA.release()
            playerB.release()
        }
    }

    // Solo la pagina activa reproduce; las vecinas quedan preparadas en pausa.
    LaunchedEffect(isActive) {
        if (isActive) {
            playerA.play()
            playerB.play()
        } else {
            playerA.pause()
            playerB.pause()
        }
    }

    var voted by remember(post.id) { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize()) {
        VideoHalf(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            player = playerA,
            side = post.sideA,
            sideKey = "a",
            voted = voted,
            onClick = { if (voted == null) { voted = "a"; onVote("a") } },
        )
        Box(Modifier.fillMaxWidth().height(2.dp).background(Color.White.copy(alpha = 0.3f)))
        VideoHalf(
            modifier = Modifier.weight(1f).fillMaxWidth(),
            player = playerB,
            side = post.sideB,
            sideKey = "b",
            voted = voted,
            onClick = { if (voted == null) { voted = "b"; onVote("b") } },
        )
    }
}

@Composable
private fun VideoHalf(
    modifier: Modifier,
    player: ExoPlayer,
    side: Side?,
    sideKey: String,
    voted: String?,
    onClick: () -> Unit,
) {
    Box(modifier.background(Color.Black).clickable { onClick() }) {
        val poster = absoluteUrl(side?.posterUrl)
        if (poster != null) {
            AsyncImage(
                model = poster,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    useController = false
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                    setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                    this.player = player
                }
            },
            update = { it.player = player },
            modifier = Modifier.fillMaxSize(),
        )
        // Etiqueta A/B (resaltada si es el voto del usuario).
        Box(
            Modifier.align(Alignment.TopStart).padding(12.dp)
                .background(if (voted == sideKey) Color(0xCCA855F7) else Color(0x8C000000))
                .padding(horizontal = 10.dp, vertical = 4.dp),
        ) {
            Text(if (sideKey == "a") "A" else "B", color = Color.White, fontSize = 13.sp)
        }
        side?.author?.username?.let { name ->
            Text(
                "@$name",
                color = Color.White,
                fontSize = 13.sp,
                modifier = Modifier.align(Alignment.BottomStart).padding(12.dp),
            )
        }
    }
}
