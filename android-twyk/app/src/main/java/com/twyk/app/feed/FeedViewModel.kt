package com.twyk.app.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.twyk.app.data.Post
import com.twyk.app.data.PostEvents
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Stats
import com.twyk.app.data.VoteRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class FeedViewModel : ViewModel() {
    private val api = RetrofitProvider.api

    private val _posts = MutableStateFlow<List<Post>>(emptyList())
    val posts: StateFlow<List<Post>> = _posts.asStateFlow()

    private val seen = mutableSetOf<String>()
    private var cursor = 0
    private var hasMore = true
    private var loading = false

    // Página activa del pager (FeedPager) en el momento de dejar de estar
    // visible (cambio a otra pestaña, ver comentario completo en
    // VersusFeed.kt/FeedPager). Al SOBREVIVIR este ViewModel a esos cambios
    // de pestaña (se instancia a nivel de TwykApp(), no dentro de VersusFeed),
    // permite reabrir el feed exactamente en la misma publicación en vez de
    // volver siempre a la primera. `handleGoHome`/`handleGoHomeDouble`
    // (MainActivity.kt) la resetean a 0 explícitamente (1 click en Home SÍ
    // debe volver arriba — función "actualizar el feed").
    var lastActivePage: Int = 0

    init {
        loadInitial()
        // Si se elimina una publicación desde "Más opciones" (propia, en
        // cualquier pantalla), la quitamos también del feed principal al
        // instante, sin esperar a recargar.
        viewModelScope.launch {
            PostEvents.postDeleted.collect { id -> _posts.value = _posts.value.filterNot { it.id == id } }
        }
        // Comentar/borrar un comentario desde CommentsSheet actualiza al
        // instante el número junto al icono de comentarios del feed, sin
        // esperar a recargar (réplica de onCountChange en la web).
        viewModelScope.launch {
            PostEvents.commentCountChanged.collect { (id, count) ->
                _posts.value = _posts.value.map { p ->
                    if (p.id == id) p.copy(stats = (p.stats ?: Stats()).copy(comments = count)) else p
                }
            }
        }
    }

    // Filtro SOLO para el fallback /api/uploads (que devuelve TODO tipo de
    // publicación tal cual está en la base de datos: versus/duet/challenge_open
    // sueltos que aún no tienen retador, etc.) — réplica exacta de
    // `fetchUploads()` en hooks/useFeed.js (web), que aplica este MISMO
    // filtro (`p.type === 'duet' || p.type === 'versus'`) ÚNICAMENTE a su
    // propio fallback, NUNCA a la página normal de /api/feed.
    private fun isFeedPost(p: Post) = p.type == "versus" || p.type == "duet"

    // BUG reportado por el usuario ("todas las publicaciones single deben
    // aparecer en el feed de la aplicación nativa"): este filtro
    // `isFeedPost` (solo versus/duet) se aplicaba también al resultado de
    // `api.feed(0)` — pero /api/feed YA inyecta ahí mismo los retos abiertos
    // ("Single", `post.type == "challenge_open"`, ver getOpenChallengeFeedItems
    // en route.js) mezclados con las publicaciones normales, exactamente
    // igual que hace la web (hooks/useFeed.js/loadInitial: `let list =
    // page?.posts || []`, SIN ningún filtro de tipo — ese filtro solo existe
    // en `fetchUploads()`, su propio fallback). Al filtrar aquí por tipo
    // ANTES incluso de guardar el resultado, CUALQUIER publicación
    // "challenge_open" que llegara en esa primera página quedaba descartada
    // de inmediato — y como el backend, cuando hay pocos retos abiertos
    // (caso típico), los inyecta TODOS únicamente en la página cursor===0 (no
    // los repite en páginas posteriores), el resultado neto era que NINGUNA
    // publicación "Single" llegaba a verse jamás en el feed principal nativo,
    // aunque el renderizado (OpenChallengePage, VersusFeed.kt) ya estaba
    // correctamente implementado y a la espera de recibirlas. FIX: el
    // resultado de `api.feed(0)` ya NO se filtra por tipo (se guarda tal
    // cual, igual que la web) — el filtro `isFeedPost` se reserva
    // EXCLUSIVAMENTE para el fallback `api.uploads()` (que sí puede incluir
    // otros tipos de publicación ajenos al feed principal), tal cual hace
    // `fetchUploads()` en la web.
    private fun loadInitial() {
        viewModelScope.launch {
            // SOLO el feed rankeado por el TWYK Engine. ANTES se cargaba
            // api.uploads() (cronológico fijo) PRIMERO + el feed después: como
            // /api/uploads contiene TODOS los posts, el dedupe descartaba los
            // del feed rankeado y el usuario veía SIEMPRE el mismo orden.
            // uploads queda solo como FALLBACK si el feed falla o llega vacío.
            val page = runCatching { api.feed(0) }.getOrNull()
            cursor = page?.nextCursor ?: 0
            hasMore = page?.hasMore != false
            // Réplica de `seenRef.current = new Set()` en useFeed.js: tanto la
            // carga inicial como refresh() sustituyen el feed ENTERO desde el
            // principio, así que el set de "vistos" también debe reiniciarse
            // (si no, un refresh() posterior a la carga inicial no volvería a
            // añadir los mismos ids y el feed quedaría vacío).
            seen.clear()
            var list = page?.posts.orEmpty()
            if (list.isEmpty()) {
                list = runCatching { api.uploads().posts.orEmpty().filter(::isFeedPost) }
                    .getOrDefault(emptyList())
            }
            _posts.value = list.filter { seen.add(it.id) }
        }
    }

    // Refresco explícito (1 click en Home, ver MainActivity.kt/handleGoHome):
    // re-descarga desde el principio y SUSTITUYE el feed entero (no acumula)
    // — réplica exacta de `refresh()` en hooks/useFeed.js (web).
    fun refresh() {
        loadInitial()
    }

    fun loadMore() {
        if (loading || !hasMore) return
        loading = true
        viewModelScope.launch {
            val page = runCatching { api.feed(cursor) }.getOrNull()
            if (page != null) {
                cursor = page.nextCursor ?: cursor
                hasMore = page.hasMore != false
                val fresh = page.posts.orEmpty().filter { seen.add(it.id) }
                if (fresh.isNotEmpty()) _posts.value = _posts.value + fresh
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
