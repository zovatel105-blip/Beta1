package com.twyk.app.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import coil.compose.AsyncImage
import com.twyk.app.absoluteUrl
import com.twyk.app.data.ChallengeBanner
import com.twyk.app.data.QuickChallengeTarget
import com.twyk.app.data.UploadWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

// "Retar rápido" a una publicación concreta del feed — réplica de
// ChallengeDialog.jsx: subes tu vídeo para enfrentarlo con el vídeo/autor
// retado. La subida real ocurre en segundo plano (reutiliza UploadWorker con
// type="challenge") y este diálogo se cierra al instante al enviar.
@Composable
fun QuickChallengeSheet(target: QuickChallengeTarget, onClose: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var fileUri by remember { mutableStateOf<Uri?>(null) }
    var message by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var sending by remember { mutableStateOf(false) }

    val username = target.author?.username ?: "rival"
    val pickFile = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { fileUri = it }

    fun send() {
        val uri = fileUri
        if (uri == null) { error = "Sube tu vídeo para retar"; return }
        if (sending) return
        sending = true
        error = null
        scope.launch {
            try {
                val queueId = UUID.randomUUID().toString()
                val filePath = withContext(Dispatchers.IO) { persistPickedFile(context, "challenge", uri).absolutePath }
                val data = Data.Builder()
                    .putString(UploadWorker.KEY_QUEUE_ID, queueId)
                    .putString(UploadWorker.KEY_TYPE, "challenge")
                    .putString(UploadWorker.KEY_FILE_A, filePath)
                    .putString(UploadWorker.KEY_DESCRIPTION, message)
                    .putString(UploadWorker.KEY_TARGET_USERNAME, target.author?.username ?: "")
                    .putString(UploadWorker.KEY_TARGET_NAME, target.author?.name ?: target.author?.username ?: "")
                    .putString(UploadWorker.KEY_TARGET_AVATAR, target.author?.avatarUrl ?: "")
                    .putString(UploadWorker.KEY_TARGET_VIDEO_URL, target.videoUrl ?: "")
                    .putString(UploadWorker.KEY_TARGET_POSTER_URL, target.posterUrl ?: "")
                    .putString(UploadWorker.KEY_TARGET_DESCRIPTION, target.description ?: "")
                    .putString(UploadWorker.KEY_TARGET_MUSIC, target.music ?: "")
                    .build()
                ChallengeBanner.show("uploading", 0, username)
                val request = OneTimeWorkRequestBuilder<UploadWorker>()
                    .setInputData(data)
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .build()
                WorkManager.getInstance(context).enqueueUniqueWork(queueId, ExistingWorkPolicy.KEEP, request)
                onClose()
            } catch (e: Exception) {
                sending = false
                error = "No se pudo enviar el reto. Inténtalo de nuevo."
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.75f)).clickable { onClose() }, contentAlignment = Alignment.BottomCenter) {
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart = 26.dp, topEnd = 26.dp))
                .background(Color.White)
                .clickable(enabled = false) {}
                .padding(bottom = 8.dp),
        ) {
            Box(Modifier.fillMaxWidth().statusBarsPadding().padding(top = 10.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.size(width = 36.dp, height = 4.dp).clip(RoundedCornerShape(2.dp)).background(Color(0xFFD4D4D8)))
            }

            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(36.dp).clip(CircleShape)
                        .background(Brush.linearGradient(listOf(Color(0xFFA855F7), Color(0xFF3B82F6)))).padding(2.dp),
                ) {
                    TwykAvatar(target.author?.avatarUrl, Modifier.fillMaxSize())
                }
                Spacer(Modifier.width(10.dp))
                Column {
                    Text("CHALLENGE", color = Color(0xFF71717A), fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
                    Text("Challenge @$username", color = Color(0xFF18181B), fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
            }

            Box(Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    // Tu vídeo
                    Box(
                        Modifier.weight(1f).aspectRatio(0.8f).clip(RoundedCornerShape(18.dp))
                            .background(if (fileUri != null) Color.Black else Color(0xFFA855F7).copy(alpha = 0.08f))
                            .border(if (fileUri != null) 2.dp else 1.5.dp, Color(0xFFA855F7).copy(alpha = if (fileUri != null) 1f else 0.4f), RoundedCornerShape(18.dp))
                            .clickable { pickFile.launch("video/*") },
                    ) {
                        Box(Modifier.fillMaxWidth().padding(8.dp), contentAlignment = Alignment.TopStart) {
                            Box(Modifier.clip(RoundedCornerShape(50)).background(Color(0xFFA855F7)).padding(horizontal = 8.dp, vertical = 2.dp)) {
                                Text("You", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                        if (fileUri != null) {
                            AsyncImage(model = fileUri, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)), contentAlignment = Alignment.Center) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Box(Modifier.size(36.dp).clip(CircleShape).background(Color(0xFFA855F7)), contentAlignment = Alignment.Center) {
                                        Icon(Icons.Filled.Check, null, tint = Color.White, modifier = Modifier.size(18.dp))
                                    }
                                    Spacer(Modifier.height(6.dp))
                                    Text("Change video", color = Color.White, fontSize = 10.sp)
                                }
                            }
                        } else {
                            Column(Modifier.fillMaxSize().padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                                Icon(Icons.Filled.Upload, null, tint = Color(0xFFA855F7), modifier = Modifier.size(22.dp))
                                Spacer(Modifier.height(8.dp))
                                Text("Upload your video", color = Color(0xFF18181B), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
                            }
                        }
                    }

                    // Vídeo retado (solo lectura)
                    Box(
                        Modifier.weight(1f).aspectRatio(0.8f).clip(RoundedCornerShape(18.dp))
                            .background(Color(0xFF3B82F6).copy(alpha = 0.08f))
                            .border(1.5.dp, Color(0xFF3B82F6).copy(alpha = 0.4f), RoundedCornerShape(18.dp)),
                    ) {
                        val posterUrl = absoluteUrl(target.posterUrl ?: target.videoUrl)
                        if (posterUrl != null) {
                            AsyncImage(model = posterUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.2f)))
                        } else {
                            Column(Modifier.fillMaxSize().padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                                Icon(Icons.Filled.Movie, null, tint = Color(0xFF3B82F6), modifier = Modifier.size(22.dp))
                            }
                        }
                        Box(Modifier.fillMaxWidth().padding(8.dp), contentAlignment = Alignment.TopStart) {
                            Box(Modifier.clip(RoundedCornerShape(50)).background(Color(0xFF3B82F6)).padding(horizontal = 8.dp, vertical = 2.dp)) {
                                Text("@$username", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                            }
                        }
                    }
                }

                // Insignia VS central
                Box(Modifier.align(Alignment.Center).size(40.dp).clip(CircleShape).background(Brush.linearGradient(listOf(Color(0xFFA855F7), Color(0xFF3B82F6)))), contentAlignment = Alignment.Center) {
                    Text("VS", color = Color.White, fontWeight = FontWeight.Black, fontSize = 12.sp)
                }
            }

            Spacer(Modifier.height(16.dp))
            Box(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp).heightIn(min = 56.dp)
                    .clip(RoundedCornerShape(16.dp)).background(Color(0xFFFAFAFA)).border(1.dp, Color(0xFFE4E4E7), RoundedCornerShape(16.dp))
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            ) {
                if (message.isEmpty()) Text("Add a message to the challenge (optional)…", color = Color(0xFFA1A1AA), fontSize = 14.sp)
                BasicTextField(
                    value = message,
                    onValueChange = { message = it },
                    textStyle = TextStyle(color = Color(0xFF18181B), fontSize = 14.sp),
                    cursorBrush = SolidColor(Color(0xFF18181B)),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Text(
                "A challenge request will be sent to @$username. When they accept it, it will be published as a versus.",
                color = Color(0xFF71717A), fontSize = 12.sp, modifier = Modifier.padding(horizontal = 20.dp, top = 10.dp),
            )

            error?.let {
                Text(it, color = Color(0xFFEF4444), fontSize = 12.sp, modifier = Modifier.padding(horizontal = 20.dp, top = 8.dp))
            }

            Box(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp).height(50.dp)
                    .clip(RoundedCornerShape(50))
                    .background(if (fileUri != null) Brush.linearGradient(listOf(Color(0xFFA855F7), Color(0xFF3B82F6))) else Brush.linearGradient(listOf(Color(0xFFE4E4E7), Color(0xFFE4E4E7))))
                    .clickable(enabled = fileUri != null && !sending) { send() },
                contentAlignment = Alignment.Center,
            ) {
                if (sending) {
                    CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                } else {
                    Text("Send challenge", color = if (fileUri != null) Color.White else Color(0xFFA1A1AA), fontWeight = FontWeight.Bold, fontSize = 15.sp)
                }
            }
        }
    }
}

