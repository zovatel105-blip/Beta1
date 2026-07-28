package com.twyk.app

import android.graphics.Color as AndroidColor
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import coil.compose.AsyncImage
import com.twyk.app.feed.VersusFeed
import com.twyk.app.ui.AuthSheet
import com.twyk.app.ui.BattlesScreen
import com.twyk.app.ui.CommentsSheet
import com.twyk.app.ui.ConsentGate
import com.twyk.app.ui.InboxScreen
import com.twyk.app.ui.ProfileScreen
import com.twyk.app.ui.SearchScreen
import com.twyk.app.ui.UploadScreen
import kotlinx.coroutines.delay

// Twyk Android — app NATIVA (Jetpack Compose + Media3/ExoPlayer).
// El feed se adapta al formato de cada publicación; la barra inferior navega
// entre secciones. La barra de estado queda intacta y el vídeo se ve por detrás.
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Restaura la sesión guardada (token + usuario) -> sobrevive al cerrar la app.
        com.twyk.app.data.Session.init(applicationContext)
        // Restaura tu voto por publicación (SharedPreferences) -> réplica de
        // localStorage en la web: si ya votaste un post, sigue mostrándose
        // como votado (icono relleno, borde, aviso) al reabrir la app o al
        // volver a esa tarjeta tras alejarte mucho en el scroll.
        com.twyk.app.data.VoteStore.init(applicationContext)
        // Contadores sociales por publicación (guardados/retos) persistidos —
        // ver data/SocialCountStore.kt.
        com.twyk.app.data.SocialCountStore.init(applicationContext)

        // Edge-to-edge: el contenido se dibuja detrás de las barras del sistema.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = AndroidColor.TRANSPARENT
        window.navigationBarColor = AndroidColor.TRANSPARENT
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                TwykApp()
            }
        }
    }

    // BUG reportado por el usuario ("cuando cierro la aplicación y la
    // mantengo en segundo plano... el audio sigue reproduciéndose"): único
    // punto donde se actualiza `AppLifecycle.inForeground` (ver
    // data/AppLifecycle.kt) — onStop() se dispara al enviar la app a
    // segundo plano (Home, cambiar de app, apagar pantalla) y onStart() al
    // volver a traerla al frente; MainActivity es la ÚNICA Activity de la
    // app, así que esto equivale exactamente a "visibilitychange" en una SPA
    // de una sola pestaña.
    override fun onStop() {
        super.onStop()
        com.twyk.app.data.AppLifecycle.inForeground = false
    }

    override fun onStart() {
        super.onStart()
        com.twyk.app.data.AppLifecycle.inForeground = true
    }
}

private enum class Tab {
    Home, Battles, Upload, Inbox, Profile,
}

