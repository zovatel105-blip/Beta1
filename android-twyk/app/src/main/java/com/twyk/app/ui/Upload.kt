package com.twyk.app.ui

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Search
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
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
import com.twyk.app.data.MusicTrack
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import com.twyk.app.data.UploadQueue
import com.twyk.app.data.UploadWorker
import com.twyk.app.data.User
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

// SUBIR — réplica de UploadDialog.jsx: modo (Versus / 1vs1 / Retos) → vídeos →
// (a quién retar) → subiendo.
@Composable
fun UploadScreen(onRequireAuth: () -> Unit, onDone: () -> Unit) {
    if (Session.token == null) {
        LoginPrompt("Sign in to post", onRequireAuth, Icons.Filled.Movie)
        return
    }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var step by remember { mutableStateOf("mode") } // mode | file | target | uploading
    var selected by remember { mutableStateOf("versus") } // versus | duet | challenge (en paso mode)
    var mode by remember { mutableStateOf("versus") }
    var layout by remember { mutableStateOf("horizontal") }
    var uriA by remember { mutableStateOf<Uri?>(null) }
    var uriB by remember { mutableStateOf<Uri?>(null) }
    var mediaKindA by remember { mutableStateOf<String?>(null) } // "image" | "video"
    var mediaKindB by remember { mutableStateOf<String?>(null) }
    var description by remember { mutableStateOf("") }
    var music by remember { mutableStateOf<MusicTrack?>(null) }
    var musicPickerOpen by remember { mutableStateOf(false) }
    var users by remember { mutableStateOf<List<User>>(emptyList()) }
    var usersLoading by remember { mutableStateOf(false) }
    var userQuery by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    // Réplica de la validación de UploadDialog.jsx: acepta vídeo O foto (nunca
    // mezclados), ambos lados (A/B) deben ser del MISMO tipo, y cada tipo
    // tiene su propio límite de tamaño (vídeo 80MB, foto 15MB).
    fun handlePicked(uri: Uri?, isSideA: Boolean) {
        if (uri == null) return
        val kind = mediaKindOf(context, uri)
        val otherKind = if (isSideA) mediaKindB else mediaKindA
        if (mode != "challenge" && otherKind != null && kind != otherKind) {
            error = "Both sides must be the same type: 2 videos or 2 photos."
            return
        }
        val maxBytes = if (kind == "image") MAX_IMAGE_BYTES else MAX_VIDEO_BYTES
        val size = fileSizeOf(context, uri)
        if (size > 0 && size > maxBytes) {
            error = if (kind == "image") "Photo can't exceed 15MB." else "Video can't exceed 80MB."
            return
        }
        error = null
        if (isSideA) { uriA = uri; mediaKindA = kind } else { uriB = uri; mediaKindB = kind }
    }

    val pickA = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { handlePicked(it, true) }
    val pickB = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { handlePicked(it, false) }

    LaunchedEffect(step) {
        if (step == "target") {
            usersLoading = true
            userQuery = ""
            users = runCatching { RetrofitProvider.api.users(null).users.orEmpty() }.getOrDefault(emptyList())
            usersLoading = false
        }
    }

    fun doUpload(target: User?) {
        error = null
        scope.launch {
            try {
                val a = uriA ?: throw IllegalStateException("Missing video")
                val queueId = UUID.randomUUID().toString()
                val descFinal = when (mode) {
                    "duet" -> description.ifBlank { "Who wins? 🥊 #1vs1" }
                    "challenge" -> description
                    else -> description.ifBlank { "Which do you prefer? 🅰️🆚🅱️" }
                }
                val dataBuilder = Data.Builder()
                    .putString(UploadWorker.KEY_QUEUE_ID, queueId)
                    .putString(UploadWorker.KEY_TYPE, mode)
                    .putString(UploadWorker.KEY_DESCRIPTION, descFinal)

                withContext(Dispatchers.IO) {
                    dataBuilder.putString(UploadWorker.KEY_FILE_A, persistPickedFile(context, "a", a).absolutePath)
                    music?.let { m ->
                        dataBuilder.putString(UploadWorker.KEY_MUSIC_TITLE, m.title.orEmpty())
                        dataBuilder.putString(UploadWorker.KEY_MUSIC_ARTIST, m.artist.orEmpty())
                        dataBuilder.putString(UploadWorker.KEY_MUSIC_ARTWORK, m.artwork.orEmpty())
                        dataBuilder.putString(UploadWorker.KEY_MUSIC_PREVIEW_URL, m.previewUrl.orEmpty())
                        dataBuilder.putString(UploadWorker.KEY_MUSIC_TRACK_ID, m.id.orEmpty())
                    }
                    when (mode) {
                        "challenge" -> {
                            val tgt = target ?: throw IllegalStateException("No target")
                            dataBuilder.putString(UploadWorker.KEY_TARGET_USERNAME, tgt.username ?: "")
                            dataBuilder.putString(UploadWorker.KEY_TARGET_NAME, tgt.name ?: tgt.username ?: "")
                            dataBuilder.putString(UploadWorker.KEY_TARGET_AVATAR, tgt.avatarUrl ?: "")
                        }
                        else -> {
                            val b = uriB ?: throw IllegalStateException("Missing video B")
                            dataBuilder.putString(UploadWorker.KEY_FILE_B, persistPickedFile(context, "b", b).absolutePath)
                            if (mode == "duet") dataBuilder.putString(UploadWorker.KEY_LAYOUT, layout)
                        }
                    }
                }

                // Encola la subida REAL en segundo plano (sobrevive a cerrar esta
                // pantalla) y cierra el diálogo al instante — igual que la web.
                UploadQueue.enqueue(queueId, mode)
                val request = OneTimeWorkRequestBuilder<UploadWorker>()
                    .setInputData(dataBuilder.build())
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .build()
                WorkManager.getInstance(context).enqueueUniqueWork(queueId, ExistingWorkPolicy.KEEP, request)

                onDone()
            } catch (e: Exception) {
                error = "Upload failed. Check your session and videos."
            }
        }
    }

    val title = when (step) {
        "mode" -> "Create content"
        "target" -> "Choose who to challenge"
        "file" -> if (mode == "versus") "Your 2 videos" else if (mode == "challenge") "Your challenge" else "Your 1vs1"
        else -> if (mode == "challenge") "Sending challenge" else "Uploading"
    }

    Box(Modifier.fillMaxSize().background(TwykBg)) {
        GoldGlow(height = 176.dp, alpha = 0.07f)

        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            // Header
            Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (step == "file" || step == "target") {
                    Box(Modifier.size(36.dp).clip(CircleShape).clickable { step = if (step == "target") "file" else "mode" }, contentAlignment = Alignment.Center) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "back", tint = Color.White, modifier = Modifier.size(20.dp))
                    }
                } else {
                    Spacer(Modifier.width(6.dp))
                }
                Text(title, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f).padding(start = 4.dp))
                Box(Modifier.size(36.dp).clip(CircleShape).clickable { onDone() }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Close, "close", tint = ZincText, modifier = Modifier.size(20.dp))
                }
            }

            when (step) {
                "mode" -> ModeStep(selected = selected, onSelect = { selected = it }, onContinue = { mode = selected; step = "file" })
                "file" -> FileStep(
                    mode = mode,
                    layout = layout,
                    onLayout = { layout = it },
                    uriA = uriA,
                    uriB = uriB,
                    description = description,
                    onDescription = { description = it },
                    music = music,
                    onPickMusic = { musicPickerOpen = true },
                    onRemoveMusic = { music = null },
                    error = error,
                    onPickA = { pickA.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)) },
                    onPickB = { pickB.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)) },
                    onPublish = { if (mode == "challenge") { if (uriA != null) step = "target" else error = "Upload your challenge video or photo" } else doUpload(null) },
                )
                "target" -> TargetStep(
                    users = users,
                    loading = usersLoading,
                    query = userQuery,
                    onQuery = { userQuery = it },
                    error = error,
                    onPick = { doUpload(it) },
                )
                else -> UploadingStep(mode)
            }
        }

        if (musicPickerOpen) {
            MusicPickerSheet(
                onClose = { musicPickerOpen = false },
                onSelect = { music = it },
            )
        }
    }
}

