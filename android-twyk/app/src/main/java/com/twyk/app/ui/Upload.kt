package com.twyk.app.ui

import android.content.Context
import android.net.Uri
import android.util.Base64
import android.view.LayoutInflater
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.AutoFixHigh
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.zIndex
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import coil.compose.AsyncImage
import com.google.gson.Gson
import com.twyk.app.R
import com.twyk.app.data.LuxuryTheme
import com.twyk.app.data.MusicTrack
import com.twyk.app.data.PendingLuxuryEntry
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import com.twyk.app.data.UploadQueue
import com.twyk.app.data.UploadWorker
import com.twyk.app.data.User
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.HttpException
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

    // "Luxury Battle" (petición del usuario, réplica nativa de
    // `uploadLuxuryTheme`/`onEnterLuxuryBattle` en Feed.jsx web) — si se
    // entró aquí desde la hoja de Luxury Battle (ui/Battles.kt), consume el
    // tema+modo pendiente UNA sola vez al montar: salta el selector de modo,
    // entra directo al paso "file" en ese modo, y precarga `promptHint` al
    // abrir el editor de fotos con IA (ver FileStep más abajo).
    var luxuryTheme by remember { mutableStateOf<LuxuryTheme?>(null) }
    LaunchedEffect(Unit) {
        val pending = PendingLuxuryEntry.consume()
        if (pending != null) {
            val (theme, entryMode) = pending
            luxuryTheme = theme
            mode = entryMode
            selected = entryMode
            step = "file"
        }
    }

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
                // Paridad web: la descripción se envía TAL CUAL (la web manda
                // `description || ''`; el placeholder del textarea es solo visual).
                val descFinal = description
                val dataBuilder = Data.Builder()
                    .putString(UploadWorker.KEY_QUEUE_ID, queueId)
                    .putString(UploadWorker.KEY_TYPE, mode)
                    .putString(UploadWorker.KEY_DESCRIPTION, descFinal)
                luxuryTheme?.id?.let { dataBuilder.putString(UploadWorker.KEY_LUXURY_THEME_ID, it) }

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
                        // "Single" (publicación única, sin destinatario): solo hace
                        // falta el archivo A + descripción (ya añadidos arriba),
                        // igual que el modo `solo` de UploadDialog.jsx (web) — ver
                        // el caso "solo" en UploadWorker.kt.
                        "solo" -> { /* sin campos adicionales */ }
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
        "file" -> if (mode == "versus") "Your 2 videos" else if (mode == "challenge") "Your challenge" else if (mode == "solo") "Your post" else "Your 1vs1"
        else -> if (mode == "challenge") "Sending challenge" else "Uploading"
    }

    Box(Modifier.fillMaxSize().background(TwykBg)) {
        GoldGlow(height = 176.dp, alpha = 0.07f)

        if (step == "file") {
            // Réplica del `fixed inset-0 z-30` de la web: el paso de vídeos es
            // una vista previa a PANTALLA COMPLETA con su propio header
            // superpuesto (el header genérico del diálogo queda cubierto).
            FileStep(
                mode = mode,
                layout = layout,
                onLayout = { layout = it },
                uriA = uriA,
                uriB = uriB,
                kindA = mediaKindA,
                kindB = mediaKindB,
                description = description,
                onDescription = { description = it },
                music = music,
                onPickMusic = { musicPickerOpen = true },
                onRemoveMusic = { music = null },
                error = error,
                onPickA = { pickA.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)) },
                onPickB = { pickB.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)) },
                onBack = { step = "mode" },
                onClose = { onDone() },
                onPublish = { if (mode == "challenge") { if (uriA != null) step = "target" else error = "Upload your challenge video or photo" } else doUpload(null) },
                luxuryTheme = luxuryTheme,
                // Editor de fotos con IA (Versus/1vs1/Retos, ver comentario en
                // FileStep): al confirmar "Use this photo" se reemplaza el
                // archivo del slot correspondiente (0=A, 1=B) por el resultado
                // editado (esa es la foto que se subirá al publicar).
                onApplyAiEdit = { slot, newUri ->
                    if (slot == 0) { uriA = newUri; mediaKindA = "image" } else { uriB = newUri; mediaKindB = "image" }
                },
            )
        } else {
            Column(Modifier.fillMaxSize().statusBarsPadding()) {
                // Header (pasos mode/target/uploading; el paso file tiene el suyo propio)
                Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (step == "target") {
                        Box(Modifier.size(36.dp).clip(CircleShape).clickable { step = "file" }, contentAlignment = Alignment.Center) {
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
        // Segmentado (sin gap entre botones, como el inline-flex de la web).
        // BUG reportado por el usuario (captura adjunta): la pestaña "Single"
        // (la 4ª, la más nueva) se quedaba sin espacio y su texto se envolvía
        // en 2 líneas ("Sing"/"le") — a diferencia de la web, donde el
        // `inline-flex` de las 4 pestañas nunca envuelve texto. CAUSA: este
        // `Row` no tenía ancho propio garantizado — al medir sus 4 hijos,
        // Compose reparte el ancho disponible en orden, y en pantallas
        // estrechas el ÚLTIMO hijo (Single) se quedaba con menos espacio del
        // que su texto necesita en una sola línea, así que Compose lo
        // envolvía. FIX: se envuelve en `horizontalScroll` (nunca fuerza a
        // ningún hijo a medirse más pequeño de su ancho natural -cada pestaña
        // pide su propio ancho intrínseco- y, si las 4 no caben del todo en
        // pantallas muy estrechas, el usuario puede deslizar el propio
        // selector en vez de que el texto se rompa) + `ModeSeg` ahora fuerza
        // explícitamente una sola línea (ver comentario ahí).
        Row(
            Modifier
                .horizontalScroll(rememberScrollState())
                .clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.06f)).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(50)).padding(4.dp),
        ) {
            ModeSeg("Versus", selected == "versus") { onSelect("versus") }
            ModeSeg("1 vs 1", selected == "duet") { onSelect("duet") }
            ModeSeg("Challenges", selected == "challenge") { onSelect("challenge") }
            // "Open" (antes "Single") — réplica del 4º modo `solo` añadido en
            // UploadDialog.jsx (web): un solo vídeo/foto, sin necesidad de un
            // segundo lado ni de elegir a quién retar. Internamente reutiliza
            // el mismo endpoint de retos con openChallenge=1 (ver doUpload/
            // UploadWorker.kt más abajo). RENOMBRADO a petición del usuario:
            // "Open" encaja mejor con lo que ES esta publicación (queda
            // ABIERTA para que cualquiera te retador — mismo concepto que
            // `type == "challenge_open"` interno) — SOLO el texto visible
            // cambia, `mode == "solo"` y el resto del código quedan intactos.
            ModeSeg("Open", selected == "solo") { onSelect("solo") }
        }

        Column(Modifier.weight(1f).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            // Caja del icono con GLOW alrededor del marco — réplica EXACTA
            // (valor por valor) de `boxShadow: '0 0 60px -14px
            // rgba(255,255,255,.45)'` de la web (UploadDialog.jsx, paso
            // "mode"). Misma técnica ya validada en VSContentCard/Battles.kt
            // (`Modifier.blur` real, RenderEffect) en vez de capas de
            // degradado ajustadas a mano, a petición del usuario de una
            // réplica "token por token" en toda la app. El spread es
            // NEGATIVO (-14dp): la forma a difuminar (96dp-2×14dp=68dp) es
            // más pequeña que la propia caja del icono (96dp) — para
            // garantizar que el interior de esa caja se vea 100% negro/plano
            // (mismo criterio ya validado en Battles.kt), su relleno pasa de
            // translúcido (`bg-white/[0.04]` en la web) a `TwykBg` sólido
            // (igual que el fondo de la pantalla), bloqueando cualquier
            // brillo del blur que caiga dentro de sus propios 96dp — solo
            // queda visible la parte del halo que se extiende más allá del
            // borde. El radio de esquina de la forma a difuminar se reduce
            // proporcionalmente (28dp + spread = 14dp), igual que ajusta un
            // navegador el radio de un box-shadow con spread negativo.
            Box(contentAlignment = Alignment.Center) {
                Box(
                    Modifier
                        .size(96.dp - 28.dp) // 96dp - 2×14dp de spread = 68dp
                        .blur(radius = 60.dp, edgeTreatment = BlurredEdgeTreatment.Unbounded)
                        .background(Color.White.copy(alpha = 0.45f), RoundedCornerShape(14.dp)), // 28dp + (-14dp) de spread
                )
                Box(
                    Modifier.size(96.dp).clip(RoundedCornerShape(28.dp)).background(TwykBg).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(28.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    val icon: ImageVector = when (selected) {
                        "duet" -> Icons.Filled.People
                        "solo" -> Icons.Filled.Public
                        else -> Icons.Filled.Movie
                    }
                    if (selected == "challenge") {
                        Icon(ImageVector.vectorResource(R.drawable.ic_swords), null, tint = TwykGold, modifier = Modifier.size(44.dp))
                    } else {
                        Icon(icon, null, tint = TwykGold, modifier = Modifier.size(44.dp))
                    }
                }
            }
            Spacer(Modifier.height(28.dp))
            Text(
                when (selected) {
                    "versus" -> "Upload 2 videos (A and B) and let people vote by swiping between them."
                    "duet" -> "Upload 2 videos (A and B) in the format you choose and let people vote who wins."
                    "solo" -> "Upload just ONE video or photo - no need for a second one. Anyone can challenge you on it."
                    else -> "Upload your video or photo and challenge a creator. It will appear in their active challenges to accept."
                },
                color = ZincText, fontSize = 15.sp, lineHeight = 24.sp, textAlign = TextAlign.Center,
                modifier = Modifier.widthIn(max = 304.dp),
            )
            Spacer(Modifier.height(40.dp))
            if (selected == "challenge") {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    MiniTile("YOU", strong = true)
                    Text("VS", color = Color.White.copy(alpha = 0.6f), fontSize = 16.sp, fontWeight = FontWeight.Black)
                    MiniTile("RIVAL", strong = false)
                }
            } else if (selected == "solo") {
                // Réplica de la mini-ilustración "YOU" + insignia de globo de
                // UploadDialog.jsx (web) para el modo `solo`.
                Box {
                    MiniTile("YOU", strong = true)
                    Box(
                        Modifier.align(Alignment.BottomEnd).size(28.dp).clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.10f))
                            .border(1.dp, Color.White.copy(alpha = 0.20f), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.Public, null, tint = Color.White, modifier = Modifier.size(14.dp)) }
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
                Icon(Icons.Filled.ChevronRight, null, tint = Color.Black, modifier = Modifier.size(18.dp))
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
        // BUG reportado por el usuario ("Single" se envolvía en 2 líneas):
        // `maxLines = 1` + `softWrap = false` fuerzan una sola línea SIEMPRE
        // (réplica del comportamiento real de la web, donde el texto de
        // estos botones nunca envuelve) — ahora, aunque el `Row` padre mida
        // a este Box con menos ancho del que el texto necesita, el propio
        // texto exige su ancho natural en una sola línea (el `horizontalScroll`
        // del Row padre, ver ModeStep, es lo que absorbe cualquier falta de
        // espacio, en vez de romper el texto).
        Text(
            label, color = if (active) Color.Black else Color(0xFFD4D4D8), fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
            maxLines = 1, softWrap = false,
        )
    }
}

