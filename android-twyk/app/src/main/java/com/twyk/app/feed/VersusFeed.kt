@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package com.twyk.app.feed

import android.content.Context
import android.media.MediaPlayer
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
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
import com.twyk.app.data.BlockRequest
import com.twyk.app.data.CreateReportRequest
import com.twyk.app.data.Post
import com.twyk.app.data.PostEvents
import com.twyk.app.data.QuickChallengeTarget
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.SaveRequest
import com.twyk.app.data.Session
import com.twyk.app.data.Side
import com.twyk.app.data.Votes
import com.twyk.app.ui.ShareSheet
import com.twyk.app.ui.sharePost
import kotlinx.coroutines.delay
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
    onChallenge: (QuickChallengeTarget) -> Unit = {},
    vm: FeedViewModel = viewModel(),
) {
    val posts by vm.posts.collectAsState()

    if (posts.isEmpty()) {
        Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
            Text("Loading…", color = Color.White)
        }
        return
    }

    FeedPager(
        posts = posts,
        onOpenComments = onOpenComments,
        onRequireAuth = onRequireAuth,
        onOpenProfile = onOpenProfile,
        onVote = { id, side, previousSide -> vm.vote(id, side, previousSide) },
        onNearEnd = { vm.loadMore() },
        onChallenge = onChallenge,
    )
}