@Composable
private fun ModeStep(selected: String, onSelect: (String) -> Unit, onContinue: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(8.dp))
        // Segmentado
        Row(
            Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.06f)).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(50)).padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            ModeSeg("Versus", selected == "versus") { onSelect("versus") }
            ModeSeg("1 vs 1", selected == "duet") { onSelect("duet") }
            ModeSeg("Retos", selected == "challenge") { onSelect("challenge") }
        }

        Column(Modifier.weight(1f).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Box(
                Modifier.size(96.dp).clip(RoundedCornerShape(28.dp)).background(Color.White.copy(alpha = 0.04f)).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(28.dp)),
                contentAlignment = Alignment.Center,
            ) {
                val icon: ImageVector = when (selected) {
                    "duet" -> Icons.Filled.People
                    else -> Icons.Filled.Movie
                }
                if (selected == "challenge") {
                    Icon(ImageVector.vectorResource(R.drawable.ic_swords), null, tint = TwykGold, modifier = Modifier.size(44.dp))
                } else {
                    Icon(icon, null, tint = TwykGold, modifier = Modifier.size(44.dp))
                }
            }
            Spacer(Modifier.height(28.dp))
            Text(
                when (selected) {
                    "versus" -> "Upload 2 videos or 2 photos (A and B) and let people vote by swiping between them."
                    "duet" -> "Upload 2 videos or 2 photos (A and B) in the format you choose and let people vote who wins."
                    else -> "Upload your video or photo and challenge a creator. It will appear in their active challenges for them to accept."
                },
                color = ZincText, fontSize = 15.sp, textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(40.dp))
            if (selected == "challenge") {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    MiniTile("YOU", strong = true)
                    Text("VS", color = Color.White.copy(alpha = 0.6f), fontSize = 16.sp, fontWeight = FontWeight.Black)
                    MiniTile("RIVAL", strong = false)
                }
            } else {
                Row(
                    Modifier.width(192.dp).height(128.dp).clip(RoundedCornerShape(16.dp)).border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.02f)).padding(10.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Box(Modifier.weight(1f).fillMaxSize().clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.10f)), contentAlignment = Alignment.Center) { Text("A", color = Color.White.copy(alpha = 0.7f), fontWeight = FontWeight.Bold) }
                    Box(Modifier.weight(1f).fillMaxSize().clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.06f)), contentAlignment = Alignment.Center) { Text("B", color = Color.White.copy(alpha = 0.5f), fontWeight = FontWeight.Bold) }
                }
            }
        }

        Box(
            Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(50)).background(Color.White).clickable { onContinue() },
            contentAlignment = Alignment.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Continue", color = Color.Black, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Icon(Icons.Filled.ChevronRight, null, tint = Color.Black, modifier = Modifier.size(20.dp))
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun MiniTile(label: String, strong: Boolean) {
    Box(
        Modifier.width(80.dp).height(112.dp).clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = if (strong) 0.06f else 0.02f)).border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(16.dp)),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = Color.White.copy(alpha = if (strong) 0.8f else 0.4f), fontSize = 12.sp, fontWeight = FontWeight.Bold) }
}

