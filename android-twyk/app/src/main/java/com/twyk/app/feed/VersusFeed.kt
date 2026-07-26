@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package com.twyk.app.feed

import android.content.Context
import android.media.MediaPlayer
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.offset
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
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PlayArrow
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
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.IntOffset
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
import com.twyk.app.data.ContentCardRequest
import com.twyk.app.data.CreateReportRequest
import com.twyk.app.data.FeedOverlays
import com.twyk.app.data.MoreOptionsRequest
import com.twyk.app.data.Post
import com.twyk.app.data.PostEvents
import com.twyk.app.data.QuickChallengeTarget
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.SaveRequest
import com.twyk.app.data.SocialCountStore
import com.twyk.app.data.Session
import com.twyk.app.data.Side
import com.twyk.app.data.Votes
import com.twyk.app.data.VoteStore
import com.twyk.app.data.WinnerRequest
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
    onOpenComments: (String, String?) -> Unit,
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
    onOpenComments: (String, String?) -> Unit,
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
                onOpenComments = onOpenComments,
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
                onOpenComments = onOpenComments,
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
    onOpenComments: (String, String?) -> Unit,
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
        onDispose {
            playerA.release(); playerB.release()
            // Si esta tarjeta se descarta (se sale del viewport del pager)
            // mientras su overlay de "Ganador" seguía abierto, hay que
            // cerrarlo también en el singleton global (ver FeedOverlays.kt).
            FeedOverlays.closeWinnerFor(post.id)
        }
    }

    // Música adjunta (preview de iTunes, 30s). Si existe, los vídeos van en
    // mute y suena la música — réplica de `hasMusic` en CarouselSlide.jsx.
    val hasMusic = !post.musicPreviewUrl.isNullOrBlank()
    val musicPlayer by rememberMusicPlayer(post.musicPreviewUrl)

    val sidePager = rememberPagerState(pageCount = { 2 })
    // Voto restaurado de SharedPreferences (réplica de leer
    // `localStorage.getItem('versus_vote_'+id)` en el `useEffect` de montaje
    // de CarouselSlide.jsx) — antes SIEMPRE arrancaba en null, así que un
    // voto ya emitido dejaba de verse como votado en cuanto la tarjeta se
    // recomponía desde cero (reabrir la app, o reciclado del pager).
    var voted by remember(post.id) { mutableStateOf(VoteStore.get(post.id)) }
    // Cierra sobre el post.id y el voto ACTUAL de esta tarjeta (réplica de
    // votedSide={userVote} que CarouselSlide.jsx pasa a <CommentsModal>).
    val onCommentsLocal: () -> Unit = { onOpenComments(post.id, voted) }
    var votes by remember(post.id) { mutableStateOf(post.votes ?: Votes()) }
    var showWinner by remember(post.id) { mutableStateOf(false) }
    // Se actualiza SOLO cuando `submitVote` procesa un voto REAL (nuevo o
    // cambiado) — NUNCA al restaurar `voted` desde disco al montar. Así el
    // LaunchedEffect de abajo (que abre la tarjeta de "Ganador") solo se
    // dispara justo después de votar de verdad, exactamente como en la web
    // (el `useEffect` que restaura desde localStorage NUNCA abre el ganador).
    var voteTrigger by remember(post.id) { mutableStateOf(0L) }
    // Pausa MANUAL (toque simple sobre el vídeo) — antes esta pantalla solo
    // manejaba el DOBLE toque (votar); no había ningún gesto de un solo
    // toque, así que era IMPOSIBLE pausar el vídeo tocándolo (bug reportado:
    // "no puedo parar el vídeo"). Réplica de `paused` en CarouselSlide.jsx.
    var paused by remember(post.id) { mutableStateOf(false) }

    // Votar / CAMBIAR de voto — réplica exacta de submitVote() en
    // CarouselSlide.jsx: (1) sin sesión, abre el login (antes ni se
    // comprobaba: se podía votar como invitado, a diferencia de la web); (2)
    // re-tocar la MISMA opción ya votada solo repite la animación del icono,
    // sin cambiar nada; (3) tocar la OTRA opción CAMBIA el voto (resta al
    // lado anterior, suma al nuevo, se lo dice al backend con `previousSide`
    // para que lo aplique como un cambio atómico, no como un voto extra).
    // Devuelve true si había sesión iniciada: VideoSurface solo muestra el
    // burst del icono en ese caso (igual que la web: un invitado nunca ve
    // la animación, solo el modal de login).
    fun submitVote(side: String): Boolean {
        if (Session.token == null) { onRequireAuth(); return false }
        if (voted != side) {
            val previous = voted
            votes = if (previous != null) switchVote(votes, previous, side) else bump(votes, side)
            voted = side
            VoteStore.set(post.id, side)
            voteTrigger = System.currentTimeMillis()
            onVote(side, previous)
        }
        return true
    }

    // Tarjeta de ganador: aparece ~650ms después de votar (igual que la web).
    // Se re-dispara en cada voto REAL (primero o cambio de opción), no en un
    // simple re-toque de la misma opción (voted no cambia -> no se re-lanza)
    // NI al restaurar un voto antiguo desde disco al abrir/volver a la
    // tarjeta (por eso la clave es `voteTrigger`, no `voted`).
    LaunchedEffect(post.id, voteTrigger) {
        if (voteTrigger != 0L) {
            delay(650)
            showWinner = true
        }
    }

    // Sincroniza el overlay de "Ganador" con el singleton global
    // FeedOverlays (ver data/FeedOverlays.kt): MainActivity lo pinta por
    // encima de la barra de navegación inferior, en vez de aquí mismo (donde
    // quedaba tapado por ella al estar anidado dentro del feed).
    LaunchedEffect(showWinner, voted, votes) {
        if (showWinner) {
            val chosenSide = if (voted == "b") post.sideB else post.sideA
            val otherSide = if (voted == "b") post.sideA else post.sideB
            FeedOverlays.showWinner(
                WinnerRequest(
                    postId = post.id,
                    votedSide = voted ?: "a",
                    chosenSide = chosenSide,
                    otherSide = otherSide,
                    votes = votes,
                    onShare = { sharePost(context, post) },
                    onComments = onCommentsLocal,
                    onClose = { showWinner = false },
                    onNext = { showWinner = false; onRequestNext() },
                ),
            )
        } else {
            FeedOverlays.closeWinnerFor(post.id)
        }
    }

    // Solo el lado VISIBLE de la publicación ACTIVA reproduce (con audio,
    // salvo que haya música adjunta: entonces el vídeo va en mute y suena la
    // música en su lugar, réplica exacta de la web).
    LaunchedEffect(isActive, sidePager.currentPage, showWinner, paused) {
        if (isActive && !showWinner && !paused) {
            if (sidePager.currentPage == 0) {
                playerB.pause(); playerA.volume = if (hasMusic) 0f else 1f; playerA.play()
            } else {
                playerA.pause(); playerB.volume = if (hasMusic) 0f else 1f; playerB.play()
            }
        } else {
            playerA.pause(); playerB.pause()
        }
    }
    // Al deslizar al otro lado del carrusel se retoma la reproducción — una
    // pausa manual es "de este vídeo", no un modo global de la tarjeta
    // (misma UX que la web: cada <video> lleva su propio estado `paused`).
    LaunchedEffect(sidePager.currentPage) { paused = false }
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
    // terminado de votar, y sin estar en pausa manual) — se usa para el
    // pulso sintético del MusicDisc.
    val audioActive = isActive && !showWinner && !paused

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        HorizontalPager(state = sidePager, modifier = Modifier.fillMaxSize()) { p ->
            VideoSurface(
                player = if (p == 0) playerA else playerB,
                modifier = Modifier.fillMaxSize(),
                side = if (p == 0) post.sideA else post.sideB,
                voteColor = if (p == 0) Color(0xFFA855F7) else Color(0xFF3B82F6),
                // Toque simple = pausa/reanuda (antes NO existía ningún
                // gesto de un solo toque aquí; solo se manejaba el doble
                // toque para votar, por lo que era imposible pausar el
                // vídeo — bug reportado por el usuario).
                onSingleTap = { paused = !paused },
                onVoteA = { offset -> submitVote(if (p == 0) "a" else "b") },
            )
        }

        // ── Capas RECICLADAS estilo TikTok (se resetean al reciclarse la celda) ──
        VideoProgressBar(visiblePlayer, isActive)                                 // barra de progreso
        BufferingSpinner(visiblePlayer)                                           // spinner de carga
        // El burst del icono de voto ahora vive DENTRO de cada VideoSurface
        // (aparece justo en el punto exacto del doble toque, con la misma
        // animación elástica que VoteBurstEffect.jsx en la web).
        // Icono de Play centrado mientras el vídeo está en pausa manual —
        // réplica del overlay `<Play size={72}.../>` de CarouselSlide.jsx.
        if (paused) {
            Icon(
                Icons.Filled.PlayArrow,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.align(Alignment.Center).size(72.dp),
            )
        }

        HeaderOverlay(post, onOpenProfile, onRequireAuth)
        // Autor del lado VISIBLE ahora mismo (cambia según la página del
        // carrusel) — misma variable "current" de CarouselSlide.jsx, usada
        // tanto para el objetivo del reto como para decidir si el botón de
        // Retar debe ocultarse (es tu propia publicación).
        val currentSideForChallenge = if (sidePager.currentPage == 0) post.sideA else post.sideB
        SocialRail(
            post, votes, voted, onCommentsLocal, onRequireAuth,
            hideChallenge = hideChallenge, audioActive = audioActive,
            coverUrl = currentSideForChallenge?.posterUrl ?: currentSideForChallenge?.imageUrl ?: post.posterUrl ?: post.thumbnailUrl,
            hasMusic = hasMusic, musicArtwork = post.musicArtwork,
            headAuthorUsername = (currentSideForChallenge?.author ?: post.author)?.username,
        ) {
            onChallenge(
                QuickChallengeTarget(
                    postId = post.id,
                    author = currentSideForChallenge?.author ?: post.author,
                    videoUrl = currentSideForChallenge?.videoUrl,
                    posterUrl = currentSideForChallenge?.posterUrl,
                    description = currentSideForChallenge?.description ?: post.description,
                    music = currentSideForChallenge?.music ?: post.music,
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
        // La tarjeta de "Ganador" YA NO se pinta aquí: se sincroniza con
        // FeedOverlays (ver el LaunchedEffect de más arriba) y MainActivity
        // la renderiza por encima de la barra de navegación inferior.
    }
}

// ── Publicación DUET (pantalla partida) ───────────────────────────────────────
@Composable
private fun DuetPage(
    post: Post,
    isActive: Boolean,
    dataSourceFactory: CacheDataSource.Factory,
    onVote: (String, String?) -> Unit,
    onOpenComments: (String, String?) -> Unit,
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
        onDispose {
            playerA.release(); playerB.release()
            FeedOverlays.closeWinnerFor(post.id)
            FeedOverlays.closeContentCardFor(post.id)
        }
    }

    // Música adjunta (preview de iTunes, 30s): si existe, el lado A (el único
    // con audio en un dueto) va en mute y suena la música en su lugar.
    val hasMusic = !post.musicPreviewUrl.isNullOrBlank()
    val musicPlayer by rememberMusicPlayer(post.musicPreviewUrl)

    // Voto restaurado de SharedPreferences (réplica de leer
    // `localStorage.getItem('duet_vote_'+id)` en el `useEffect` de montaje
    // de DuetSlide.jsx) — antes SIEMPRE arrancaba en null.
    var voted by remember(post.id) { mutableStateOf(VoteStore.get(post.id)) }
    // Réplica de votedSide={userVote} que DuetSlide.jsx pasa a <CommentsModal>.
    val onCommentsLocal: () -> Unit = { onOpenComments(post.id, voted) }
    var votes by remember(post.id) { mutableStateOf(post.votes ?: Votes()) }
    var showWinner by remember(post.id) { mutableStateOf(false) }
    // Se actualiza SOLO cuando `submitVote` procesa un voto REAL — NUNCA al
    // restaurar `voted` desde disco al montar (misma razón que en
    // CarouselPage: la web tampoco reabre el ganador al restaurar desde
    // localStorage, solo justo después de votar de verdad).
    var voteTrigger by remember(post.id) { mutableStateOf(0L) }
    val isHorizontal = (post.layout ?: "horizontal") == "horizontal"
    // Lado que tiene el audio ahora mismo ('a'|'b') — antes NO existía este
    // estado: el lado A siempre tenía el audio FIJO y B siempre iba muted a
    // fuego, sin ninguna forma de cambiarlo (bug reportado por el usuario:
    // "en las publicaciones 1vs1 no puedo cambiar el audio haciendo click
    // sobre la otra opción"). Réplica de `audibleSide` en DuetSlide.jsx.
    // Empieza SIEMPRE en 'a' aunque haya un voto restaurado (misma web: el
    // useEffect de restauración solo toca userVote, NUNCA audibleSide).
    var audibleSide by remember(post.id) { mutableStateOf("a") }
    // Pausa MANUAL (toque simple sobre el lado que YA tiene el audio) —
    // réplica de `paused` en DuetSlide.jsx.
    var paused by remember(post.id) { mutableStateOf(false) }
    // Content card (VSContentCard.jsx): se abre MANTENIENDO PULSADA una opción
    // (long-press) y muestra el contenido A/B a pantalla. `contentIdx` recuerda
    // qué lado se pulsó para arrancar el carrusel en él (réplica de
    // `showContent`/`contentIdx` en DuetSlide.jsx). Antes NO existía ningún
    // gesto de mantener pulsado en la app nativa (bug reportado: "cuando
    // mantengo presionado en las publicaciones 1vs1 debería mostrarme el
    // vscontent card como lo hace la web").
    var showContent by remember(post.id) { mutableStateOf(false) }
    var contentIdx by remember(post.id) { mutableStateOf(0) }

    // Votar / CAMBIAR de voto — misma lógica que CarouselPage (réplica de
    // submitVote() en DuetSlide.jsx): exige sesión, re-tocar el mismo lado
    // solo repite la animación, tocar el otro lado CAMBIA el voto (y le pasa
    // el audio, igual que `setAudibleSide(side)` dentro de submitVote() en
    // la web). Devuelve true si había sesión iniciada: VideoSurface solo
    // muestra el burst del icono en ese caso (igual que la web).
    fun submitVote(side: String): Boolean {
        if (Session.token == null) { onRequireAuth(); return false }
        if (voted != side) {
            val previous = voted
            votes = if (previous != null) switchVote(votes, previous, side) else bump(votes, side)
            voted = side
            audibleSide = side
            VoteStore.set(post.id, side)
            voteTrigger = System.currentTimeMillis()
            onVote(side, previous)
        }
        return true
    }

    // Tarjeta de ganador: aparece ~650ms después de votar (igual que la
    // web); NUNCA al restaurar un voto antiguo desde disco (ver `voteTrigger`).
    LaunchedEffect(post.id, voteTrigger) {
        if (voteTrigger != 0L) {
            delay(650)
            showWinner = true
        }
    }

    // Sincroniza el overlay de "Ganador" con el singleton global
    // FeedOverlays (ver data/FeedOverlays.kt) — mismo motivo que en
    // CarouselPage: MainActivity lo pinta por encima de la barra de
    // navegación inferior.
    LaunchedEffect(showWinner, voted, votes) {
        if (showWinner) {
            val chosenSide = if (voted == "b") post.sideB else post.sideA
            val otherSide = if (voted == "b") post.sideA else post.sideB
            FeedOverlays.showWinner(
                WinnerRequest(
                    postId = post.id,
                    votedSide = voted ?: "a",
                    chosenSide = chosenSide,
                    otherSide = otherSide,
                    votes = votes,
                    onShare = { sharePost(context, post) },
                    onComments = onCommentsLocal,
                    onClose = { showWinner = false },
                    onNext = { showWinner = false; onRequestNext() },
                ),
            )
        } else {
            FeedOverlays.closeWinnerFor(post.id)
        }
    }

    // Sincroniza la content card (long-press) con el singleton global
    // FeedOverlays: MainActivity la pinta por encima de la barra de
    // navegación inferior (mismo motivo que la tarjeta de Ganador). El estado
    // local `showContent` sigue siendo la fuente de verdad para pausar los
    // vídeos del feed mientras la card esté abierta.
    LaunchedEffect(showContent, contentIdx) {
        if (showContent) {
            FeedOverlays.showContentCard(
                ContentCardRequest(
                    postId = post.id,
                    optionA = post.sideA,
                    optionB = post.sideB,
                    initialIndex = contentIdx,
                    onClose = { showContent = false },
                ),
            )
        } else {
            FeedOverlays.closeContentCardFor(post.id)
        }
    }

    LaunchedEffect(isActive, showWinner, paused, audibleSide, hasMusic, showContent) {
        if (isActive && !showWinner && !paused && !showContent) {
            // El audio suena en el lado `audibleSide` (cambiable con un
            // toque simple sobre el lado que NO lo tiene, o automáticamente
            // al votar por ese lado); si hay música adjunta, AMBOS vídeos
            // van mute (suena el MediaPlayer de música aparte).
            playerA.volume = if (hasMusic) 0f else if (audibleSide == "a") 1f else 0f
            playerB.volume = if (hasMusic) 0f else if (audibleSide == "b") 1f else 0f
            playerA.play(); playerB.play()
        } else {
            playerA.pause(); playerB.pause()
        }
    }
    LaunchedEffect(isActive, showWinner, musicPlayer, showContent) {
        if (hasMusic) {
            if (isActive && !showWinner && !showContent) {
                runCatching { if (musicPlayer?.isPlaying == false) musicPlayer?.start() }
            } else {
                runCatching { if (musicPlayer?.isPlaying == true) musicPlayer?.pause() }
            }
        }
    }
    // "¿hay audio sonando ahora?" (música O el vídeo audible del dueto, y
    // sin estar en pausa manual) — se usa para el pulso sintético del MusicDisc.
    val audioActive = isActive && !showWinner && !paused && !showContent

    val voteA: (Offset) -> Boolean = { submitVote("a") }
    val voteB: (Offset) -> Boolean = { submitVote("b") }

    // NOTA: antes había un marco de color (`ring`) en el lado votado, réplica
    // de `ring-2 ring-purple-500`/`ring-blue-500` de DuetSlide.jsx (web). El
    // usuario confirmó que en la web ese marco NO se ve (bug de la web: el
    // vídeo a pantalla completa se pinta POR ENCIMA del box-shadow inset,
    // ocultándolo) y pidió explícitamente que el nativo coincida con ese
    // estado actual de la web (sin marco) en vez de arreglar el bug de la
    // web. Eliminado.

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (isHorizontal) {
            Column(Modifier.fillMaxSize()) {
                VideoSurface(
                    playerA, Modifier.weight(1f).fillMaxWidth(), useTextureView = true, side = post.sideA,
                    voteColor = Color(0xFFA855F7),
                    // Toque simple: si A NO tiene el audio, se lo pasa; si ya
                    // lo tiene, pausa/reanuda AMBOS vídeos (antes ningún
                    // toque simple estaba conectado: el audio B siempre
                    // estaba muteado a fuego y nunca se podía pausar).
                    onSingleTap = { if (audibleSide != "a") audibleSide = "a" else paused = !paused },
                    onLongPress = { contentIdx = 0; showContent = true },
                    onVoteA = voteA,
                )
                Box(Modifier.fillMaxWidth().height(2.dp).background(Color.White.copy(alpha = 0.3f)))
                VideoSurface(
                    playerB, Modifier.weight(1f).fillMaxWidth(), useTextureView = true, side = post.sideB,
                    voteColor = Color(0xFF3B82F6),
                    onSingleTap = { if (audibleSide != "b") audibleSide = "b" else paused = !paused },
                    onLongPress = { contentIdx = 1; showContent = true },
                    onVoteA = voteB,
                )
            }
        } else {
            Row(Modifier.fillMaxSize()) {
                VideoSurface(
                    playerA, Modifier.weight(1f).fillMaxHeight(), useTextureView = true, side = post.sideA,
                    voteColor = Color(0xFFA855F7),
                    onSingleTap = { if (audibleSide != "a") audibleSide = "a" else paused = !paused },
                    onLongPress = { contentIdx = 0; showContent = true },
                    onVoteA = voteA,
                )
                Box(Modifier.fillMaxHeight().width(2.dp).background(Color.White.copy(alpha = 0.3f)))
                VideoSurface(
                    playerB, Modifier.weight(1f).fillMaxHeight(), useTextureView = true, side = post.sideB,
                    voteColor = Color(0xFF3B82F6),
                    onSingleTap = { if (audibleSide != "b") audibleSide = "b" else paused = !paused },
                    onLongPress = { contentIdx = 1; showContent = true },
                    onVoteA = voteB,
                )
            }
        }

        // El burst del icono de voto ahora vive DENTRO de cada VideoSurface
        // (aparece justo en el punto exacto del doble toque, con la misma
        // animación elástica que VoteBurstEffect.jsx en la web).
        // Icono de Play centrado mientras está en pausa manual — réplica del
        // overlay `<Play size={72}.../>` de DuetSlide.jsx.
        if (paused) {
            Icon(
                Icons.Filled.PlayArrow,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.align(Alignment.Center).size(72.dp),
            )
        }

        HeaderOverlay(post, onOpenProfile, onRequireAuth)
        SocialRail(
            post, votes, voted, onCommentsLocal, onRequireAuth,
            hideChallenge = hideChallenge, audioActive = audioActive,
            coverUrl = (if (audibleSide == "b") post.sideB else post.sideA)?.let { it.posterUrl ?: it.imageUrl },
            hasMusic = hasMusic, musicArtwork = post.musicArtwork,
            headAuthorUsername = (post.sideA?.author ?: post.author)?.username,
        ) {
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
        // La tarjeta de "Ganador" YA NO se pinta aquí: se sincroniza con
        // FeedOverlays (ver el LaunchedEffect de más arriba) y MainActivity
        // la renderiza por encima de la barra de navegación inferior.
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
    voteColor: Color = Color.White,
    // Toque SIMPLE — antes esta superficie solo reaccionaba al DOBLE toque
    // (votar); no había NINGÚN gesto de un solo toque, por lo que era
    // imposible pausar el vídeo (bug reportado: "no puedo parar el vídeo")
    // ni, en el 1vs1, cambiar el audio al otro lado ("no puedo cambiar el
    // audio haciendo click sobre la otra opción"). Al pasar AMBOS callbacks
    // a `detectTapGestures`, Compose espera automáticamente la ventana de
    // doble-toque antes de disparar `onTap` — mismo comportamiento que el
    // `setTimeout` manual de 280ms que usa la web para diferenciarlos
    // (CarouselSlide.jsx/DuetSlide.jsx).
    onSingleTap: () -> Unit = {},
    // Mantener pulsado (long-press) — abre la content card (VSContentCard.jsx
    // en la web) que muestra el contenido A/B a pantalla. detectTapGestures
    // usa el mismo umbral de tiempo/movimiento que el `setTimeout(450)` de la
    // web para distinguirlo del toque simple y del doble toque.
    onLongPress: () -> Unit = {},
    // Doble toque -> intenta votar; devuelve true SOLO si había sesión
    // iniciada. Si no (invitado), abre el login y NO se muestra el burst —
    // réplica exacta de submitVote() en la web, que solo llama a
    // spawnVoteBurst() cuando el voto se procesó de verdad.
    onVoteA: (Offset) -> Boolean,
) {
    var burstId by remember { mutableStateOf(0L) }
    var burstOffset by remember { mutableStateOf(Offset.Zero) }
    Box(
        modifier
            .clipToBounds()
            .background(Color.Black)
            .pointerInput(Unit) {
                detectTapGestures(
                    onTap = { onSingleTap() },
                    onLongPress = { onLongPress() },
                    onDoubleTap = { offset ->
                        if (onVoteA(offset)) {
                            burstOffset = offset
                            burstId = System.currentTimeMillis()
                        }
                    },
                )
            },
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
        // Burst del icono de voto (doble toque) — réplica EXACTA de
        // VoteBurstEffect.jsx + la animación CSS `voteIconPop` de la web
        // (rebote elástico con rotación, 800ms), apareciendo justo en el
        // punto donde tocaste. Antes esta app nativa tenía una animación
        // DISTINTA (crecimiento lineal simple sin rebote/rotación, siempre
        // centrada en pantalla en vez de en el punto exacto del toque) —
        // bug reportado: "cuando realizo un voto no tiene la misma
        // animación/tamaño que la web".
        if (burstId != 0L) {
            VoteBurst(burstId, burstOffset, voteColor) { burstId = 0L }
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
                    // Avatar secundario (arriba-izquierda, detrás) — con un
                    // "mordisco" circular recortado donde se solapa el avatar
                    // principal, réplica EXACTA de `mask-image: radial-
                    // gradient(circle 15px at 27px 27px, transparent 0 15px,
                    // #000 15px)` de CarouselSlide.jsx/DuetSlide.jsx. ANTES el
                    // nativo no recortaba nada aquí y en su lugar le pintaba
                    // un ANILLO NEGRO al avatar de DELANTE (fondo negro +
                    // padding) para separarlos — ese anillo NO existe en la
                    // web (bug reportado: "aparece un anillo negro alrededor
                    // del avatar de abajo"). `compositingStrategy = Offscreen`
                    // es imprescindible para que `BlendMode.DstOut` recorte
                    // transparencia real (sin capa offscreen, el blend mode
                    // se mezclaría con lo que haya detrás en vez de agujerear
                    // este layer).
                    Box(
                        Modifier
                            .align(Alignment.TopStart)
                            .size(24.dp)
                            .clickable(enabled = authorB?.username != null) { authorB?.username?.let(onOpenProfile) }
                            .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
                            .drawWithContent {
                                drawContent()
                                drawCircle(
                                    color = Color.Black,
                                    radius = 15.dp.toPx(),
                                    center = Offset(27.dp.toPx(), 27.dp.toPx()),
                                    blendMode = BlendMode.DstOut,
                                )
                            },
                    ) {
                        TwykAvatar(authorB?.avatarUrl, 24.dp)
                    }
                    // Avatar principal (abajo-derecha, delante) — SIN ningún
                    // anillo ni fondo añadido, igual que la web: al dibujarse
                    // DESPUÉS (hijo posterior del mismo Box) ya queda
                    // naturalmente por encima del de atrás sin necesitar nada
                    // extra. Mismo tamaño (24dp) que el avatar de atrás,
                    // réplica exacta de `w-[24px] h-[24px]` en ambos lados.
                    Box(
                        Modifier
                            .align(Alignment.BottomEnd)
                            .size(24.dp)
                            .clickable(enabled = authorA?.username != null) { authorA?.username?.let(onOpenProfile) },
                    ) {
                        TwykAvatar(authorA?.avatarUrl, 24.dp)
                    }
                }
                Spacer(Modifier.width(8.dp))
                // Tipografía EXACTA de la web (CarouselSlide.jsx/DuetSlide.jsx):
                // 14px (antes 13.sp — la web usa 13px SOLO para el nombre único
                // de una publicación normal; el par "A vs B" de un reto usa
                // 14px, un tamaño distinto que el nativo no diferenciaba), el
                // nombre en SemiBold pero el "vs" en peso LIGERO ("font-light",
                // antes el nativo pintaba TODO —incluido el "vs"— en SemiBold,
                // sin distinguir pesos), y el "vs" se coloca junto al nombre
                // MÁS CORTO (arriba si es A, abajo si es B — antes el nativo
                // SIEMPRE lo ponía tras A sin importar la longitud de cada
                // nombre), réplica exacta de `shortNameIsA`. También se añade
                // una sombra de texto sutil (réplica de `drop-shadow-md`).
                val nameA = authorA?.username ?: authorA?.name ?: "twyk"
                val nameB = authorB?.username ?: authorB?.name ?: "twyk"
                val shortNameIsA = nameA.length <= nameB.length
                val nameShadow = Shadow(color = Color.Black.copy(alpha = 0.35f), offset = Offset(0f, 2f), blurRadius = 3f)
                Column {
                    Text(
                        buildAnnotatedString {
                            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(nameA) }
                            if (shortNameIsA) {
                                withStyle(SpanStyle(fontWeight = FontWeight.Light)) { append(" vs") }
                            }
                        },
                        color = Color.White,
                        fontSize = 14.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = TextStyle(shadow = nameShadow),
                        modifier = Modifier.clickable(enabled = authorA?.username != null) { authorA?.username?.let(onOpenProfile) },
                    )
                    Text(
                        buildAnnotatedString {
                            if (!shortNameIsA) {
                                withStyle(SpanStyle(fontWeight = FontWeight.Light)) { append("vs ") }
                            }
                            withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(nameB) }
                        },
                        color = Color.White,
                        fontSize = 14.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = TextStyle(shadow = nameShadow),
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
    // Portada del lado VISIBLE ahora mismo (o del post si no hay lados) y
    // metadatos de música — misma prioridad EXACTA de contenido que usa el
    // disco de vinilo en CarouselSlide.jsx/DuetSlide.jsx (ver MusicDisc).
    coverUrl: String? = null,
    hasMusic: Boolean = false,
    musicArtwork: String? = null,
    // Username del autor del lado VISIBLE ahora mismo — réplica de `headAuthor`
    // en CarouselSlide.jsx/DuetSlide.jsx, usado para ocultar el botón de Retar
    // en tu PROPIA publicación (antes este check no existía en la app nativa).
    headAuthorUsername: String? = null,
    onChallengeClick: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var saved by remember(post.id) { mutableStateOf(false) }
    // Contadores sociales EN VIVO (guardados/retos): parten del valor del
    // backend fusionado con el incremento propio persistido (SocialCountStore),
    // y muestran el NÚMERO solo cuando ya hubo interacción — réplica exacta de
    // `saveCount`/`challengeCount` en CarouselSlide.jsx/DuetSlide.jsx. Antes el
    // nativo leía siempre `post.stats` estático: guardar no cambiaba el número
    // y retar nunca mostraba ninguno.
    var saveCount by remember(post.id) {
        mutableStateOf(maxOf(post.stats?.saves ?: 0, SocialCountStore.getInt(SocialCountStore.savesKey(post.id))))
    }
    var challengeCount by remember(post.id) {
        mutableStateOf(maxOf(post.stats?.challenges ?: 0, SocialCountStore.getInt(SocialCountStore.challengesKey(post.id))))
    }
    // Escucha los retos creados contra ESTA publicación para incrementar el
    // contador al instante (réplica del listener de `twyk:challenged` en la web).
    LaunchedEffect(post.id) {
        PostEvents.challenged.collect { pid ->
            if (pid == post.id) {
                val next = challengeCount + 1
                challengeCount = next
                SocialCountStore.setInt(SocialCountStore.challengesKey(post.id), next)
            }
        }
    }

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
        // Challenge (crossed swords) — hidden on "Battles > Completed"
        // (hideChallenge) AND on your OWN posts (headAuthorUsername matches
        // the logged-in user), exact same double condition as
        // `!hideChallenge && headAuthor?.username !== user?.username` in
        // CarouselSlide.jsx/DuetSlide.jsx. Before, the native app always
        // showed this button even on your own posts.
        if (!hideChallenge && headAuthorUsername != Session.user?.username) {
            RailItem(ImageVector.vectorResource(R.drawable.ic_swords), label(challengeCount, "Challenge"), Color.White, size = 30) {
                if (Session.token == null) onRequireAuth() else onChallengeClick()
            }
        }
        // Comment (round bubble, same as the web)
        RailItem(ImageVector.vectorResource(R.drawable.ic_comment), label(post.stats?.comments ?: 0, "Comment"), Color.White, size = 30) { onComments() }
        // Share (TikTok-style arrow) — abre la hoja de opciones (Send to/Copy
        // link/Instagram/WhatsApp/X), igual que ShareModal.jsx en la web. Se
        // pide vía el singleton FeedOverlays (ver data/FeedOverlays.kt) para
        // que MainActivity la pinte POR ENCIMA de la barra de navegación
        // inferior, en vez de renderizarla aquí mismo (anidada dentro del
        // feed, donde quedaba tapada por esa barra).
        RailItem(ImageVector.vectorResource(R.drawable.ic_share), label(post.stats?.shares ?: 0, "Share"), Color.White, size = 30) { FeedOverlays.openShare(post.id) }
        // Save (bookmark, same as the web) — actualización OPTIMISTA del
        // número + persistencia (SocialCountStore) y reversión si la API falla,
        // réplica de handleSaveToggle en la web.
        RailItem(
            ImageVector.vectorResource(if (saved) R.drawable.ic_bookmark_filled else R.drawable.ic_bookmark),
            label(saveCount, "Save"),
            if (saved) Color(0xFFFACC15) else Color.White,
            size = 30,
        ) {
            if (Session.token == null) {
                onRequireAuth()
            } else {
                val newSaved = !saved
                saved = newSaved
                saveCount = (saveCount + if (newSaved) 1 else -1).coerceAtLeast(0)
                SocialCountStore.setInt(SocialCountStore.savesKey(post.id), saveCount)
                scope.launch {
                    runCatching { RetrofitProvider.api.save(SaveRequest(post.id)) }
                        .onFailure {
                            // Revertir el cambio optimista si la llamada falla.
                            saved = !newSaved
                            saveCount = (saveCount + if (newSaved) -1 else 1).coerceAtLeast(0)
                            SocialCountStore.setInt(SocialCountStore.savesKey(post.id), saveCount)
                        }
                }
            }
        }
        // Más opciones (tres puntos finos, igual que la web) — mismo motivo
        // que "Share" arriba: se pide vía el singleton para que se pinte por
        // encima de la barra de navegación.
        RailItem(ImageVector.vectorResource(R.drawable.ic_more), "", Color.White, size = 18) {
            FeedOverlays.openMoreOptions(
                MoreOptionsRequest(
                    postId = post.id,
                    targetUsername = author?.username,
                    isOwnPost = author?.username != null && author.username == Session.user?.username,
                ),
            )
        }
        // Disco de música giratorio — réplica exacta del disco de vinilo real
        // (surcos + viñeta + agujero central transparente) de CarouselSlide.jsx/
        // DuetSlide.jsx; ver MusicDisc.
        MusicDisc(author?.avatarUrl, coverUrl, hasMusic, musicArtwork, active = audioActive)
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
private fun MusicDisc(
    avatarUrl: String?,
    coverUrl: String?,
    hasMusic: Boolean,
    musicArtwork: String?,
    active: Boolean = false,
) {
    // Rotación real (2.8s/vuelta, LINEAR, igual que @keyframes vinylSpin +
    // .vinyl-spin en app/globals.css de la web): SOLO avanza mientras
    // `active` es true, y se CONGELA en el ángulo EXACTO donde estaba al
    // pausar (nunca vuelve a 0°) — réplica exacta de
    // animationPlayState:'running'/'paused' en CarouselSlide.jsx/DuetSlide.jsx.
    // Sustituye por completo el "pulso" sintético de escala que tenía antes
    // el nativo (0↔1.14, latido de ecualizer) — ESO no existe en la web.
    var angle by remember { mutableStateOf(0f) }
    LaunchedEffect(active) {
        if (active) {
            val startAngle = angle
            val startNanos = System.nanoTime()
            while (true) {
                val elapsedMs = (System.nanoTime() - startNanos) / 1_000_000f
                angle = (startAngle + elapsedMs / 2800f * 360f) % 360f
                delay(16)
            }
        }
    }
    Box(
        Modifier
            .size(40.dp)
            .graphicsLayer(rotationZ = angle, compositingStrategy = CompositingStrategy.Offscreen)
            .clip(CircleShape)
            .background(Brush.linearGradient(listOf(Color(0xFF3F3F46), Color.Black)))
            // Agujero/eje central — TRANSPARENTE de verdad (réplica exacta del
            // mask-image: radial-gradient(...) del contenedor .vinyl-spin en
            // la web): recorta un agujero real a través de TODAS las capas de
            // este disco (portada, surcos, viñeta, fondo), dejando ver el
            // contenido real detrás — SIN ningún aro/borde decorativo
            // alrededor (quitado también de la web por petición del usuario).
            // NO lleva ya el borde blanco exterior de 1dp (quitado en la web).
            .drawWithContent {
                drawContent()
                drawCircle(color = Color.Black, radius = 2.dp.toPx(), center = center, blendMode = BlendMode.DstOut)
            },
        contentAlignment = Alignment.Center,
    ) {
        // Portada: MISMA prioridad exacta que hasMusic/musicArtwork/cover en
        // CarouselSlide.jsx/DuetSlide.jsx (antes el nativo SIEMPRE mostraba
        // el avatar del autor, sin esta lógica de portada real).
        when {
            hasMusic && !musicArtwork.isNullOrBlank() -> AsyncImage(
                model = absoluteUrl(musicArtwork),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            hasMusic -> Icon(Icons.Filled.MusicNote, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
            !coverUrl.isNullOrBlank() -> AsyncImage(
                model = absoluteUrl(coverUrl),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            else -> TwykAvatar(avatarUrl, 24.dp)
        }
        // Surcos de vinilo — superpuestos sobre la portada (no la
        // reemplazan), réplica del repeating-radial-gradient de la web
        // (anillos cada ~3.2px, negro semitransparente 0.32 alpha).
        Canvas(Modifier.matchParentSize()) {
            val step = 3.2.dp.toPx()
            val band = 0.6.dp.toPx()
            var r = step
            while (r < size.minDimension / 2f) {
                drawCircle(color = Color.Black.copy(alpha = 0.32f), radius = r, style = Stroke(width = band))
                r += step
            }
        }
        // Viñeta interior sutil para dar profundidad al disco — réplica del
        // inset box-shadow de la web.
        Box(
            Modifier
                .matchParentSize()
                .background(Brush.radialGradient(0.55f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.45f))),
        )
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

// Burst del doble toque — réplica EXACTA de la animación `voteIconPop` de la
// web (globals.css): 800ms, rebote elástico (escala 0.15→1.4→0.92→1.1→1→1.08)
// con ligera rotación (-18°→8°→-4°→2°→0°) y un fade que empieza en el pico
// (32%, cuando ya es opacity:1) y se desvanece de forma lineal hasta el
// final — NO el crecimiento/desvanecido lineal simple que tenía antes esta
// app nativa. Aparece centrado en el punto EXACTO del doble toque, 60dp por
// encima (misma fórmula que `translate(-50%,-60px)` + el propio centrado del
// icono en VoteBurstEffect.jsx/CSS de la web).
@Composable
private fun VoteBurst(id: Long, tapOffset: Offset, color: Color, onEnd: () -> Unit) {
    val density = LocalDensity.current
    val iconSizeDp = 96.dp
    val iconSizePx = with(density) { iconSizeDp.toPx() }
    val upPx = with(density) { 60.dp.toPx() }
    val scaleAnim = remember(id) { Animatable(0.15f) }
    val opacityAnim = remember(id) { Animatable(0f) }
    val rotationAnim = remember(id) { Animatable(-18f) }
    LaunchedEffect(id) {
        launch {
            scaleAnim.snapTo(0.15f)
            scaleAnim.animateTo(
                1.08f,
                animationSpec = keyframes {
                    durationMillis = 800
                    0.15f at 0
                    1.4f at 256
                    0.92f at 400
                    1.1f at 560
                    1.0f at 680
                    1.08f at 800
                },
            )
        }
        launch {
            opacityAnim.snapTo(0f)
            opacityAnim.animateTo(
                0f,
                animationSpec = keyframes {
                    durationMillis = 800
                    0f at 0
                    1f at 256
                    0f at 800
                },
            )
        }
        launch {
            rotationAnim.snapTo(-18f)
            rotationAnim.animateTo(
                0f,
                animationSpec = keyframes {
                    durationMillis = 800
                    -18f at 0
                    8f at 256
                    -4f at 400
                    2f at 560
                    0f at 680
                    0f at 800
                },
            )
        }
        delay(800)
        onEnd()
    }
    val shadowDownPx = with(density) { 6.dp.toPx() }
    val burstOffsetModifier = Modifier.offset {
        IntOffset(
            (tapOffset.x - iconSizePx / 2f).roundToInt(),
            (tapOffset.y - upPx - iconSizePx / 2f).roundToInt(),
        )
    }
    Box {
        // Sombra APROXIMADA — réplica ligera de `filter: drop-shadow(0 6px
        // 20px rgba(0,0,0,.55))` de VoteBurstEffect.jsx. Sin desenfoque real
        // (un blur nativo con `RenderEffect` exige API 31+ y esta app da
        // soporte desde minSdk 24), pero una silueta oscura ligeramente
        // desplazada hacia abajo aporta la misma sensación de profundidad
        // que antes faltaba por completo (bug reportado: "no tiene la misma
        // animación/tamaño que la web").
        Icon(
            ImageVector.vectorResource(R.drawable.ic_vote_filled),
            contentDescription = null,
            tint = Color.Black.copy(alpha = 0.45f),
            modifier = Modifier
                .size(iconSizeDp)
                .offset {
                    IntOffset(
                        (tapOffset.x - iconSizePx / 2f).roundToInt(),
                        (tapOffset.y - upPx - iconSizePx / 2f + shadowDownPx).roundToInt(),
                    )
                }
                .graphicsLayer {
                    scaleX = scaleAnim.value
                    scaleY = scaleAnim.value
                    rotationZ = rotationAnim.value
                    alpha = opacityAnim.value * 0.7f
                },
        )
        Icon(
            ImageVector.vectorResource(R.drawable.ic_vote_filled),
            contentDescription = null,
            tint = color,
            modifier = Modifier
                .size(iconSizeDp)
                .then(burstOffsetModifier)
                .graphicsLayer {
                    scaleX = scaleAnim.value
                    scaleY = scaleAnim.value
                    rotationZ = rotationAnim.value
                    alpha = opacityAnim.value
                },
        )
    }
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
fun VoteResultOverlay(
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

// Hoja inferior "Más opciones" — réplica EXACTA de OptionsModal.jsx: mismo
// orden de filas (Not interested/Report/Block user/Copy link en contenido
// ajeno; Delete/Copy link en el propio), cabecera con flecha-abajo para
// cerrar en el menú y flecha-atrás + título en "Report post"/"Delete post",
// feedback "Link copied" antes de cerrar, y bloqueo DIRECTO de un solo tap
// (sin paso de confirmación intermedio, igual que la web) vía POST
// /api/users/block. En el PROPIO permite Eliminar la publicación (DELETE
// /api/posts/{id}, notifica via PostEvents para quitarla de todas las
// listas visibles: feed principal y perfil/guardados).
@Composable
fun MoreOptionsSheet(
    postId: String,
    targetUsername: String?,
    isOwnPost: Boolean,
    onClose: () -> Unit,
    onRequireAuth: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // menu | report | deleteConfirm | deleting | done
    var step by remember { mutableStateOf("menu") }
    var doneMsg by remember { mutableStateOf("") }
    var copied by remember { mutableStateOf(false) }
    var reportBusy by remember { mutableStateOf(false) }
    var blockBusy by remember { mutableStateOf(false) }

    fun requireAuthOrRun(action: () -> Unit) {
        if (Session.token == null) { onClose(); onRequireAuth() } else action()
    }

    // Copiar enlace: feedback "Link copied" (900ms) antes de cerrar — réplica
    // exacta de copyLink() en OptionsModal.jsx.
    fun copyLink() {
        runCatching {
            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            cm.setPrimaryClip(android.content.ClipData.newPlainText("twyk", Config.BASE_URL.trimEnd('/') + "/?post=" + postId))
        }
        copied = true
        scope.launch { delay(900); copied = false; onClose() }
    }

    fun submitReport(reason: String) {
        reportBusy = true
        scope.launch {
            val ok = runCatching { RetrofitProvider.api.createReport(CreateReportRequest("post", postId, reason)) }.getOrNull()?.ok == true
            reportBusy = false
            if (ok) {
                doneMsg = "Thanks. We've received your report."
                step = "done"
                delay(1400)
                onClose()
            } else {
                doneMsg = "Couldn't send the report."
                step = "done"
            }
        }
    }

    // Bloquea DIRECTAMENTE al tocar "Block user" — la web NO tiene ningún
    // paso de confirmación intermedio (a diferencia de la versión anterior
    // de esta hoja nativa, que sí lo tenía).
    fun submitBlock() {
        val uname = targetUsername ?: return
        blockBusy = true
        scope.launch {
            val ok = runCatching { RetrofitProvider.api.blockUser(BlockRequest(uname)) }.getOrNull()?.ok == true
            blockBusy = false
            if (ok) {
                doneMsg = "User blocked. You will no longer see posts from @$uname."
                step = "done"
                delay(1400)
                onClose()
            } else {
                doneMsg = "Couldn't block user."
                step = "done"
            }
        }
    }

    fun submitDelete() {
        step = "deleting"
        scope.launch {
            val ok = runCatching { RetrofitProvider.api.deletePost(postId) }.getOrNull()?.ok == true
            if (ok) {
                PostEvents.emitPostDeleted(postId)
                doneMsg = "Post deleted."
                step = "done"
                delay(1000)
                onClose()
            } else {
                doneMsg = "Couldn't delete the post."
                step = "done"
            }
        }
    }

    // Paleta CLARA (blanca) — réplica exacta de OptionsModal.jsx (BottomSheet
    // blanco de la web), no del resto de hojas oscuras de la app.
    val zinc900 = Color(0xFF18181B)
    val zinc700 = Color(0xFF3F3F46)
    val zinc500 = Color(0xFF71717A)
    val zinc300 = Color(0xFFD4D4D8)
    val zinc100 = Color(0xFFF4F4F5)
    val green600 = Color(0xFF16A34A)
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
                .padding(horizontal = 8.dp, vertical = 4.dp),
        ) {
            // Cabecera — flecha abajo para cerrar (menú); flecha atrás + título
            // en "Report post"/"Delete post" — réplica exacta de OptionsModal.jsx.
            if (step == "menu") {
                Box(
                    Modifier.fillMaxWidth().clickable(onClick = onClose).padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.KeyboardArrowDown, "close", tint = zinc500, modifier = Modifier.size(18.dp)) }
            } else if (step == "report" || step == "deleteConfirm") {
                Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        Modifier.size(32.dp).clip(CircleShape).clickable { step = "menu" },
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.ChevronLeft, "back", tint = zinc700, modifier = Modifier.size(22.dp)) }
                    Spacer(Modifier.width(2.dp))
                    Text(
                        if (step == "report") "Report post" else "Delete post",
                        color = zinc900, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            when (step) {
                "menu" -> {
                    Column(Modifier.padding(horizontal = 4.dp, vertical = 4.dp)) {
                        if (!isOwnPost) {
                            SheetItem(Icons.Filled.VisibilityOff, "Not interested", zinc900, onClose)
                            SheetItem(Icons.Filled.Flag, "Report", red600) { requireAuthOrRun { step = "report" } }
                            if (targetUsername != null) {
                                if (blockBusy) {
                                    SheetBusyItem("Block user", red600)
                                } else {
                                    SheetItem(Icons.Filled.Block, "Block user", red600) { requireAuthOrRun { submitBlock() } }
                                }
                            }
                        } else {
                            SheetItem(Icons.Filled.Delete, "Delete", red600) { requireAuthOrRun { step = "deleteConfirm" } }
                        }
                        if (copied) {
                            SheetItem(Icons.Filled.Check, "Link copied", green600) {}
                        } else {
                            SheetItem(Icons.Filled.Link, "Copy link", zinc900) { copyLink() }
                        }
                    }
                }
                "report" -> {
                    Column(Modifier.padding(horizontal = 4.dp, vertical = 2.dp)) {
                        Text(
                            "Why are you reporting this post?", color = zinc500, fontSize = 13.sp,
                            modifier = Modifier.padding(start = 16.dp, top = 6.dp, bottom = 4.dp),
                        )
                        for (reason in REPORT_REASONS) {
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                                    .clickable(enabled = !reportBusy) { submitReport(reason) }
                                    .padding(horizontal = 16.dp, vertical = 13.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(reason, color = zinc900, fontSize = 15.sp, fontWeight = FontWeight.Medium)
                                if (reportBusy) {
                                    CircularProgressIndicator(color = zinc300, strokeWidth = 2.dp, modifier = Modifier.size(14.dp))
                                } else {
                                    Icon(Icons.Filled.ChevronRight, null, tint = zinc300, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                        Spacer(Modifier.height(6.dp))
                    }
                }
                "deleteConfirm" -> {
                    Column(Modifier.padding(horizontal = 8.dp, vertical = 6.dp)) {
                        Text(
                            "Delete this post?",
                            color = zinc900, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Text(
                            "This action can't be undone. Your post will be removed permanently.",
                            color = zinc500, fontSize = 13.sp, textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 18.dp),
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
                }
                "deleting" -> {
                    Box(Modifier.fillMaxWidth().padding(vertical = 28.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = zinc700, strokeWidth = 2.dp, modifier = Modifier.size(26.dp))
                    }
                }
                else -> { // "done" — mensaje simple centrado, igual que el estado `done` de la web.
                    Box(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 28.dp), contentAlignment = Alignment.Center) {
                        Text(doneMsg, color = zinc900, fontSize = 15.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
                    }
                }
            }
        }
    }
}

@Composable
private fun SheetBusyItem(text: String, tint: Color) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(color = tint, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Text(text, color = tint, fontSize = 15.sp)
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


// ── Content card (long-press en un 1vs1) ─────────────────────────────────────
// Réplica NATIVA de VSContentCard.jsx: al MANTENER PULSADA una opción de un
// dueto, se abre esta tarjeta central que muestra "solo el contenido" (vídeo o
// imagen) de A y B en un carrusel horizontal deslizable, con marco blanco
// tenue + resplandor, indicadores neutros (sin color) y botón "atrás". Arranca
// en la opción que se pulsó (initialIndex). Se dibuja desde MainActivity (vía
// FeedOverlays) para quedar POR ENCIMA de la barra de navegación inferior,
// igual que en la web es un portal a document.body con z-[60].
@Composable
fun VSContentCard(
    optionA: Side?,
    optionB: Side?,
    initialIndex: Int,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val dataSourceFactory = remember { VideoCache.cacheDataSourceFactory(context) }
    val pagerState = rememberPagerState(initialPage = initialIndex.coerceIn(0, 1), pageCount = { 2 })
    val playerA = remember { buildPlayer(context, dataSourceFactory, optionA?.videoUrl, muted = false) }
    val playerB = remember { buildPlayer(context, dataSourceFactory, optionB?.videoUrl, muted = false) }
    DisposableEffect(Unit) {
        onDispose { playerA.release(); playerB.release() }
    }
    // Solo el lado VISIBLE reproduce (con audio), igual que OptionMedia en la
    // web pausa el <video> no activo.
    LaunchedEffect(pagerState.currentPage) {
        if (pagerState.currentPage == 0) {
            playerB.pause(); playerA.play()
        } else {
            playerA.pause(); playerB.play()
        }
    }
    // El botón/gesto "Atrás" del sistema cierra la card (réplica de la
    // integración con window.history de VSContentCard.jsx).
    BackHandler(onBack = onClose)

    val slides = listOf(optionA, optionB)

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.8f))
            // Tocar FUERA de la card la cierra (réplica de onClick sobre el
            // backdrop en la web).
            .pointerInput(Unit) { detectTapGestures { onClose() } },
        contentAlignment = Alignment.Center,
    ) {
        // Glow blanco alrededor del marco de la card — réplica de `boxShadow:
        // '0 0 60px 8px rgba(255,255,255,.35), 0 0 120px 24px
        // rgba(255,255,255,.15)'` de la web (VSContentCard.jsx). BUG
        // reportado por el usuario ("debe aparecer el glow como en la web"
        // — faltaba por completo, solo había un borde de 1dp sin ningún
        // resplandor). Compose no tiene un blur de color fiable desde
        // minSdk 24 (mismo motivo ya documentado en los demás glows de esta
        // sesión — icono de 'Crear contenido', trofeo/espadas de Retos); se
        // aproxima con 3 capas rounded-rect BLANCAS ligeramente más grandes
        // que la card real (mismo aspect-ratio, escaladas desde el centro),
        // alfa decreciente hacia fuera — un contorno expandido "por capas"
        // que sigue la FORMA real de la card (no un círculo genérico).
        listOf(1.16f to 0.08f, 1.09f to 0.16f, 1.03f to 0.26f).forEach { (scale, alpha) ->
            Box(
                Modifier
                    .fillMaxHeight(0.85f * scale)
                    .aspectRatio(9f / 17.5f, matchHeightConstraintsFirst = true)
                    .clip(RoundedCornerShape(24.dp * scale))
                    .background(Color.White.copy(alpha = alpha)),
            )
        }
        Box(
            Modifier
                .fillMaxHeight(0.85f)
                .aspectRatio(9f / 17.5f, matchHeightConstraintsFirst = true)
                .clip(RoundedCornerShape(24.dp))
                .background(Color.Black)
                .border(1.dp, Color.White.copy(alpha = 0.18f), RoundedCornerShape(24.dp))
                // Consume los toques sobre la card para que NO cierren (solo
                // los del backdrop cierran); el carrusel sigue deslizándose
                // porque el gesto de arrastre lo maneja HorizontalPager aparte.
                .pointerInput(Unit) { detectTapGestures { } },
        ) {
            HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { p ->
                ContentOption(
                    option = slides[p],
                    player = if (p == 0) playerA else playerB,
                )
            }

            // Indicadores neutros (sin color), réplica de los dots de la web.
            Row(
                Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                for (i in 0..1) {
                    val activeDot = pagerState.currentPage == i
                    Box(
                        Modifier
                            .size(width = if (activeDot) 16.dp else 6.dp, height = 6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(Color.White.copy(alpha = if (activeDot) 0.9f else 0.35f)),
                    )
                }
            }

            // Botón atrás — sin fondo, solo el icono (réplica de la web).
            Icon(
                Icons.Filled.ChevronLeft,
                contentDescription = "Back",
                tint = Color.White,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(6.dp)
                    .size(32.dp)
                    .clickable { onClose() },
            )
        }
    }
}

// Contenido puro de una opción dentro de la content card: vídeo (reproductor
// nativo) o imagen a pantalla, sin nombres ni %.
@Composable
private fun ContentOption(option: Side?, player: ExoPlayer) {
    val videoUrl = absoluteUrl(option?.videoUrl)
    val imageUrl = absoluteUrl(option?.imageUrl ?: option?.posterUrl)
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        if (videoUrl != null) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        useController = false
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                        setShutterBackgroundColor(android.graphics.Color.BLACK)
                    }.also { it.player = player }
                },
                update = { it.player = player },
                modifier = Modifier.fillMaxSize(),
            )
        } else if (imageUrl != null) {
            AsyncImage(
                model = imageUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}
