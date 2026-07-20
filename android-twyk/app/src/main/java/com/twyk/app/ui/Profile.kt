package com.twyk.app.ui

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.twyk.app.Config
import com.twyk.app.R
import com.twyk.app.absoluteUrl
import com.twyk.app.data.Post
import com.twyk.app.data.PostEvents
import com.twyk.app.data.ProfileUser
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import com.twyk.app.data.UploadEvents
import com.twyk.app.data.UploadQueue
import com.twyk.app.data.UploadQueueItem
import com.twyk.app.data.VoteRequest
import com.twyk.app.feed.FeedPager
import kotlinx.coroutines.launch

// Pantalla de PERFIL (propio o ajeno) — réplica de ProfilePage.jsx de la web.
// Fondo #0a0a0b + glow dorado, stats alrededor del avatar, nombre/handle,
// botones (Editar/Compartir o Seguir/Retar), pestañas y cuadrícula 3 columnas.
@Composable
fun ProfileScreen(
    username: String?,
    isOverlay: Boolean,
    onClose: () -> Unit,
    onRequireAuth: () -> Unit,
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
    var nestedProfileUsername by remember(target) { mutableStateOf<String?>(null) }
    var followListType by remember(target) { mutableStateOf<String?>(null) } // "followers" | "following" | null
    var menuOpen by remember(target) { mutableStateOf(false) } // hoja de "Settings" (☰, cerrar sesión)
    // Publicaciones guardadas (pestaña "saved", solo perfil propio) y lista
    // activa dentro del visor (puede ser "posts" o "savedPosts" según la pestaña
    // desde la que se abrió).
    var savedPosts by remember(target) { mutableStateOf<List<Post>>(emptyList()) }
    var savedLoading by remember(target) { mutableStateOf(false) }
    var viewerList by remember(target) { mutableStateOf<List<Post>>(emptyList()) }

    LaunchedEffect(target) {
        loading = true
        runCatching { RetrofitProvider.api.userProfile(target) }
            .onSuccess { r ->
                profile = r.user
                posts = r.posts.orEmpty()
                following = r.user?.isFollowing ?: false
                followers = r.user?.followers ?: 0
            }
        loading = false
    }

    val isOwn = username == null || target == Session.user?.username
    val votos = posts.sumOf { (it.votes?.a ?: 0) + (it.votes?.b ?: 0) }
    val retos = posts.count { it.type == "versus" }

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

    // ── Header colapsable estilo TikTok ────────────────────────────────────────
    // Al hacer scroll, la barra superior (siempre fija) revela progresivamente
    // el mini-perfil (avatar+nombre) y la acción (Editar/Seguir). Se calcula a
    // partir del scroll del PRIMER item del grid (la cabecera).
    val gridState = rememberLazyGridState()
    val density = LocalDensity.current
    val collapseDistPx = with(density) { COLLAPSE_DIST_DP.dp.toPx() }
    val collapseProgress =
        if (gridState.firstVisibleItemIndex > 0) 1f
        else (gridState.firstVisibleItemScrollOffset / collapseDistPx).coerceIn(0f, 1f)

    Box(Modifier.fillMaxSize().background(TwykBg)) {
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
                    activeTab = activeTab,
                    onTab = { activeTab = it },
                    onFollow = onFollow,
                    onShare = onShare,
                    onEditProfile = { editOpen = true },
                    onOpenFollowList = { followListType = it },
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
                        EmptyTab(title = "No posts yet", desc = if (isOwn) "Start creating content" else "This user hasn't posted yet")
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
                        EmptyTab(title = "No saved posts", desc = "Save videos to watch them later", bookmark = true)
                    }
                    else -> itemsIndexed(savedPosts) { idx, p -> ProfileGridItem(p) { viewerList = savedPosts; viewerIndex = idx } }
                }
            }
        }

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
        viewerIndex?.let { idx ->
            Box(Modifier.fillMaxSize()) {
                FeedPager(
                    posts = viewerList,
                    initialPage = idx,
                    onOpenComments = { viewerCommentsPostId = it },
                    onRequireAuth = onRequireAuth,
                    onOpenProfile = { uname -> nestedProfileUsername = uname },
                    onVote = { id, side ->
                        scope.launch { runCatching { RetrofitProvider.api.vote(VoteRequest(id, side)) } }
                    },
                )
                Box(
                    Modifier.align(Alignment.TopStart).statusBarsPadding().padding(start = 12.dp, top = 8.dp)
                        .size(36.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.45f))
                        .clickable { viewerIndex = null },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(ImageVector.vectorResource(R.drawable.ic_arrow_left), "cerrar", tint = Color.White, modifier = Modifier.size(20.dp))
                }
            }
            viewerCommentsPostId?.let { pid ->
                CommentsSheet(postId = pid, onClose = { viewerCommentsPostId = null }, onRequireAuth = onRequireAuth)
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
        nestedProfileUsername?.let { uname ->
            ProfileScreen(
                username = uname,
                isOverlay = true,
                onClose = { nestedProfileUsername = null },
                onRequireAuth = onRequireAuth,
            )
        }

        // Menú (☰, solo perfil propio) — acción principal: cerrar sesión.
        if (menuOpen) {
            ProfileMenuSheet(
                onClose = { menuOpen = false },
                onLogout = { Session.clear() },
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
) {
    val name = profile?.name?.takeIf { it.isNotBlank() } ?: profile?.username ?: "User"
    val actionsEnabled = progress > 0.5f

    Box(
        Modifier.fillMaxWidth().statusBarsPadding().height(44.dp)
            .background(TwykBg),
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

            // Acción (Editar+Compartir o Seguir/Retar): mitad derecha del espacio
            // restante — igual que la web, que SIEMPRE muestra Editar Y Compartir
            // juntos para el perfil propio (antes solo se mostraba "Edit", faltaba
            // el botón circular de Compartir).
            Row(
                Modifier.weight(1f).graphicsLayer(alpha = progress),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.End),
            ) {
                if (isOwn) {
                    MiniPill("Edit", filled = true, enabled = actionsEnabled, horizontalPadding = 16.dp, onClick = onEditProfile)
                    MiniIconButton(enabled = actionsEnabled, onClick = onShare) {
                        Icon(ImageVector.vectorResource(R.drawable.ic_share), null, tint = Color.White, modifier = Modifier.size(15.dp))
                    }
                } else {
                    MiniIconButton(enabled = actionsEnabled, onClick = { }) {
                        Icon(ImageVector.vectorResource(R.drawable.ic_swords), null, tint = Color.White, modifier = Modifier.size(15.dp))
                    }
                    MiniPill(if (following) "Following" else "Follow", filled = !following, enabled = actionsEnabled && !followBusy, horizontalPadding = 20.dp, onClick = onFollow)
                }
            }

            if (isOwn) {
                Box(Modifier.size(40.dp).clip(CircleShape).clickable { onOpenMenu() }, contentAlignment = Alignment.Center) {
                    Icon(ImageVector.vectorResource(R.drawable.ic_menu), "menu", tint = Color.White, modifier = Modifier.size(24.dp))
                }
            } else {
                Spacer(Modifier.size(40.dp))
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
    activeTab: String,
    onTab: (String) -> Unit,
    onFollow: () -> Unit,
    onShare: () -> Unit,
    onEditProfile: () -> Unit,
    onOpenFollowList: (String) -> Unit,
) {
    val name = profile?.name?.takeIf { it.isNotBlank() } ?: profile?.username ?: "User"
    val handle = "@" + (profile?.username ?: "user")

    Column(Modifier.fillMaxWidth().statusBarsPadding()) {
        // Espacio reservado para la barra superior FIJA (ver CollapsedTopBar,
        // renderizada como overlay encima del grid) — evita que el contenido
        // aparezca oculto detrás de ella al inicio. Altura 44dp = web h-11.
        Spacer(Modifier.height(44.dp))

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
                PillButton("Challenge", filled = false, leadingDrawable = R.drawable.ic_swords) { }
            }
        }

        // ── Tabs — active: transparent bg + white border (matches web exactly:
        // `bg-transparent border border-white`); inactive: black bg + faint
        // border (web: `bg-black border-white/[0.07]`). Each tab owns its own
        // background/border (no shared wrapper pill), height 32dp = web h-8.
        // Solo 2 pestañas para el perfil propio (polls, saved) — la web NO
        // tiene 3ª pestaña de "links"; perfil ajeno = solo "polls" (igual que
        // web, ver TABS/TABS.filter en ProfilePage.jsx). Gap antes = web
        // mb-7(28)+pt-1(4)=32dp; gap después = web pb-2.5(10)+mt-4(16)=26dp.
        Spacer(Modifier.height(32.dp))
        val tabs = if (isOwn) listOf("polls", "saved") else listOf("polls")
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            tabs.forEach { key ->
                val active = activeTab == key
                Box(
                    Modifier.weight(1f).height(32.dp).clip(RoundedCornerShape(8.dp))
                        .then(
                            if (active) Modifier.background(Color.Transparent).border(1.dp, Color.White, RoundedCornerShape(8.dp))
                            else Modifier.background(Color.Black).border(1.dp, Color.White.copy(alpha = 0.07f), RoundedCornerShape(8.dp)),
                        )
                        .clickable { onTab(key) },
                    contentAlignment = Alignment.Center,
                ) {
                    val tint = if (active) Color.White else ZincText
                    when (key) {
                        "polls" -> ColumnsIcon(Modifier.size(18.dp), tint)
                        else -> Icon(
                            ImageVector.vectorResource(if (active) R.drawable.ic_bookmark_filled else R.drawable.ic_bookmark),
                            null, tint = tint, modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(26.dp))
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

@Composable
private fun EmptyTab(title: String, desc: String, bookmark: Boolean = false) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 64.dp, horizontal = 16.dp),
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

    Box(
        Modifier.padding(2.dp).fillMaxWidth().aspectRatio(9f / 16f)
            .clip(RoundedCornerShape(8.dp))
            .background(Color.White.copy(alpha = 0.04f))
            .border(1.dp, Color.White.copy(alpha = 0.05f), RoundedCornerShape(8.dp))
            .clickable { onClick() },
    ) {
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

        if (totalVotes > 0) {
            Row(
                Modifier.align(Alignment.BottomStart).padding(4.dp).clip(RoundedCornerShape(50))
                    .background(Color.Black.copy(alpha = 0.55f)).padding(horizontal = 6.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(ImageVector.vectorResource(R.drawable.ic_vote), null, tint = Color.White, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(3.dp))
                Text(formatCount(totalVotes), color = Color.White, fontSize = 11.sp)
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