// Banner flotante sobre el feed mientras se envía un reto en segundo plano —
// réplica del banner `challengeUpload` de Feed.jsx.
@Composable
fun ChallengeBannerHost() {
    val banner = ChallengeBanner.state
    LaunchedEffect(banner?.status) {
        when (banner?.status) {
            "done" -> { delay(4000); ChallengeBanner.clear() }
            "error" -> { delay(5000); ChallengeBanner.clear() }
            else -> {}
        }
    }
    banner?.let {
        Box(Modifier.fillMaxWidth().statusBarsPadding().padding(top = 12.dp, start = 12.dp, end = 12.dp)) {
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color(0xFF161618).copy(alpha = 0.97f))
                    .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(18.dp))
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    when (it.status) {
                        "uploading" -> {
                            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(30.dp))
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text("Sending challenge to @${it.username}", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                Spacer(Modifier.height(5.dp))
                                Box(Modifier.fillMaxWidth().height(3.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.12f))) {
                                    Box(Modifier.fillMaxWidth(it.progress / 100f).fillMaxSize().background(Color.White))
                                }
                            }
                            Spacer(Modifier.width(8.dp))
                            Text("${it.progress}%", color = Color.White.copy(alpha = 0.7f), fontSize = 12.sp)
                        }
                        "done" -> {
                            Box(Modifier.size(30.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
                                Icon(Icons.Filled.Check, null, tint = Color.Black, modifier = Modifier.size(16.dp))
                            }
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text("Challenge sent to @${it.username}", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                Text("We will notify you when they accept", color = Color(0xFFA1A1AA), fontSize = 12.sp)
                            }
                        }
                        else -> {
                            Box(Modifier.size(30.dp).clip(CircleShape).background(Color(0xFFEF4444).copy(alpha = 0.2f)), contentAlignment = Alignment.Center) {
                                Icon(Icons.Filled.Close, null, tint = Color(0xFFFB7185), modifier = Modifier.size(16.dp))
                            }
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text("Couldn't send the challenge", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                                Text("Try again", color = Color(0xFFA1A1AA), fontSize = 12.sp)
                            }
                            Box(Modifier.size(24.dp).clip(CircleShape).clickable { ChallengeBanner.clear() }, contentAlignment = Alignment.Center) {
                                Icon(Icons.Filled.Close, null, tint = Color(0xFFA1A1AA), modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}
