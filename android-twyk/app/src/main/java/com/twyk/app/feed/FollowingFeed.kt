package com.twyk.app.feed

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.People
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.twyk.app.data.Post
import com.twyk.app.data.PostEvents
import com.twyk.app.data.QuickChallengeTarget
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import com.twyk.app.data.Stats
import com.twyk.app.data.VoteRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException

// ─────────────────────────────────────────────────────────────────────────────
// Página "Siguiendo" (doble-click en Home del BottomNav — ver
// MainActivity.kt/handleGoHomeDouble): SOLO publicaciones de las cuentas que
// el usuario sigue. Réplica exacta de hooks/useFollowingFeed.js (web), que
// consume GET /api/feed/following (feed cronológico, sin ranking del
// recomendador — a diferencia de GET /api/feed, que sí usa TWYK Engine).
//
// El ViewModel se instancia de forma PEREZOSA: solo se crea (y por tanto solo
// dispara init{}/loadInitial()) la primera vez que `followingMode == true` en
// MainActivity.kt monta `FollowingFeedScreen` — igual que el `enabled` +
// `startedRef` del hook web ("Solo se dispara la PRIMERA vez que enabled pasa
// a true... reabrir la página no repite la carga"). Al estar cacheado en el
// ViewModelStore de la Activity, alternar Siguiendo <-> Principal varias
// veces en la misma sesión NO repite la petición de red.
// ─────────────────────────────────────────────────────────────────────────────
class FollowingFeedViewModel : ViewModel() {
    private val api = RetrofitProvider.api

    private val _posts = MutableStateFlow<List<Post>>(emptyList())
    val posts: StateFlow<List<Post>> = _posts.asStateFlow()

    private val _ready = MutableStateFlow(false)
    val ready: StateFlow<Boolean> = _ready.asStateFlow()

    // Se pone a true si el backend responde 401 (sin sesión) — el llamador
    // (FollowingFeedScreen) debe pedir login en vez de mostrar un feed vacío,
    // réplica de `unauthorized` en useFollowingFeed.js.
    private val _unauthorized = MutableStateFlow(false)
    val unauthorized: StateFlow<Boolean> = _unauthorized.asStateFlow()

    private val seen = mutableSetOf<String>()
    private var cursor = 0
    private var hasMore = true
    private var loading = false

    init {
        loadInitial()
        // Mismas 2 suscripciones que FeedViewModel (feed principal): un post
        // propio borrado desde "Más opciones" también debe desaparecer aquí
        // al instante, y el contador de comentarios debe reflejarse en vivo
        // sin esperar a recargar la página.
        viewModelScope.launch {
            PostEvents.postDeleted.collect { id -> _posts.value = _posts.value.filterNot { it.id == id } }
        }
        viewModelScope.launch {
            PostEvents.commentCountChanged.collect { (id, count) ->
                _posts.value = _posts.value.map { p ->
                    if (p.id == id) p.copy(stats = (p.stats ?: Stats()).copy(comments = count)) else p
                }
            }
        }
    }

    private fun loadInitial() {
        viewModelScope.launch {
            try {
                val page = api.feedFollowing(0)
                cursor = page.nextCursor ?: 0
                hasMore = page.hasMore != false
                seen.clear()
                _posts.value = page.posts.orEmpty().filter { seen.add(it.id) }
                _unauthorized.value = false
            } catch (e: HttpException) {
                _posts.value = emptyList()
                hasMore = false
                if (e.code() == 401) _unauthorized.value = true
            } catch (e: Exception) {
                _posts.value = emptyList()
                hasMore = false
            } finally {
                _ready.value = true
            }
        }
    }

    fun loadMore() {
        if (loading || !hasMore) return
        loading = true
        viewModelScope.launch {
            try {
                val page = api.feedFollowing(cursor)
                cursor = page.nextCursor ?: cursor
                hasMore = page.hasMore != false
                val fresh = page.posts.orEmpty().filter { seen.add(it.id) }
                if (fresh.isNotEmpty()) _posts.value = _posts.value + fresh
            } catch (_: Exception) {
                /* swallow: reintentará en el próximo cruce de umbral del observer */
            }
            loading = false
        }
    }

    fun vote(id: String, side: String, previousSide: String? = null) {
        viewModelScope.launch {
            runCatching { api.vote(VoteRequest(id, side, previousSide)) }
        }
    }
}

// Pantalla "Siguiendo" — reutiliza el MISMO FeedPager (reproductor nativo,
// doble-toque para votar, comentarios, retar, etc.) que el feed principal;
// solo cambia la fuente de datos. Réplica de la rama `followingMode` dentro
// del render de Feed.jsx (web): spinner mientras `!ready`, estado vacío con 2
// variantes (invitado/sin sesión -> pedir login; con sesión sin
// publicaciones de cuentas seguidas -> mensaje informativo), y si hay posts,
// el mismo pager de siempre.
@Composable
fun FollowingFeedScreen(
    onOpenComments: (String, String?) -> Unit,
    onRequireAuth: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onChallenge: (QuickChallengeTarget) -> Unit = {},
    vm: FollowingFeedViewModel = viewModel(),
) {
    val posts by vm.posts.collectAsState()
    val ready by vm.ready.collectAsState()
    val unauthorized by vm.unauthorized.collectAsState()

    if (!ready) {
        Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = Color.White)
        }
        return
    }

    if (posts.isEmpty()) {
        Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
            Column(
                modifier = Modifier.padding(horizontal = 32.dp).widthIn(max = 280.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier.background(Color.White.copy(alpha = 0.05f), CircleShape).padding(15.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.People, contentDescription = null, tint = Color.White.copy(alpha = 0.4f))
                }
                if (unauthorized || Session.user == null) {
                    Text(
                        "Log in to see who you follow",
                        color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center, modifier = Modifier.padding(top = 12.dp),
                    )
                    Text(
                        "Sign in to your account to view posts from people you follow.",
                        color = Color.White.copy(alpha = 0.5f), fontSize = 13.sp,
                        textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp),
                    )
                    Box(
                        Modifier
                            .padding(top = 12.dp)
                            .background(Color.White, RoundedCornerShape(50))
                            .clickable { onRequireAuth() }
                            .padding(horizontal = 20.dp, vertical = 8.dp),
                    ) {
                        Text("Log in", color = Color.Black, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                } else {
                    Text(
                        "No posts yet",
                        color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center, modifier = Modifier.padding(top = 12.dp),
                    )
                    Text(
                        "Follow people to see their posts here.",
                        color = Color.White.copy(alpha = 0.5f), fontSize = 13.sp,
                        textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
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