@Composable
private fun FileStep(
    mode: String,
    layout: String,
    onLayout: (String) -> Unit,
    uriA: Uri?,
    uriB: Uri?,
    kindA: String?,
    kindB: String?,
    description: String,
    onDescription: (String) -> Unit,
    music: MusicTrack?,
    onPickMusic: () -> Unit,
    onRemoveMusic: () -> Unit,
    error: String?,
    onPickA: () -> Unit,
    onPickB: () -> Unit,
    onBack: () -> Unit,
    onClose: () -> Unit,
    onPublish: () -> Unit,
    luxuryTheme: LuxuryTheme? = null,
    onApplyAiEdit: (Int, Uri) -> Unit,
) {
    // Slide activo del carrusel versus (réplica de versusIdx en la web).
    var versusIdx by remember { mutableStateOf(0) }
    var dragDx by remember { mutableStateOf(0f) }

    // ── Editor de fotos con IA (réplica de AIImageEditor.jsx web: botón
    // circular con Sparkles, SOLO cuando el archivo de ESE slot es una foto
    // — mismo criterio `isImg` de la web). BUG CORREGIDO en esta ronda: el
    // botón (y el propio editor) NO estaba disponible en los slots de
    // Versus/1vs1 (`small=true`) — solo en Retos (`small=false`) — cuando la
    // web SÍ lo ofrece en los 3 modos por igual (misma función `renderSlot`
    // para Versus/1vs1, con el mismo botón circular; ver UploadDialog.jsx).
    // `aiEditorSlot`: null = cerrado; 0 = editando el archivo A; 1 = editando
    // el archivo B (réplica exacta de `aiEditorSlot` en la web, que también
    // es 0|1|null, no solo un booleano).
    val context = LocalContext.current
    val aiScope = rememberCoroutineScope()
    var aiEditorSlot by remember { mutableStateOf<Int?>(null) }
    var aiStage by remember { mutableStateOf("input") } // input|loading|result|error
    var aiPrompt by remember { mutableStateOf("") }
    var aiError by remember { mutableStateOf<String?>(null) }
    var aiResultUri by remember { mutableStateOf<Uri?>(null) }
    var aiSuggestions by remember { mutableStateOf<List<String>>(emptyList()) }
    var aiSuggestionsLoading by remember { mutableStateOf(false) }

    // Uri de origen del slot ACTUALMENTE en edición (0->A, 1->B) — recalculado
    // en cada recomposición a partir de los uriA/uriB vigentes.
    val aiSourceUri = when (aiEditorSlot) { 0 -> uriA; 1 -> uriB; else -> null }

    // Sugerencias RELEVANTES a la foto (misma idea que la web): se piden en
    // cuanto se abre el editor para esta foto; si fallan, respaldo genérico.
    LaunchedEffect(aiEditorSlot) {
        if (aiEditorSlot == null) return@LaunchedEffect
        aiStage = "input"
        // "Luxury Battle" (petición del usuario, réplica de `initialPrompt`
        // en AIImageEditor.jsx web): si esta subida viene de la hoja de
        // Luxury Battle (mode challenge, único modo que la admite — ver
        // comentario de LuxuryBattleSheet en ui/Battles.kt) y se está
        // editando el slot A, precarga el `promptHint` del tema en vez de
        // arrancar con el cuadro vacío.
        aiPrompt = if (aiEditorSlot == 0 && mode == "challenge") luxuryTheme?.promptHint.orEmpty() else ""
        aiError = null; aiResultUri = null
        aiSuggestions = emptyList()
        val srcUri = aiSourceUri ?: return@LaunchedEffect
        aiSuggestionsLoading = true
        val result = withContext(Dispatchers.IO) {
            runCatching {
                val (f, temp) = aiSourceFile(context, srcUri)
                val res = RetrofitProvider.api.suggestEdits(imagePart(f))
                if (temp) f.delete()
                res
            }
        }
        aiSuggestionsLoading = false
        aiSuggestions = result.getOrNull()?.suggestions?.takeIf { it.isNotEmpty() } ?: AI_FALLBACK_SUGGESTIONS
    }

    fun generateAiEdit() {
        val trimmed = aiPrompt.trim()
        val srcUri = aiSourceUri
        if (trimmed.length < 3 || srcUri == null) return
        aiStage = "loading"; aiError = null
        aiScope.launch {
            val outcome = withContext(Dispatchers.IO) {
                runCatching {
                    val (f, temp) = aiSourceFile(context, srcUri)
                    val promptBody = trimmed.toRequestBody("text/plain".toMediaTypeOrNull())
                    val res = RetrofitProvider.api.editImage(imagePart(f), promptBody)
                    if (temp) f.delete()
                    res
                }
            }
            outcome.fold(
                onSuccess = { res ->
                    val dataUrl = res.image
                    val savedUri = if (dataUrl != null) withContext(Dispatchers.IO) { saveAiResultToFile(context, dataUrl) } else null
                    if (savedUri == null) {
                        aiError = "The AI could not edit this photo, try a different instruction"
                        aiStage = "error"
                    } else {
                        aiResultUri = savedUri
                        aiStage = "result"
                    }
                },
                onFailure = { e ->
                    aiError = aiErrorMessage(e) ?: "Something went wrong, please try again"
                    aiStage = "error"
                },
            )
        }
    }

    // Qué Uri mostrar en el slot dado: la foto ORIGINAL, salvo que ESE slot
    // esté en la etapa "result" del editor de IA (aún sin confirmar) — en
    // ese caso se enseña el resultado editado en el MISMO sitio (réplica de
    // `displayUrl` en renderSlot, web).
    fun displayUriFor(slot: Int, original: Uri?): Uri? =
        if (aiEditorSlot == slot && aiStage == "result") aiResultUri ?: original else original

    // BUG reportado por el usuario ("en el preview no se respeta la barra de
    // estado del sistema como lo hace el feed"): a diferencia del feed
    // principal (ver `FeedPager` en feed/VersusFeed.kt, cuyo `VerticalPager`
    // exterior tiene `.statusBarsPadding()` UNA SOLA VEZ, así que TODO el
    // contenido -incluido el propio vídeo- queda insertado bajo la barra de
    // estado de forma uniforme), este paso "file" solo aplicaba
    // `.statusBarsPadding()` a la cabecera propia (más abajo) mientras el
    // Box exterior con el vídeo/foto llegaba hasta el borde absoluto y
    // superior real de la pantalla (edge-to-edge, `WindowCompat
    // .setDecorFitsSystemWindows(window, false)` en MainActivity.kt) —
    // inconsistente con el feed. FIX: se aplica `.statusBarsPadding()` aquí,
    // en el Box exterior que envuelve TODO (vídeo/foto, degradados y
    // cabecera), exactamente igual que en `FeedPager`; la cabecera propia
    // (más abajo) YA NO necesita su propio `.statusBarsPadding()` -se quita,
    // para no duplicar el hueco- y el botón "Change" de `MediaSlot` (que sí
    // tenía su propio ajuste `atTop` añadido en una ronda anterior, ahora
    // redundante por el mismo motivo) también se simplifica.
    Box(Modifier.fillMaxSize().background(Color.Black).statusBarsPadding()) {
        // "Luxury Battle" — banner del tema activo (petición del usuario,
        // ver ui/Battles.kt/LuxuryBattleSheet) — SOLO en retos DIRIGIDOS
        // (mode 'challenge'); las publicaciones "Single"/abiertas ('solo')
        // nunca llevan tema (petición del usuario: "las publicaciones
        // single no deben estar en las batallas porque solo existen para
        // ser retadas"). Puramente informativo.
        if (mode == "challenge" && luxuryTheme != null) {
            Box(
                Modifier.align(Alignment.TopCenter).padding(top = 10.dp).zIndex(10f)
                    .clip(RoundedCornerShape(50))
                    .background(Color(0xFFFCD34D).copy(alpha = 0.15f))
                    .border(1.dp, Color(0xFFFCD34D).copy(alpha = 0.35f), RoundedCornerShape(50))
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Icon(Icons.Filled.LocalFireDepartment, null, tint = Color(0xFFFCD34D), modifier = Modifier.size(12.dp))
                    Text("Luxury Battle: ${luxuryTheme.title.orEmpty()}", color = Color(0xFFFCD34D), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        // ── Media: dueto = split con formato; versus = carrusel; reto = único ──
        when (mode) {
            "duet" -> {
                // CLIP EXPLÍCITO en cada mitad y en el contenedor del split:
                // PlayerView con resize_mode="zoom" (ExoPlayer AspectRatioFrameLayout)
                // mide DELIBERADAMENTE la superficie de vídeo interior MÁS GRANDE que
                // su contenedor (para hacer zoom+recorte); confía en el recorte NORMAL
                // de vistas del padre para ocultar el sobrante. Sin `clipToBounds()`
                // explícito en el lado de Compose, ese sobrante podía desbordarse sobre
                // la mitad vecina (visto en captura real: un lado ocupaba ~90% y el otro
                // quedaba reducido a una fina franja), tanto en Horizontal como en
                // Vertical. `clipToBounds()` fuerza el recorte EXACTO a los límites ya
                // medidos (weight(1f) => 50/50 real), sin depender de que la vista
                // nativa interna respete el recorte por sí sola.
                if (layout == "vertical") {
                    Row(
                        Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.20f)).clipToBounds(),
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        // touchesTop (réplica exacta de la web): 1vs1 vertical (izq/der) -> AMBOS slots tocan el borde superior.
                        MediaSlot(
                            displayUriFor(0, uriA), kindA, onPickA, small = true, modifier = Modifier.weight(1f).fillMaxSize().clipToBounds(),
                            aiStage = if (aiEditorSlot == 0) aiStage else null,
                            onAiEdit = if (kindA == "image") { { aiEditorSlot = 0 } } else null,
                            touchesTop = true,
                        )
                        MediaSlot(
                            displayUriFor(1, uriB), kindB, onPickB, small = true, modifier = Modifier.weight(1f).fillMaxSize().clipToBounds(),
                            aiStage = if (aiEditorSlot == 1) aiStage else null,
                            onAiEdit = if (kindB == "image") { { aiEditorSlot = 1 } } else null,
                            touchesTop = true,
                        )
                    }
                } else {
                    Column(
                        Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.20f)).clipToBounds(),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        // touchesTop: 1vs1 horizontal (arriba/abajo) -> SOLO el slot A (arriba) toca el borde superior.
                        MediaSlot(
                            displayUriFor(0, uriA), kindA, onPickA, small = true, modifier = Modifier.weight(1f).fillMaxWidth().clipToBounds(),
                            aiStage = if (aiEditorSlot == 0) aiStage else null,
                            onAiEdit = if (kindA == "image") { { aiEditorSlot = 0 } } else null,
                            touchesTop = true,
                        )
                        MediaSlot(
                            displayUriFor(1, uriB), kindB, onPickB, small = true, modifier = Modifier.weight(1f).fillMaxWidth().clipToBounds(),
                            aiStage = if (aiEditorSlot == 1) aiStage else null,
                            onAiEdit = if (kindB == "image") { { aiEditorSlot = 1 } } else null,
                            touchesTop = false,
                        )
                    }
                }
            }
            "versus" -> {
                // Swipe horizontal para alternar A/B (umbral 40, como la web).
                Box(
                    Modifier.fillMaxSize().pointerInput(Unit) {
                        detectHorizontalDragGestures(
                            onDragStart = { dragDx = 0f },
                            onDragEnd = { if (dragDx < -40f) versusIdx = 1 else if (dragDx > 40f) versusIdx = 0 },
                        ) { _, amount -> dragDx += amount }
                    },
                ) {
                    // touchesTop: versus SIEMPRE toca el borde superior (solo se ve 1 slot a pantalla completa).
                    if (versusIdx == 0) {
                        MediaSlot(
                            displayUriFor(0, uriA), kindA, onPickA, small = true, modifier = Modifier.fillMaxSize(),
                            aiStage = if (aiEditorSlot == 0) aiStage else null,
                            onAiEdit = if (kindA == "image") { { aiEditorSlot = 0 } } else null,
                            touchesTop = true,
                        )
                    } else {
                        MediaSlot(
                            displayUriFor(1, uriB), kindB, onPickB, small = true, modifier = Modifier.fillMaxSize(),
                            aiStage = if (aiEditorSlot == 1) aiStage else null,
                            onAiEdit = if (kindB == "image") { { aiEditorSlot = 1 } } else null,
                            touchesTop = true,
                        )
                    }
                }
            }
            else -> MediaSlot(
                uri = displayUriFor(0, uriA),
                kind = kindA,
                onPick = onPickA,
                small = false,
                modifier = Modifier.fillMaxSize(),
                aiStage = if (aiEditorSlot == 0) aiStage else null,
                onAiEdit = if (kindA == "image") { { aiEditorSlot = 0 } } else null,
                touchesTop = true,
            )
        }

        // ── Degradados para legibilidad (top h-44 / bottom h-80 de la web) ──
        Box(
            Modifier.fillMaxWidth().height(176.dp).align(Alignment.TopCenter)
                .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.85f), Color.Black.copy(alpha = 0.30f), Color.Transparent))),
        )
        Box(
            Modifier.fillMaxWidth().height(320.dp).align(Alignment.BottomCenter)
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.65f), Color.Black))),
        )

        // ── Header propio (con conmutador de formato centrado en 1vs1) ──
        // (ya NO necesita su propio `.statusBarsPadding()`: el Box exterior
        // de este mismo `FileStep` ya inserta TODO el contenido bajo la
        // barra de estado, ver comentario más arriba)
        Row(
            Modifier.fillMaxWidth().align(Alignment.TopCenter).padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(36.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.35f)).clickable { onBack() },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "back", tint = Color.White, modifier = Modifier.size(20.dp)) }
            Spacer(Modifier.weight(1f))
            if (mode == "duet") {
                Row(
                    Modifier.clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.45f))
                        .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(50)).padding(4.dp),
                ) {
                    LayoutSeg("Horizontal", ImageVector.vectorResource(R.drawable.ic_rows_2), layout == "horizontal") { onLayout("horizontal") }
                    LayoutSeg("Vertical", ImageVector.vectorResource(R.drawable.ic_columns_2), layout == "vertical") { onLayout("vertical") }
                }
                Spacer(Modifier.weight(1f))
            }
            Box(
                Modifier.size(36.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.35f)).clickable { onClose() },
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Close, "close", tint = Color(0xFFE4E4E7), modifier = Modifier.size(20.dp)) }
        }

        // ── Panel inferior: puntitos (versus) + descripción + música + publicar
        //    — o, mientras se edita CUALQUIER slot con IA (aiEditorSlot != null,
        //    Versus/1vs1/Retos por igual), este MISMO panel muestra los
        //    controles de AiEditorPanel en su lugar (mismo criterio "en el
        //    mismo sitio, sin overlay" que AIImageEditor.jsx web).
        Column(
            Modifier.fillMaxWidth().align(Alignment.BottomCenter).imePadding().navigationBarsPadding()
                .padding(horizontal = 16.dp).padding(bottom = 18.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (aiEditorSlot != null) {
                AiEditorPanel(
                    stage = aiStage,
                    prompt = aiPrompt,
                    onPromptChange = { aiPrompt = it },
                    suggestions = aiSuggestions,
                    suggestionsLoading = aiSuggestionsLoading,
                    error = aiError,
                    onClose = { aiEditorSlot = null; aiStage = "input"; aiResultUri = null },
                    onGenerate = { generateAiEdit() },
                    onUseThisPhoto = {
                        val slot = aiEditorSlot
                        val result = aiResultUri
                        if (slot != null && result != null) onApplyAiEdit(slot, result)
                        aiEditorSlot = null; aiStage = "input"; aiPrompt = ""; aiResultUri = null
                    },
                    onTryAnother = { aiStage = "input"; aiError = null },
                )
            } else {
            if (mode == "versus") {
                // Puntitos más finos (3dp, antes 6dp, a petición del usuario) —
                // réplica del mismo ajuste en UploadDialog.jsx.
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    (0..1).forEach { i ->
                        Box(
                            Modifier.padding(horizontal = 3.dp)
                                .width(if (versusIdx == i) 20.dp else 6.dp).height(3.dp)
                                .clip(RoundedCornerShape(50))
                                .background(if (versusIdx == i) Color.White else Color.White.copy(alpha = 0.40f))
                                .clickable { versusIdx = i },
                        )
                    }
                }
            }
            error?.let { Text(it, color = Color(0xFFFDA4AF), fontSize = 12.sp) }
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.Black.copy(alpha = 0.45f))
                    .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(16.dp)).padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                if (description.isEmpty()) {
                    // BUG FIX (mojibake con emoji, ver gradle.properties): texto ASCII.
                    Text(
                        when (mode) { "duet" -> "Who wins? #1vs1"; "challenge" -> "Challenge! Do you accept?"; "solo" -> "Share something..."; else -> "Which do you prefer? A vs B" },
                        color = ZincText, fontSize = 15.sp,
                    )
                }
                BasicTextField(
                    value = description, onValueChange = onDescription,
                    textStyle = TextStyle(color = Color(0xFFF4F4F5), fontSize = 15.sp), cursorBrush = SolidColor(Color.White),
                    maxLines = 3, modifier = Modifier.fillMaxWidth(),
                )
            }
            MusicRow(music = music, onPick = onPickMusic, onRemove = onRemoveMusic)
            val enabled = if (mode == "challenge" || mode == "solo") uriA != null else (uriA != null && uriB != null)
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(50))
                    .background(if (enabled) Color.White else Color.White.copy(alpha = 0.20f))
                    .clickable(enabled = enabled) { onPublish() }.padding(vertical = 14.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    when (mode) { "duet" -> "Publish 1vs1"; "challenge" -> "Choose who to challenge"; "solo" -> "Publish"; else -> "Publish versus" },
                    color = if (enabled) Color.Black else Color.White.copy(alpha = 0.40f), fontSize = 16.sp, fontWeight = FontWeight.Bold,
                )
            }
            }
        }
    }
}

