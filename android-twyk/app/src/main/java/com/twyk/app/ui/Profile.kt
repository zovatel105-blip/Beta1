package com.twyk.app.ui

import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
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
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.twyk.app.Config
import com.twyk.app.R
import com.twyk.app.absoluteUrl
import com.twyk.app.data.Author
import com.twyk.app.data.Post
import com.twyk.app.data.PostEvents
import com.twyk.app.data.QuickChallengeTarget
import com.twyk.app.data.ProfileUser
import com.twyk.app.data.FullScreenOverlays
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import com.twyk.app.data.Stats
import com.twyk.app.data.UploadEvents
import com.twyk.app.data.UploadQueue
import com.twyk.app.data.UploadQueueItem
import com.twyk.app.data.VoteRequest
import com.twyk.app.feed.FeedPager
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import kotlinx.coroutines.launch
import kotlin.math.ceil
import kotlin.math.roundToInt

// Pantalla de PERFIL (propio o ajeno) — réplica de ProfilePage.jsx de la web.
// Fondo #0a0a0b + glow dorado, stats alrededor del avatar, nombre/handle,
// botones (Editar/Compartir o Seguir/Retar), pestañas y cuadrícula 3 columnas.
// NUEVA FEATURE (usuario: "en la página de perfil ajeno y propio cuando
// deslice hacia abajo el perfil debe actualizar"): "pull to refresh" — ni la
// web ni el nativo tenían este gesto en ningún sitio (no hay equivalente en
// ProfilePage.jsx que replicar; es una feature nueva SOLO para el nativo,
// donde el gesto de "deslizar hacia abajo para refrescar" es un patrón
// estándar de plataforma). Implementado con `PullToRefreshBox` de
// Material3 (ver más abajo).
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    username: String?,
    isOverlay: Boolean,
    onClose: () -> Unit,
    onRequireAuth: () -> Unit,
    onOpenChallenge: (QuickChallengeTarget) -> Unit = {},
) {
    val target = username ?: Session.user?.username

    if (target == null) {
        LoginPrompt("Sign in to view your profile", onRequireAuth)
        return
    }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var profile by remember(target) { mutableStateOf<ProfileUser?>(null) }
    var posts by remember(target) { mutableStateOf<List<Post>>(emptyList()) }
    var loading by remember(target) { mutableStateOf(true) }
    var following by remember(target) { mutableStateOf(false) }
    var followers by remember(target) { mutableStateOf(0) }
    var followBusy by remember(target) { mutableStateOf(false) }
    var activeTab by remember(target) { mutableStateOf("polls") }
    var editOpen by remember(target) { mutableStateOf(false) } // pantalla "Edit profile" (solo perfil propio)
    // Visor de publicación (al tocar un elemento del grid) — reutiliza el mismo
    // reproductor nativo del feed principal (ver feed/VersusFeed.kt::FeedPager).
    var viewerIndex by remember(target) { mutableStateOf<Int?>(null) }
    var viewerCommentsPostId by remember(target) { mutableStateOf<String?>(null) }
    // Voto ACTUAL del usuario sobre la publicación abierta en el visor (misma
    // idea que commentsVotedSide en MainActivity.kt) — se pasa al modal de
    // comentarios para el punto de color y para etiquetar comentarios nuevos.
    var viewerVotedSide by remember(target) { mutableStateOf<String?>(null) }
    var nestedProfileUsername by remember(target) { mutableStateOf<String?>(null) }
    var followListType by remember(target) { mutableStateOf<String?>(null) } // "followers" | "following" | null
    var menuOpen by remember(target) { mutableStateOf(false) } // hoja de "Settings" (☰, cerrar sesión)
    // Publicaciones guardadas (pestaña "saved", solo perfil propio) y lista
    // activa dentro del visor (puede ser "posts" o "savedPosts" según la pestaña
    // desde la que se abrió).
    var savedPosts by remember(target) { mutableStateOf<List<Post>>(emptyList()) }
    var savedLoading by remember(target) { mutableStateOf(false) }
    var viewerList by remember(target) { mutableStateOf<List<Post>>(emptyList()) }
    // NOTA sobre el contador de "reproducciones": YA NO se registra aquí —
    // se centralizó dentro de CarouselPage/DuetPage (VersusFeed.kt, dispara
    // con solo isActive=true), así que también cubre el feed principal y
    // Batallas>Completados, no solo el grid del perfil.

    // BUG REPORTADO (edge swipe back cerraba la app entera): ninguno de los
    // overlays PROPIOS de esta pantalla (visor de publicación del grid,
    // comentarios de ese visor, editar perfil, lista de seguidores, perfil
    // anidado al tocar a alguien de esa lista) tenía BackHandler -> el gesto
    // se colaba hasta el nivel de MainActivity (que en el mejor caso cerraba
    // el perfil entero, o en el peor cerraba la app si esta pantalla es la
    // pestaña "Perfil" de Inicio). FIX: BackHandler LOCAL con prioridad sobre
    // el del padre (por composición más profunda) que resuelve primero lo más
    // "encima" de esta pantalla; `menuOpen` (Settings) NO se incluye aquí
    // porque ProfileMenuSheet ya tiene su propio BackHandler interno.
    val hasLocalOverlay = viewerCommentsPostId != null || nestedProfileUsername != null ||
        followListType != null || editOpen || viewerIndex != null
    BackHandler(enabled = hasLocalOverlay) {
        when {
            viewerCommentsPostId != null -> { viewerCommentsPostId = null; viewerVotedSide = null }
            nestedProfileUsername != null -> nestedProfileUsername = null
            followListType != null -> followListType = null
            editOpen -> editOpen = false
            viewerIndex != null -> viewerIndex = null
        }
    }

    // Carga (y recarga) los datos del perfil. Extraído en una función
    // reutilizable para poder llamarla también desde el pull-to-refresh
    // (mismo endpoint, `showSpinner=false` evita parpadear el spinner de
    // pantalla completa mientras el indicador de PullToRefreshBox ya se
    // encarga de mostrar el estado de "actualizando").
    suspend fun loadProfile(showSpinner: Boolean) {
        if (showSpinner) loading = true
        runCatching { RetrofitProvider.api.userProfile(target) }
            .onSuccess { r ->
                profile = r.user
                posts = r.posts.orEmpty()
                following = r.user?.isFollowing ?: false
                followers = r.user?.followers ?: 0
            }
        if (showSpinner) loading = false
    }

    LaunchedEffect(target) { loadProfile(showSpinner = true) }

    val isOwn = username == null || target == Session.user?.username
    val votos = posts.sumOf { (it.votes?.a ?: 0) + (it.votes?.b ?: 0) }
    // BUG reportado por el usuario ("cuando creo una publicación tipo versus
    // aparece como reto"): réplica exacta de un bug YA corregido en la web
    // (ProfilePage.jsx). Las publicaciones NORMALES (carrusel de 2 vídeos
    // A/B) también son `type == "versus"` por diseño — SOLO un reto realmente
    // aceptado se marca con `isChallenge = true` (asignado únicamente al
    // aceptar un reto, ver handleAcceptChallenge en route.js). Contar por
    // `type` inflaba el contador "Challenges" del perfil con publicaciones
    // normales; contar por `isChallenge` es lo correcto.
    val retos = posts.count { it.isChallenge == true }

    // Pull-to-refresh (deslizar hacia abajo estando arriba del todo para
    // actualizar) — feature nueva pedida por el usuario, aplica tanto al
    // perfil propio como al ajeno. Refresca el perfil (datos + stats +
    // publicaciones) y, si la pestaña activa es "saved" (solo posible en el
    // perfil propio), también las publicaciones guardadas.
    var refreshing by remember(target) { mutableStateOf(false) }
    val onRefresh: () -> Unit = {
        if (!refreshing) {
            refreshing = true
            scope.launch {
                loadProfile(showSpinner = false)
                if (activeTab == "saved" && isOwn && Session.token != null) {
                    savedPosts = runCatching { RetrofitProvider.api.saves().posts.orEmpty() }.getOrDefault(savedPosts)
                }
                refreshing = false
            }
        }
    }

    // BUG reportado por el usuario ("aparece la barra de navegación inferior
    // que no debería aparecer" al recortar la foto de perfil): "Edit profile"
    // (y su recorte circular anidado) es una pantalla A PANTALLA COMPLETA que
    // vive DENTRO de ProfileScreen, la cual a su vez vive DENTRO de la rama
    // "Tab.Profile" de MainActivity — declarada ANTES que TwykBottomNav en el
    // mismo Box, así que la barra se pintaba siempre por encima (ver
    // FullScreenOverlays.kt para la causa raíz completa, mismo patrón que
    // FeedOverlays). FIX: reflejar `editOpen` (solo si es mi propio perfil)
    // en el singleton observable para que MainActivity oculte la barra
    // mientras esta pantalla esté abierta — igual que la web, donde
    // EditProfileModal/CircularCrop son overlays de pantalla completa sin
    // ninguna barra de navegación inferior visible.
    LaunchedEffect(editOpen, isOwn) {
        if (isOwn) FullScreenOverlays.editProfileOpen = editOpen
    }
    DisposableEffect(Unit) {
        onDispose { if (isOwn) FullScreenOverlays.editProfileOpen = false }
    }

    // Mismo mecanismo, para el panel de Ajustes (ProfileMenuSheet, ☰) — BUG
    // reportado por el usuario ("los ajustes... deben estar por encima de la
    // barra de navegación inferior"): ver comentario completo en
    // FullScreenOverlays.kt.
    LaunchedEffect(menuOpen) { FullScreenOverlays.settingsOpen = menuOpen }
    DisposableEffect(Unit) {
        onDispose { FullScreenOverlays.settingsOpen = false }
    }

    // Mismo mecanismo que arriba, para el visor de publicaciones del grid —
    // BUG reportado por el usuario ("la barra de navegación inferior sigue
    // apareciendo... debería aparecer la barra de comentar"): la barra de
    // navegación (pintada por MainActivity, fuera de este árbol) se seguía
    // dibujando ENCIMA del visor y de la nueva barra de "Añadir comentario"
    // porque nada la ocultaba mientras `viewerIndex != null`.
    LaunchedEffect(viewerIndex) {
        FullScreenOverlays.profileViewerOpen = viewerIndex != null
    }
    DisposableEffect(Unit) {
        onDispose { FullScreenOverlays.profileViewerOpen = false }
    }

    // Cargar publicaciones GUARDADAS al abrir la pestaña "saved" (solo perfil propio).
    LaunchedEffect(activeTab, target, isOwn) {
        if (activeTab == "saved" && isOwn && Session.token != null) {
            savedLoading = true
            savedPosts = runCatching { RetrofitProvider.api.saves().posts.orEmpty() }.getOrDefault(emptyList())
            savedLoading = false
        }
    }

    // Cuando una subida en segundo plano TERMINA con éxito (ver
    // data/UploadWorker.kt + data/UploadQueue.kt), insertamos la publicación
    // al principio del grid al instante, sin esperar a recargar el perfil.
    LaunchedEffect(isOwn) {
        if (isOwn) {
            UploadEvents.postCreated.collect { post ->
                posts = listOf(post) + posts.filterNot { it.id == post.id }
            }
        }
    }

    // Cuando se elimina una publicación (propia, desde "Más opciones" en
    // cualquier pantalla), la quitamos de TODAS las listas de este perfil
    // (grid principal, guardados, visor abierto) sin recargar.
    LaunchedEffect(Unit) {
        PostEvents.postDeleted.collect { id ->
            posts = posts.filterNot { it.id == id }
            savedPosts = savedPosts.filterNot { it.id == id }
            viewerList = viewerList.filterNot { it.id == id }
        }
    }

    // Comentar/borrar un comentario desde el visor de este perfil actualiza al
    // instante el número junto al icono, sin recargar (mismo patrón que
    // FeedViewModel/BattlesScreen).
    LaunchedEffect(Unit) {
        PostEvents.commentCountChanged.collect { (id, count) ->
            fun patch(list: List<Post>) = list.map { p -> if (p.id == id) p.copy(stats = (p.stats ?: Stats()).copy(comments = count)) else p }
            posts = patch(posts)
            savedPosts = patch(savedPosts)
            viewerList = patch(viewerList)
        }
    }

    val onFollow: () -> Unit = {
        if (Session.token == null) {
            onRequireAuth()
        } else if (!followBusy) {
            followBusy = true
            val prevF = following
            val prevC = followers
            following = !prevF
            followers = (prevC + if (prevF) -1 else 1).coerceAtLeast(0)
            scope.launch {
                runCatching { RetrofitProvider.api.toggleFollow(target) }
                    .onSuccess { following = it.following; followers = it.followers }
                    .onFailure { following = prevF; followers = prevC }
                followBusy = false
            }
        }
    }

    val onShare: () -> Unit = {
        val i = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, "@$target on Twyk\n${Config.BASE_URL}")
        }
        context.startActivity(Intent.createChooser(i, "Share"))
    }

    // Retar a este usuario: reto "de mención" (sin vídeo del retado, igual
    // que handleChallenge en ProfilePage.jsx) — el usuario retado sube su
    // vídeo de respuesta cuando acepta. BUG FIX: los botones "Challenge" del
    // perfil ajeno (icono en la barra colapsada y píldora bajo el avatar)
    // tenían un onClick VACÍO (`{ }`), así que no hacían absolutamente nada
    // al pulsarlos — nunca se llegó a implementar en el nativo (a diferencia
    // de la web). Requiere sesión, igual que onFollow.
    val onChallenge: () -> Unit = {
        if (Session.token == null) {
            onRequireAuth()
        } else {
            onOpenChallenge(
                QuickChallengeTarget(
                    postId = "",
                    author = Author(
                        username = profile?.username ?: target,
                        name = profile?.name ?: profile?.username ?: target,
                        avatarUrl = profile?.avatarUrl,
                    ),
                    videoUrl = null,
                    posterUrl = null,
                    description = null,
                    music = null,
                ),
            )
        }
    }

    // ── Header colapsable estilo TikTok ────────────────────────────────────────
    // Al hacer scroll, la barra superior (siempre fija) revela progresivamente
    // el mini-perfil (avatar+nombre) y la acción (Editar/Seguir). Se calcula a
    // partir del scroll del PRIMER item del grid (la cabecera).
    val gridState = rememberLazyGridState()
    val density = LocalDensity.current
    // BUG reportado por el usuario ("la info con el icono... se desplaza
    // hacia arriba cuando debería quedar visible sin recortes", con captura
    // de la pestaña "saved" vacía): al cambiar de pestaña (polls -> saved)
    // el LazyVerticalGrid CONSERVA el mismo `gridState` (es un solo grid
    // compartido, ver más abajo) — si el usuario ya había hecho scroll
    // profundo en "polls" (muchas publicaciones), ese scroll se "hereda" al
    // cambiar a "saved", cuyo contenido es mucho más corto (cabecera +
    // EmptyTab). Compose recorta (clampa) automáticamente esa posición para
    // que siga siendo válida con el contenido nuevo, pero lo hace ANTES de
    // que `minContentFillerPx` recalcule el relleno correcto para la pestaña
    // nueva (ese relleno depende de `savedLoading`, que en el primer frame
    // tras cambiar de pestaña sigue siendo `true`) — el resultado es que el
    // primer item de contenido real (aquí, `EmptyTab`) queda anclado
    // exactamente en la posición 0 del scroll (`firstVisibleItemIndex`>0,
    // offset 0), que es JUSTO la zona cubierta por la barra superior fija +
    // las pestañas sticky, así que su icono aparece recortado por arriba —
    // y como Compose NO vuelve a desplazar hacia abajo por sí solo una vez
    // que el relleno correcto está disponible (nada fuerza ese ajuste sin
    // que el usuario arrastre), se queda así permanentemente. FIX: al
    // cambiar de pestaña, se reinicia el scroll a la cabecera (item 0,
    // offset 0) — la MISMA pestaña que se elige queda con su cabecera
    // totalmente expandida y su contenido garantizado visible desde el
    // principio, sin heredar ninguna posición de scroll incompatible de la
    // pestaña anterior (mismo criterio, aunque por un motivo distinto, al
    // `scrollRef.current.scrollTop = 0` que la web ya usa al reabrir el
    // perfil, ver línea ~381 de ProfilePage.jsx).
    LaunchedEffect(activeTab) { gridState.scrollToItem(0, 0) }
    // Tamaño real (medido) del área visible del perfil — necesario para el
    // relleno mínimo de contenido de más abajo (minContentFillerPx).
    var viewportSize by remember(target) { mutableStateOf(IntSize.Zero) }
    // Borde inferior de la barra superior fija = inset de status bar + 44dp.
    val statusTopPx = WindowInsets.statusBars.getTop(density).toFloat()
    val barBottomPx = statusTopPx + with(density) { 44.dp.toPx() }
    // Altura MEDIDA del bloque de perfil (stats+avatar+nombre+bio+botones), es
    // decir la distancia de scroll necesaria para que las pestañas se anclen
    // bajo la barra — equivalente a `collapseDist = tabs.offsetTop - barHeight`
    // en la web. Se mide con onGloballyPositioned (ver ProfileHeaderSection);
    // hasta tener la medida real usamos un valor por defecto razonable.
    var profileBlockHeightPx by remember(target) { mutableStateOf(with(density) { COLLAPSE_DIST_DP.dp.toPx() }) }
    // Progreso de colapso 0 (expandido) → 1 (pestañas ancladas), calculado con
    // el scroll del PRIMER item (la cabecera). Al usar la altura real del
    // bloque, el desvanecido de la cabecera y el anclaje de las pestañas quedan
    // perfectamente sincronizados (como la web).
    val collapseProgress by remember {
        derivedStateOf {
            if (gridState.firstVisibleItemIndex > 0) {
                1f
            } else {
                val dist = profileBlockHeightPx.coerceAtLeast(1f)
                (gridState.firstVisibleItemScrollOffset / dist).coerceIn(0f, 1f)
            }
        }
    }
    // Posición Y (px) de la banda de pestañas STICKY: baja con el scroll hasta
    // anclarse justo bajo la barra superior (réplica de `position: sticky`).
    val tabsTopPx by remember {
        derivedStateOf {
            barBottomPx + profileBlockHeightPx * (1f - collapseProgress)
        }
    }

    // BUG reportado por el usuario ("el perfil no se solapa como la web"): con
    // pocas publicaciones (p.ej. 3), el grid no tenía suficiente contenido
    // para desplazarse lo bastante -> el header nunca llegaba a colapsar del
    // todo ni las pestañas a anclarse bajo la barra superior (se quedaban a
    // medias, con la cabecera casi completa aún visible y un "fantasma" tenue
    // de la barra colapsada superpuesto). La web NUNCA tiene este problema
    // porque reserva `contentMinH` (altura mínima = alto visible - barra -
    // pestañas) en el contenedor del grid, garantizando SIEMPRE suficiente
    // distancia de scroll para colapsar, sin importar cuántas publicaciones
    // reales haya (ver comentario "Altura mínima del contenido" en
    // ProfilePage.jsx). Réplica aquí: `minContentFillerPx` calcula cuánto le
    // falta al contenido real (posts en filas de 3, por aspecto 9:16) para
    // alcanzar el alto de la pantalla, y se añade como un item de relleno
    // invisible al final del grid.
    val currentTabItemCount = if (activeTab == "saved") savedPosts.size else (if (isOwn) UploadQueue.items.size else 0) + posts.size
    val currentTabReady = if (activeTab == "saved") !savedLoading else !loading
    // Espacio disponible tras la barra superior/pestañas/relleno inferior —
    // reutilizado TANTO para calcular el relleno con publicaciones (más abajo)
    // COMO para el alto del propio `EmptyTab` (ver más abajo). BUG reportado
    // por el usuario, dos intentos previos sin solucionarlo del todo ("la
    // info que aparece cuando no hay publicación... cuando deslizo se
    // recorta"): los intentos anteriores median la altura REAL de `EmptyTab`
    // (onGloballyPositioned con un valor "por defecto" de 250dp mientras
    // llegaba la medida real) y restaban esa medida del espacio disponible
    // para calcular un relleno POSTERIOR — pero eso deja una ventana de
    // carrera: en el/los primeros frames (medida aún con el valor por
    // defecto, que no coincide exactamente con el alto real renderizado) el
    // grid ya permite desplazarse hasta el límite calculado con ese valor
    // aproximado; en cuanto llega la medida real (frame siguiente) el relleno
    // se recalcula, pero Compose NO vuelve a desplazar el scroll ya
    // consumido por el usuario -> si el valor por defecto no coincidía
    // exactamente, el resultado final queda con `EmptyTab` un poco recortado
    // por la barra/pestañas, de forma permanente hasta que el usuario vuelva
    // a arrastrar manualmente. FIX RAÍZ (sin medir nada, sin valores por
    // defecto, sin ventana de carrera): en vez de RESTAR la altura de
    // `EmptyTab` de un relleno posterior, se le asigna a `EmptyTab` un alto
    // MÍNIMO EXPLÍCITO igual a `availableContentAreaPx` directamente (ver
    // `minHeight` en su uso más abajo) — así `EmptyTab` ES el relleno, con un
    // valor 100% determinista desde el primer frame (depende solo de
    // `viewportSize`, ya conocido), sin depender de ninguna medida que pueda
    // llegar tarde o con un valor por defecto ligeramente distinto.
    val availableContentAreaPx = if (!currentTabReady || viewportSize.height <= 0 || viewportSize.width <= 0) {
        0f
    } else {
        val reservedAfterHeaderPx = barBottomPx + with(density) { (32.dp + 26.dp).toPx() }
        val bottomPadPx = with(density) { 112.dp.toPx() }
        (viewportSize.height.toFloat() - reservedAfterHeaderPx - bottomPadPx).coerceAtLeast(0f)
    }
    val minContentFillerPx = if (currentTabItemCount <= 0 || availableContentAreaPx <= 0f) {
        0f
    } else {
        val horizontalPaddingPx = with(density) { 12.dp.toPx() } // contentPadding start(6)+end(6)
        val cellWidthPx = (viewportSize.width.toFloat() - horizontalPaddingPx) / 3f
        val cellHeightPx = cellWidthPx * (16f / 9f) // aspecto 9:16 (ancho:alto)
        val rows = ceil(currentTabItemCount / 3.0).toFloat()
        val realContentHeightPx = rows * cellHeightPx
        (availableContentAreaPx - realContentHeightPx).coerceAtLeast(0f)
    }

    // PullToRefreshBox envuelve TODO el contenido de la pantalla (grid +
    // barras superpuestas + overlays anidados) — solo intercepta el gesto
    // cuando el LazyVerticalGrid interior ya está en la posición de scroll 0
    // y el usuario sigue arrastrando hacia abajo (comportamiento estándar de
    // Compose vía nested scroll), así que no interfiere con el scroll normal
    // del grid ni con las barras fijas (que solo consumen taps, no arrastres).
    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = onRefresh,
        modifier = Modifier.fillMaxSize(),
    ) {
    Box(Modifier.fillMaxSize().background(TwykBg).onSizeChanged { viewportSize = it }) {
        // NOTA: la web (ProfilePage.jsx) NO tiene ningún glow superior en el
        // perfil principal ("todo el perfil usa el mismo negro grisáceo
        // sólido #0a0a0b", ver comentario en el propio código de la web);
        // el único glow real de esa pantalla es uno morado, pequeño y en la
        // esquina, dentro del panel de Ajustes (SettingsDrawer), no aquí.
        // Se quita el GoldGlow() que había antes por error.

        LazyVerticalGrid(
            state = gridState,
            columns = GridCells.Fixed(3),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 6.dp, end = 6.dp, bottom = 112.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                ProfileHeaderSection(
                    profile = profile,
                    isOwn = isOwn,
                    votos = votos,
                    retos = retos,
                    followers = followers,
                    following = following,
                    followBusy = followBusy,
                    collapseProgress = collapseProgress,
                    onBlockMeasured = { h -> if (h > 0) profileBlockHeightPx = h.toFloat() },
                    onFollow = onFollow,
                    onShare = onShare,
                    onEditProfile = { editOpen = true },
                    onOpenFollowList = { followListType = it },
                    onChallenge = onChallenge,
                )
            }

            if (activeTab == "polls") {
                // Placeholders de subidas EN CURSO (solo perfil propio) — se
                // muestran SIEMPRE al principio del grid, ver data/UploadQueue.kt.
                if (isOwn && UploadQueue.items.isNotEmpty()) {
                    items(UploadQueue.items, key = { it.id }) { q ->
                        UploadPlaceholderItem(q) { UploadQueue.remove(q.id) }
                    }
                }
                when {
                    loading -> item(span = { GridItemSpan(maxLineSpan) }) {
                        Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(32.dp))
                        }
                    }
                    posts.isEmpty() && !(isOwn && UploadQueue.items.isNotEmpty()) -> item(span = { GridItemSpan(maxLineSpan) }) {
                        EmptyTab(
                            title = "No posts yet", desc = if (isOwn) "Start creating content" else "This user hasn't posted yet",
                            minHeightPx = availableContentAreaPx,
                        )
                    }
                    else -> itemsIndexed(posts) { idx, p -> ProfileGridItem(p) { viewerList = posts; viewerIndex = idx } }
                }
            } else if (activeTab == "saved") {
                when {
                    savedLoading -> item(span = { GridItemSpan(maxLineSpan) }) {
                        Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(32.dp))
                        }
                    }
                    savedPosts.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) {
                        EmptyTab(
                            title = "No saved posts", desc = "Save videos to watch them later", bookmark = true,
                            minHeightPx = availableContentAreaPx,
                        )
                    }
                    else -> itemsIndexed(savedPosts) { idx, p -> ProfileGridItem(p) { viewerList = savedPosts; viewerIndex = idx } }
                }
            }

            // Relleno invisible (ver minContentFillerPx más arriba): garantiza
            // SIEMPRE suficiente distancia de scroll para colapsar la cabecera y
            // anclar las pestañas, incluso con 0/pocas publicaciones — antes de
            // este fix, con pocas publicaciones el header se quedaba a medio
            // colapsar para siempre (el bug reportado por el usuario, ver captura).
            if (minContentFillerPx > 1f) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Spacer(Modifier.height(with(density) { minContentFillerPx.toDp() }))
                }
            }
        }

        // Pestañas STICKY (overlay): siguen al scroll y se anclan bajo la barra
        // superior; el contenido del grid pasa POR DETRÁS (solapamiento, réplica
        // de las tabs `position: sticky` de ProfilePage.jsx). Se dibuja ANTES
        // que CollapsedTopBar para quedar por debajo de ella. Solo se muestra
        // cuando ya se midió el bloque de perfil (evita un salto inicial).
        ProfileTabsBar(
            activeTab = activeTab,
            isOwn = isOwn,
            onTab = { activeTab = it },
            modifier = Modifier.offset { IntOffset(0, tabsTopPx.roundToInt()) },
        )

        // Barra superior FIJA (siempre visible, encima del grid): revela el
        // mini-perfil y la acción al colapsar, con menú (☰) para perfil propio.
        CollapsedTopBar(
            progress = collapseProgress,
            profile = profile,
            isOwn = isOwn,
            isOverlay = isOverlay,
            following = following,
            followBusy = followBusy,
            onClose = onClose,
            onFollow = onFollow,
            onShare = onShare,
            onEditProfile = { editOpen = true },
            onOpenMenu = { menuOpen = true },
            onChallenge = onChallenge,
        )

        // Pantalla "Edit profile" (nombre, bio, avatar con recorte circular) —
        // solo aplica al perfil propio. Al guardar, refresca la cabecera y la
        // sesión (avatar/nombre usados en el resto de la app).
        if (editOpen && isOwn) {
            EditProfileScreen(
                initial = profile ?: ProfileUser(
                    username = Session.user?.username,
                    name = Session.user?.name,
                    avatarUrl = Session.user?.avatarUrl,
                ),
                onClose = { editOpen = false },
                onSaved = { updated ->
                    profile = (profile ?: ProfileUser()).copy(
                        name = updated.name,
                        bio = updated.bio,
                        avatarUrl = updated.avatarUrl,
                    )
                    Session.user?.let { su ->
                        Session.set(
                            Session.token,
                            su.copy(name = updated.name ?: su.name, avatarUrl = updated.avatarUrl ?: su.avatarUrl),
                        )
                    }
                    editOpen = false
                },
            )
        }

        // Visor de publicación al tocar un elemento del grid ("polls"). Reutiliza
        // el mismo FeedPager del feed principal, empezando en la publicación
        // tocada. Comentarios y "abrir perfil de otro autor" se gestionan aquí
        // mismo (hoja de comentarios y overlay de perfil anidado).
        //
        // BUG reportado por el usuario ("aparece una flecha de atrás,
        // elimínala, y debería aparecer la barra de comentar como en la web"):
        // réplica de PostViewer (ProfilePage.jsx) — ese visor NO tiene NINGÚN
        // botón de flecha/cerrar visible (se cierra solo con el gesto de
        // deslizar desde el borde izquierdo, o aquí, con el gesto nativo de
        // "Atrás" ya conectado más abajo vía BackHandler); y SIEMPRE pasa
        // `showCommentInput` a CarouselSlide/DuetSlide, para que la barra de
        // "Añadir comentario" (QuickCommentInput.jsx) aparezca al pie. FIX:
        // se quita la flecha (Box clicable de más abajo) y se pasa
        // `showCommentInput = true` a `FeedPager`.
        viewerIndex?.let { idx ->
            Box(Modifier.fillMaxSize()) {
                FeedPager(
                    insideOverlay = true, // el visor vive dentro del overlay del perfil (fix pausa)
                    posts = viewerList,
                    initialPage = idx,
                    onOpenComments = { id, side -> viewerCommentsPostId = id; viewerVotedSide = side },
                    onRequireAuth = onRequireAuth,
                    onOpenProfile = { uname -> nestedProfileUsername = uname },
                    onVote = { id, side, prev ->
                        scope.launch { runCatching { RetrofitProvider.api.vote(VoteRequest(id, side, prev)) } }
                    },
                    // BUG REPORTADO ("en las publicaciones single el botón social
                    // Retar no responde a nada por más que haga click en él"):
                    // este FeedPager (visor de publicación al tocar un elemento
                    // del grid del perfil — incluye publicaciones tipo "Single"/
                    // reto abierto, ver OpenChallengePage en VersusFeed.kt) NUNCA
                    // pasaba `onChallenge`, así que usaba el valor por defecto de
                    // la firma (`onChallenge: (QuickChallengeTarget) -> Unit =
                    // {}`, un no-op literal, ver FeedPager en feed/VersusFeed.kt)
                    // — el botón "Retar" de la columna social (SocialRail) SÍ
                    // llamaba correctamente a ese callback al tocarlo, pero como
                    // aquí nunca llegaba ninguna función real, no pasaba nada en
                    // absoluto, sin importar cuántas veces se tocara — exactamente
                    // el síntoma reportado. MISMO patrón exacto que los 2 bugs ya
                    // corregidos antes en este mismo archivo (botón "Challenge" de
                    // la cabecera del perfil, y el ProfileScreen anidado sin
                    // `onOpenChallenge`) — tercera aparición del mismo olvido.
                    // FIX: se pasa `onOpenChallenge` (parámetro recibido por esta
                    // función ProfileScreen, MISMA firma exacta que `onChallenge`
                    // de FeedPager, ya correctamente cableado desde MainActivity.kt
                    // hasta aquí) en vez de dejarlo en el valor por defecto.
                    onChallenge = onOpenChallenge,
                    showCommentInput = true,
                    // SOLO en el PROPIO perfil, la barra alterna con "reproducciones"
                    // (ver CommentOrViewsBar en VersusFeed.kt) — perfil ajeno sin cambios.
                    alternateViews = isOwn,
                )
            }
            viewerCommentsPostId?.let { pid ->
                CommentsSheet(
                    postId = pid,
                    votedSide = viewerVotedSide,
                    onClose = { viewerCommentsPostId = null; viewerVotedSide = null },
                    onRequireAuth = onRequireAuth,
                )
            }
        }

        // Listas de Followers / Following (tocar un usuario abre su perfil).
        followListType?.let { type ->
            FollowListScreen(
                username = target,
                initialType = type,
                onClose = { followListType = null },
                onOpenUser = { uname -> followListType = null; nestedProfileUsername = uname },
            )
        }

        // Perfil anidado de OTRO autor — puede abrirse desde el visor de
        // publicaciones o desde la lista de Followers/Following.
        // BUG REPORTADO POR EL USUARIO ("en los perfiles ajenos el botón
        // social de reto no funciona"): esta instancia ANIDADA de
        // ProfileScreen NO pasaba `onOpenChallenge`, así que usaba el valor
        // por defecto del parámetro (`= {}` en la firma de ProfileScreen,
        // ver más arriba) — un no-op literal. El botón "Challenge" (icono de
        // espadas en la barra colapsada + píldora bajo el avatar) SÍ estaba
        // correctamente cableado a `onChallenge` -> `onOpenChallenge(target)`
        // dentro de este archivo, pero al no llegar ningún callback real
        // desde aquí, pulsar el botón en un perfil abierto por esta vía
        // (desde Seguidores/Siguiendo de CUALQUIER perfil, o al tocar al
        // autor de una publicación dentro del visor de un perfil) no abría
        // el diálogo de reto ni pasaba nada visible — exactamente el
        // síntoma reportado. Las otras 2 instancias de ProfileScreen
        // (Tab.Profile y el overlay `profileUsername` de MainActivity.kt)
        // SÍ pasaban `onOpenChallenge` correctamente, por eso el bug solo
        // aparecía en perfiles abiertos por esta ruta anidada. FIX: se
        // propaga el MISMO `onOpenChallenge` recibido por esta instancia
        // (parámetro de función, línea ~103) hacia la instancia anidada,
        // igual que ya se hace con `onRequireAuth`.
        nestedProfileUsername?.let { uname ->
            ProfileScreen(
                username = uname,
                isOverlay = true,
                onClose = { nestedProfileUsername = null },
                onRequireAuth = onRequireAuth,
                onOpenChallenge = onOpenChallenge,
            )
        }

        // Menú (☰, solo perfil propio) — panel de Ajustes. Se monta SIEMPRE
        // (no solo cuando menuOpen==true) para que la animación de SALIDA
        // (deslizar hacia la derecha) pueda reproducirse; la visibilidad real
        // la controla el parámetro `open` (ver ProfileMenu.kt). `isAdmin` viene
        // del rol de la sesión (backend ya lo incluye en el usuario, igual que
        // `user?.role === 'admin'` en ProfilePage.jsx).
        ProfileMenuSheet(
            open = menuOpen,
            onClose = { menuOpen = false },
            onLogout = { com.twyk.app.data.PushTokenManager.unregisterAndClearSession() },
            isAdmin = Session.user?.role == "admin",
        )
    }
    }
}

