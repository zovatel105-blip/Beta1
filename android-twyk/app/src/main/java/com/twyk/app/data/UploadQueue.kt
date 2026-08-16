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

// Notifica a las pantallas abiertas cuando una publicación se ELIMINA (menú
// "Más opciones" > Eliminar publicación, ver feed/VersusFeed.kt::MoreOptionsSheet)
// para quitarla de todas las listas visibles (feed, perfil, guardados) sin
// tener que recargar — mismo patrón que UploadEvents.postCreated.
object PostEvents {
    private val _postDeleted = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val postDeleted = _postDeleted.asSharedFlow()

    suspend fun emitPostDeleted(postId: String) {
        _postDeleted.emit(postId)
    }

    // Notifica cuando cambia el NÚMERO TOTAL de comentarios de una
    // publicación (crear/borrar uno desde CommentsSheet), para reflejarlo AL
    // INSTANTE en el icono de comentarios de la tarjeta del feed/rail, sin
    // esperar a recargar — réplica nativa del callback `onCountChange` que
    // CommentsModal.jsx recibe de CarouselSlide.jsx/DuetSlide.jsx en la web.
    private val _commentCountChanged = MutableSharedFlow<Pair<String, Int>>(extraBufferCapacity = 8)
    val commentCountChanged = _commentCountChanged.asSharedFlow()

    suspend fun emitCommentCountChanged(postId: String, count: Int) {
        _commentCountChanged.emit(postId to count)
    }

    // Notifica cuando se ha CREADO un reto CONTRA una publicación concreta
    // (flujo "Retar rápido"), para incrementar AL INSTANTE el contador de
    // "Retar" en la tarjeta cuyo postId coincida — réplica nativa del evento
    // global `twyk:challenged` que Feed.jsx dispara y que
    // CarouselSlide.jsx/DuetSlide.jsx escuchan. Se emite desde UploadWorker
    // cuando la subida del reto termina con éxito.
    private val _challenged = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val challenged = _challenged.asSharedFlow()

    suspend fun emitChallenged(postId: String) {
        _challenged.emit(postId)
    }

    // Notifica cuando el usuario COMPARTE una publicación (cualquier opción
    // de ShareSheet.kt: Send to/Copy link/Instagram/WhatsApp/X), para
    // incrementar AL INSTANTE el contador de "Share" en la tarjeta cuyo
    // postId coincida — réplica nativa exacta del callback `onShared` que
    // ShareModal.jsx recibe de CarouselSlide.jsx/DuetSlide.jsx en la web
    // (`onShared={() => setShareCount((n) => n + 1)}`, incremento puramente
    // local/optimista, sin llamada al backend en ninguna de las 2
    // plataformas). BUG reportado por el usuario ("el contador de compartir
    // no muestra número" y "los botones sociales deben actualizar el
    // contador en el instante"): antes `ShareSheet` no emitía nada y
    // `SocialRail` leía siempre `post.stats?.shares` (estático, casi siempre
    // 0 porque nada lo incrementaba nunca) — el número nunca aparecía.
    private val _shared = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val shared = _shared.asSharedFlow()

    suspend fun emitShared(postId: String) {
        _shared.emit(postId)
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


// "Luxury Battle" (petición del usuario: réplica nativa de `uploadLuxuryTheme`
// en Feed.jsx web) — tema pendiente de adjuntar a la SIGUIENTE subida, más el
// modo de entrada ("challenge" = 1v1 dirigido vía "Enter with an AI photo",
// "solo" = reto abierto sin rival vía "Post a solo entry"). Escrito por
// ui/Battles.kt (botones de la hoja LuxuryBattleSheet) y consumido/limpiado
// por ui/Upload.kt al montar (LaunchedEffect(Unit)) para: saltar el
// selector de modo, mostrar el banner del tema, y precargar `promptHint` en
// el editor de fotos con IA (mismo criterio que `luxuryTheme`/`initialPrompt`
// en UploadDialog.jsx/AIImageEditor.jsx web).
object PendingLuxuryEntry {
    var theme by mutableStateOf<LuxuryTheme?>(null)
        private set
    var entryMode by mutableStateOf<String?>(null)
        private set

    fun set(theme: LuxuryTheme, entryMode: String) {
        this.theme = theme
        this.entryMode = entryMode
    }

    fun consume(): Pair<LuxuryTheme, String>? {
        val t = theme ?: return null
        val m = entryMode ?: "challenge"
        theme = null
        entryMode = null
        return t to m
    }
}