@Composable
private fun ModeSeg(label: String, active: Boolean, onClick: () -> Unit) {
    Box(Modifier.clip(RoundedCornerShape(50)).background(if (active) Color.White else Color.Transparent).clickable { onClick() }.padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(label, color = if (active) Color.Black else Color(0xFFD4D4D8), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun FileStep(
    mode: String,
    layout: String,
    onLayout: (String) -> Unit,
    uriA: Uri?,
    uriB: Uri?,
    description: String,
    onDescription: (String) -> Unit,
    music: MusicTrack?,
    onPickMusic: () -> Unit,
    onRemoveMusic: () -> Unit,
    error: String?,
    onPickA: () -> Unit,
    onPickB: () -> Unit,
    onPublish: () -> Unit,
) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 6.dp)) {
        if (mode == "duet") {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.06f)).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(50)).padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Box(Modifier.weight(1f).clip(RoundedCornerShape(50)).background(if (layout == "horizontal") Color.White else Color.Transparent).clickable { onLayout("horizontal") }.padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
                    Text("Horizontal", color = if (layout == "horizontal") Color.Black else Color(0xFFD4D4D8), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
                Box(Modifier.weight(1f).clip(RoundedCornerShape(50)).background(if (layout == "vertical") Color.White else Color.Transparent).clickable { onLayout("vertical") }.padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
                    Text("Vertical", color = if (layout == "vertical") Color.Black else Color(0xFFD4D4D8), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            Spacer(Modifier.height(14.dp))
        }

        if (mode == "challenge") {
            VideoSlot("your video", uriA != null, Modifier.fillMaxWidth().aspectRatio(1.2f), onPickA)
        } else {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                VideoSlot("Video A", uriA != null, Modifier.weight(1f).aspectRatio(0.62f), onPickA)
                VideoSlot("Video B", uriB != null, Modifier.weight(1f).aspectRatio(0.62f), onPickB)
            }
        }

        Spacer(Modifier.height(16.dp))
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.04f)).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(16.dp)).padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            if (description.isEmpty()) {
                Text(
                    when (mode) { "duet" -> "Who wins? 🥊 #1vs1"; "challenge" -> "Challenge 🔥 Do you accept?"; else -> "Which do you prefer? 🅰️🆚🅱️" },
                    color = ZincText, fontSize = 15.sp,
                )
            }
            BasicTextField(
                value = description, onValueChange = onDescription,
                textStyle = TextStyle(color = Color.White, fontSize = 15.sp), cursorBrush = SolidColor(Color.White),
                maxLines = 3, modifier = Modifier.fillMaxWidth(),
            )
        }

        error?.let {
            Spacer(Modifier.height(10.dp))
            Text(it, color = Color(0xFFFB7185), fontSize = 12.sp)
        }

        Spacer(Modifier.height(12.dp))
        MusicRowPicker(music = music, onPick = onPickMusic, onRemove = onRemoveMusic)

        Spacer(Modifier.height(16.dp))
        val enabled = if (mode == "challenge") uriA != null else (uriA != null && uriB != null)
        Box(
            Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(50)).background(if (enabled) Color.White else Color.White.copy(alpha = 0.20f)).clickable(enabled = enabled) { onPublish() },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                when (mode) { "duet" -> "Publish 1vs1"; "challenge" -> "Choose who to challenge"; else -> "Publish versus" },
                color = if (enabled) Color.Black else Color.White.copy(alpha = 0.40f), fontSize = 16.sp, fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun MusicRowPicker(music: MusicTrack?, onPick: () -> Unit, onRemove: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.04f))
            .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(16.dp))
            .clickable(enabled = music == null) { onPick() }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (music == null) {
            Icon(Icons.Filled.MusicNote, null, tint = Color.White, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(10.dp))
            Text("Add music", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Icon(Icons.Filled.ChevronRight, null, tint = Color.White.copy(alpha = 0.3f), modifier = Modifier.size(18.dp))
        } else {
            Box(Modifier.size(32.dp).clip(RoundedCornerShape(6.dp)).background(Color.White.copy(alpha = 0.06f)), contentAlignment = Alignment.Center) {
                if (!music.artwork.isNullOrBlank()) {
                    AsyncImage(model = music.artwork, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                } else {
                    // Fallback sin portada: la web usa zinc-400 aquí (no el
                    // blanco/dorado del icono "Add music" de arriba).
                    Icon(Icons.Filled.MusicNote, null, tint = ZincText, modifier = Modifier.size(14.dp))
                }
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(music.title ?: "Song", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(music.artist ?: "", color = ZincText, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Box(Modifier.size(28.dp).clip(CircleShape).clickable { onRemove() }, contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Close, "remove music", tint = Color.White.copy(alpha = 0.6f), modifier = Modifier.size(16.dp))
            }
        }
    }
}

@Composable
private fun VideoSlot(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier.clip(RoundedCornerShape(16.dp))
            .background(Color.White.copy(alpha = 0.04f))
            .border(1.dp, if (selected) TwykGold else Color.White.copy(alpha = 0.10f), RoundedCornerShape(16.dp))
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(if (selected) TwykGold else Color.White.copy(alpha = 0.05f)).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center,
            ) {
                if (selected) Icon(Icons.Filled.Check, null, tint = Color.Black, modifier = Modifier.size(24.dp))
                else Icon(Icons.Filled.Movie, null, tint = Color(0xFFD4D4D8), modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.height(8.dp))
            Text(if (selected) "$label ready" else "Upload $label", color = if (selected) Color.White else Color(0xFFD4D4D8), fontSize = 13.sp, fontWeight = FontWeight.Medium)
            if (!selected) {
                Spacer(Modifier.height(2.dp))
                Text("Video or photo · max 80MB / 15MB", color = Color(0xFF71717A), fontSize = 10.sp)
            }
        }
    }
}