// Botón del conmutador Horizontal/Vertical del 1vs1 (réplica exacta del pill
// web con iconos Rows2/Columns2 de lucide → ic_rows_2/ic_columns_2 vectores
// custom, mismo criterio que el resto de iconos exactos de este proyecto).
@Composable
private fun LayoutSeg(label: String, icon: ImageVector, active: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(if (active) Color.White else Color.Transparent)
            .clickable { onClick() }.padding(horizontal = 14.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(icon, null, tint = if (active) Color.Black else Color.White.copy(alpha = 0.85f), modifier = Modifier.size(14.dp))
        Text(label, color = if (active) Color.Black else Color.White.copy(alpha = 0.85f), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

// Una "mitad" del split (o pantalla completa): vídeo/foto en vivo con botón
// "Change" arriba a la derecha, o placeholder para subir (réplica de renderSlot
// de la web; small=true usa los tamaños del split A/B, small=false los del reto).
// (El parámetro `atTop`/`.statusBarsPadding()` que este botón tenía en una
// ronda anterior se retiró: ahora el Box EXTERIOR de `FileStep` ya aplica
// `.statusBarsPadding()` una sola vez a TODO el paso -igual que hace
// `FeedPager` en el feed principal-, así que ningún hijo, incluido este
// botón, vuelve a tocar el borde real de la pantalla; mantenerlo aquí habría
// duplicado el hueco de la barra de estado.)
@Composable
private fun MediaSlot(
    uri: Uri?,
    kind: String?,
    onPick: () -> Unit,
    small: Boolean,
    modifier: Modifier,
    // Editor de fotos con IA — réplica de renderSlot (web): disponible en
    // CUALQUIER slot (Versus/1vs1/Retos) que contenga una foto, no solo en
    // Retos (bug corregido en esta ronda: antes solo se ofrecía en el slot
    // único de Retos, cuando la web lo tiene en los 3 modos por igual).
    // aiStage: null cuando el editor está cerrado para ESTE slot;
    // "loading"/"result" pintan el mismo overlay que AIImageEditor.jsx.
    aiStage: String? = null,
    onAiEdit: (() -> Unit)? = null,
    // ¿Este slot toca el borde superior de la pantalla? (réplica exacta de
    // `touchesTop` en renderSlot, web) — determina si los botones circulares
    // deben bajar para no quedar tapados por el header propio de FileStep
    // (~54-58dp) o si pueden ir arriba del todo (8dp, como `0.5rem` web).
    touchesTop: Boolean = true,
) {
    val buttonsTop = if (touchesTop) 58.dp else 8.dp
    val badgeTop = if (touchesTop) 54.dp else 8.dp
    Box(modifier.background(Color.Black)) {
        if (uri != null) {
            if (kind == "image") {
                AsyncImage(model = uri, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else {
                LocalVideoPreview(uri, Modifier.fillMaxSize())
            }
            if (aiStage == "loading") {
                Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.55f)), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        CircularProgressIndicator(color = Color.White, strokeWidth = 2.5.dp, modifier = Modifier.size(26.dp))
                        Text("Editing with AI…", color = Color(0xFFE4E4E7), fontSize = 12.5.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }
            if (aiStage == "result") {
                Row(
                    Modifier.align(Alignment.TopStart).padding(start = 8.dp, top = badgeTop)
                        .clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.6f))
                        .border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(Icons.Filled.AutoAwesome, null, tint = Color.White, modifier = Modifier.size(11.dp))
                    Text("AI result", color = Color.White, fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            // Botones CIRCULARES apilados (Edit with AI + Change) — MISMO
            // w-9(36dp) bg-black/35 que la web, en TODOS los slots por igual.
            Column(
                Modifier.align(Alignment.TopEnd).padding(top = buttonsTop, end = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (onAiEdit != null) {
                    Box(
                        Modifier.size(36.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.35f)).clickable { onAiEdit() },
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.AutoAwesome, "Edit with AI", tint = Color.White, modifier = Modifier.size(17.dp)) }
                }
                Box(
                    Modifier.size(36.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.35f)).clickable { onPick() },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Refresh, "Change media", tint = Color.White, modifier = Modifier.size(17.dp)) }
            }
        } else {
            Column(
                Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.02f)).clickable { onPick() },
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
            ) {
                Box(
                    Modifier.size(if (small) 48.dp else 64.dp).clip(RoundedCornerShape(if (small) 12.dp else 16.dp))
                        .background(Color.White.copy(alpha = 0.05f)).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(if (small) 12.dp else 16.dp)),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Movie, null, tint = Color(0xFFD4D4D8), modifier = Modifier.size(if (small) 22.dp else 28.dp)) }
                Spacer(Modifier.height(if (small) 8.dp else 12.dp))
                Text(
                    if (small) "Upload photo or video" else "Tap to upload your photo or video",
                    color = Color(0xFFE4E4E7), fontSize = if (small) 13.sp else 15.sp, fontWeight = FontWeight.Medium,
                )
                Spacer(Modifier.height(if (small) 4.dp else 6.dp))
                // BUG FIX (mojibake "·", ver gradle.properties): ASCII.
                Text("Video (max 80MB) - Photo (max 15MB)", color = Color(0xFF71717A), fontSize = if (small) 10.sp else 11.sp)
            }
        }
    }
}