// Pager de feed REUTILIZABLE (mismo reproductor nativo) con una lista de posts
// externa. Lo usan tanto el feed principal como "Batallas > Completados".
@Composable
fun FeedPager(
    posts: List<Post>,
    onOpenComments: (String) -> Unit,
    onRequireAuth: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onVote: (String, String, String?) -> Unit = { _, _, _ -> },
    onNearEnd: () -> Unit = {},
    initialPage: Int = 0,
    onChallenge: (QuickChallengeTarget) -> Unit = {},
    hideChallenge: Boolean = false,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val dataSourceFactory = remember { VideoCache.cacheDataSourceFactory(context) }
    val pagerState = rememberPagerState(initialPage = initialPage.coerceIn(0, (posts.size - 1).coerceAtLeast(0)), pageCount = { posts.size })

    LaunchedEffect(pagerState.currentPage, posts.size) {
        if (posts.size - pagerState.currentPage <= 3) onNearEnd()
    }

    VerticalPager(
        state = pagerState,
        beyondViewportPageCount = 1,
        modifier = Modifier.fillMaxSize().background(Color.Black).statusBarsPadding(),
    ) { page ->
        val post = posts[page]
        val active = page == pagerState.currentPage
        val requestNext: () -> Unit = {
            val next = page + 1
            if (next < posts.size) scope.launch { pagerState.animateScrollToPage(next) }
        }
        if (post.type == "duet") {
            DuetPage(
                post, active, dataSourceFactory,
                onVote = { side, previousSide -> onVote(post.id, side, previousSide) },
                onComments = { onOpenComments(post.id) },
                onRequireAuth = onRequireAuth,
                onOpenProfile = onOpenProfile,
                onRequestNext = requestNext,
                onChallenge = onChallenge,
                hideChallenge = hideChallenge,
            )
        } else {
            CarouselPage(
                post, active, dataSourceFactory,
                onVote = { side, previousSide -> onVote(post.id, side, previousSide) },
                onComments = { onOpenComments(post.id) },
                onRequireAuth = onRequireAuth,
                onOpenProfile = onOpenProfile,
                onRequestNext = requestNext,
                onChallenge = onChallenge,
                hideChallenge = hideChallenge,
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

// Reproductor de la MÚSICA adjunta (preview de iTunes, 30s) — réplica del
// <audio loop> independiente de CarouselSlide.jsx/DuetSlide.jsx. Antes esta
// música NUNCA se reproducía en el feed nativo (solo se guardaba como texto).
// MediaPlayer.prepareAsync() es asíncrono: el estado devuelto es null hasta
// que onPrepared confirma que ya se puede reproducir (evita bloquear el hilo
// de UI con una preparación síncrona de una URL remota).
@Composable
private fun rememberMusicPlayer(url: String?): State<MediaPlayer?> {
    val abs = absoluteUrl(url)
    val playerState = remember(abs) { mutableStateOf<MediaPlayer?>(null) }
    DisposableEffect(abs) {
        var mp: MediaPlayer? = null
        if (abs != null) {
            mp = runCatching {
                MediaPlayer().apply {
                    isLooping = true
                    setOnPreparedListener { playerState.value = this }
                    setOnErrorListener { _, _, _ -> true }
                    setDataSource(abs)
                    prepareAsync()
                }
            }.getOrNull()
        }
        onDispose {
            playerState.value = null
            runCatching { mp?.stop() }
            runCatching { mp?.release() }
        }
    }
    return playerState
}

// ── Publicación VERSUS (carrusel horizontal A↔B a pantalla completa) ──────────
@Composable
private fun CarouselPage(
    post: Post,
    isActive: Boolean,
    dataSourceFactory: CacheDataSource.Factory,
    onVote: (String, String?) -> Unit,
    onComments: () -> Unit,
    onRequireAuth: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onRequestNext: () -> Unit,
    onChallenge: (QuickChallengeTarget) -> Unit,
    hideChallenge: Boolean = false,
) {
    val context = LocalContext.current
    val playerA = remember(post.id) { buildPlayer(context, dataSourceFactory, post.sideA?.videoUrl, muted = false) }
    val playerB = remember(post.id) { buildPlayer(context, dataSourceFactory, post.sideB?.videoUrl, muted = false) }
    DisposableEffect(post.id) {
        onDispose { playerA.release(); playerB.release() }
    }

    // Música adjunta (preview de iTunes, 30s). Si existe, los vídeos van en
    // mute y suena la música — réplica de `hasMusic` en CarouselSlide.jsx.
    val hasMusic = !post.musicPreviewUrl.isNullOrBlank()
    val musicPlayer by rememberMusicPlayer(post.musicPreviewUrl)

    val sidePager = rememberPagerState(pageCount = { 2 })
    var voted by remember(post.id) { mutableStateOf<String?>(null) }
    var votes by remember(post.id) { mutableStateOf(post.votes ?: Votes()) }
    var showWinner by remember(post.id) { mutableStateOf(false) }
    var burstId by remember(post.id) { mutableStateOf(0L) }
    var burstColor by remember(post.id) { mutableStateOf(Color(0xFFA855F7)) }

    // Votar / CAMBIAR de voto — réplica exacta de submitVote() en
    // CarouselSlide.jsx: (1) sin sesión, abre el login (antes ni se
    // comprobaba: se podía votar como invitado, a diferencia de la web); (2)
    // re-tocar la MISMA opción ya votada solo repite la animación del icono,
    // sin cambiar nada; (3) tocar la OTRA opción CAMBIA el voto (resta al
    // lado anterior, suma al nuevo, se lo dice al backend con `previousSide`
    // para que lo aplique como un cambio atómico, no como un voto extra).
    fun submitVote(side: String) {
        if (Session.token == null) { onRequireAuth(); return }
        burstColor = if (side == "b") Color(0xFF3B82F6) else Color(0xFFA855F7)
        burstId = System.currentTimeMillis()
        if (voted == side) return
        val previous = voted
        votes = if (previous != null) switchVote(votes, previous, side) else bump(votes, side)
        voted = side
        onVote(side, previous)
    }

    // Tarjeta de ganador: aparece ~650ms después de votar (igual que la web).
    // Se re-dispara en cada voto REAL (primero o cambio de opción), no en un
    // simple re-toque de la misma opción (voted no cambia -> no se re-lanza).
    LaunchedEffect(post.id, voted) {
        if (voted != null) {
            delay(650)
            showWinner = true
        }
    }

    // Solo el lado VISIBLE de la publicación ACTIVA reproduce (con audio,
    // salvo que haya música adjunta: entonces el vídeo va en mute y suena la
    // música en su lugar, réplica exacta de la web).
    LaunchedEffect(isActive, sidePager.currentPage, showWinner) {
        if (isActive && !showWinner) {
            if (sidePager.currentPage == 0) {
                playerB.pause(); playerA.volume = if (hasMusic) 0f else 1f; playerA.play()
            } else {
                playerA.pause(); playerB.volume = if (hasMusic) 0f else 1f; playerB.play()
            }
        } else {
            playerA.pause(); playerB.pause()
        }
    }
    // Música adjunta: play/pausa en sincronía con la tarjeta activa (igual
    // que el efecto de audioRef en la web); MediaPlayer.isLooping=true ya
    // repite el preview de 30s mientras la tarjeta esté activa.
    LaunchedEffect(isActive, showWinner, musicPlayer) {
        if (hasMusic) {
            if (isActive && !showWinner) {
                runCatching { if (musicPlayer?.isPlaying == false) musicPlayer?.start() }
            } else {
                runCatching { if (musicPlayer?.isPlaying == true) musicPlayer?.pause() }
            }
        }
    }

    val visiblePlayer = if (sidePager.currentPage == 0) playerA else playerB
    // "¿hay audio sonando ahora?" (música O el vídeo activo sin haber
    // terminado de votar) — se usa para el pulso sintético del MusicDisc.
    val audioActive = isActive && !showWinner

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        HorizontalPager(state = sidePager, modifier = Modifier.fillMaxSize()) { p ->
            VideoSurface(
                player = if (p == 0) playerA else playerB,
                modifier = Modifier.fillMaxSize(),
                side = if (p == 0) post.sideA else post.sideB,
            ) {
                submitVote(if (p == 0) "a" else "b")
            }
        }

        // ── Capas RECICLADAS estilo TikTok (se resetean al reciclarse la celda) ──
        VideoProgressBar(visiblePlayer, isActive)                                 // barra de progreso
        BufferingSpinner(visiblePlayer)                                           // spinner de carga
        if (burstId != 0L) VoteBurst(burstId, burstColor) { burstId = 0L }        // burst del doble toque

        HeaderOverlay(post, onOpenProfile, onRequireAuth)
        SocialRail(post, votes, voted, onComments, onRequireAuth, hideChallenge = hideChallenge, audioActive = audioActive) {
            val current = if (sidePager.currentPage == 0) post.sideA else post.sideB
            onChallenge(
                QuickChallengeTarget(
                    postId = post.id,
                    author = current?.author ?: post.author,
                    videoUrl = current?.videoUrl,
                    posterUrl = current?.posterUrl,
                    description = current?.description ?: post.description,
                    music = current?.music ?: post.music,
                ),
            )
        }
        Dots(active = sidePager.currentPage)
        // Aviso: distinto según se haya votado ya o no, igual que la web
        // (antes de votar invita a comparar/votar; tras votar, si el lado
        // visible NO es el votado, invita a cambiar el voto).
        val currentSide = if (sidePager.currentPage == 0) "a" else "b"
        if (voted == null) {
            VoteHint("Swipe to compare · double-tap to vote")
        } else if (voted != currentSide) {
            VoteHint("Double-tap to switch your vote")
        }

        if (showWinner) {
            val chosenSide = if (voted == "b") post.sideB else post.sideA
            val otherSide = if (voted == "b") post.sideA else post.sideB
            VoteResultOverlay(
                votedSide = voted ?: "a",
                chosenSide = chosenSide,
                otherSide = otherSide,
                votes = votes,
                onClose = { showWinner = false },
                onShare = { sharePost(context, post) },
                onComments = onComments,
                onNext = { showWinner = false; onRequestNext() },
            )
        }
    }
}

// ── Publicación DUET (pantalla partida) ───────────────────────────────────────
@Composable
private fun DuetPage(
    post: Post,
    isActive: Boolean,
    dataSourceFactory: CacheDataSource.Factory,
    onVote: (String, String?) -> Unit,
    onComments: () -> Unit,
    onRequireAuth: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onRequestNext: () -> Unit,
    onChallenge: (QuickChallengeTarget) -> Unit,
    hideChallenge: Boolean = false,
) {
    val context = LocalContext.current
    val playerA = remember(post.id) { buildPlayer(context, dataSourceFactory, post.sideA?.videoUrl, muted = false) }
    val playerB = remember(post.id) { buildPlayer(context, dataSourceFactory, post.sideB?.videoUrl, muted = true) }
    DisposableEffect(post.id) {
        onDispose { playerA.release(); playerB.release() }
    }

    // Música adjunta (preview de iTunes, 30s): si existe, el lado A (el único
    // con audio en un dueto) va en mute y suena la música en su lugar.
    val hasMusic = !post.musicPreviewUrl.isNullOrBlank()
    val musicPlayer by rememberMusicPlayer(post.musicPreviewUrl)

    var voted by remember(post.id) { mutableStateOf<String?>(null) }
    var votes by remember(post.id) { mutableStateOf(post.votes ?: Votes()) }
    var showWinner by remember(post.id) { mutableStateOf(false) }
    var burstId by remember(post.id) { mutableStateOf(0L) }
    var burstColor by remember(post.id) { mutableStateOf(Color(0xFFA855F7)) }
    val isHorizontal = (post.layout ?: "horizontal") == "horizontal"

    // Votar / CAMBIAR de voto — misma lógica que CarouselPage (réplica de
    // submitVote() en DuetSlide.jsx): exige sesión, re-tocar el mismo lado
    // solo repite la animación, tocar el otro lado CAMBIA el voto.
    fun submitVote(side: String) {
        if (Session.token == null) { onRequireAuth(); return }
        burstColor = if (side == "b") Color(0xFF3B82F6) else Color(0xFFA855F7)
        burstId = System.currentTimeMillis()
        if (voted == side) return
        val previous = voted
        votes = if (previous != null) switchVote(votes, previous, side) else bump(votes, side)
        voted = side
        onVote(side, previous)
    }

    // Tarjeta de ganador: aparece ~650ms después de votar (igual que la web).
    LaunchedEffect(post.id, voted) {
        if (voted != null) {
            delay(650)
            showWinner = true
        }
    }

    LaunchedEffect(isActive, showWinner) {
        if (isActive && !showWinner) {
            playerA.volume = if (hasMusic) 0f else 1f
            playerA.play(); playerB.play()
        } else {
            playerA.pause(); playerB.pause()
        }
    }
    LaunchedEffect(isActive, showWinner, musicPlayer) {
        if (hasMusic) {
            if (isActive && !showWinner) {
                runCatching { if (musicPlayer?.isPlaying == false) musicPlayer?.start() }
            } else {
                runCatching { if (musicPlayer?.isPlaying == true) musicPlayer?.pause() }
            }
        }
    }
    // "¿hay audio sonando ahora?" (música O el vídeo A del dueto) — se usa
    // para el pulso sintético del MusicDisc.
    val audioActive = isActive && !showWinner

    val voteA: () -> Unit = { submitVote("a") }
    val voteB: () -> Unit = { submitVote("b") }

    // Borde de color en el lado VOTADO (igual que el "ring" de la web).
    fun ring(side: String): Modifier =
        if (voted == side) Modifier.border(2.dp, if (side == "a") Color(0xFFA855F7) else Color(0xFF3B82F6)) else Modifier

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (isHorizontal) {
            Column(Modifier.fillMaxSize()) {
                VideoSurface(playerA, Modifier.weight(1f).fillMaxWidth().then(ring("a")), useTextureView = true, side = post.sideA, onVoteA = voteA)
                Box(Modifier.fillMaxWidth().height(2.dp).background(Color.White.copy(alpha = 0.3f)))
                VideoSurface(playerB, Modifier.weight(1f).fillMaxWidth().then(ring("b")), useTextureView = true, side = post.sideB, onVoteA = voteB)
            }
        } else {
            Row(Modifier.fillMaxSize()) {
                VideoSurface(playerA, Modifier.weight(1f).fillMaxHeight().then(ring("a")), useTextureView = true, side = post.sideA, onVoteA = voteA)
                Box(Modifier.fillMaxHeight().width(2.dp).background(Color.White.copy(alpha = 0.3f)))
                VideoSurface(playerB, Modifier.weight(1f).fillMaxHeight().then(ring("b")), useTextureView = true, side = post.sideB, onVoteA = voteB)
            }
        }

        if (burstId != 0L) VoteBurst(burstId, burstColor) { burstId = 0L }        // burst del doble toque

        HeaderOverlay(post, onOpenProfile, onRequireAuth)
        SocialRail(post, votes, voted, onComments, onRequireAuth, hideChallenge = hideChallenge, audioActive = audioActive) {
            val current = if (voted == "b") post.sideB else post.sideA
            onChallenge(
                QuickChallengeTarget(
                    postId = post.id,
                    author = current?.author ?: post.author,
                    videoUrl = current?.videoUrl,
                    posterUrl = current?.posterUrl,
                    description = current?.description ?: post.description,
                    music = current?.music ?: post.music,
                ),
            )
        }
        // Aviso: "Double-tap to vote" antes de votar; tras votar, invita a
        // cambiar si se quiere (siempre visible en el dueto, ya que AMBOS
        // lados están siempre a la vista a la vez, a diferencia del carrusel).
        if (voted == null) {
            VoteHint("Double-tap to vote")
        } else {
            VoteHint("Double-tap the other side to switch your vote")
        }

        if (showWinner) {
            val chosenSide = if (voted == "b") post.sideB else post.sideA
            val otherSide = if (voted == "b") post.sideA else post.sideB
            VoteResultOverlay(
                votedSide = voted ?: "a",
                chosenSide = chosenSide,
                otherSide = otherSide,
                votes = votes,
                onClose = { showWinner = false },
                onShare = { sharePost(context, post) },
                onComments = onComments,
                onNext = { showWinner = false; onRequestNext() },
            )
        }
    }
}

// ── Superficie de vídeo (PlayerView nativo) + doble toque para votar ──────────
// useTextureView=true -> usa un PlayerView basado en TextureView (recorta el zoom
// a sus límites). OBLIGATORIO en el 1vs1 (dueto): con SurfaceView + RESIZE_MODE_ZOOM
// el vídeo se desbordaba sobre la mitad vecina y el split se veía desbalanceado
// (29/71 vertical, 56/44 horizontal). El recorte (clipToBounds + TextureView)
// confina cada vídeo a su 50% exacto, igual que el object-cover de la web.
@Composable
private fun VideoSurface(
    player: ExoPlayer,
    modifier: Modifier = Modifier,
    useTextureView: Boolean = false,
    side: Side? = null,
    onVoteA: () -> Unit,
) {
    Box(
        modifier
            .clipToBounds()
            .background(Color.Black)
            .pointerInput(Unit) { detectTapGestures(onDoubleTap = { onVoteA() }) },
    ) {
        val imageUrl = if (side?.mediaType == "image") absoluteUrl(side.imageUrl ?: side.posterUrl) else null
        if (imageUrl != null) {
            // Lado de tipo FOTO (paridad con la web: la imagen se muestra a
            // pantalla completa como diapositiva, sin reproductor de vídeo).
            AsyncImage(
                model = imageUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            AndroidView(
                factory = { ctx ->
                    val view = if (useTextureView) {
                        android.view.LayoutInflater.from(ctx)
                            .inflate(R.layout.twyk_texture_player, null) as PlayerView
                    } else {
                        PlayerView(ctx).apply {
                            useController = false
                            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                            setShutterBackgroundColor(android.graphics.Color.BLACK)
                        }
                    }
                    view.player = player
                    view
                },
                update = { it.player = player },
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

// ── Overlays ──────────────────────────────────────────────────────────────────
@Composable
private fun BoxScope.HeaderOverlay(post: Post, onOpenProfile: (String) -> Unit, onRequireAuth: () -> Unit) {
    val author = post.sideA?.author ?: post.author
    val uname = author?.username
    // Estado de "Seguir" — antes este botón NO hacía nada (ni onClick, ni
    // llamada a la API, ni reflejaba si ya se seguía). Réplica exacta del
    // comportamiento de CarouselSlide.jsx/DuetSlide.jsx: estado inicial desde
    // author.isFollowing (persistente, anotado por el backend), toggle
    // optimista al tocar + POST /api/users/{username}/follow, revertido si
    // la llamada falla.
    var following by remember(post.id, uname) { mutableStateOf(author?.isFollowing ?: false) }
    val followScope = rememberCoroutineScope()
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
        ) {
            if (post.isChallenge == true) {
                // ── Reto 1vs1: DOS creadores (avatar + nombre de cada lado), igual que la web ──
                val authorA = post.sideA?.author ?: post.author
                val authorB = post.sideB?.author ?: post.author
                Box(Modifier.size(39.dp)) {
                    // Avatar secundario (arriba-izquierda, detrás)
                    Box(
                        Modifier
                            .align(Alignment.TopStart)
                            .size(24.dp)
                            .clickable(enabled = authorB?.username != null) { authorB?.username?.let(onOpenProfile) },
                    ) {
                        TwykAvatar(authorB?.avatarUrl, 24.dp)
                    }
                    // Avatar principal (abajo-derecha, delante) con anillo negro que los separa
                    Box(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .size(26.dp)
                            .clip(CircleShape)
                            .background(Color.Black)
                            .padding(2.dp)
                            .clickable(enabled = authorA?.username != null) { authorA?.username?.let(onOpenProfile) },
                    ) {
                        TwykAvatar(authorA?.avatarUrl, 22.dp)
                    }
                }
                Spacer(Modifier.width(8.dp))
                Column {
                    Text(
                        (authorA?.username ?: authorA?.name ?: "twyk") + " vs",
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.clickable(enabled = authorA?.username != null) { authorA?.username?.let(onOpenProfile) },
                    )
                    Text(
                        authorB?.username ?: authorB?.name ?: "twyk",
                        color = Color.White,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.clickable(enabled = authorB?.username != null) { authorB?.username?.let(onOpenProfile) },
                    )
                }
            } else {
                // ── Publicación normal: un solo avatar + nombre ──
                TwykAvatar(
                    author?.avatarUrl,
                    30.dp,
                    Modifier.clickable(enabled = uname != null) { uname?.let { onOpenProfile(it) } },
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    author?.username ?: author?.name ?: "twyk",
                    color = Color.White,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable(enabled = uname != null) { uname?.let { onOpenProfile(it) } },
                )
            }
            Spacer(Modifier.width(10.dp))
            Box(
                Modifier
                    .clip(RoundedCornerShape(50))
                    .border(1.dp, Color.White, RoundedCornerShape(50))
                    .clickable(enabled = uname != null) {
                        if (Session.token == null) { onRequireAuth(); return@clickable }
                        if (uname == null || uname == Session.user?.username) return@clickable
                        following = !following
                        followScope.launch {
                            runCatching { RetrofitProvider.api.toggleFollow(uname) }
                                .onSuccess { r -> following = r.following }
                                .onFailure { following = !following }
                        }
                    }
                    .padding(horizontal = 12.dp, vertical = 4.dp),
            ) {
                Text(if (following) "Following" else "Follow", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium)
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
    hideChallenge: Boolean = false,
    audioActive: Boolean = false,
    onChallengeClick: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var saved by remember(post.id) { mutableStateOf(false) }
    var menuOpen by remember(post.id) { mutableStateOf(false) }
    var shareOpen by remember(post.id) { mutableStateOf(false) }

    val author = post.sideA?.author ?: post.author

    Column(
        Modifier
            .align(Alignment.BottomEnd)
            .navigationBarsPadding()
            .padding(end = 4.dp, bottom = 64.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        val total = votes.a + votes.b
        val voteTint = when (voted) {
            "a" -> Color(0xFFA855F7)
            "b" -> Color(0xFF3B82F6)
            else -> Color.White
        }
        // Votar — al votar pasa a icono SÓLIDO (relleno por dentro), como la web.
        RailItem(ImageVector.vectorResource(if (voted != null) R.drawable.ic_vote_filled else R.drawable.ic_vote), label(total, "Vote"), voteTint, size = 40) { }
        // Challenge (crossed swords) — hidden on "Battles > Completed" (hideChallenge), same as the web.
        if (!hideChallenge) {
            RailItem(ImageVector.vectorResource(R.drawable.ic_swords), label(post.stats?.challenges ?: 0, "Challenge"), Color.White, size = 30) {
                if (Session.token == null) onRequireAuth() else onChallengeClick()
            }
        }
        // Comment (round bubble, same as the web)
        RailItem(ImageVector.vectorResource(R.drawable.ic_comment), label(post.stats?.comments ?: 0, "Comment"), Color.White, size = 30) { onComments() }
        // Share (TikTok-style arrow) — opens the options sheet (Send
        // to/Copy link/Instagram/WhatsApp/X), same as ShareModal.jsx on the
        // web (used to open the native Android chooser directly).
        RailItem(ImageVector.vectorResource(R.drawable.ic_share), label(post.stats?.shares ?: 0, "Share"), Color.White, size = 30) { shareOpen = true }
        // Save (bookmark, same as the web)
        RailItem(
            ImageVector.vectorResource(if (saved) R.drawable.ic_bookmark_filled else R.drawable.ic_bookmark),
            label(post.stats?.saves ?: 0, "Save"),
            if (saved) Color(0xFFFACC15) else Color.White,
            size = 30,
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
        // Disco de música giratorio, con un pulso sintético mientras haya
        // audio/música real sonando en esta tarjeta (ver MusicDisc).
        MusicDisc(author?.avatarUrl, active = audioActive)
    }

    if (menuOpen) {
        MoreOptionsSheet(
            postId = post.id,
            targetUsername = author?.username,
            isOwnPost = author?.username != null && author.username == Session.user?.username,
            onClose = { menuOpen = false },
            onRequireAuth = onRequireAuth,
        )
    }
    if (shareOpen) {
        ShareSheet(postId = post.id, onClose = { shareOpen = false })
    }
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
private fun TwykAvatar(url: String?, size: androidx.compose.ui.unit.Dp, modifier: Modifier = Modifier) {
    // Réplica del <Avatar> de la web: muestra la imagen real SOLO si no es un
    // avatar autogenerado (dicebear/pravatar); si no, la silueta gris por defecto.
    val abs = absoluteUrl(url)
    val generated = url == null || url.contains("dicebear") || url.contains("pravatar")
    if (abs != null && !generated) {
        AsyncImage(
            model = abs,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = modifier.size(size).clip(CircleShape),
        )
    } else {
        Image(
            imageVector = ImageVector.vectorResource(R.drawable.ic_avatar_default),
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = modifier.size(size).clip(CircleShape),
        )
    }
}

@Composable
private fun MusicDisc(avatarUrl: String?, active: Boolean = false) {
    val transition = rememberInfiniteTransition()
    val angle by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(animation = tween(durationMillis = 6000, easing = LinearEasing)),
    )
    // Pulso "reactivo" — NO es amplitud de audio real: android.media.audiofx.
    // Visualizer exige el permiso RECORD_AUDIO incluso para la sesión de
    // audio de la propia app (confirmado; ver documentación oficial), lo
    // cual mostraría al usuario un aviso de "acceso al micrófono" solo para
    // animar un disco decorativo — un coste de privacidad/confianza
    // desproporcionado para este detalle visual. En su lugar: una
    // oscilación sintética continua (0↔1, ~700ms, imita el "latido" de un
    // ecualizer) que solo se anima mientras `active` es true (hay audio o
    // música real sonando en esta tarjeta) y queda inmóvil en reposo. Sigue
    // siendo una mejora real sobre el giro a velocidad constante de antes.
    val pulse by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(animation = tween(durationMillis = 700, easing = LinearEasing), repeatMode = androidx.compose.animation.core.RepeatMode.Reverse),
    )
    val level = if (active) pulse else 0f
    val animatedLevel by animateFloatAsState(level, animationSpec = tween(durationMillis = 150))
    val pulseScale = 1f + (animatedLevel * 0.14f)
    Box(
        Modifier
            .size(40.dp)
            .scale(pulseScale)
            .rotate(angle)
            .clip(CircleShape)
            .border(1.dp, Color.White.copy(alpha = 0.3f + animatedLevel * 0.25f), CircleShape)
            .background(Brush.linearGradient(listOf(Color(0xFF3F3F46), Color.Black))),
        contentAlignment = Alignment.Center,
    ) {
        TwykAvatar(avatarUrl, 24.dp)
    }
}

@Composable
private fun BoxScope.Dots(active: Int) {
    Row(
        Modifier
            .align(Alignment.BottomCenter)
            .navigationBarsPadding()
            .padding(bottom = 64.dp),
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

// Barra de progreso (reciclada): línea blanca fina que sigue al vídeo VISIBLE.
@Composable
private fun BoxScope.VideoProgressBar(player: ExoPlayer, active: Boolean) {
    var progress by remember { mutableStateOf(0f) }
    LaunchedEffect(player, active) {
        if (!active) {
            progress = 0f
            return@LaunchedEffect
        }
        while (true) {
            val dur = runCatching { player.duration }.getOrDefault(0L)
            val pos = runCatching { player.currentPosition }.getOrDefault(0L)
            progress = if (dur > 0) (pos.toFloat() / dur).coerceIn(0f, 1f) else 0f
            delay(150)
        }
    }
    Box(
        Modifier
            .align(Alignment.BottomCenter)
            .navigationBarsPadding()
            .padding(bottom = 56.dp)
            .fillMaxWidth()
            .height(2.dp)
            .background(Color.White.copy(alpha = 0.15f)),
    ) {
        Box(
            Modifier
                .fillMaxWidth(progress)
                .height(2.dp)
                .background(Color.White.copy(alpha = 0.8f)),
        )
    }
}

// Spinner de carga (reciclado): se muestra solo cuando el reproductor bufferiza.
@Composable
private fun BoxScope.BufferingSpinner(player: ExoPlayer) {
    var buffering by remember { mutableStateOf(false) }
    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                buffering = playbackState == Player.STATE_BUFFERING
            }
        }
        player.addListener(listener)
        buffering = player.playbackState == Player.STATE_BUFFERING
        onDispose { player.removeListener(listener) }
    }
    if (buffering) {
        CircularProgressIndicator(
            color = Color.White,
            strokeWidth = 2.dp,
            modifier = Modifier.align(Alignment.Center).size(40.dp),
        )
    }
}

// Burst del doble toque (reciclado): icono de voto grande que crece y se desvanece.
@Composable
private fun BoxScope.VoteBurst(id: Long, color: Color, onEnd: () -> Unit) {
    val anim = remember(id) { Animatable(0f) }
    LaunchedEffect(id) {
        anim.snapTo(0f)
        anim.animateTo(1f, animationSpec = tween(durationMillis = 750))
        onEnd()
    }
    val v = anim.value
    val scale = 0.6f + v * 0.7f
    val fade = (1f - ((v - 0.6f) / 0.4f)).coerceIn(0f, 1f)
    Icon(
        ImageVector.vectorResource(R.drawable.ic_vote_filled),
        contentDescription = null,
        tint = color,
        modifier = Modifier
            .align(Alignment.Center)
            .size(96.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                alpha = fade
                translationY = -v * 80f
            },
    )
}

@Composable
private fun BoxScope.VoteHint(text: String) {
    Box(
        Modifier
            .align(Alignment.TopCenter)
            .padding(top = 40.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(Color.Black.copy(alpha = 0.45f))
            .padding(horizontal = 12.dp, vertical = 5.dp),
    ) {
        Text(text, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
    }
}

// Tarjeta de "ganador" — réplica de VSWinnerCard.jsx: aparece tras votar,
// muestra al autor elegido en grande con su % y la barra de resultados A/B,
// con acciones Compartir / Comentar / Siguiente duelo. Se usa tanto en
// publicaciones "versus" (carrusel) como "duet" (pantalla partida).
@Composable
private fun VoteResultOverlay(
    votedSide: String,
    chosenSide: Side?,
    otherSide: Side? = null,
    votes: Votes,
    onClose: () -> Unit,
    onShare: () -> Unit,
    onComments: () -> Unit,
    onNext: () -> Unit,
) {
    val total = (votes.a + votes.b).coerceAtLeast(0)
    val aPct = if (total > 0) (votes.a * 100f / total).roundToInt() else 50
    val bPct = 100 - aPct
    val chosenPct = if (votedSide == "b") bPct else aPct
    val otherPct = 100 - chosenPct
    val chosenColor = if (votedSide == "b") Color(0xFF3B82F6) else Color(0xFFA855F7)
    val chosenName = chosenSide?.author?.name?.takeIf { it.isNotBlank() }
        ?: chosenSide?.author?.username?.let { "@$it" } ?: ""
    // Nombre del lado NO elegido, para la línea "vs {rival} · {pct}%" (réplica
    // de `loserName`/`loserPercentage` en VSWinnerCard.jsx) — se omite si es
    // el MISMO autor en ambos lados (versus/1vs1 normales: no aporta nada
    // decir "vs tu mismo nombre"), igual que `sameAuthorBothSides` en la web.
    val otherName = otherSide?.author?.name?.takeIf { it.isNotBlank() }
        ?: otherSide?.author?.username?.let { "@$it" } ?: ""
    val sameAuthorBothSides = !chosenSide?.author?.username.isNullOrBlank() &&
        chosenSide?.author?.username == otherSide?.author?.username
    val posterUrl = absoluteUrl(chosenSide?.posterUrl)

    // Gesto: deslizar hacia ARRIBA (>60dp) pasa al siguiente duelo — réplica
    // exacta del umbral (SWIPE_THRESHOLD=60) y la dirección de VSWinnerCard.jsx.
    var dragY by remember { mutableStateOf(0f) }
    val density = LocalDensity.current
    val swipeThresholdPx = with(density) { 60.dp.toPx() }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.82f))
            .pointerInput(Unit) {
                detectVerticalDragGestures(
                    onDragEnd = {
                        if (-dragY > swipeThresholdPx) onNext()
                        dragY = 0f
                    },
                    onDragCancel = { dragY = 0f },
                ) { change, amount ->
                    change.consume()
                    dragY += amount
                }
            }
            .clickable { onClose() },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.fillMaxWidth(0.86f).aspectRatio(9f / 16f)
                .clip(RoundedCornerShape(26.dp))
                .border(2.5.dp, Brush.horizontalGradient(listOf(Color(0xFFA855F7), Color(0xFF3B82F6))), RoundedCornerShape(26.dp))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { },
        ) {
            if (posterUrl != null) {
                AsyncImage(model = posterUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else {
                Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF27272A), Color.Black))))
            }
            Box(
                Modifier.fillMaxSize().background(
                    Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.65f), Color.Black.copy(alpha = 0.15f), Color.Black.copy(alpha = 0.9f))),
                ),
            )

            Column(
                Modifier.fillMaxSize().padding(vertical = 22.dp, horizontal = 18.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("DUEL", color = Color.White.copy(alpha = 0.7f), fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 3.sp)
                    Row(
                        Modifier.clip(RoundedCornerShape(50)).background(chosenColor.copy(alpha = 0.85f)).padding(horizontal = 14.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(Icons.Filled.EmojiEvents, null, tint = Color.White, modifier = Modifier.size(15.dp))
                        Text("WINNER", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Black)
                    }
                }

                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    if (chosenName.isNotEmpty()) {
                        Text(
                            chosenName, color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Black,
                            maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(bottom = 4.dp),
                        )
                    }
                    Text("$chosenPct%", color = Color.White, fontSize = 60.sp, fontWeight = FontWeight.Black)
                }

                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Column {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("A · $aPct%", color = Color(0xFFA855F7), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            Text("${formatCount(total)} votes", color = Color.White.copy(alpha = 0.6f), fontSize = 11.sp)
                            Text("B · $bPct%", color = Color(0xFF3B82F6), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(Modifier.height(6.dp))
                        Row(Modifier.fillMaxWidth().height(9.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.15f))) {
                            Box(Modifier.weight(aPct.coerceIn(1, 99).toFloat()).fillMaxHeight().background(Color(0xFFA855F7)))
                            Box(Modifier.weight((100 - aPct.coerceIn(1, 99)).toFloat()).fillMaxHeight().background(Color(0xFF3B82F6)))
                        }
                        // Línea "vs {rival} · {pct}%" bajo la barra — réplica de
                        // loserName/loserPercentage en VSWinnerCard.jsx; se omite
                        // si ambos lados son del MISMO autor (versus/1vs1
                        // normales, no un reto real entre 2 usuarios distintos).
                        if (!sameAuthorBothSides && otherName.isNotEmpty()) {
                            Text(
                                "vs $otherName · $otherPct%", color = Color.White.copy(alpha = 0.55f), fontSize = 11.sp,
                                modifier = Modifier.padding(top = 6.dp),
                            )
                        }
                    }

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ResultActionButton("Share", ImageVector.vectorResource(R.drawable.ic_share), Modifier.weight(1f)) { onShare(); onClose() }
                        ResultActionButton("Comments", ImageVector.vectorResource(R.drawable.ic_comment), Modifier.weight(1f)) { onComments(); onClose() }
                    }
                    Box(
                        Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(14.dp))
                            .background(Brush.horizontalGradient(listOf(Color(0xFFA855F7), Color(0xFF3B82F6))))
                            .clickable { onNext() },
                        contentAlignment = Alignment.Center,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("Next duel", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            Icon(Icons.Filled.KeyboardArrowDown, null, tint = Color.White, modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ResultActionButton(label: String, icon: ImageVector, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Row(
        modifier.height(42.dp).clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.15f)).clickable { onClick() },
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(6.dp))
        Text(label, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

// Motivos de reporte — DEBEN coincidir EXACTAMENTE con REPORT_REASONS del
// backend (lib/db.js), que valida la cadena recibida tal cual.
private val REPORT_REASONS = listOf(
    "Spam", "Inappropriate content", "Harassment", "Violence", "Nudity", "False information", "Other",
)

// Hoja inferior "Más opciones" (igual que la web): en contenido AJENO permite
// Reportar (con motivo real, POST /api/reports) y Bloquear al autor (POST/DELETE
// /api/users/block); en el PROPIO permite Eliminar la publicación (DELETE
// /api/posts/{id}, notifica via PostEvents para quitarla de todas las listas
// visibles: feed principal y perfil/guardados).
@Composable
private fun MoreOptionsSheet(
    postId: String,
    targetUsername: String?,
    isOwnPost: Boolean,
    onClose: () -> Unit,
    onRequireAuth: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // menu | report | reporting | reported | blockConfirm | blocking | blocked | error
    var step by remember { mutableStateOf("menu") }
    var errorMsg by remember { mutableStateOf("Something went wrong. Please try again.") }

    fun requireAuthOrRun(action: () -> Unit) {
        if (Session.token == null) { onClose(); onRequireAuth() } else action()
    }

    fun submitReport(reason: String) {
        step = "reporting"
        scope.launch {
            val ok = runCatching { RetrofitProvider.api.createReport(CreateReportRequest("post", postId, reason)) }.getOrNull()?.ok == true
            if (ok) { step = "reported" } else { errorMsg = "Couldn't send the report."; step = "error" }
        }
    }

    fun submitBlock() {
        val uname = targetUsername
        if (uname == null) { step = "menu"; return }
        step = "blocking"
        scope.launch {
            val ok = runCatching { RetrofitProvider.api.blockUser(BlockRequest(uname)) }.getOrNull()?.ok == true
            if (ok) { step = "blocked" } else { errorMsg = "Couldn't block user."; step = "error" }
        }
    }

    fun submitDelete() {
        step = "deleting"
        scope.launch {
            val ok = runCatching { RetrofitProvider.api.deletePost(postId) }.getOrNull()?.ok == true
            if (ok) { PostEvents.emitPostDeleted(postId); step = "deleted" } else { errorMsg = "Couldn't delete the post."; step = "error" }
        }
    }

    // Paleta CLARA (blanca) — réplica exacta de OptionsModal.jsx (BottomSheet
    // blanco de la web), no del resto de hojas oscuras de la app.
    val zinc900 = Color(0xFF18181B)
    val zinc700 = Color(0xFF3F3F46)
    val zinc500 = Color(0xFF71717A)
    val zinc400 = Color(0xFFA1A1AA)
    val zinc100 = Color(0xFFF4F4F5)
    val red600 = Color(0xFFDC2626)

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
                .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
                .background(Color.White)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { }
                .navigationBarsPadding()
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Box(
                Modifier
                    .align(Alignment.CenterHorizontally)
                    .padding(top = 4.dp, bottom = 10.dp)
                    .size(width = 40.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(zinc400),
            )

            when (step) {
                "menu" -> {
                    SheetItem(Icons.Filled.VisibilityOff, "Not interested", zinc900, onClose)
                    SheetItem(Icons.Filled.Link, "Copy link", zinc900) {
                        runCatching {
                            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                            cm.setPrimaryClip(android.content.ClipData.newPlainText("twyk", Config.BASE_URL))
                        }
                        onClose()
                    }
                    if (!isOwnPost) {
                        SheetItem(Icons.Filled.Flag, "Report", red600) { requireAuthOrRun { step = "report" } }
                        if (targetUsername != null) {
                            SheetItem(Icons.Filled.Block, "Block user", red600) { requireAuthOrRun { step = "blockConfirm" } }
                        }
                    } else {
                        SheetItem(Icons.Filled.Delete, "Delete", red600) { requireAuthOrRun { step = "deleteConfirm" } }
                    }
                    SheetCancel(zinc500, onClose)
                }
                "report" -> {
                    Text(
                        "Why are you reporting this post?", color = zinc500, fontSize = 13.sp,
                        modifier = Modifier.padding(bottom = 4.dp, start = 8.dp, top = 4.dp),
                    )
                    for (reason in REPORT_REASONS) {
                        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { submitReport(reason) }.padding(vertical = 13.dp, horizontal = 8.dp)) {
                            Text(reason, color = zinc900, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                    SheetBack(zinc500) { step = "menu" }
                }
                "reporting", "blocking", "deleting" -> {
                    Box(Modifier.fillMaxWidth().padding(vertical = 28.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = zinc700, strokeWidth = 2.dp, modifier = Modifier.size(26.dp))
                    }
                }
                "reported" -> ConfirmMessage(Icons.Filled.Flag, "Report sent", "Thanks. We've received your report.", onClose)
                "blockConfirm" -> {
                    Text(
                        "Block @$targetUsername? You won't see their content and they won't see yours.",
                        color = zinc900, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 10.dp),
                    )
                    Spacer(Modifier.height(6.dp))
                    Box(
                        Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(50)).background(red600).clickable { submitBlock() },
                        contentAlignment = Alignment.Center,
                    ) { Text("Block", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp) }
                    Spacer(Modifier.height(8.dp))
                    Box(
                        Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(50)).background(zinc100).clickable { step = "menu" },
                        contentAlignment = Alignment.Center,
                    ) { Text("Cancel", color = zinc900, fontWeight = FontWeight.SemiBold, fontSize = 15.sp) }
                    Spacer(Modifier.height(4.dp))
                }
                "blocked" -> ConfirmMessage(Icons.Filled.Block, "User blocked", "You will no longer see posts from @$targetUsername.", onClose)
                "deleteConfirm" -> {
                    Text(
                        "Delete this post?",
                        color = zinc900, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, top = 6.dp),
                    )
                    Text(
                        "This action can't be undone. Your post will be removed permanently.",
                        color = zinc500, fontSize = 13.sp, textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, top = 4.dp, bottom = 14.dp),
                    )
                    Box(
                        Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(50)).background(red600).clickable { submitDelete() },
                        contentAlignment = Alignment.Center,
                    ) { Text("Delete", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp) }
                    Spacer(Modifier.height(8.dp))
                    Box(
                        Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(50)).background(zinc100).clickable { step = "menu" },
                        contentAlignment = Alignment.Center,
                    ) { Text("Cancel", color = zinc900, fontWeight = FontWeight.SemiBold, fontSize = 15.sp) }
                    Spacer(Modifier.height(4.dp))
                }
                "deleted" -> ConfirmMessage(Icons.Filled.Delete, "Post deleted", "It will no longer appear in your profile or feed.", onClose)
                else -> {
                    Text(errorMsg, color = red600, fontSize = 14.sp, modifier = Modifier.padding(vertical = 10.dp, horizontal = 8.dp))
                    SheetBack(zinc500) { step = "menu" }
                }
            }
        }
    }
}

