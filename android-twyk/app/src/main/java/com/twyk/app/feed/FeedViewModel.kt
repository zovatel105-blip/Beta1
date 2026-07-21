package com.twyk.app.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.twyk.app.data.Post
import com.twyk.app.data.PostEvents
import com.twyk.app.data.RetrofitProvider
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

    init {
        loadInitial()
        // Si se elimina una publicación desde "Más opciones" (propia, en
        // cualquier pantalla), la quitamos también del feed principal al
        // instante, sin esperar a recargar.
        viewModelScope.launch {
            PostEvents.postDeleted.collect { id -> _posts.value = _posts.value.filterNot { it.id == id } }
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
            val merged = (uploads + (page?.posts ?: emptyList())).filter { seen.add(it.id) }
            _posts.value = merged
        }
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