@Composable
private fun TargetStep(
    users: List<User>,
    loading: Boolean,
    query: String,
    onQuery: (String) -> Unit,
    error: String?,
    onPick: (User) -> Unit,
) {
    val q = query.trim().lowercase()
    val filtered = if (q.isBlank()) users else users.filter {
        (it.username ?: "").lowercase().contains(q) || (it.name ?: "").lowercase().contains(q)
    }

    Column(Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
        Text("Choose who to challenge. It will appear in their active challenges to accept.", color = Color(0xFF71717A), fontSize = 13.sp)
        Spacer(Modifier.height(14.dp))
        // Search bar
        Row(
            Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.04f)).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(50)).padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(Icons.Filled.Search, null, tint = Color(0xFF71717A), modifier = Modifier.size(16.dp))
            Box(Modifier.weight(1f)) {
                if (query.isEmpty()) Text("Search user by name or @username", color = Color(0xFF71717A), fontSize = 14.sp)
                BasicTextField(value = query, onValueChange = onQuery, singleLine = true, textStyle = TextStyle(color = Color.White, fontSize = 14.sp), cursorBrush = SolidColor(Color.White), modifier = Modifier.fillMaxWidth())
            }
        }
        Spacer(Modifier.height(14.dp))
        error?.let { Text(it, color = Color(0xFFFB7185), fontSize = 12.sp); Spacer(Modifier.height(10.dp)) }

        when {
            loading -> Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = ZincText, strokeWidth = 2.dp, modifier = Modifier.size(26.dp)) }
            users.isEmpty() -> Column(Modifier.fillMaxWidth().padding(top = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(56.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.04f)).border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.People, null, tint = Color(0xFF71717A), modifier = Modifier.size(24.dp))
                }
                Spacer(Modifier.height(14.dp))
                Text("No users to challenge yet", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(4.dp))
                Text("When more creators sign up, they'll appear here.", color = Color(0xFF71717A), fontSize = 13.sp, textAlign = TextAlign.Center)
            }
            filtered.isEmpty() -> Text("No results for \"$query\".", color = ZincText, fontSize = 14.sp, modifier = Modifier.padding(top = 24.dp))
            else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                items(filtered) { u -> UserRow(u) { onPick(u) } }
            }
        }
    }
}