// Panel de controles del editor de IA (réplica de AIImageEditor.jsx web,
// SOLO fotos): sustituye TEMPORALMENTE el panel inferior normal (descripción/
// música/publicar) mientras se edita — la foto en sí ya se ve arriba, en el
// mismo MediaSlot (ver aiStage), este panel solo tiene los controles.
@Composable
private fun AiEditorPanel(
    stage: String, // input | loading | result | error
    prompt: String,
    onPromptChange: (String) -> Unit,
    suggestions: List<String>,
    suggestionsLoading: Boolean,
    error: String?,
    onClose: () -> Unit,
    onGenerate: () -> Unit,
    onUseThisPhoto: () -> Unit,
    onTryAnother: () -> Unit,
) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.weight(1f)) {
            Icon(Icons.Filled.AutoAwesome, null, tint = Color.White.copy(alpha = 0.8f), modifier = Modifier.size(14.dp))
            Text("Edit with AI", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
        Box(Modifier.size(28.dp).clip(CircleShape).clickable { onClose() }, contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.Close, "Close AI editor", tint = ZincText, modifier = Modifier.size(15.dp))
        }
    }
    Spacer(Modifier.height(4.dp))

    if (stage == "input" || stage == "loading") {
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.Black.copy(alpha = 0.45f))
                .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(16.dp)).padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            if (prompt.isEmpty()) {
                Text("Add a private jet flying in the background…", color = ZincText, fontSize = 15.sp)
            }
            BasicTextField(
                value = prompt, onValueChange = onPromptChange, enabled = stage != "loading",
                textStyle = TextStyle(color = Color(0xFFF4F4F5), fontSize = 15.sp), cursorBrush = SolidColor(Color.White),
                maxLines = 2, modifier = Modifier.fillMaxWidth(),
            )
        }
        Spacer(Modifier.height(10.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (suggestionsLoading) {
                items(3) {
                    Box(
                        Modifier.height(26.dp).width(96.dp).clip(RoundedCornerShape(50))
                            .background(Color.White.copy(alpha = 0.06f)).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(50)),
                    )
                }
            } else {
                items(suggestions) { s ->
                    Box(
                        Modifier.clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.45f))
                            .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(50))
                            .clickable(enabled = stage != "loading") { onPromptChange(s) }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                    ) { Text(s, color = Color(0xFFD4D4D8), fontSize = 11.5.sp, fontWeight = FontWeight.Medium) }
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        val enabled = prompt.trim().length >= 3 && stage != "loading"
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(50))
                .background(if (enabled) Color.White else Color.White.copy(alpha = 0.20f))
                .clickable(enabled = enabled) { onGenerate() }.padding(vertical = 14.dp),
            contentAlignment = Alignment.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (stage == "loading") {
                    CircularProgressIndicator(color = Color.Black, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                    Text("Editing your photo…", color = Color.Black, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                } else {
                    Icon(Icons.Filled.AutoFixHigh, null, tint = Color.Black, modifier = Modifier.size(17.dp))
                    Text("Generate with AI", color = Color.Black, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }

    if (stage == "error") {
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color(0xFFF43F5E).copy(alpha = 0.10f))
                .border(1.dp, Color(0xFFF43F5E).copy(alpha = 0.25f), RoundedCornerShape(16.dp)).padding(horizontal = 16.dp, vertical = 12.dp),
        ) { Text(error ?: "Something went wrong, please try again", color = Color(0xFFFDA4AF), fontSize = 13.sp) }
        Spacer(Modifier.height(10.dp))
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(Color.White)
                .clickable { onGenerate() }.padding(vertical = 14.dp),
            contentAlignment = Alignment.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Filled.Replay, null, tint = Color.Black, modifier = Modifier.size(17.dp))
                Text("Try again", color = Color.Black, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(8.dp))
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.45f))
                .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(50))
                .clickable { onTryAnother() }.padding(vertical = 12.dp),
            contentAlignment = Alignment.Center,
        ) { Text("Edit instruction", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold) }
    }

    if (stage == "result") {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.Black.copy(alpha = 0.45f))
                .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(16.dp)).padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.AutoAwesome, null, tint = Color.White.copy(alpha = 0.8f), modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(8.dp))
            Text("AI result shown above — keep it?", color = Color(0xFFD4D4D8), fontSize = 13.sp)
        }
        Spacer(Modifier.height(10.dp))
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(Color.White)
                .clickable { onUseThisPhoto() }.padding(vertical = 14.dp),
            contentAlignment = Alignment.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Filled.Check, null, tint = Color.Black, modifier = Modifier.size(18.dp))
                Text("Use this photo", color = Color.Black, fontSize = 16.sp, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.height(8.dp))
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.45f))
                .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(50))
                .clickable { onTryAnother() }.padding(vertical = 12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icons.Filled.Replay, null, tint = Color.White, modifier = Modifier.size(15.dp))
                Text("Try another instruction", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

// Vista previa de vídeo LOCAL (Uri del picker): autoplay + loop + silenciado,
// recortado tipo object-cover (PlayerView TextureView con resize_mode=zoom,
// mismo layout que usa el feed para el split 1vs1).
@Composable
private fun LocalVideoPreview(uri: Uri, modifier: Modifier) {
    val context = LocalContext.current
    val player = remember(uri) {
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(uri))
            repeatMode = Player.REPEAT_MODE_ONE
            volume = 0f // como la web: <video autoPlay loop muted>
            playWhenReady = true
            prepare()
        }
    }
    DisposableEffect(player) { onDispose { player.release() } }
    AndroidView(
        factory = { ctx ->
            (LayoutInflater.from(ctx).inflate(R.layout.twyk_texture_player, null) as PlayerView).apply { this.player = player }
        },
        update = { it.player = player },
        modifier = modifier,
    )
}