@Composable
private fun TwykApp() {
    var tab by remember { mutableStateOf(Tab.Home) }
    var commentsPostId by remember { mutableStateOf<String?>(null) }
    // Voto ACTUAL del usuario sobre esa publicación en el momento de abrir el
    // modal (réplica de votedSide={userVote} que CarouselSlide.jsx/DuetSlide.jsx
    // pasan a <CommentsModal>): se usa para el punto de color de tus propios
    // comentarios y para etiquetar los comentarios nuevos con tu voto actual.
    var commentsVotedSide by remember { mutableStateOf<String?>(null) }
    var authOpen by remember { mutableStateOf(false) }
    var profileUsername by remember { mutableStateOf<String?>(null) }
    var feedReloadKey by remember { mutableStateOf(0) }
    var searchOpen by remember { mutableStateOf(false) } // buscador de usuarios (lupa del feed)
    var quickChallengeTarget by remember { mutableStateOf<com.twyk.app.data.QuickChallengeTarget?>(null) } // "Retar rápido" a una publicación
    // Barra de navegación inferior visible SOLO en la pestaña "Completados"
    // dentro de Batallas (BattlesScreen la reporta vía onShowNavChange).
    var battlesShowNav by remember { mutableStateOf(true) }
    // Globos rojos de la barra inferior (Battle = retos pendientes por responder,
    // Inbox = notificaciones no leídas) — réplica de BottomNav.jsx (que hace
    // polling de /api/notifications/unread cada 30s) y de refreshChallenges()
    // en Feed.jsx (GET /api/challenges, rol 'to' por defecto = dirigidos a mí).
    var unreadCount by remember { mutableStateOf(0) }
    var pendingChallengesCount by remember { mutableStateOf(0) }
    suspend fun refreshBadges() {
        if (com.twyk.app.data.Session.token == null) { unreadCount = 0; pendingChallengesCount = 0; return }
        runCatching { com.twyk.app.data.RetrofitProvider.api.unreadNotificationsCount() }.getOrNull()?.let { unreadCount = it.count }
        runCatching { com.twyk.app.data.RetrofitProvider.api.challenges() }.getOrNull()?.let { pendingChallengesCount = it.challenges?.size ?: 0 }
    }
    // Vuelve a arrancar (con una lectura inmediata) cada vez que cambia la
    // sesión (login/logout), y repite cada 30s mientras se mantenga igual.
    LaunchedEffect(com.twyk.app.data.Session.token) {
        while (true) {
            refreshBadges()
            delay(30_000)
        }
    }
    // Recalcula también tras eventos que cambian los retos pendientes (aceptar/
    // rechazar uno, terminar de enviar uno) — mismos eventos que ya disparan
    // feedReloadKey en el resto de la app.
    LaunchedEffect(feedReloadKey) { refreshBadges() }
    // Tocar TU propio autor abre tu perfil propio (no la vista de perfil ajeno).
    val openProfile: (String) -> Unit = { uname ->
        if (uname == com.twyk.app.data.Session.user?.username) tab = Tab.Profile
        else profileUsername = uname
    }
    // No puedes retarte a ti mismo (igual que la web: se ignora en silencio).
    val onChallenge: (com.twyk.app.data.QuickChallengeTarget) -> Unit = { target ->
        val authorUsername = target.author?.username
        if (authorUsername != null && authorUsername != com.twyk.app.data.Session.user?.username) {
            quickChallengeTarget = target
        }
    }

    // Réplica EXACTA de qué páginas muestran la barra de navegación inferior
    // en la web: Feed.jsx pinta <BottomNav> SIEMPRE, pero cada pantalla que
    // se abre ENCIMA la tapa o no según su z-index/si tiene su propia copia:
    //   · Inicio, Perfil (propio o ajeno), Batallas > Completados -> VISIBLE
    //     (ProfilePage.jsx usa z-40, por debajo del z-50 de BottomNav;
    //     CompletedBattlesPage.jsx tiene su PROPIA <BottomNav>).
    //   · Subir, Buzón, Batallas > Activos, Buscador -> OCULTA
    //     (UploadDialog.jsx/NotificationsInbox.jsx/ActiveChallengesPage.jsx/
    //     SearchOverlay.jsx usan z-index > 50 y NO tienen <BottomNav> propia).
    // Antes la app nativa mostraba la barra SIEMPRE, en cualquier pantalla.
    val showBottomNav = when {
        searchOpen -> false
        com.twyk.app.data.FullScreenOverlays.editProfileOpen -> false
        com.twyk.app.data.FullScreenOverlays.profileViewerOpen -> false
        com.twyk.app.data.FullScreenOverlays.settingsOpen -> false
        profileUsername != null -> true
        tab == Tab.Upload -> false
        tab == Tab.Inbox -> false
        tab == Tab.Battles -> battlesShowNav
        else -> true // Tab.Home, Tab.Profile
    }

    // Al abrir la app con una sesión guardada, refresca el usuario desde el
    // backend (no solo la copia local en disco) — así, si `termsAccepted` (o
    // el avatar/nombre) cambió desde otro dispositivo o la web, el modal de
    // Términos (ConsentGate, más abajo) decide con el dato REAL, no uno
    // desactualizado.
    LaunchedEffect(Unit) {
        if (com.twyk.app.data.Session.token != null) {
            val me = runCatching { com.twyk.app.data.RetrofitProvider.api.me() }.getOrNull()
            me?.user?.let { com.twyk.app.data.Session.set(com.twyk.app.data.Session.token, it) }
        }
    }
    // BUG REPORTADO: el gesto/botón "Atrás" (edge swipe back) cerraba la app
    // POR COMPLETO en cualquier pantalla en vez de volver atrás, porque NINGÚN
    // estado de este nivel (pestaña activa, perfil ajeno, comentarios, login,
    // buscador, reto rápido, hojas del feed) tenía un BackHandler registrado
    // -> el gesto caía siempre en el comportamiento por defecto de la Activity
    // (finish = cerrar la app), incluso estando en Batallas/Subir/Buzón/Perfil
    // o con cualquier hoja abierta. FIX: un único BackHandler que resuelve en
    // orden de PRIORIDAD (lo más "encima" primero, igual que el equivalente
    // web useBackableOverlay de Feed.jsx) qué cerrar. AJUSTE (pedido explícito
    // del usuario): estando en Inicio sin nada abierto, la app NO debe
    // cerrarse con una sola pulsación/gesto — solo debe cerrarse si se hace
    // "Atrás" DOS VECES SEGUIDAS (patrón estándar de Android "pulsa Atrás de
    // nuevo para salir"), por eso `enabled` ahora es SIEMPRE `true` (antes se
    // desactivaba en Inicio para dejar pasar el cierre por defecto tras 1
    // sola pulsación) y el propio BackHandler gestiona el temporizador.
    val context = androidx.compose.ui.platform.LocalContext.current
    var lastBackPressAt by remember { mutableStateOf(0L) }
    BackHandler(enabled = true) {
        when {
            authOpen -> authOpen = false
            quickChallengeTarget != null -> quickChallengeTarget = null
            com.twyk.app.data.FeedOverlays.contentCard != null -> com.twyk.app.data.FeedOverlays.contentCard?.onClose?.invoke()
            com.twyk.app.data.FeedOverlays.winner != null -> com.twyk.app.data.FeedOverlays.winner?.onClose?.invoke()
            com.twyk.app.data.FeedOverlays.share != null -> com.twyk.app.data.FeedOverlays.closeShare()
            com.twyk.app.data.FeedOverlays.moreOptions != null -> com.twyk.app.data.FeedOverlays.closeMoreOptions()
            commentsPostId != null -> { commentsPostId = null; commentsVotedSide = null }
            searchOpen -> searchOpen = false
            profileUsername != null -> profileUsername = null
            tab != Tab.Home -> tab = Tab.Home
            else -> {
                // En Inicio sin nada abierto: solo cierra la app si esta
                // pulsación llega dentro de los 2s siguientes a la anterior;
                // si no, solo avisa (Toast) y arranca/reinicia el plazo.
                val now = android.os.SystemClock.elapsedRealtime()
                if (now - lastBackPressAt < 2000L) {
                    (context as? android.app.Activity)?.finish()
                } else {
                    lastBackPressAt = now
                    android.widget.Toast.makeText(context, "Press back again to exit", android.widget.Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        when (tab) {
            Tab.Home -> key(feedReloadKey) {
                VersusFeed(
                    onOpenComments = { id, side -> commentsPostId = id; commentsVotedSide = side },
                    onRequireAuth = { authOpen = true },
                    onOpenProfile = openProfile,
                    onChallenge = onChallenge,
                )
            }
            Tab.Upload -> UploadScreen(
                onRequireAuth = { authOpen = true },
                onDone = { feedReloadKey++; tab = Tab.Home },
            )
            Tab.Profile -> ProfileScreen(
                username = null,
                isOverlay = false,
                onClose = {},
                onRequireAuth = { authOpen = true },
                onOpenChallenge = onChallenge,
            )
            Tab.Inbox -> InboxScreen(
                onRequireAuth = { authOpen = true },
                onAccepted = { feedReloadKey++ },
                onBack = { tab = Tab.Home },
            )
            Tab.Battles -> BattlesScreen(
                onRequireAuth = { authOpen = true },
                onChanged = { feedReloadKey++ },
                onOpenComments = { id, side -> commentsPostId = id; commentsVotedSide = side },
                onOpenProfile = openProfile,
                onOpenUpload = { tab = Tab.Upload },
                onChallenge = onChallenge,
                onShowNavChange = { battlesShowNav = it },
            )
        }
        // Buscador de usuarios: lupa fija arriba a la derecha (solo en Inicio,
        // igual que la web).
        if (tab == Tab.Home) {
            Box(
                Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(top = 4.dp, end = 12.dp)
                    .size(36.dp).clickable { searchOpen = true },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Search, "Buscar usuarios", tint = Color.White, modifier = Modifier.size(24.dp))
            }
        }
        if (showBottomNav) {
            TwykBottomNav(
                current = tab,
                onSelect = {
                    // Al abrir Inbox, el globo se descuenta al instante (igual que
                    // handleInboxClick en BottomNav.jsx: reset optimista, sin
                    // esperar a que el usuario marque cada notificación leída).
                    if (it == Tab.Inbox) unreadCount = 0
                    tab = it
                },
                unreadCount = unreadCount,
                pendingChallengesCount = pendingChallengesCount,
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
        // Perfil ajeno (al tocar un autor en el feed) como overlay sobre todo.
        profileUsername?.let { uname ->
            ProfileScreen(
                username = uname,
                isOverlay = true,
                onClose = { profileUsername = null },
                onRequireAuth = { authOpen = true },
                onOpenChallenge = onChallenge,
            )
        }
        // Hojas por encima de la barra de navegación.
        commentsPostId?.let { pid ->
            CommentsSheet(
                postId = pid,
                votedSide = commentsVotedSide,
                onClose = { commentsPostId = null; commentsVotedSide = null },
                onRequireAuth = { authOpen = true },
            )
        }
        // Overlays "modales" del FEED (Más opciones ⋮ / Compartir / tarjeta de
        // Ganador tras votar) — se piden desde SocialRail/CarouselPage/
        // DuetPage (feed/VersusFeed.kt) a través del singleton FeedOverlays en
        // vez de renderizarse ahí mismo, PRECISAMENTE para que se dibujen aquí
        // (como hermanos DESPUÉS de TwykBottomNav en este mismo Box) y así
        // queden por encima de la barra de navegación inferior — antes, al
        // estar anidados varios niveles dentro del feed (una rama ANTERIOR de
        // este Box), la barra siempre los tapaba por debajo, sin importar
        // cuán "encima" pareciera estar el modal en su propio árbol. Aplica a
        // cualquier pantalla que reutilice el feed nativo (Inicio, Battles >
        // Completados, el visor de publicaciones del propio perfil), igual
        // que CommentsSheet/AuthSheet ya funcionaban correctamente por estar
        // también declarados aquí.
        com.twyk.app.data.FeedOverlays.moreOptions?.let { req ->
            com.twyk.app.feed.MoreOptionsSheet(
                postId = req.postId,
                targetUsername = req.targetUsername,
                isOwnPost = req.isOwnPost,
                onClose = { com.twyk.app.data.FeedOverlays.closeMoreOptions() },
                onRequireAuth = { authOpen = true },
            )
        }
        com.twyk.app.data.FeedOverlays.share?.let { pid ->
            com.twyk.app.ui.ShareSheet(postId = pid, onClose = { com.twyk.app.data.FeedOverlays.closeShare() })
        }
        com.twyk.app.data.FeedOverlays.winner?.let { w ->
            com.twyk.app.feed.VoteResultOverlay(
                votedSide = w.votedSide,
                chosenSide = w.chosenSide,
                otherSide = w.otherSide,
                votes = w.votes,
                onClose = w.onClose,
                onShare = w.onShare,
                onComments = w.onComments,
                onNext = w.onNext,
            )
        }
        // Content card (long-press en un 1vs1) — se pide desde DuetPage vía el
        // singleton FeedOverlays para pintarse aquí, por encima de la barra de
        // navegación inferior (igual que Ganador/Compartir).
        com.twyk.app.data.FeedOverlays.contentCard?.let { c ->
            com.twyk.app.feed.VSContentCard(
                optionA = c.optionA,
                optionB = c.optionB,
                initialIndex = c.initialIndex,
                onClose = c.onClose,
            )
        }
        if (authOpen) {
            AuthSheet(onClose = { authOpen = false }, onAuthed = { authOpen = false })
        }
        if (searchOpen) {
            SearchScreen(
                onClose = { searchOpen = false },
                onOpenProfile = { uname -> searchOpen = false; openProfile(uname) },
            )
        }
        quickChallengeTarget?.let { target ->
            com.twyk.app.ui.QuickChallengeSheet(target = target, onClose = { quickChallengeTarget = null })
        }
        // Banner de reto enviándose en segundo plano (visible sobre cualquier pestaña).
        com.twyk.app.ui.ChallengeBannerHost()
        // Modal de Términos y Condiciones (bloqueante, ver ui/Consent.kt) — se
        // dibuja al final para quedar SIEMPRE por encima de todo lo demás.
        ConsentGate()
    }
}

@Composable
private fun TwykBottomNav(
    current: Tab,
    onSelect: (Tab) -> Unit,
    unreadCount: Int = 0,
    pendingChallengesCount: Int = 0,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
            .background(Color.Black)
            .navigationBarsPadding()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceAround,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Inicio — relleno al estar activo (igual que la web).
        NavIcon(
            icon = ImageVector.vectorResource(if (current == Tab.Home) R.drawable.ic_home_filled else R.drawable.ic_home),
            selected = current == Tab.Home,
        ) { onSelect(Tab.Home) }

        // Batallas — espadas cruzadas (icono de la web) + globo con el número
        // de retos pendientes por responder (réplica de challengesCount en
        // BottomNav.jsx).
        NavIcon(
            icon = ImageVector.vectorResource(R.drawable.ic_swords),
            selected = current == Tab.Battles,
            badgeCount = pendingChallengesCount,
        ) { onSelect(Tab.Battles) }

        // Crear / Subir — borde con degradado lila → azul. Tamaño 36dp con
        // icono de 20dp para replicar EXACTAMENTE la web (BottomNav.jsx:
        // `w-9 h-9` = 36px con Plus `w-5 h-5` = 20px). Antes era 38dp/22dp,
        // desalineando el botón respecto al resto de iconos (20dp).
        Box(
            Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(12.dp))
                .border(
                    width = 2.dp,
                    brush = Brush.linearGradient(listOf(Color(0xFFA855F7), Color(0xFF3B82F6))),
                    shape = RoundedCornerShape(12.dp),
                )
                .clickable { onSelect(Tab.Upload) },
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Add, contentDescription = "Subir", tint = Color.White, modifier = Modifier.size(20.dp))
        }

        // Buzón + globo con notificaciones no leídas (réplica de
        // notificationsCount en BottomNav.jsx).
        NavIcon(
            icon = ImageVector.vectorResource(R.drawable.ic_inbox),
            selected = current == Tab.Inbox,
            badgeCount = unreadCount,
        ) { onSelect(Tab.Inbox) }

        // Perfil — muestra el avatar REAL si hay sesión (foto subida o silueta
        // gris por defecto), igual que la web; icono genérico solo de invitado.
        // Antes SIEMPRE mostraba el icono genérico, incluso con sesión iniciada.
        ProfileNavIcon(selected = current == Tab.Profile) { onSelect(Tab.Profile) }
    }
}

@Composable
private fun ProfileNavIcon(selected: Boolean, onClick: () -> Unit) {
    val user = com.twyk.app.data.Session.user
    Box(
        Modifier.size(36.dp).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (user != null) {
            val abs = absoluteUrl(user.avatarUrl)
            // Igual que <Avatar>/DefaultAvatar en la web: solo se muestra la
            // imagen real si NO es un avatar autogenerado (dicebear/pravatar).
            val generated = user.avatarUrl.isNullOrBlank() || user.avatarUrl.contains("dicebear") || user.avatarUrl.contains("pravatar")
            if (abs != null && !generated) {
                AsyncImage(
                    model = abs,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(23.dp).clip(CircleShape).background(Color(0xFF18181B))
                        .border(1.dp, Color.White.copy(alpha = 0.2f), CircleShape),
                )
            } else {
                Image(
                    imageVector = ImageVector.vectorResource(R.drawable.ic_avatar_default),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(23.dp).clip(CircleShape),
                )
            }
        } else {
            Icon(
                ImageVector.vectorResource(R.drawable.ic_user),
                contentDescription = null,
                tint = if (selected) Color.White else Color.White.copy(alpha = 0.5f),
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
private fun NavIcon(icon: ImageVector, selected: Boolean, badgeCount: Int = 0, onClick: () -> Unit) {
    Box(
        Modifier.size(36.dp).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        // Envoltorio del tamaño EXACTO del glifo (20dp = w-5 h-5 de la web).
        // Antes era 24dp, lo que hacía que los iconos se vieran DEMASIADO
        // grandes respecto al avatar de perfil (23dp), invirtiendo la
        // proporción de la web (iconos 20px, avatar 23px → avatar 1.15x más
        // grande que los iconos). Con 20dp la barra queda idéntica a la web.
        Box(Modifier.size(20.dp)) {
            Icon(
                icon,
                contentDescription = null,
                tint = if (selected) Color.White else Color.White.copy(alpha = 0.5f),
                modifier = Modifier.fillMaxSize(),
            )
            // Globo rojo con el contador — réplica exacta del <span> de
            // BottomNav.jsx: `absolute -top-0.5 -right-0.5` está anclado al
            // CONTENEDOR de 36dp del botón (w-9 h-9), no al glifo de 20dp
            // (w-5 h-5) que queda centrado DENTRO de ese botón con 8dp de
            // margen por lado — por eso, medido desde el propio icono de
            // 20dp, el globo debe sobresalir claramente por su esquina
            // superior-derecha (centro del globo en x=22dp/y=-2dp respecto al
            // icono). ANTES el offset (6dp,-4dp) lo dejaba demasiado metido
            // hacia dentro/abajo (bug reportado: "la burbuja... no se ve bien
            // como en la web"); con align(TopEnd)+offset(10dp,-10dp) el
            // globo queda exactamente en esa posición (10,-10 respecto a la
            // esquina del icono = centro en 22,-2, la misma matemática que
            // usa la web al posicionarlo sobre el botón de 36dp completo).
            if (badgeCount > 0) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 10.dp, y = (-10).dp)
                        .defaultMinSize(minWidth = 16.dp)
                        .height(16.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFEF4444))
                        .padding(horizontal = 4.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (badgeCount > 9) "9+" else badgeCount.toString(),
                        color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold,
                        // lineHeight = fontSize: Compose reserva por defecto
                        // un espacio vertical de línea MAYOR que el tamaño
                        // real del glifo (el "font padding" de la fuente),
                        // así que sin esto el número queda visualmente
                        // descentrado (más hacia abajo) dentro de un globo
                        // tan pequeño y ajustado (16dp) — otra causa real de
                        // que "no se viera bien" comparado con el <span> de
                        // la web (que sí centra perfecto vía flexbox+CSS).
                        style = TextStyle(fontSize = 10.sp, lineHeight = 10.sp),
                    )
                }
            }
        }
    }
}
