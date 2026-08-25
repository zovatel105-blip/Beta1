@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package com.twyk.app.feed

import android.content.Context
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import java.io.File

// Cache en disco LRU (512 MB) compartida -> la re-reproduccion de un video ya
// visto es instantanea (misma idea que compose-reels). Singleton para toda la app.
// 150 MB -> 512 MB: con la precarga agresiva de FeedPrefetcher (~1.5 MB por
// video de las proximas 4 publicaciones) 150 MB expulsaba (LRU) videos vistos
// hace poco; 512 MB retiene ~1h de sesion tipica sin re-descargar nada.
object VideoCache {
    private const val MAX_BYTES = 512L * 1024 * 1024

    @Volatile
    private var cache: SimpleCache? = null

    // Publico: FeedPrefetcher lo usa para saber que hay ya en disco
    // (getCachedBytes/getContentMetadata) antes de lanzar una descarga.
    fun cache(context: Context): SimpleCache {
        return cache ?: synchronized(this) {
            cache ?: SimpleCache(
                File(context.applicationContext.cacheDir, "media"),
                LeastRecentlyUsedCacheEvictor(MAX_BYTES),
                StandaloneDatabaseProvider(context.applicationContext),
            ).also { cache = it }
        }
    }

    fun cacheDataSourceFactory(context: Context): CacheDataSource.Factory {
        // Timeouts agresivos (8 s en vez de los 8/30 s por defecto de
        // conectar/leer): en red movil mala es mejor fallar rapido y que el
        // reproductor reintente (o el poster cubra el hueco) que colgarse.
        val http = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(8_000)
            .setReadTimeoutMs(8_000)
        val upstream = DefaultDataSource.Factory(context.applicationContext, http)
        return CacheDataSource.Factory()
            .setCache(cache(context))
            .setUpstreamDataSourceFactory(upstream)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
    }
}
