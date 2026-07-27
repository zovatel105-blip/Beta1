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
import androidx.compose.material.icons.filled.KeyboardArrowDown
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
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
import com.twyk.app.R
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
        if (uri == null) { error = "Upload your video to challenge"; return }
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
                    .putString(UploadWorker.KEY_TARGET_POST_ID, target.postId)
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
                error = "Couldn't send the challenge. Please try again."
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.80f)).clickable { onClose() }, contentAlignment = Alignment.BottomCenter) {
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)),
        ) {
            // Glow superior con gradiente de marca (morado -> azul) — réplica
            // EXACTA de ChallengeDialog.jsx (`radial-gradient(70% 100% at 20% 0%,
            // rgba(168,85,247,0.10), transparent 60%), radial-gradient(70% 100%
            // at 80% 0%, rgba(59,130,246,0.10), transparent 60%)`, altura h-40 =
            // 160dp) — faltaba por completo en el nativo.
            Box(Modifier.fillMaxWidth().height(160.dp).align(Alignment.TopCenter)) {
                Box(
                    Modifier.fillMaxWidth(0.5f).fillMaxHeight().align(Alignment.CenterStart)
                        .background(Brush.radialGradient(0f to Color(0xFFA855F7).copy(alpha = 0.10f), 0.6f to Color.Transparent)),
                )
                Box(
                    Modifier.fillMaxWidth(0.5f).fillMaxHeight().align(Alignment.CenterEnd)
                        .background(Brush.radialGradient(0f to Color(0xFF3B82F6).copy(alpha = 0.10f), 0.6f to Color.Transparent)),
                )
            }

            Column(
                Modifier.fillMaxWidth()
                    .background(Color.White)
                    .clickable(enabled = false) {}
                    .padding(bottom = 8.dp),
            ) {
            // Flecha abajo para cerrar — réplica exacta de ChallengeDialog.jsx
            // (antes había un tirador/asa, sin acción de cerrar explícita).
            Box(
                Modifier.fillMaxWidth().statusBarsPadding().clickable { onClose() }.padding(top = 12.dp, bottom = 4.dp),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.KeyboardArrowDown, "close", tint = Color(0xFF71717A), modifier = Modifier.size(20.dp)) }

            Row(
                Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(36.dp).clip(CircleShape)
                        .background(Brush.linearGradient(listOf(Color(0xFFA855F7), Color(0xFF3B82F6)))).padding(2.dp),
                ) {
                    TwykAvatar(target.author?.avatarUrl, Modifier.fillMaxSize())
                }
                Spacer(Modifier.width(12.dp))
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // Icono de espadas antes de "CHALLENGE" — réplica de
                        // `<Swords size={11}/> Challenge` en ChallengeDialog.jsx,
                        // faltaba por completo en el nativo.
                        Icon(ImageVector.vectorResource(R.drawable.ic_swords), null, tint = Color(0xFF71717A), modifier = Modifier.size(11.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("CHALLENGE", color = Color(0xFF71717A), fontSize = 10.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.8.sp)
                    }
                    Text(
                        "Challenge @$username", color = Color(0xFF18181B), fontSize = 15.sp, fontWeight = FontWeight.Bold,
                        letterSpacing = (-0.2).sp, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                    )
                }
            }

            Box(Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    // Tu vídeo
                    Box(
                        Modifier.weight(1f).aspectRatio(0.8f).clip(RoundedCornerShape(16.dp))
                            .background(if (fileUri != null) Color.Black else Color(0xFFA855F7).copy(alpha = 0.08f))
                            .border(if (fileUri != null) 2.dp else 1.5.dp, Color(0xFFA855F7).copy(alpha = if (fileUri != null) 1f else 0.4f), RoundedCornerShape(16.dp))
                            .clickable { pickFile.launch("video/*") },
                    ) {
                        Box(Modifier.fillMaxWidth().padding(8.dp), contentAlignment = Alignment.TopStart) {
                            Box(Modifier.clip(RoundedCornerShape(50)).background(Color(0xFFA855F7)).padding(horizontal = 10.dp, vertical = 2.dp)) {
                                Text("You", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                        if (fileUri != null) {
                            AsyncImage(model = fileUri, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)), contentAlignment = Alignment.Center) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Box(Modifier.size(40.dp).clip(CircleShape).background(Color(0xFFA855F7)), contentAlignment = Alignment.Center) {
                                        Icon(Icons.Filled.Check, null, tint = Color.White, modifier = Modifier.size(20.dp))
                                    }
                                    Spacer(Modifier.height(6.dp))
                                    Text("Change video", color = Color.White.copy(alpha = 0.9f), fontSize = 11.sp, textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline)
                                }
                            }
                        } else {
                            // Icono envuelto en caja redondeada (`w-12 h-12 rounded-2xl
                            // bg-purple/20`) + 2ª línea descriptiva — ambos faltaban por
                            // completo en el nativo (réplica de ChallengeDialog.jsx).
                            Column(Modifier.fillMaxSize().padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                                Box(
                                    Modifier.size(48.dp).clip(RoundedCornerShape(16.dp)).background(Color(0xFFA855F7).copy(alpha = 0.2f)),
                                    contentAlignment = Alignment.Center,
                                ) { Icon(Icons.Filled.Upload, null, tint = Color(0xFFA855F7), modifier = Modifier.size(22.dp)) }
                                Spacer(Modifier.height(10.dp))
                                Text("Upload your video", color = Color(0xFF18181B), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
                                Spacer(Modifier.height(1.dp))
                                Text("@$username challenged with a video — match it", color = Color(0xFF71717A), fontSize = 10.5.sp, textAlign = TextAlign.Center)
                            }
                        }
                    }

                    // Vídeo retado (solo lectura)
                    Box(
                        Modifier.weight(1f).aspectRatio(0.8f).clip(RoundedCornerShape(16.dp))
                            .background(Color(0xFF3B82F6).copy(alpha = 0.08f))
                            .border(1.5.dp, Color(0xFF3B82F6).copy(alpha = 0.4f), RoundedCornerShape(16.dp)),
                    ) {
                        val posterUrl = absoluteUrl(target.posterUrl ?: target.videoUrl)
                        if (posterUrl != null) {
                            AsyncImage(model = posterUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.2f)))
                        } else {
                            // Icono envuelto + texto explicativo — faltaba por completo
                            // en el nativo (réplica de ChallengeDialog.jsx).
                            Column(Modifier.fillMaxSize().padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                                Box(
                                    Modifier.size(48.dp).clip(RoundedCornerShape(16.dp)).background(Color(0xFF3B82F6).copy(alpha = 0.18f)),
                                    contentAlignment = Alignment.Center,
                                ) { Icon(Icons.Filled.Movie, null, tint = Color(0xFF3B82F6), modifier = Modifier.size(22.dp)) }
                                Spacer(Modifier.height(10.dp))
                                Text(
                                    "They'll upload their media\nwhen accepting the challenge",
                                    color = Color(0xFF71717A), fontSize = 10.5.sp, textAlign = TextAlign.Center,
                                )
                            }
                        }
                        Box(Modifier.fillMaxWidth().padding(8.dp), contentAlignment = Alignment.TopStart) {
                            Box(Modifier.clip(RoundedCornerShape(50)).background(Color(0xFF3B82F6)).padding(horizontal = 10.dp, vertical = 2.dp)) {
                                Text("@$username", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                            }
                        }
                    }
                }

                // Insignia VS central — réplica exacta: 48dp (w-12 h-12, antes 40dp),
                // con sombra (boxShadow de la web) y texto en cursiva con tracking.
                Box(
                    Modifier.align(Alignment.Center).size(48.dp).shadow(8.dp, CircleShape).clip(CircleShape)
                        .background(Brush.linearGradient(listOf(Color(0xFFA855F7), Color(0xFF3B82F6)))),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        "VS", color = Color.White, fontWeight = FontWeight.Black, fontSize = 13.sp,
                        letterSpacing = 0.5.sp, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic,
                    )
                }
            }

            Spacer(Modifier.height(20.dp))
            Box(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp).heightIn(min = 56.dp)
                    .clip(RoundedCornerShape(16.dp)).background(Color(0xFFFAFAFA)).border(1.dp, Color(0xFFE4E4E7), RoundedCornerShape(16.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp),
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

            Spacer(Modifier.height(20.dp))
            // Réplica de la sub-frase resaltada (`@username` en zinc-700/font-medium)
            // y del sufijo "(you vs {name})", ambos ausentes en el nativo.
            Text(
                buildAnnotatedString {
                    append("A challenge request will be sent to ")
                    withStyle(androidx.compose.ui.text.SpanStyle(color = Color(0xFF3F3F46), fontWeight = FontWeight.Medium)) { append("@$username") }
                    append(". When they accept it, it will be published as a versus (you vs ${target.author?.name ?: "rival"}).")
                },
                color = Color(0xFF71717A), fontSize = 12.sp, modifier = Modifier.padding(horizontal = 20.dp),
            )

            error?.let {
                Spacer(Modifier.height(20.dp))
                Text(it, color = Color(0xFFF43F5E), fontSize = 12.sp, modifier = Modifier.padding(horizontal = 20.dp))
            }

            Spacer(Modifier.height(20.dp))
            Box(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp).height(48.dp)
                    .clip(RoundedCornerShape(50))
                    .background(if (fileUri != null) Brush.linearGradient(listOf(Color(0xFFA855F7), Color(0xFF3B82F6))) else Brush.linearGradient(listOf(Color(0xFFE4E4E7), Color(0xFFE4E4E7))))
                    .clickable(enabled = fileUri != null && !sending) { send() },
                contentAlignment = Alignment.Center,
            ) {
                if (sending) {
                    CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        // Icono de espadas — réplica exacta del botón "Send challenge"
                        // de ChallengeDialog.jsx (antes solo tenía el texto, sin icono).
                        Icon(
                            ImageVector.vectorResource(R.drawable.ic_swords), null,
                            tint = if (fileUri != null) Color.White else Color(0xFFA1A1AA), modifier = Modifier.size(18.dp),
                        )
                        Text("Send challenge", color = if (fileUri != null) Color.White else Color(0xFFA1A1AA), fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    }
                }
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