@Composable
private fun UserRow(u: User, onPick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.03f)).border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(16.dp)).clickable { onPick() }.padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TwykAvatar(u.avatarUrl, Modifier.size(44.dp).border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(u.name ?: u.username ?: "user", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("@" + (u.username ?: ""), color = Color(0xFF71717A), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Row(
            Modifier.clip(RoundedCornerShape(50)).background(TwykGold).padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Icon(ImageVector.vectorResource(R.drawable.ic_swords), null, tint = Color.Black, modifier = Modifier.size(13.dp))
            Text("Challenge", color = Color.Black, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun UploadingStep(mode: String) {
    Column(Modifier.fillMaxSize().padding(top = 90.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            Modifier.size(64.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.03f)).border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape),
            contentAlignment = Alignment.Center,
        ) { CircularProgressIndicator(color = TwykGold, strokeWidth = 3.dp, modifier = Modifier.size(28.dp)) }
        Spacer(Modifier.height(20.dp))
        Text(
            when (mode) { "challenge" -> "Sending your challenge…"; "duet" -> "Creating your 1vs1…"; else -> "Uploading your versus…" },
            color = ZincText, fontSize = 14.sp,
        )
    }
}

// Detecta si el Uri elegido es una imagen o un vídeo (mismo criterio que el
// backend, ver mediaKind() en route.js): por MIME type real del
// ContentResolver.
private fun mediaKindOf(context: Context, uri: Uri): String {
    val type = context.contentResolver.getType(uri)?.lowercase().orEmpty()
    return if (type.startsWith("image/")) "image" else "video"
}

// Tamaño en bytes del Uri elegido (columna OpenableColumns.SIZE), o -1 si no
// se puede determinar (en ese caso no se bloquea la subida: el backend sigue
// siendo la autoridad final de validación de tamaño).
private fun fileSizeOf(context: Context, uri: Uri): Long = try {
    context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            val idx = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (idx >= 0) cursor.getLong(idx) else -1L
        } else {
            -1L
        }
    } ?: -1L
} catch (e: Exception) {
    -1L
}

private const val MAX_VIDEO_BYTES = 80L * 1024 * 1024
private const val MAX_IMAGE_BYTES = 15L * 1024 * 1024

// Copia el contenido del Uri elegido a un archivo DURADERO (filesDir, no
// cacheDir: el sistema puede purgar la caché en cualquier momento) para que
// UploadWorker pueda leerlo de forma fiable en segundo plano, incluso si el
// proceso se recrea antes de que termine la subida. No es privada: la
// reutiliza también ui/QuickChallenge.kt (mismo paquete). La extensión se
// deriva del MIME real (jpg/png/webp/mp4/webm…) para que el backend
// (mediaKind()) detecte correctamente imagen vs vídeo.
fun persistPickedFile(context: Context, prefix: String, uri: Uri): File {
    val dir = File(context.filesDir, "pending_uploads").apply { mkdirs() }
    val input = context.contentResolver.openInputStream(uri) ?: throw IllegalStateException("No se pudo abrir el archivo")
    val mime = context.contentResolver.getType(uri)
    val extFromMime = mime?.let { MimeTypeMap.getSingleton().getExtensionFromMimeType(it) }
    val ext = extFromMime ?: if (mime?.startsWith("image/") == true) "jpg" else "mp4"
    val file = File(dir, "twyk_${prefix}_${System.currentTimeMillis()}_${(0..9999).random()}.$ext")
    file.outputStream().use { out -> input.use { it.copyTo(out) } }
    return file
}

}
