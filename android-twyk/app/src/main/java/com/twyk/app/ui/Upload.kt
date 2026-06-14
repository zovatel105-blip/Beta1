package com.twyk.app.ui

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.gson.Gson
import com.twyk.app.R
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import com.twyk.app.data.User
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File

// SUBIR — réplica de UploadDialog.jsx: modo (Versus / 1vs1 / Retos) → vídeos →
// (a quién retar) → subiendo.
@Composable
fun UploadScreen(onRequireAuth: () -> Unit, onDone: () -> Unit) {
    if (Session.token == null) {
        LoginPrompt("Inicia sesión para publicar", onRequireAuth, Icons.Filled.Movie)
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
    var description by remember { mutableStateOf("") }
    var users by remember { mutableStateOf<List<User>>(emptyList()) }
    var usersLoading by remember { mutableStateOf(false) }
    var userQuery by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }

    val pickA = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uriA = it }
    val pickB = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uriB = it }

    LaunchedEffect(step) {
        if (step == "target") {
            usersLoading = true
            userQuery = ""
            users = runCatching { RetrofitProvider.api.users().users.orEmpty() }.getOrDefault(emptyList())
            usersLoading = false
        }
    }

    fun doUpload(target: User?) {
        step = "uploading"
        error = null
        scope.launch {
            try {
                val a = uriA ?: throw IllegalStateException("Falta vídeo")
                when (mode) {
                    "challenge" -> {
                        val tgt = target ?: throw IllegalStateException("Sin objetivo")
                        val part = withContext(Dispatchers.IO) { uploadPart(context, "file", a) }
                        val json = Gson().toJson(mapOf("username" to (tgt.username ?: ""), "name" to (tgt.name ?: tgt.username ?: ""), "avatarUrl" to (tgt.avatarUrl ?: "")))
                        RetrofitProvider.api.createChallenge(part, json.toRequestBody("text/plain".toMediaTypeOrNull()), description.toRequestBody("text/plain".toMediaTypeOrNull()))
                    }
                    "duet" -> {
                        val b = uriB ?: throw IllegalStateException("Falta vídeo B")
                        val (pa, pb) = withContext(Dispatchers.IO) { uploadPart(context, "fileA", a) to uploadPart(context, "fileB", b) }
                        val desc = description.ifBlank { "¿Quién gana? 🥊 #1vs1" }.toRequestBody("text/plain".toMediaTypeOrNull())
                        RetrofitProvider.api.uploadDuet(pa, pb, desc, layout.toRequestBody("text/plain".toMediaTypeOrNull()))
                    }
                    else -> {
                        val b = uriB ?: throw IllegalStateException("Falta vídeo B")
                        val (pa, pb) = withContext(Dispatchers.IO) { uploadPart(context, "fileA", a) to uploadPart(context, "fileB", b) }
                        val desc = description.ifBlank { "¿Cuál prefieres? 🅰️🆚🅱️" }.toRequestBody("text/plain".toMediaTypeOrNull())
                        RetrofitProvider.api.uploadVersus(pa, pb, desc)
                    }
                }
                onDone()
            } catch (e: Exception) {
                error = "Error al subir. Revisa tu sesión y los vídeos."
                step = if (mode == "challenge") "target" else "file"
            }
        }
    }

    val title = when (step) {
        "mode" -> "Crear contenido"
        "target" -> "Elige a quién retar"
        "file" -> if (mode == "versus") "Tus 2 vídeos" else if (mode == "challenge") "Tu vídeo del reto" else "Tu 1vs1"
        else -> if (mode == "challenge") "Enviando reto" else "Subiendo"
    }

    Box(Modifier.fillMaxSize().background(TwykBg)) {
        GoldGlow(height = 176.dp, alpha = 0.07f)

        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            // Header
            Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (step == "file" || step == "target") {
                    Box(Modifier.size(36.dp).clip(CircleShape).clickable { step = if (step == "target") "file" else "mode" }, contentAlignment = Alignment.Center) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "atrás", tint = Color.White, modifier = Modifier.size(20.dp))
                    }
                } else {
                    Spacer(Modifier.width(6.dp))
                }
                Text(title, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f).padding(start = 4.dp))
                Box(Modifier.size(36.dp).clip(CircleShape).clickable { onDone() }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Close, "cerrar", tint = ZincText, modifier = Modifier.size(20.dp))
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
                    error = error,
                    onPickA = { pickA.launch("video/*") },
                    onPickB = { pickB.launch("video/*") },
                    onPublish = { if (mode == "challenge") { if (uriA != null) step = "target" else error = "Sube tu vídeo del reto" } else doUpload(null) },
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
                    "versus" -> "Sube 2 vídeos (A y B) y deja que la gente vote deslizando entre ellos."
                    "duet" -> "Sube 2 vídeos (A y B) con el formato que elijas y deja que la gente vote quién gana."
                    else -> "Sube tu vídeo y reta a un creador. Aparecerá en sus retos activos para que lo acepte."
                },
                color = ZincText, fontSize = 15.sp, textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(40.dp))
            if (selected == "challenge") {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    MiniTile("TÚ", strong = true)
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
                Text("Continuar", color = Color.Black, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
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
            VideoSlot("Tu vídeo", uriA != null, Modifier.fillMaxWidth().aspectRatio(1.2f), onPickA)
        } else {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                VideoSlot("Vídeo A", uriA != null, Modifier.weight(1f).aspectRatio(0.62f), onPickA)
                VideoSlot("Vídeo B", uriB != null, Modifier.weight(1f).aspectRatio(0.62f), onPickB)
            }
        }

        Spacer(Modifier.height(16.dp))
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.04f)).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(16.dp)).padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            if (description.isEmpty()) {
                Text(
                    when (mode) { "duet" -> "¿Quién gana? 🥊 #1vs1"; "challenge" -> "Reto 🔥 ¿Aceptas?"; else -> "¿Cuál prefieres? 🅰️🆚🅱️" },
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

        Spacer(Modifier.height(16.dp))
        val enabled = if (mode == "challenge") uriA != null else (uriA != null && uriB != null)
        Box(
            Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(50)).background(if (enabled) Color.White else Color.White.copy(alpha = 0.20f)).clickable(enabled = enabled) { onPublish() },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                when (mode) { "duet" -> "Publicar 1vs1"; "challenge" -> "Elegir a quién retar"; else -> "Publicar versus" },
                color = if (enabled) Color.Black else Color.White.copy(alpha = 0.40f), fontSize = 16.sp, fontWeight = FontWeight.Bold,
            )
        }
        Spacer(Modifier.height(20.dp))
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
            Text(if (selected) "$label listo" else "Subir $label", color = if (selected) Color.White else Color(0xFFD4D4D8), fontSize = 13.sp, fontWeight = FontWeight.Medium)
            if (!selected) {
                Spacer(Modifier.height(2.dp))
                Text("MP4 / WebM · máx 80MB", color = Color(0xFF71717A), fontSize = 10.sp)
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
        Text("Elige a quién retar. Le aparecerá en sus retos activos para aceptar.", color = Color(0xFF71717A), fontSize = 13.sp)
        Spacer(Modifier.height(14.dp))
        // Buscador
        Row(
            Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.04f)).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(50)).padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(Icons.Filled.Search, null, tint = Color(0xFF71717A), modifier = Modifier.size(16.dp))
            Box(Modifier.weight(1f)) {
                if (query.isEmpty()) Text("Buscar por nombre o @usuario", color = Color(0xFF71717A), fontSize = 14.sp)
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
                Text("Aún no hay usuarios para retar", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(4.dp))
                Text("Cuando se registren más creadores, aparecerán aquí.", color = Color(0xFF71717A), fontSize = 13.sp, textAlign = TextAlign.Center)
            }
            filtered.isEmpty() -> Text("Sin resultados para \"$query\".", color = ZincText, fontSize = 14.sp, modifier = Modifier.padding(top = 24.dp))
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
            Text(u.name ?: u.username ?: "usuario", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("@" + (u.username ?: ""), color = Color(0xFF71717A), fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Row(
            Modifier.clip(RoundedCornerShape(50)).background(TwykGold).padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Icon(ImageVector.vectorResource(R.drawable.ic_swords), null, tint = Color.Black, modifier = Modifier.size(13.dp))
            Text("Retar", color = Color.Black, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
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
            when (mode) { "challenge" -> "Enviando tu reto…"; "duet" -> "Creando tu 1vs1…"; else -> "Subiendo tu versus…" },
            color = ZincText, fontSize = 14.sp,
        )
    }
}

private fun uploadPart(context: Context, name: String, uri: Uri): MultipartBody.Part {
    val input = context.contentResolver.openInputStream(uri) ?: throw IllegalStateException("No se pudo abrir el vídeo")
    val file = File.createTempFile("twyk_upload_", ".mp4", context.cacheDir)
    file.outputStream().use { out -> input.use { it.copyTo(out) } }
    val body = file.asRequestBody("video/*".toMediaTypeOrNull())
    return MultipartBody.Part.createFormData(name, file.name, body)
}
