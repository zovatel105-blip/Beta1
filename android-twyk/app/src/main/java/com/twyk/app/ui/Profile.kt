package com.twyk.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Person
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.twyk.app.absoluteUrl
import com.twyk.app.data.Post
import com.twyk.app.data.ProfileUser
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import kotlinx.coroutines.launch

// Pantalla de PERFIL (propio o ajeno). En overlay (perfil ajeno) muestra una
// flecha de volver. Cabecera + cuadrícula 3 columnas con los pósters del usuario.
@Composable
fun ProfileScreen(
    username: String?,
    isOverlay: Boolean,
    onClose: () -> Unit,
    onRequireAuth: () -> Unit,
) {
    val target = username ?: Session.user?.username

    if (target == null) {
        Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
                Icon(Icons.Filled.Person, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(54.dp))
                Spacer(Modifier.height(12.dp))
                Text("Inicia sesión para ver tu perfil", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(16.dp))
                Box(
                    Modifier.clip(RoundedCornerShape(10.dp)).background(Color(0xFF3B82F6))
                        .clickable { onRequireAuth() }.padding(horizontal = 24.dp, vertical = 10.dp),
                ) { Text("Entrar", color = Color.White, fontWeight = FontWeight.SemiBold) }
            }
        }
        return
    }

    val scope = rememberCoroutineScope()
    var profile by remember(target) { mutableStateOf<ProfileUser?>(null) }
    var posts by remember(target) { mutableStateOf<List<Post>>(emptyList()) }
    var loading by remember(target) { mutableStateOf(true) }
    var following by remember(target) { mutableStateOf(false) }
    var followers by remember(target) { mutableStateOf(0) }

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

    val isOwn = target == Session.user?.username

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 96.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                ProfileHeader(
                    profile = profile,
                    postsCount = posts.size,
                    followers = followers,
                    following = following,
                    isOwn = isOwn,
                    isOverlay = isOverlay,
                    onFollow = {
                        if (Session.token == null) {
                            onRequireAuth()
                        } else {
                            scope.launch {
                                runCatching { RetrofitProvider.api.toggleFollow(target) }
                                    .onSuccess { following = it.following; followers = it.followers }
                            }
                        }
                    },
                )
            }
            items(posts) { p -> PosterCell(p) }
        }

        if (!loading && posts.isEmpty()) {
            Text(
                "Aún no hay publicaciones",
                color = Color.White.copy(alpha = 0.5f),
                fontSize = 13.sp,
                modifier = Modifier.align(Alignment.Center),
            )
        }

        if (isOverlay) {
            Box(
                Modifier.align(Alignment.TopStart).statusBarsPadding().padding(8.dp)
                    .clip(CircleShape).background(Color.Black.copy(alpha = 0.4f))
                    .clickable { onClose() }.padding(8.dp),
            ) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "atrás", tint = Color.White, modifier = Modifier.size(22.dp))
            }
        }
    }
}

@Composable
private fun ProfileHeader(
    profile: ProfileUser?,
    postsCount: Int,
    followers: Int,
    following: Boolean,
    isOwn: Boolean,
    isOverlay: Boolean,
    onFollow: () -> Unit,
) {
    Column(
        Modifier.fillMaxWidth().statusBarsPadding()
            .padding(top = if (isOverlay) 48.dp else 16.dp, start = 16.dp, end = 16.dp, bottom = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val avatar = absoluteUrl(profile?.avatarUrl)
        if (avatar != null) {
            AsyncImage(model = avatar, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(88.dp).clip(CircleShape))
        } else {
            Box(Modifier.size(88.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.1f)))
        }
        Spacer(Modifier.height(10.dp))
        Text("@" + (profile?.username ?: ""), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        profile?.name?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(3.dp))
            Text(it, color = Color.White.copy(alpha = 0.7f), fontSize = 13.sp)
        }
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(30.dp)) {
            Stat(postsCount.toString(), "Publicaciones")
            Stat(formatCountP(followers), "Seguidores")
            Stat(formatCountP(profile?.following ?: 0), "Siguiendo")
        }
        profile?.bio?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = Color.White, fontSize = 13.sp, textAlign = TextAlign.Center)
        }
        if (!isOwn) {
            Spacer(Modifier.height(14.dp))
            Box(
                Modifier.clip(RoundedCornerShape(10.dp))
                    .background(if (following) Color.White.copy(alpha = 0.15f) else Color(0xFFEF2D56))
                    .clickable { onFollow() }
                    .padding(horizontal = 44.dp, vertical = 9.dp),
            ) {
                Text(if (following) "Siguiendo" else "Seguir", color = Color.White, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun Stat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        Text(label, color = Color.White.copy(alpha = 0.6f), fontSize = 11.sp)
    }
}

@Composable
private fun PosterCell(post: Post) {
    val poster = absoluteUrl(post.posterUrl ?: post.sideA?.posterUrl ?: post.thumbnailUrl)
    Box(
        Modifier.padding(1.dp).aspectRatio(0.62f).background(Color.White.copy(alpha = 0.06f)),
    ) {
        if (poster != null) {
            AsyncImage(model = poster, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
    }
}

private fun formatCountP(n: Int): String = when {
    n >= 1_000_000 -> String.format("%.1f", n / 1_000_000.0).removeSuffix(".0") + "M"
    n >= 1_000 -> String.format("%.1f", n / 1_000.0).removeSuffix(".0") + "K"
    else -> n.toString()
}