// Distancia de scroll (en dp) necesaria para colapsar del todo la barra
// superior y revelar el mini-perfil — equivalente al collapseDistRef web.
private const val COLLAPSE_DIST_DP = 180

// Barra superior FIJA (no se desplaza con el grid) — réplica del "barRef" de
// la web: siempre visible; al colapsar (progress 0→1) revela el mini-perfil
// (avatar+nombre) y la acción (Editar/Seguir), con fondo que se va opacando.
// NOTA (paridad con la web): en ProfilePage.jsx el fondo de la barra es SIEMPRE
// sólido (`bg-[#0a0a0b]`, sin depender del scroll); lo único que se revela
// progresivamente con el scroll es el CONTENIDO (nombre/avatar/acciones vía
// `style={{opacity:revealP}}`). Además el nombre está SIEMPRE a la izquierda
// (nunca centrado junto al avatar) y el avatar está SIEMPRE perfectamente
// centrado en la barra de forma independiente (`absolute left-1/2
// -translate-x-1/2`), y la altura de contenido es 44px (`h-11`), no 56dp.
@Composable
private fun CollapsedTopBar(
    progress: Float,
    profile: ProfileUser?,
    isOwn: Boolean,
    isOverlay: Boolean,
    following: Boolean,
    followBusy: Boolean,
    onClose: () -> Unit,
    onFollow: () -> Unit,
    onShare: () -> Unit,
    onEditProfile: () -> Unit,
    onOpenMenu: () -> Unit,
    onChallenge: () -> Unit,
) {
    val name = profile?.name?.takeIf { it.isNotBlank() } ?: profile?.username ?: "User"
    val actionsEnabled = progress > 0.5f

    // BUG reportado por el usuario ("los perfiles no respetan la barra de
    // estado del sistema como el feed"): el orden anterior de modificadores
    // era `.statusBarsPadding().height(44.dp).background(TwykBg)` — con
    // `background` APLICADO DESPUÉS del padding, el color solo pintaba la
    // franja de 44dp de contenido, dejando TRANSPARENTE la franja real de la
    // barra de estado (arriba de esa franja) -> el avatar grande del bloque
    // de perfil, al desplazarse hacia arriba con el scroll, se veía
    // "sangrando" por detrás/encima de los iconos del reloj/batería, en vez
    // de quedar oculto por un fondo sólido como pasa siempre en el feed. El
    // feed (`FeedPager`, VersusFeed.kt: `.background(Color.Black)
    // .statusBarsPadding()`) y el fix ya aplicado en Upload.kt/FileStep usan
    // el orden CONTRARIO: `background` ANTES de `statusBarsPadding`, así el
    // color pintado cubre el tamaño TOTAL (contenido + inset), incluida la
    // franja de la barra de estado; el padding solo empuja el CONTENIDO
    // hacia abajo, sin dejar ningún hueco transparente. FIX: mismo orden aquí.
    // BUG FIX ("en los perfiles, en el header, cuando toco un espacio vacío y
    // hay muchas publicaciones, al tap en un espacio vacío del header abre
    // una publicación del grid"): en Jetpack Compose, `Modifier.background()`
    // es PURAMENTE visual — a diferencia de la web (donde un <div> opaco
    // BLOQUEA los clics de lo que esté detrás salvo que se use pointer-events
    // explícitamente), un `Box`/`Row` con solo `background()` y SIN
    // `clickable`/`pointerInput` propio NO consume los toques: cualquier
    // toque que no caiga exactamente sobre un hijo con su propio `clickable`
    // (aquí: el botón de atrás/menú de 40dp, el Row del nombre, el Row de
    // acciones) SIGUE BAJANDO por el árbol hasta encontrar algo clicable más
    // abajo en el mismo punto de pantalla — que, al ser esta barra un OVERLAY
    // pintado ENCIMA del `LazyVerticalGrid`/`ProfileTabsBar` (ver el `Box`
    // exterior en `ProfileScreen`), es exactamente una publicación del grid
    // que esté posicionada justo debajo de ese punto tras hacer scroll. Zonas
    // "vacías" reales afectadas: el `Spacer(40.dp)` cuando no hay botón de
    // atrás (perfil propio), el hueco de 40dp del menú en perfil ajeno, el
    // propio avatar circular (sin `clickable`), y cualquier margen entre los
    // Row de nombre/acciones. FIX: `pointerInput(Unit) { detectTapGestures {} }`
    // en el `Box` exterior — consume CUALQUIER toque que llegue hasta aquí
    // (sin hacer nada), igual que ya se usa en VSContentCard (VersusFeed.kt)
    // para que tocar el fondo de la card no la cierre; los botones/Row hijos
    // con su propio `clickable` siguen recibiendo sus toques normalmente (Compose
    // resuelve el hit-test de dentro hacia fuera, así que un hijo clicable
    // consume el toque ANTES de que llegue a este `pointerInput` del padre).
    Box(
        Modifier.fillMaxWidth().background(TwykBg).statusBarsPadding().height(44.dp)
            .pointerInput(Unit) { detectTapGestures { } },
    ) {
        Row(
            Modifier.fillMaxSize().padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (isOverlay && !isOwn) {
                Box(Modifier.size(40.dp).clip(CircleShape).clickable { onClose() }, contentAlignment = Alignment.Center) {
                    Icon(ImageVector.vectorResource(R.drawable.ic_arrow_left), "back", tint = Color.White, modifier = Modifier.size(24.dp))
                }
            } else {
                Spacer(Modifier.size(40.dp))
            }

            // Nombre: SIEMPRE a la izquierda (mitad izquierda del espacio restante),
            // nunca centrado — igual que la web (`pl-2`, truncado antes del centro).
            Row(
                Modifier.weight(1f).graphicsLayer(alpha = progress).padding(start = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(name, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }

            // Acción (Editar+Compartir o Seguir/Retar): PEGADA a la esquina
            // derecha real de la barra (justo antes del icono de menú/hueco
            // de 40dp), NUNCA compartiendo espacio 50/50 con el nombre.
            // BUG reportado por el usuario ("en el perfil ajeno el botón de
            // reto y seguir se solapan, deben estar a la derecha en la
            // esquina"): con `weight(1f)` este bloque ocupaba la MITAD del
            // espacio restante (repartido igual que el nombre), así que su
            // ranura empezaba justo en el CENTRO horizontal de la barra —
            // exactamente donde también vive el avatar (`align(Center)`,
            // independiente de este Row) — quedando ambos MUY cerca o
            // solapados visualmente, en vez de claramente separados. FIX:
            // se quita `weight(1f)` (y por tanto ya no hace falta alinear a
            // `Alignment.End`, pues sin peso este Row mide su ANCHO REAL de
            // contenido) — así, al ser hijo de un Row donde el nombre SÍ
            // tiene `weight(1f)` (absorbe TODO el espacio restante), este
            // bloque de acciones queda automáticamente empujado a pegarse
            // justo contra el icono/hueco de 40dp del extremo derecho — la
            // esquina real de la barra, lejos del avatar central.
            Row(
                Modifier.graphicsLayer(alpha = progress),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (isOwn) {
                    MiniPill("Edit", filled = true, enabled = actionsEnabled, horizontalPadding = 16.dp, onClick = onEditProfile)
                    MiniIconButton(enabled = actionsEnabled, onClick = onShare) {
                        Icon(ImageVector.vectorResource(R.drawable.ic_share), null, tint = Color.White, modifier = Modifier.size(15.dp))
                    }
                } else {
                    MiniIconButton(enabled = actionsEnabled, onClick = onChallenge) {
                        Icon(ImageVector.vectorResource(R.drawable.ic_swords), null, tint = Color.White, modifier = Modifier.size(15.dp))
                    }
                    MiniPill(if (following) "Following" else "Follow", filled = !following, enabled = actionsEnabled && !followBusy, horizontalPadding = 20.dp, onClick = onFollow)
                }
            }

            // BUG reportado por el usuario ("el botón de reto y seguir sigue
            // solapando con el avatar, debe estar en la esquina derecha"):
            // el intento anterior (quitar `weight(1f)` de la fila de
            // acciones) NO cambiaba nada visualmente, porque esa fila YA
            // estaba alineada a la derecha (`Arrangement.End`) DENTRO de su
            // propio hueco -con o sin peso, su contenido terminaba en el
            // MISMO píxel, justo antes de este `Spacer(40.dp)`-. La causa
            // REAL es este hueco reservado de 40dp: existe para que el
            // NOMBRE quede perfectamente simétrico respecto al icono real
            // de menú (☰) del perfil PROPIO, pero en el perfil AJENO no hay
            // ningún icono aquí -es espacio vacío que le resta a los botones
            // de Reto/Seguir exactamente los 40dp que necesitarían para
            // alejarse del avatar central (siempre fijo en el medio de TODO
            // el ancho de la barra, `align(Alignment.Center)`, independiente
            // de este Row). FIX: se elimina este hueco SOLO cuando `!isOwn`
            // -el perfil propio conserva su icono de menú sin cambios- para
            // que la fila de acciones (Reto+Seguir) pueda extenderse hasta
            // el borde real de la barra (los 6dp de padding del Row), lejos
            // del avatar.
            if (isOwn) {
                Box(Modifier.size(40.dp).clip(CircleShape).clickable { onOpenMenu() }, contentAlignment = Alignment.Center) {
                    Icon(ImageVector.vectorResource(R.drawable.ic_menu), "menu", tint = Color.White, modifier = Modifier.size(24.dp))
                }
            }
        }

        // Avatar: SIEMPRE centrado en la barra, en posición ABSOLUTA e
        // independiente del ancho que ocupe el nombre o las acciones — igual
        // que la web (`absolute left-1/2 -translate-x-1/2`).
        Box(Modifier.align(Alignment.Center).graphicsLayer(alpha = progress)) {
            Box(Modifier.size(28.dp).clip(CircleShape).border(1.dp, Color.White.copy(alpha = 0.15f), CircleShape)) {
                TwykAvatar(profile?.avatarUrl, Modifier.fillMaxSize())
            }
        }
    }
}

@Composable
private fun MiniPill(text: String, filled: Boolean, enabled: Boolean, horizontalPadding: androidx.compose.ui.unit.Dp = 14.dp, onClick: () -> Unit) {
    Box(
        Modifier.height(28.dp).clip(RoundedCornerShape(50))
            .then(if (filled) Modifier.background(Color.White) else Modifier.border(1.dp, Color.White.copy(alpha = 0.2f), RoundedCornerShape(50)))
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = horizontalPadding),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = if (filled) Color.Black else Color.White, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
    }
}

@Composable
private fun MiniIconButton(enabled: Boolean, onClick: () -> Unit, content: @Composable () -> Unit) {
    Box(
        Modifier.size(28.dp).clip(CircleShape).border(1.dp, Color.White.copy(alpha = 0.2f), CircleShape)
            .clickable(enabled = enabled) { onClick() },
        contentAlignment = Alignment.Center,
    ) { content() }
}

@Composable
private fun ProfileHeaderSection(
    profile: ProfileUser?,
    isOwn: Boolean,
    votos: Int,
    retos: Int,
    followers: Int,
    following: Boolean,
    followBusy: Boolean,
    collapseProgress: Float,
    onBlockMeasured: (Int) -> Unit,
    onFollow: () -> Unit,
    onShare: () -> Unit,
    onEditProfile: () -> Unit,
    onOpenFollowList: (String) -> Unit,
    onChallenge: () -> Unit,
) {
    val name = profile?.name?.takeIf { it.isNotBlank() } ?: profile?.username ?: "User"
    val handle = "@" + (profile?.username ?: "user")

    Column(Modifier.fillMaxWidth().statusBarsPadding()) {
        // Espacio reservado para la barra superior FIJA (ver CollapsedTopBar,
        // renderizada como overlay encima del grid) — evita que el contenido
        // aparezca oculto detrás de ella al inicio. Altura 44dp = web h-11.
        Spacer(Modifier.height(44.dp))

        // Bloque de perfil (stats+avatar+nombre+bio+botones + hueco de 32dp
        // hasta las pestañas). Se DESVANECE, sube y se encoge al colapsar
        // (réplica de `opacity:1-p; translateY(-p*14) scale(1-p*0.04)` de la
        // web). Su ALTURA MEDIDA (onGloballyPositioned) es la distancia de
        // scroll para anclar las pestañas (graphicsLayer no altera la medida).
        Column(
            Modifier
                .fillMaxWidth()
                .onGloballyPositioned { onBlockMeasured(it.size.height) }
                .graphicsLayer {
                    alpha = 1f - collapseProgress
                    translationY = -collapseProgress * 14.dp.toPx()
                    val s = 1f - collapseProgress * 0.04f
                    scaleX = s
                    scaleY = s
                    transformOrigin = TransformOrigin(0.5f, 0f)
                },
        ) {
            // ── Stats alrededor del avatar (max-w-[360px] igual que la web) ──
            Box(
                Modifier.fillMaxWidth().widthIn(max = 360.dp).padding(horizontal = 20.dp).height(226.dp),
            ) {
                Row(Modifier.fillMaxWidth().align(Alignment.TopCenter), horizontalArrangement = Arrangement.SpaceBetween) {
                    StatItem(drawable = R.drawable.ic_vote, value = formatCount(votos), label = "Votes", iconSize = 36.dp)
                    StatItem(drawable = R.drawable.ic_swords, value = formatCount(retos), label = "Challenges", iconSize = 28.dp, alignEnd = true)
                }
                // Avatar centro (sin halo/degradado, igual que la web: círculo plano
                // con fondo zinc-900 y sombra sutil).
                Box(
                    Modifier.align(Alignment.Center).size(104.dp).clip(CircleShape).background(Color(0xFF18181B)),
                ) {
                    TwykAvatar(profile?.avatarUrl, Modifier.fillMaxSize())
                }
                Row(Modifier.fillMaxWidth().align(Alignment.BottomCenter), horizontalArrangement = Arrangement.SpaceBetween) {
                    StatItem(drawable = R.drawable.ic_users, value = formatCount(followers), label = "Followers", iconSize = 28.dp, onClick = { onOpenFollowList("followers") })
                    StatItem(drawable = R.drawable.ic_user_plus, value = formatCount(profile?.following ?: 0), label = "Following", iconSize = 28.dp, alignEnd = true, onClick = { onOpenFollowList("following") })
                }
            }

            // ── Nombre + handle + bio (web: mt-6=24dp antes del nombre) ──
            Spacer(Modifier.height(24.dp))
            Text(name, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 20.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            Spacer(Modifier.height(2.dp))
            Text(handle, color = ZincText, fontSize = 13.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
            val bio = profile?.bio?.trim().orEmpty()
            if (bio.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    bio,
                    color = Color(0xFFD4D4D8),
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().widthIn(max = 300.dp).padding(horizontal = 24.dp),
                )
            }

            // ── Botones (web: mt-5=20dp antes; Follow=px-7=28dp, resto=px-6=24dp) ──
            Spacer(Modifier.height(20.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                if (isOwn) {
                    PillButton("Edit profile", filled = true, onClick = onEditProfile)
                    Spacer(Modifier.width(8.dp))
                    PillButton("Share", filled = false, onClick = onShare)
                } else {
                    PillButton(if (following) "Following" else "Follow", filled = !following, enabled = !followBusy, horizontalPadding = 28.dp, onClick = onFollow)
                    Spacer(Modifier.width(8.dp))
                    PillButton("Challenge", filled = false, leadingDrawable = R.drawable.ic_swords, onClick = onChallenge)
                }
            }

            // Hueco hasta las pestañas (web mb-7(28)+pt-1(4)=32dp) — se incluye
            // en la medición del bloque para que la distancia de colapso llegue
            // EXACTAMENTE hasta la banda de pestañas.
            Spacer(Modifier.height(32.dp))
        }

        // Hueco RESERVADO para la banda de pestañas STICKY (32dp = web h-8), que
        // se pinta como overlay en ProfileScreen (ProfileTabsBar). Debajo, el
        // hueco hasta el contenido (web pb-2.5(10)+mt-4(16)=26dp).
        Spacer(Modifier.height(32.dp))
        Spacer(Modifier.height(26.dp))
    }
}

// Banda de pestañas STICKY del perfil — se pinta como overlay en ProfileScreen
// con un offset vertical que baja con el scroll hasta anclarse bajo la barra
// superior (réplica de las tabs `position: sticky` de ProfilePage.jsx). Fondo
// sólido TwykBg para que el contenido del grid pase POR DETRÁS al hacer scroll.
@Composable
private fun ProfileTabsBar(
    activeTab: String,
    isOwn: Boolean,
    onTab: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tabs = if (isOwn) listOf("polls", "saved") else listOf("polls")
    // BUG FIX (misma causa raíz que CollapsedTopBar, ver su comentario
    // completo): el hueco entre "Polls"/"Saved" (`spacedBy(10.dp)`) y el
    // padding horizontal de 8dp de este Row NO tienen su propio `clickable`
    // — solo lo tienen los 2 `Box` individuales de cada pestaña — así que un
    // toque en ese hueco/padding pasaba directo al `LazyVerticalGrid` de
    // debajo (esta barra es un overlay con `background(TwykBg)`, que en
    // Compose NO bloquea toques por sí solo). `pointerInput` consume
    // cualquier toque que no haya sido ya capturado por un `clickable` hijo.
    Row(
        modifier
            .fillMaxWidth()
            .background(TwykBg)
            .pointerInput(Unit) { detectTapGestures { } }
            .padding(horizontal = 8.dp)
            .height(32.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        tabs.forEach { key ->
            val active = activeTab == key
            // `scale-105`/`scale-100` de la web (TABS[].icon, ProfilePage.jsx) —
            // el icono de la pestaña activa crece ligeramente (5%), animado;
            // faltaba por completo en el nativo, haciendo que el estado activo
            // se notara MENOS (solo el color/borde cambiaban).
            val iconScale by animateFloatAsState(if (active) 1.05f else 1f, label = "tabIconScale")
            Box(
                Modifier.weight(1f).height(32.dp).clip(RoundedCornerShape(8.dp))
                    .then(
                        if (active) Modifier.background(Color.Transparent).border(1.dp, Color.White, RoundedCornerShape(8.dp))
                        else Modifier.background(Color.Black).border(1.dp, Color.White.copy(alpha = 0.07f), RoundedCornerShape(8.dp)),
                    )
                    .clickable { onTab(key) },
                contentAlignment = Alignment.Center,
            ) {
                // Color explícito por rama (sin variable compartida) — misma
                // regla en ambos casos (blanco si `active`, gris `ZincText` si
                // no), réplica exacta de `text-white`/`text-zinc-400` en el
                // <button> de la web (ambos iconos heredan ese color vía
                // `currentColor`, ver TABS[].icon en ProfilePage.jsx).
                when (key) {
                    "polls" -> ColumnsIcon(
                        Modifier.size(18.dp).graphicsLayer(scaleX = iconScale, scaleY = iconScale),
                        if (active) Color.White else ZincText,
                        // Pestaña activa: los 6 rectángulos RELLENOS de
                        // blanco (petición del usuario: igual que Saved,
                        // que pasa a ic_bookmark_filled al seleccionarse).
                        filled = active,
                    )
                    else -> Icon(
                        ImageVector.vectorResource(if (active) R.drawable.ic_bookmark_filled else R.drawable.ic_bookmark),
                        null,
                        tint = if (active) Color.White else ZincText,
                        modifier = Modifier.size(18.dp).graphicsLayer(scaleX = iconScale, scaleY = iconScale),
                    )
                }
            }
        }
    }
}


@Composable
private fun StatItem(
    value: String,
    label: String,
    iconSize: androidx.compose.ui.unit.Dp,
    alignEnd: Boolean = false,
    icon: ImageVector? = null,
    drawable: Int? = null,
    onClick: (() -> Unit)? = null,
) {
    val iconSlot: @Composable () -> Unit = {
        when {
            drawable != null -> Icon(ImageVector.vectorResource(drawable), null, tint = Color.White, modifier = Modifier.size(iconSize))
            icon != null -> Icon(icon, null, tint = Color.White, modifier = Modifier.size(iconSize))
        }
    }
    val textSlot: @Composable () -> Unit = {
        Column(horizontalAlignment = if (alignEnd) Alignment.End else Alignment.Start) {
            Text(value, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
            Spacer(Modifier.height(2.dp))
            Text(label, color = ZincText, fontSize = 11.sp, fontWeight = FontWeight.Medium)
        }
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = if (onClick != null) Modifier.clickable { onClick() } else Modifier,
    ) {
        if (alignEnd) { textSlot(); iconSlot() } else { iconSlot(); textSlot() }
    }
}

@Composable
private fun PillButton(
    text: String,
    filled: Boolean,
    enabled: Boolean = true,
    leadingDrawable: Int? = null,
    horizontalPadding: androidx.compose.ui.unit.Dp = 24.dp,
    onClick: () -> Unit,
) {
    Row(
        Modifier.height(36.dp).clip(RoundedCornerShape(50))
            .then(if (filled) Modifier.background(Color.White) else Modifier.border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(50)))
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = horizontalPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        leadingDrawable?.let {
            Icon(ImageVector.vectorResource(it), null, tint = if (filled) Color.Black else Color.White, modifier = Modifier.size(15.dp))
        }
        Text(text, color = if (filled) Color.Black else Color.White, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
    }
}

// BUG reportado por el usuario, dos intentos previos sin solucionarlo del
// todo ("la info que aparece cuando no hay publicación... cuando deslizo se
// recorta, ocurre tanto en polls como en saved"): ya no se mide la altura
// real de este composable (`onGloballyPositioned` con un valor por defecto
// mientras llegaba la medida real, con ventana de carrera — ver comentario
// detallado en `availableContentAreaPx` en ProfileScreen). Ahora recibe
// directamente `minHeightPx` (mismo valor 100% determinista usado para el
// relleno cuando SÍ hay publicaciones) y se lo aplica como alto MÍNIMO
// propio — así este estado vacío ocupa por sí mismo exactamente el espacio
// disponible tras la barra/pestañas, garantizando que nunca quede recortado
// sin depender de ninguna medida que pueda llegar tarde.
@Composable
private fun EmptyTab(title: String, desc: String, bookmark: Boolean = false, minHeightPx: Float = 0f) {
    val minHeightDp = with(LocalDensity.current) { minHeightPx.toDp() }
    Column(
        Modifier.fillMaxWidth().heightIn(min = minHeightDp).padding(vertical = 64.dp, horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(64.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.04f))
                .border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (bookmark) {
                Icon(ImageVector.vectorResource(R.drawable.ic_bookmark), null, tint = Color(0xFF71717A), modifier = Modifier.size(28.dp))
            } else {
                ColumnsIcon(Modifier.size(28.dp), Color(0xFF71717A))
            }
        }
        Spacer(Modifier.height(16.dp))
        Text(title, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        Spacer(Modifier.height(4.dp))
        Text(desc, color = Color(0xFF71717A), fontSize = 14.sp)
    }
}

@Composable
private fun UploadPlaceholderItem(item: UploadQueueItem, onDismiss: () -> Unit) {
    Box(
        Modifier.padding(2.dp).fillMaxWidth().aspectRatio(9f / 16f)
            .clip(RoundedCornerShape(8.dp))
            .background(Color.White.copy(alpha = 0.04f))
            .border(1.dp, Color.White.copy(alpha = 0.05f), RoundedCornerShape(8.dp))
            .then(if (item.failed) Modifier.clickable { onDismiss() } else Modifier),
    ) {
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.40f)), contentAlignment = Alignment.Center) {
            if (item.failed) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(ImageVector.vectorResource(R.drawable.ic_alert_circle), null, tint = Color(0xFFFB7185), modifier = Modifier.size(24.dp))
                    Text(
                        "Upload failed", color = Color(0xFFFDA4AF), fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 10.dp),
                    )
                }
            } else {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
                    Spacer(Modifier.height(6.dp))
                    Text("${item.progress}%", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun ProfileGridItem(post: Post, onClick: () -> Unit) {
    val isDuet = post.type == "duet" && post.sideA?.videoUrl != null && post.sideB?.videoUrl != null
    val isRow = post.layout == "vertical"
    val totalVotes = (post.votes?.a ?: 0) + (post.votes?.b ?: 0)
    val views = post.stats?.views ?: 0
    // Estado del desenfoque de fondo de la píldora de votos (ver hazeSource/
    // hazeEffect más abajo) — réplica de `backdrop-blur-sm` de la web. Uno
    // por miniatura (cada Box de esta función es una miniatura independiente).
    val hazeState = rememberHazeState()

    Box(
        Modifier.padding(2.dp).fillMaxWidth().aspectRatio(9f / 16f)
            .clip(RoundedCornerShape(8.dp))
            .background(Color.White.copy(alpha = 0.04f))
            .border(1.dp, Color.White.copy(alpha = 0.05f), RoundedCornerShape(8.dp))
            .clickable { onClick() },
    ) {
        // Contenido "de fondo" (vídeo/imagen + overlay oscuro), marcado como
        // FUENTE del desenfoque (`hazeSource`) — la píldora de votos, más
        // abajo, muestra una versión difuminada de ESTO MISMO detrás de
        // ella (`hazeEffect`), igual que `backdrop-filter: blur()` en CSS
        // (que difumina lo que hay DETRÁS del elemento, no el elemento en
        // sí — Modifier.blur() normal de Compose no sirve para esto, blurea
        // el propio contenido, no lo de atrás).
        Box(Modifier.fillMaxSize().hazeSource(state = hazeState)) {
            if (isDuet) {
                val a = absoluteUrl(post.sideA?.posterUrl)
                val b = absoluteUrl(post.sideB?.posterUrl)
                if (isRow) {
                    Row(Modifier.fillMaxSize()) {
                        GridHalf(a, Modifier.weight(1f).fillMaxHeight())
                        Spacer(Modifier.width(1.5.dp))
                        GridHalf(b, Modifier.weight(1f).fillMaxHeight())
                    }
                } else {
                    Column(Modifier.fillMaxSize()) {
                        GridHalf(a, Modifier.weight(1f).fillMaxWidth())
                        Spacer(Modifier.height(1.5.dp))
                        GridHalf(b, Modifier.weight(1f).fillMaxWidth())
                    }
                }
            } else {
                val thumb = absoluteUrl(post.posterUrl ?: post.thumbnailUrl ?: post.sideA?.posterUrl ?: post.sideB?.posterUrl)
                if (thumb != null) {
                    AsyncImage(model = thumb, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                } else {
                    Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF374151), Color(0xFF111827)))))
                }
            }

            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.20f)))
        }

        if (totalVotes > 0 || views > 0) {
            // RÉPLICA EXACTA de la web (usuario: "aplícalo tal cual está en
            // la web") — components/ProfilePage.jsx, GridItem: contenedor
            // `bottom-1 left-1 flex-col gap-1` (4dp margen, columna, 4dp
            // separación entre píldoras); cada píldora `bg-black/55
            // backdrop-blur-sm px-1.5 py-[2px] rounded-full text-[11px]`
            // (vía hazeEffect, ver comentario más abajo). Votos ARRIBA,
            // reproducciones DEBAJO — en perfil propio Y ajeno.
            Column(
                Modifier.align(Alignment.BottomStart).padding(4.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                if (totalVotes > 0) {
                    Row(
                        Modifier.clip(RoundedCornerShape(50))
                            .hazeEffect(
                                state = hazeState,
                                style = HazeStyle(
                                    blurRadius = 4.dp,
                                    tints = listOf(HazeTint(Color.Black.copy(alpha = 0.55f))),
                                    noiseFactor = 0f,
                                    fallbackTint = HazeTint(Color.Black.copy(alpha = 0.55f)),
                                ),
                            )
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        // ic_vote_thin (strokeWidth 150) a 16dp — réplica de
                        // VoteIcon.jsx w-4 h-4 strokeWidth={380} (web, tras
                        // igualarlo con el nuevo icono de reproducciones); el
                        // sistema de trazo de este vector nativo no es 1:1
                        // comparable al de la web, aproximación visual.
                        Icon(ImageVector.vectorResource(R.drawable.ic_vote_thin), null, tint = Color.White, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(formatCount(totalVotes), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Normal)
                    }
                }
                if (views > 0) {
                    Row(
                        Modifier.clip(RoundedCornerShape(50))
                            .hazeEffect(
                                state = hazeState,
                                style = HazeStyle(
                                    blurRadius = 4.dp,
                                    tints = listOf(HazeTint(Color.Black.copy(alpha = 0.55f))),
                                    noiseFactor = 0f,
                                    fallbackTint = HazeTint(Color.Black.copy(alpha = 0.55f)),
                                ),
                            )
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        // Icono de trazo hueco (outline), NO relleno — réplica de
                        // `<Play fill="none" stroke="white" strokeWidth={2}/>` (web).
                        Icon(Icons.Outlined.PlayArrow, null, tint = Color.White, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(formatCount(views), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Normal)
                    }
                }
            }
        }
    }
}

@Composable
private fun GridHalf(poster: String?, modifier: Modifier) {
    Box(modifier.background(Color(0xFF1F2937))) {
        if (poster != null) {
            AsyncImage(model = poster, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
    }
}
