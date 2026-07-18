package com.twyk.app.data

import android.content.Context
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
                    )
                    null
                }
                "duet" -> {
                    val a = fileA ?: return Result.failure()
                    val b = fileB ?: return Result.failure()
                    val layout = inputData.getString(KEY_LAYOUT) ?: "horizontal"
                    val pa = progressPart("fileA", a) { progressA = it; report() }
                    val pb = progressPart("fileB", b) { progressB = it; report() }
                    RetrofitProvider.api.uploadDuet(pa, pb, description.toRequestBody(textType), layout.toRequestBody(textType)).post
                }
                else -> {
                    val a = fileA ?: return Result.failure()
                    val b = fileB ?: return Result.failure()
                    val pa = progressPart("fileA", a) { progressA = it; report() }
                    val pb = progressPart("fileB", b) { progressB = it; report() }
                    RetrofitProvider.api.uploadVersus(pa, pb, description.toRequestBody(textType)).post
                }
            }
            fileA?.delete()
            fileB?.delete()
            UploadQueue.remove(queueId)
            if (type == "challenge") ChallengeBanner.show("done", 100, targetUsername)
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

// RequestBody que reporta el progreso de escritura (0-100) mientras sube el
// archivo — OkHttp no expone esto de forma nativa en multipart.
private fun progressPart(name: String, file: File, onProgress: (Int) -> Unit): MultipartBody.Part {
    val body = object : RequestBody() {
        override fun contentType() = "video/*".toMediaTypeOrNull()
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
