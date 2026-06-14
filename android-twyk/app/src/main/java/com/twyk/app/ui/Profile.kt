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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material.icons.outlined.People
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
import com.twyk.app.Config
import com.twyk.app.R
import com.twyk.app.absoluteUrl
import com.twyk.app.data.Post
import com.twyk.app.data.ProfileUser
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
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
        LoginPrompt("Inicia sesión para ver tu perfil", onRequireAuth)
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
            putExtra(Intent.EXTRA_TEXT, "@$target en Twyk\n${Config.BASE_URL}")
        }
        context.startActivity(Intent.createChooser(i, "Compartir"))
    }

    Box(Modifier.fillMaxSize().background(TwykBg)) {
        GoldGlow()

        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 6.dp, end = 6.dp, bottom = 112.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                ProfileHeaderSection(
                    profile = profile,
                    isOwn = isOwn,
                    isOverlay = isOverlay,
                    votos = votos,
                    retos = retos,
                    followers = followers,
                    following = following,
                    followBusy = followBusy,
                    activeTab = activeTab,
                    onTab = { activeTab = it },
                    onFollow = onFollow,
                    onShare = onShare,
                    onClose = onClose,
                )
            }

            if (activeTab == "polls") {
                when {
                    loading -> item(span = { GridItemSpan(maxLineSpan) }) {
                        Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = TwykGold, strokeWidth = 2.dp, modifier = Modifier.size(30.dp))
                        }
                    }
                    posts.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) {
                        EmptyTab(title = "Aún no hay publicaciones", desc = if (isOwn) "Empieza a crear contenido" else "Este usuario aún no ha publicado")
                    }
                    else -> items(posts) { p -> ProfileGridItem(p) }
                }
            } else {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    val (t, d) = if (activeTab == "saved") "No hay guardados" to "Guarda vídeos para verlos luego"
                    else "No hay enlaces" to "Añade tus enlaces aquí"
                    EmptyTab(title = t, desc = d, bookmark = activeTab == "saved", link = activeTab == "links")
                }
            }
        }
    }
}

@Composable
private fun ProfileHeaderSection(
    profile: ProfileUser?,
    isOwn: Boolean,
    isOverlay: Boolean,
    votos: Int,
    retos: Int,
    followers: Int,
    following: Boolean,
    followBusy: Boolean,
    activeTab: String,
    onTab: (String) -> Unit,
    onFollow: () -> Unit,
    onShare: () -> Unit,
    onClose: () -> Unit,
) {
    val name = profile?.name?.takeIf { it.isNotBlank() } ?: profile?.username ?: "Usuario"
    val handle = "@" + (profile?.username ?: "usuario")

    Column(Modifier.fillMaxWidth().statusBarsPadding()) {
        // ── Barra superior ──
        Row(
            Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (isOverlay && !isOwn) {
                Box(Modifier.size(40.dp).clip(CircleShape).clickable { onClose() }, contentAlignment = Alignment.Center) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "atrás", tint = Color.White, modifier = Modifier.size(24.dp))
                }
                Text(profile?.username ?: "", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f).padding(start = 4.dp))
            } else {
                Spacer(Modifier.weight(1f))
            }
            Box(Modifier.size(40.dp).clip(CircleShape).clickable { }, contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Menu, "menú", tint = Color.White, modifier = Modifier.size(24.dp))
            }
        }

        // ── Stats alrededor del avatar ──
        Box(
            Modifier.fillMaxWidth().widthIn(max = 380.dp).padding(horizontal = 20.dp).height(196.dp),
        ) {
            Row(Modifier.fillMaxWidth().align(Alignment.TopCenter), horizontalArrangement = Arrangement.SpaceBetween) {
                StatItem(drawable = R.drawable.ic_vote, value = formatCount(votos), label = "Votos", iconSize = 34.dp)
                StatItem(drawable = R.drawable.ic_swords, value = formatCount(retos), label = "Retos", iconSize = 28.dp, alignEnd = true)
            }
            // Avatar centro con anillo degradado
            Box(Modifier.align(Alignment.Center).size(104.dp).clip(CircleShape).background(Brush.linearGradient(listOf(Color.White.copy(alpha = 0.15f), Color.White.copy(alpha = 0.03f)))).padding(3.dp)) {
                Box(Modifier.fillMaxSize().clip(CircleShape).border(2.dp, Color.White.copy(alpha = 0.10f), CircleShape).background(Color(0xFF18181B))) {
                    TwykAvatar(profile?.avatarUrl, Modifier.fillMaxSize())
                }
            }
            Row(Modifier.fillMaxWidth().align(Alignment.BottomCenter), horizontalArrangement = Arrangement.SpaceBetween) {
                StatItem(icon = Icons.Outlined.People, value = formatCount(followers), label = "Followers", iconSize = 26.dp)
                StatItem(icon = Icons.Outlined.PersonAdd, value = formatCount(profile?.following ?: 0), label = "Following", iconSize = 26.dp, alignEnd = true)
            }
        }

        // ── Nombre + handle ──
        Spacer(Modifier.height(20.dp))
        Text(name, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 20.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
        Spacer(Modifier.height(2.dp))
        Text(handle, color = ZincText, fontSize = 13.sp, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)

        // ── Botones ──
        Spacer(Modifier.height(18.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            if (isOwn) {
                PillButton("Editar perfil", filled = true) { }
                Spacer(Modifier.width(8.dp))
                PillButton("Compartir", filled = false, onClick = onShare)
            } else {
                PillButton(if (following) "Siguiendo" else "Seguir", filled = !following, enabled = !followBusy, onClick = onFollow)
                Spacer(Modifier.width(8.dp))
                PillButton("Retar", filled = false, leadingDrawable = R.drawable.ic_swords) { }
            }
        }

        // ── Pestañas ──
        Spacer(Modifier.height(26.dp))
        val tabs = if (isOwn) listOf("polls", "saved", "links") else listOf("polls")
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 2.dp).clip(RoundedCornerShape(12.dp))
                .background(Color.White.copy(alpha = 0.03f))
                .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(12.dp))
                .padding(2.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            tabs.forEach { key ->
                val active = activeTab == key
                Box(
                    Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(8.dp))
                        .background(if (active) Color.White else Color.Transparent)
                        .clickable { onTab(key) },
                    contentAlignment = Alignment.Center,
                ) {
                    val tint = if (active) Color.Black else Color(0xFF71717A)
                    when (key) {
                        "polls" -> ColumnsIcon(Modifier.size(20.dp), tint)
                        "saved" -> Icon(if (active) Icons.Filled.Bookmark else Icons.Outlined.BookmarkBorder, null, tint = tint, modifier = Modifier.size(20.dp))
                        else -> Icon(Icons.Filled.Link, null, tint = tint, modifier = Modifier.size(20.dp))
                    }
                }
            }
        }
        Spacer(Modifier.height(14.dp))
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
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (alignEnd) { textSlot(); iconSlot() } else { iconSlot(); textSlot() }
    }
}