// Fila de música del panel inferior (réplica exacta de la web): sin música →
// botón centrado "Add music"; con música → artwork 40dp + título/artista +
// "Change" + X para quitar.
@Composable
private fun MusicRow(music: MusicTrack?, onPick: () -> Unit, onRemove: () -> Unit) {
    if (music == null) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.Black.copy(alpha = 0.45f))
                .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(16.dp))
                .clickable { onPick() }.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center,
        ) {
            Icon(Icons.Filled.MusicNote, null, tint = Color.White, modifier = Modifier.size(17.dp))
            Spacer(Modifier.width(8.dp))
            Text("Add music", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        }
    } else {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.Black.copy(alpha = 0.45f))
                .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(16.dp))
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(8.dp)).background(Color(0xFF27272A)), contentAlignment = Alignment.Center) {
                if (!music.artwork.isNullOrBlank()) {
                    AsyncImage(model = music.artwork, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                } else {
                    Icon(Icons.Filled.MusicNote, null, tint = ZincText, modifier = Modifier.size(18.dp))
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(music.title ?: "Song", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(music.artist ?: "", color = ZincText, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text(
                "Change", color = Color.White.copy(alpha = 0.80f), fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier.clip(RoundedCornerShape(50)).clickable { onPick() }.padding(horizontal = 8.dp, vertical = 4.dp),
            )
            Box(Modifier.size(28.dp).clip(CircleShape).clickable { onRemove() }, contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Close, "remove music", tint = ZincText, modifier = Modifier.size(16.dp))
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
            // BUG FIX (mojibake "…" -> "â€¦", ver gradle.properties): ASCII.
            when (mode) { "challenge" -> "Sending your challenge..."; "duet" -> "Creating your 1vs1..."; "solo" -> "Uploading your post..."; else -> "Uploading your versus..." },
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
//
// BUG REAL ENCONTRADO (usuario: "cuando edito con IA y publico la
// publicación solo se ve en negro, no muestra el contenido"): para un Uri
// `file://` (el que genera el editor de IA, ver saveAiResultToFile — NO viene
// del selector de galería) `context.contentResolver.getType(uri)` puede
// devolver null en algunos dispositivos/versiones de Android (a diferencia
// de `content://`, donde SIEMPRE hay un proveedor que responde). Cuando
// `mime` es null, `mime?.startsWith("image/") == true` se evalúa como
// `null == true` -> `false` (NO como "no es imagen, pero tampoco es
// false-seguro") -> el `else` caía SIEMPRE en "mp4", así que una foto
// editada con IA (PNG real) se re-empaquetaba como si fuera un vídeo
// -> el backend guardaba `mediaType:'video'` y el feed intentaba
// reproducirla con ExoPlayer, que falla en silencio con un contenedor que no
// es un vídeo real -> pantalla negra, sin ningún error visible (exactamente
// el síntoma reportado). FIX: para Uris `file://` (que SIEMPRE son archivos
// nuestros, ya con la extensión correcta puesta por quien los creó —
// saveAiResultToFile, o esta misma función en una pasada anterior) se deriva
// la extensión DIRECTAMENTE del nombre de archivo real en disco, sin pasar
// por ContentResolver.getType() en absoluto — 100% fiable, cero
// adivinanzas. Los Uris `content://` (selector de galería) siguen usando el
// mismo mecanismo de siempre (MIME real vía ContentResolver).
fun persistPickedFile(context: Context, prefix: String, uri: Uri): File {
    val dir = File(context.filesDir, "pending_uploads").apply { mkdirs() }
    val input = context.contentResolver.openInputStream(uri) ?: throw IllegalStateException("No se pudo abrir el archivo")
    val ext = if (uri.scheme == "file" && uri.path != null) {
        File(uri.path!!).extension.takeIf { it.isNotBlank() } ?: "jpg"
    } else {
        val mime = context.contentResolver.getType(uri)
        val extFromMime = mime?.let { MimeTypeMap.getSingleton().getExtensionFromMimeType(it) }
        extFromMime ?: if (mime?.startsWith("image/") == true) "jpg" else "mp4"
    }
    val file = File(dir, "twyk_${prefix}_${System.currentTimeMillis()}_${(0..9999).random()}.$ext")
    file.outputStream().use { out -> input.use { it.copyTo(out) } }
    return file
}

// ── Editor de fotos con IA (POST /api/ai/suggest-edits, POST /api/ai/edit-image) ──

// Mismo respaldo genérico que FALLBACK_SUGGESTIONS en AIImageEditor.jsx web,
// usado si /api/ai/suggest-edits falla o no hay sesión — nunca bloquea poder
// escribir una instrucción manual.
private val AI_FALLBACK_SUGGESTIONS = listOf(
    "Add a private jet flying in the background",
    "Change the background to a sunset beach",
    "Add fireworks in the sky",
    "Make it look cinematic and dramatic",
)

// Origen de la foto para /api/ai/suggest-edits y /api/ai/edit-image: si
// `uri` YA es un archivo local (uri.scheme=="file" — ocurre cuando se vuelve
// a editar una foto que ya se había editado antes con IA, ver
// saveAiResultToFile) se usa DIRECTAMENTE, sin copiarlo ni borrarlo después
// (es el mismo archivo referenciado por `uriA`, borrarlo rompería la vista
// previa). Si es un Uri de galería (content://, primera vez), se copia a un
// archivo TEMPORAL con persistPickedFile (mismo criterio que el resto de la
// app) que SÍ se borra tras usarlo — el `Boolean` indica justamente eso.
private fun aiSourceFile(context: Context, uri: Uri): Pair<File, Boolean> =
    if (uri.scheme == "file" && uri.path != null) File(uri.path!!) to false
    else persistPickedFile(context, "aisrc", uri) to true

// Parte multipart "image" a partir de un archivo ya persistido localmente
// (mismo Content-Type real que espera el backend, ver AI_EDIT_ALLOWED_TYPES
// en route.js: jpeg/png/webp).
private fun imagePart(file: File): MultipartBody.Part {
    val ext = file.extension.lowercase()
    val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)?.toMediaTypeOrNull()
        ?: "image/jpeg".toMediaTypeOrNull()
    return MultipartBody.Part.createFormData("image", file.name, file.asRequestBody(mime))
}

// La respuesta de /api/ai/edit-image trae la foto editada como data URL
// ("data:image/png;base64,AAAA...", ver handleAiEditImage en route.js) — se
// decodifica y guarda como archivo LOCAL (mismo directorio que las fotos
// elegidas por el usuario) para poder previsualizarla con AsyncImage y, si
// se confirma, tratarla como cualquier otro archivo elegido (persistPickedFile
// vuelve a copiarla al publicar, réplica exacta del flujo normal).
private fun saveAiResultToFile(context: Context, dataUrl: String): Uri? = try {
    val commaIdx = dataUrl.indexOf(',')
    if (commaIdx < 0) {
        null
    } else {
        val meta = dataUrl.substring(5, commaIdx) // "image/png;base64"
        val mimeType = meta.substringBefore(';')
        val ext = when {
            mimeType.contains("png") -> "png"
            mimeType.contains("webp") -> "webp"
            else -> "jpg"
        }
        val bytes = Base64.decode(dataUrl.substring(commaIdx + 1), Base64.DEFAULT)
        val dir = File(context.filesDir, "pending_uploads").apply { mkdirs() }
        val file = File(dir, "twyk_ai_${System.currentTimeMillis()}_${(0..9999).random()}.$ext")
        file.outputStream().use { it.write(bytes) }
        Uri.fromFile(file)
    }
} catch (e: Exception) {
    null
}

// El backend responde con un código de error (401/400/413/415/500/502) y un
// body JSON {error,message} (ver handleAiEditImage/handleAiSuggestEdits en
// route.js) — Retrofit lo lanza como HttpException en vez de parsear la
// respuesta al tipo esperado; se extrae el mensaje aparte, aquí.
private data class AiErrorBody(val error: String? = null, val message: String? = null)
private fun aiErrorMessage(e: Throwable): String? {
    if (e !is HttpException) return null
    return try {
        val body = e.response()?.errorBody()?.string()
        if (body.isNullOrBlank()) null else Gson().fromJson(body, AiErrorBody::class.java)?.message
    } catch (_: Exception) {
        null
    }
}