@Composable
private fun SheetCancel(tint: Color, onClick: () -> Unit) {
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) { Text("Cancel", color = tint, fontWeight = FontWeight.Medium, fontSize = 15.sp) }
}

@Composable
private fun SheetBack(tint: Color, onClick: () -> Unit) {
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) { Text("Back", color = tint, fontWeight = FontWeight.Medium, fontSize = 15.sp) }
}

@Composable
private fun ConfirmMessage(icon: ImageVector, title: String, desc: String, onClose: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(48.dp).clip(CircleShape).background(Color(0xFFF4F4F5)), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = Color(0xFF3F3F46), modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.height(10.dp))
        Text(title, color = Color(0xFF18181B), fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(4.dp))
        Text(desc, color = Color(0xFF71717A), fontSize = 13.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(16.dp))
        Box(
            Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(50)).background(Color(0xFF18181B)).clickable { onClose() },
            contentAlignment = Alignment.Center,
        ) { Text("Done", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp) }
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

// CAMBIO de voto (A<->B): resta 1 al lado anterior y suma 1 al nuevo, en el
// MISMO objeto — réplica del cómputo optimista de submitVote() en
// CarouselSlide.jsx/DuetSlide.jsx (el total de votos no varía).
private fun switchVote(v: Votes, previous: String, next: String): Votes {
    if (previous == next) return v
    var result = v
    result = if (previous == "a") result.copy(a = (result.a - 1).coerceAtLeast(0)) else result.copy(b = (result.b - 1).coerceAtLeast(0))
    result = if (next == "a") result.copy(a = result.a + 1) else result.copy(b = result.b + 1)
    return result
}

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