@Composable
private fun PillButton(
    text: String,
    filled: Boolean,
    enabled: Boolean = true,
    leadingDrawable: Int? = null,
    onClick: () -> Unit,
) {
    Row(
        Modifier.height(36.dp).clip(RoundedCornerShape(50))
            .then(if (filled) Modifier.background(Color.White) else Modifier.border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(50)))
            .clickable(enabled = enabled) { onClick() }
            .padding(horizontal = 24.dp),
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
private fun EmptyTab(title: String, desc: String, bookmark: Boolean = false, link: Boolean = false) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 56.dp, horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(64.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.04f))
                .border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            when {
                bookmark -> Icon(Icons.Outlined.BookmarkBorder, null, tint = Color(0xFF71717A), modifier = Modifier.size(28.dp))
                link -> Icon(Icons.Filled.Link, null, tint = Color(0xFF71717A), modifier = Modifier.size(28.dp))
                else -> ColumnsIcon(Modifier.size(28.dp), Color(0xFF71717A))
            }
        }
        Spacer(Modifier.height(16.dp))
        Text(title, color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        Spacer(Modifier.height(4.dp))
        Text(desc, color = Color(0xFF71717A), fontSize = 13.sp)
    }
}

@Composable
private fun ProfileGridItem(post: Post) {
    val isDuet = post.type == "duet" && post.sideA?.videoUrl != null && post.sideB?.videoUrl != null
    val isRow = post.layout == "vertical"
    val totalVotes = (post.votes?.a ?: 0) + (post.votes?.b ?: 0)

    Box(
        Modifier.padding(2.dp).fillMaxWidth().aspectRatio(9f / 16f)
            .clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.04f)),
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

        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.18f)))

        if (totalVotes > 0) {
            Row(
                Modifier.align(Alignment.BottomStart).padding(5.dp).clip(RoundedCornerShape(50))
                    .background(Color.Black.copy(alpha = 0.55f)).padding(horizontal = 6.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(ImageVector.vectorResource(R.drawable.ic_vote), null, tint = Color.White, modifier = Modifier.size(13.dp))
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
