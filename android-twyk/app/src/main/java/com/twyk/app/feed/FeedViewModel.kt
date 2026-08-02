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

    private fun isFeedPost(p: Post) = p.type == "versus" || p.type == "duet"

    private fun loadInitial() {
        viewModelScope.launch {
            val uploads = runCatching { api.uploads().posts.orEmpty().filter(::isFeedPost) }
                .getOrDefault(emptyList())
            val page = runCatching { api.feed(0) }.getOrNull()
            cursor = page?.nextCursor ?: 0
            hasMore = page?.hasMore != false
            // Réplica de `seenRef.current = new Set()` en useFeed.js: tanto la
            // carga inicial como refresh() sustituyen el feed ENTERO desde el
            // principio, así que el set de "vistos" también debe reiniciarse
            // (si no, un refresh() posterior a la carga inicial no volvería a
            // añadir los mismos ids y el feed quedaría vacío).
            seen.clear()
            val merged = (uploads + (page?.posts ?: emptyList())).filter { seen.add(it.id) }
            _posts.value = merged
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
