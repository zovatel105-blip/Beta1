@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package com.twyk.app.feed

import android.content.Context
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.CacheWriter
import androidx.media3.datasource.cache.ContentMetadata
import coil.imageLoader
import coil.request.ImageRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

// ─────────────────────────────────────────────────────────────────────────────
// Precarga agresiva estilo TikTok/Reels ("el usuario NUNCA espera").
//
// Hasta ahora el feed nativo solo "calentaba" la publicación adyacente
// (beyondViewportPageCount = 1 del VerticalPager): los vídeos de 2, 3, 4
// tarjetas más adelante NO descargaban ni un byte hasta llegar a ellas — ahí
// nacía la espera que el usuario reporta. TikTok descarga por adelantado los
// primeros segundos de varios vídeos futuros mientras ves el actual.
//
// Este singleton replica esa estrategia (§1.2 del PERFORMANCE_BLUEPRINT):
//   · Al cambiar la página activa, FeedPager llama a updateWindow() con los
//     vídeos de las publicaciones i+1..i+4 e i-1 (en ese orden de prioridad).
//   · De cada vídeo se descargan los primeros PREFETCH_BYTES (~1.5 MB ≈
//     init MP4 + varios segundos a 540p) directamente a la MISMA SimpleCache
//     de disco que usan los ExoPlayer del feed (CacheWriter) — cuando la
//     tarjeta llega a pantalla, el reproductor lee de disco y arranca al
//     instante sin tocar la red.
//   · Máximo 3 descargas simultáneas (Semaphore JUSTO/FIFO: se respeta el
//     orden de prioridad por cercanía) para no robarle ancho de banda al
//     vídeo que se está reproduciendo AHORA.
//   · Lo que sale de la ventana (scroll rápido) se CANCELA al momento
//     (writer.cancel() + job.cancel()) — cero bytes desperdiciados en
//     publicaciones que ya no vienen.
//   · Los pósters (frame 1, generados por el backend con ffmpeg) se
//     precalientan con Coil (memoria + disco): la tarjeta siguiente SIEMPRE
//     tiene una imagen que pintar a 0 ms (ver poster overlay en VideoSurface).
//
// NOTA: no se precarga la página ACTIVA — sus 2 ExoPlayers ya están
// descargando/reproduciendo y escriben en la misma caché por sí mismos.
// ─────────────────────────────────────────────────────────────────────────────
object FeedPrefetcher {
    // ~1.5 MB por vídeo ≈ moov+init y 3-6 s de contenido a 540p — suficiente
    // para arrancar al instante Y seguir reproduciendo mientras ExoPlayer
    // rellena el resto en streaming (§1.4 del blueprint: "init + primeros
    // segundos", no el clip entero: 8 vídeos/ventana × 1.5 MB = ~12 MB).
    private const val PREFETCH_BYTES = 1_500_000L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val gate = Semaphore(3) // máx 3 descargas a la vez, FIFO

    private class Task(val writer: CacheWriter, val job: Job)

    private val tasks = LinkedHashMap<String, Task>()
    private val lock = Any()

    // ¿Ya tenemos en disco todo lo que precargaríamos de este vídeo?
    // OJO con clips más cortos que PREFETCH_BYTES: si el fichero entero mide
    // p. ej. 900 KB y ya está cacheado completo, isCached(0, 1.5MB) daría
    // false y relanzaríamos una descarga inútil en CADA cambio de página.
    // Por eso el objetivo real es min(contentLength, PREFETCH_BYTES) cuando
    // la longitud ya es conocida por la caché.
    private fun alreadyCached(cache: Cache, key: String): Boolean {
        val contentLength = ContentMetadata.getContentLength(cache.getContentMetadata(key))
        val target = if (contentLength != C.LENGTH_UNSET) {
            minOf(contentLength, PREFETCH_BYTES)
        } else {
            PREFETCH_BYTES
        }
        if (target <= 0) return true
        return cache.getCachedBytes(key, 0, target) >= target
    }

    // urls YA absolutas (ver absoluteUrl en Config.kt), ordenadas por
    // prioridad (la más cercana al usuario primero).
    fun updateWindow(context: Context, videoUrls: List<String>, posterUrls: List<String>) {
        val app = context.applicationContext

        // Pósters: Coil dedupe/cachea solo (memoria + disco), fire-and-forget.
        for (p in posterUrls) {
            app.imageLoader.enqueue(ImageRequest.Builder(app).data(p).build())
        }

        val cache = VideoCache.cache(app)
        synchronized(lock) {
            // 1) Cancelar lo que quedó fuera de la nueva ventana.
            val it = tasks.entries.iterator()
            while (it.hasNext()) {
                val entry = it.next()
                if (entry.key !in videoUrls) {
                    runCatching { entry.value.writer.cancel() }
                    entry.value.job.cancel()
                    it.remove()
                }
            }
            // 2) Lanzar (en orden de prioridad) lo que falte.
            for (url in videoUrls) {
                if (tasks.containsKey(url)) continue
                if (runCatching { alreadyCached(cache, url) }.getOrDefault(false)) continue
                val dataSource = VideoCache.cacheDataSourceFactory(app).createDataSource()
                val spec = DataSpec.Builder()
                    .setUri(Uri.parse(url))
                    .setPosition(0)
                    .setLength(PREFETCH_BYTES)
                    .build()
                val writer = CacheWriter(dataSource, spec, null, null)
                // runCatching: red caída, 416 en clips cortos, cancelación…
                // un prefetch NUNCA debe tumbar nada — es solo una mejora.
                val job = scope.launch { gate.withPermit { runCatching { writer.cache() } } }
                job.invokeOnCompletion {
                    synchronized(lock) { if (tasks[url]?.job === job) tasks.remove(url) }
                }
                tasks[url] = Task(writer, job)
            }
        }
    }
}
