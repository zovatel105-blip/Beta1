package com.twyk.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.LocalFireDepartment
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twyk.app.data.Post
import com.twyk.app.data.QuickChallengeTarget
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.VoteRequest
import com.twyk.app.feed.FeedPager
import kotlinx.coroutines.launch

// Pantalla con TODAS las publicaciones reales de un "Trending Challenge" (ej.
// "Yacht Life") — réplica nativa EXACTA de la ÚLTIMA versión implementada en
// la web (components/TrendingChallengePostsPage.jsx, tras 2 correcciones del
// usuario: descartada una hoja con leaderboard, descartado un vídeo
// deslizable a pantalla completa por "se confundía con la página de Retos" —
// LA DEFINITIVA: "Debería mostrar un grid de 3 como el perfil"). Reutiliza
// EXACTAMENTE los mismos composables del grid de perfil (ProfileGridItem,
// ahora público, ver ui/Profile.kt) y el mismo visor (FeedPager, igual que
// el grid "Posts" del perfil, ver ui/Profile.kt) para un resultado idéntico.
// Se abre al tocar el nombre del challenge en el buscador (lupa, ver
// SearchScreen en este mismo archivo/paquete). Consume GET
// /api/luxury-battles/posts?themeId=... (TwykApi.kt).
@Composable
fun TrendingChallengePostsScreen(
    themeId: String?,
    onClose: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onRequireAuth: () -> Unit,
    onChallenge: (QuickChallengeTarget) -> Unit = {},
) {
    var themeTitle by remember { mutableStateOf<String?>(null) }
    var posts by remember { mutableStateOf<List<Post>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var viewerIndex by remember { mutableStateOf<Int?>(null) }
    var commentsPostId by remember { mutableStateOf<String?>(null) }
    var commentsVotedSide by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(themeId) {
        loading = true
        val res = runCatching { RetrofitProvider.api.luxuryBattlePosts(themeId) }.getOrNull()
        posts = res?.posts.orEmpty()
        // El título del tema no viene en PostsResponse (se ignora, ver
        // TwykApi.kt) — se obtiene por separado del tema ACTUALMENTE activo,
        // igual que hace SearchScreen antes de abrir esta pantalla.
        themeTitle = runCatching { RetrofitProvider.api.luxuryBattleActive() }.getOrNull()?.theme?.title
        loading = false
    }

    // BackHandler LOCAL con prioridad SOLO cuando hay un overlay propio abierto
    // (comentarios o el visor de publicación) — igual patrón que Profile.kt/
    // Battles.kt (`hasLocalOverlay`): si no hay overlay local, `enabled =
    // false` deja pasar el gesto/botón "Atrás" al BackHandler GLOBAL de
    // MainActivity.kt, que cierra esta pantalla entera
    // (`trendingChallengeThemeId = null`).
    val hasLocalOverlay = commentsPostId != null || viewerIndex != null
    BackHandler(enabled = hasLocalOverlay) {
        when {
            commentsPostId != null -> { commentsPostId = null; commentsVotedSide = null }
            viewerIndex != null -> viewerIndex = null
        }
    }

    Box(Modifier.fillMaxSize().background(TwykBg)) {
        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 6.dp, end = 6.dp, top = 64.dp, bottom = 24.dp),
        ) {
            when {
                loading -> {}
                posts.isEmpty() -> {}
                else -> itemsIndexed(posts) { idx, p -> ProfileGridItem(p) { viewerIndex = idx } }
            }
        }

        if (loading) {
            Box(Modifier.fillMaxSize().padding(top = 64.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
            }
        } else if (posts.isEmpty()) {
            Column(
                Modifier.fillMaxSize().padding(top = 96.dp, start = 24.dp, end = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(Modifier.size(56.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.05f)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.LocalFireDepartment, null, tint = Color(0xFFFCD34D), modifier = Modifier.size(24.dp))
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    "No posts yet", color = Color.White.copy(alpha = 0.7f), fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    "When someone joins ${themeTitle ?: "this challenge"}, their posts will show up here.",
                    color = Color.White.copy(alpha = 0.4f), fontSize = 13.sp, textAlign = TextAlign.Center,
                )
            }
        }

        // Cabecera: volver + píldora con el nombre del tema (mismo estilo
        // dorado que la píldora de Batallas > Completados, ver Battles.kt).
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 10.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(36.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.06f)).clickable { onClose() }, contentAlignment = Alignment.Center) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, "back", tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.width(10.dp))
            Box(
                Modifier.clip(RoundedCornerShape(50))
                    .background(Brush.linearGradient(listOf(Color(0xFFFCD34D).copy(alpha = 0.18f), Color(0xFFF59E0B).copy(alpha = 0.18f))))
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Filled.LocalFireDepartment, null, tint = Color(0xFFFCD34D), modifier = Modifier.size(13.dp))
                    Text(themeTitle ?: "Trending Challenge", color = Color(0xFFFCD34D), fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }

    // Visor de publicación (mismo FeedPager que el grid del perfil): desliza
    // entre TODAS las publicaciones de este challenge, empezando en la que
    // se tocó.
    viewerIndex?.let { idx ->
        Box(Modifier.fillMaxSize()) {
            FeedPager(
                insideOverlay = true,
                posts = posts,
                initialPage = idx,
                onOpenComments = { id, side -> commentsPostId = id; commentsVotedSide = side },
                onRequireAuth = onRequireAuth,
                onOpenProfile = { uname -> viewerIndex = null; onClose(); onOpenProfile(uname) },
                onVote = { id, side, prev ->
                    scope.launch { runCatching { RetrofitProvider.api.vote(VoteRequest(id, side, prev)) } }
                },
                onChallenge = onChallenge,
                showCommentInput = true,
            )
        }
        commentsPostId?.let { pid ->
            CommentsSheet(
                postId = pid,
                votedSide = commentsVotedSide,
                onClose = { commentsPostId = null; commentsVotedSide = null },
                onRequireAuth = onRequireAuth,
            )
        }
    }
}
