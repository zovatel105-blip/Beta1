package com.twyk.app.data

import android.content.Context
import android.webkit.MimeTypeMap
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.gson.Gson
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import java.io.File

// Worker que ejecuta la subida REAL en segundo plano (sobrevive a cerrar la
// pantalla de subir; WorkManager la reintenta si falla o si el sistema mata
// el proceso). Ver data/UploadQueue.kt para el estado observado por la UI y
// ui/Upload.kt para dónde se encola este trabajo.
class UploadWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {

    companion object {
        const val KEY_QUEUE_ID = "queueId"
        const val KEY_TYPE = "type" // versus | duet | challenge
        const val KEY_FILE_A = "fileA"
        const val KEY_FILE_B = "fileB"
        const val KEY_DESCRIPTION = "description"
        const val KEY_LAYOUT = "layout"
        const val KEY_TARGET_USERNAME = "targetUsername"
        const val KEY_TARGET_NAME = "targetName"
        const val KEY_TARGET_AVATAR = "targetAvatar"
        const val KEY_TARGET_VIDEO_URL = "targetVideoUrl"
        const val KEY_TARGET_POSTER_URL = "targetPosterUrl"
        const val KEY_TARGET_DESCRIPTION = "targetDescription"
        const val KEY_TARGET_MUSIC = "targetMusic"
        // postId de la publicación retada (flujo "Retar rápido" desde el rail
        // del feed) — se usa para emitir PostEvents.emitChallenged(postId) al
        // completar la subida y así incrementar el contador de "Retar" en esa
        // tarjeta, igual que el evento `twyk:challenged` de la web. Vacío en el
        // flujo de reto normal (elegir a quién retar sin partir de un post).
        const val KEY_TARGET_POST_ID = "targetPostId"
        // Música elegida por el propio usuario al publicar (iTunes, ver
        // ui/Music.kt) — NO confundir con KEY_TARGET_MUSIC (la música YA
        // adjunta al contenido retado, en el flujo de "Retar rápido").
        const val KEY_MUSIC_TITLE = "musicTitle"
        const val KEY_MUSIC_ARTIST = "musicArtist"
        const val KEY_MUSIC_ARTWORK = "musicArtwork"
        const val KEY_MUSIC_PREVIEW_URL = "musicPreviewUrl"
        const val KEY_MUSIC_TRACK_ID = "musicTrackId"
    }

