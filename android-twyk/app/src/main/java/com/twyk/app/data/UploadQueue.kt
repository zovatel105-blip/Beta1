package com.twyk.app.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

// Cola de subidas EN CURSO (placeholder con progreso en el grid del perfil,
// ver ui/Profile.kt) — equivalente nativo de lib/uploadQueue.js en la web.
// El trabajo real ocurre en segundo plano vía WorkManager (ver UploadWorker),
// esta cola es solo el estado en memoria que la UI observa mientras la app
// sigue viva (si el proceso muere y se recrea, la subida en sí continúa/se
// reintenta gracias a WorkManager, pero el placeholder de esta cola se pierde
// — limitación aceptada para mantener esto simple).
data class UploadQueueItem(
    val id: String,
    val type: String, // versus | duet | challenge
    var progress: Int = 0,
    var failed: Boolean = false,
)

object UploadQueue {
    val items = mutableStateListOf<UploadQueueItem>()

    fun enqueue(id: String, type: String) {
        items.add(0, UploadQueueItem(id = id, type = type))
    }

    fun updateProgress(id: String, progress: Int) {
        val idx = items.indexOfFirst { it.id == id }
        if (idx >= 0) items[idx] = items[idx].copy(progress = progress.coerceIn(0, 100))
    }

    fun markFailed(id: String) {
        val idx = items.indexOfFirst { it.id == id }
        if (idx >= 0) items[idx] = items[idx].copy(failed = true)
    }

    fun remove(id: String) {
        items.removeAll { it.id == id }
    }
}

// Notifica a las pantallas abiertas (perfil propio) cuando una subida en
// segundo plano termina con éxito, para insertar la publicación al instante
// sin esperar a recargar — equivalente al evento 'twyk:postCreated' web.
object UploadEvents {
    private val _postCreated = MutableSharedFlow<Post>(extraBufferCapacity = 4)
    val postCreated = _postCreated.asSharedFlow()

    suspend fun emitPostCreated(post: Post) {
        _postCreated.emit(post)
    }
}

// Banner de "reto enviado en segundo plano" (equivalente a `challengeUpload`
// en Feed.jsx) — visible sobre el feed mientras se envía un "Retar rápido" a
// una publicación concreta (ver ui/QuickChallenge.kt).
data class ChallengeBannerState(
    val status: String, // uploading | done | error
    val progress: Int = 0,
    val username: String = "",
)

object ChallengeBanner {
    var state by mutableStateOf<ChallengeBannerState?>(null)
        private set

    fun show(status: String, progress: Int, username: String) {
        state = ChallengeBannerState(status, progress, username)
    }

    fun clear() {
        state = null
    }
}