    override suspend fun doWork(): Result {
        val queueId = inputData.getString(KEY_QUEUE_ID) ?: id.toString()
        val type = inputData.getString(KEY_TYPE) ?: "versus"
        val fileA = inputData.getString(KEY_FILE_A)?.let { File(it) }
        val fileB = inputData.getString(KEY_FILE_B)?.let { File(it) }
        val description = inputData.getString(KEY_DESCRIPTION).orEmpty()
        val targetUsername = inputData.getString(KEY_TARGET_USERNAME).orEmpty()

        // Reporta el progreso combinado (0-100) a la cola en memoria que observa
        // la UI del perfil, calculado a partir de los bytes escritos de cada
        // parte multipart mientras se sube. Para "challenge" también actualiza
        // el banner flotante sobre el feed (ver ui/QuickChallenge.kt).
        var progressA = 0
        var progressB = if (fileB == null) 100 else 0
        fun report() {
            val pct = (progressA + progressB) / 2
            UploadQueue.updateProgress(queueId, pct)
            if (type == "challenge") ChallengeBanner.show("uploading", pct, targetUsername)
        }

        return try {
            val textType = "text/plain".toMediaTypeOrNull()
            val musicTitle = musicPart(inputData.getString(KEY_MUSIC_TITLE))
            val musicArtist = musicPart(inputData.getString(KEY_MUSIC_ARTIST))
            val musicArtwork = musicPart(inputData.getString(KEY_MUSIC_ARTWORK))
            val musicPreviewUrl = musicPart(inputData.getString(KEY_MUSIC_PREVIEW_URL))
            val musicTrackId = musicPart(inputData.getString(KEY_MUSIC_TRACK_ID))
            val response = when (type) {
                "challenge" -> {
                    val a = fileA ?: return Result.failure()
                    val part = progressPart("file", a) { progressA = it; report() }
                    val targetJson = Gson().toJson(
                        mapOf(
                            "username" to targetUsername,
                            "name" to inputData.getString(KEY_TARGET_NAME).orEmpty(),
                            "avatarUrl" to inputData.getString(KEY_TARGET_AVATAR).orEmpty(),
                        ),
                    )
                    RetrofitProvider.api.createChallenge(
                        part,
                        targetJson.toRequestBody(textType),
                        description.toRequestBody(textType),
                        inputData.getString(KEY_TARGET_VIDEO_URL).orEmpty().toRequestBody(textType),
                        inputData.getString(KEY_TARGET_POSTER_URL).orEmpty().toRequestBody(textType),
                        inputData.getString(KEY_TARGET_DESCRIPTION).orEmpty().toRequestBody(textType),
                        inputData.getString(KEY_TARGET_MUSIC).orEmpty().toRequestBody(textType),
                        musicTitle, musicArtist, musicArtwork, musicPreviewUrl, musicTrackId,
                    )
                    null
                }
                "duet" -> {
                    val a = fileA ?: return Result.failure()
                    val b = fileB ?: return Result.failure()
                    val layout = inputData.getString(KEY_LAYOUT) ?: "horizontal"
                    val pa = progressPart("fileA", a) { progressA = it; report() }
                    val pb = progressPart("fileB", b) { progressB = it; report() }
                    RetrofitProvider.api.uploadDuet(
                        pa, pb, description.toRequestBody(textType), layout.toRequestBody(textType),
                        musicTitle, musicArtist, musicArtwork, musicPreviewUrl, musicTrackId,
                    ).post
                }
                else -> {
                    val a = fileA ?: return Result.failure()
                    val b = fileB ?: return Result.failure()
                    val pa = progressPart("fileA", a) { progressA = it; report() }
                    val pb = progressPart("fileB", b) { progressB = it; report() }
                    RetrofitProvider.api.uploadVersus(
                        pa, pb, description.toRequestBody(textType),
                        musicTitle, musicArtist, musicArtwork, musicPreviewUrl, musicTrackId,
                    ).post
                }
            }
            fileA?.delete()
            fileB?.delete()
            UploadQueue.remove(queueId)
            if (type == "challenge") {
                ChallengeBanner.show("done", 100, targetUsername)
                // Incrementa el contador de "Retar" en la tarjeta del feed cuyo
                // postId coincida (réplica del evento `twyk:challenged` que la
                // web dispara al completar la subida del reto).
                inputData.getString(KEY_TARGET_POST_ID)?.takeIf { it.isNotBlank() }?.let {
                    PostEvents.emitChallenged(it)
                }
            }
            response?.let { UploadEvents.emitPostCreated(it) }
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 2) {
                Result.retry()
            } else {
                UploadQueue.markFailed(queueId)
                if (type == "challenge") ChallengeBanner.show("error", 0, targetUsername)
                Result.failure()
            }
        }
    }
}

// Parte multipart de TEXTO opcional: si el valor es nulo/vacío, devuelve null
// (Retrofit omite por completo la parte @Part si su RequestBody es null), en
// vez de enviar una cadena vacía — así el backend (readMusicFields en
// route.js) no la confunde con "hay música pero está vacía".
private fun musicPart(value: String?): RequestBody? =
    if (value.isNullOrBlank()) null else value.toRequestBody("text/plain".toMediaTypeOrNull())

// Content-Type real del archivo persistido (imagen o vídeo; ver
// persistPickedFile en ui/Upload.kt, que ya guarda con la extensión
// correcta) — el backend (mediaKind() en route.js) lee primero el
// Content-Type de la parte multipart, así que NO puede ser siempre
// "video/*" o toda foto llegaría marcada como vídeo.
private val IMAGE_EXTENSIONS = setOf("jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif")
private fun guessContentType(file: File): okhttp3.MediaType? {
    val ext = file.extension.lowercase()
    val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
        ?: if (ext in IMAGE_EXTENSIONS) "image/$ext" else "video/mp4"
    return mime.toMediaTypeOrNull()
}

// RequestBody que reporta el progreso de escritura (0-100) mientras sube el
// archivo — OkHttp no expone esto de forma nativa en multipart.
private fun progressPart(name: String, file: File, onProgress: (Int) -> Unit): MultipartBody.Part {
    val body = object : RequestBody() {
        override fun contentType() = guessContentType(file)
        override fun contentLength(): Long = file.length()
        override fun writeTo(sink: BufferedSink) {
            val total = file.length().coerceAtLeast(1L)
            var uploaded = 0L
            var lastPct = -1
            file.inputStream().use { input ->
                val buffer = ByteArray(8192)
                while (true) {
                    val read = input.read(buffer)
                    if (read == -1) break
                    sink.write(buffer, 0, read)
                    uploaded += read
                    val pct = ((uploaded * 100) / total).toInt()
                    if (pct != lastPct) {
                        lastPct = pct
                        onProgress(pct)
                    }
                }
            }
        }
    }
    return MultipartBody.Part.createFormData(name, file.name, body)
}
