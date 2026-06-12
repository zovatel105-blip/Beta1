package com.twyk.app.ui

import android.content.Context
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.twyk.app.absoluteUrl
import com.twyk.app.data.Challenge
import com.twyk.app.data.NotificationItem
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File

// BUZÓN: retos recibidos (aceptar subiendo tu vídeo / rechazar) + notificaciones.
@Composable
fun InboxScreen(onRequireAuth: () -> Unit, onAccepted: () -> Unit) {
    if (Session.token == null) {
        LoginPrompt("Inicia sesión para ver tu buzón", onRequireAuth)
        return
    }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var challenges by remember { mutableStateOf<List<Challenge>>(emptyList()) }
    var notifications by remember { mutableStateOf<List<NotificationItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var pendingAcceptId by remember { mutableStateOf<String?>(null) }

    val pickResponse = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val cid = pendingAcceptId
        pendingAcceptId = null
        if (cid != null && uri != null) {
            busy = true
            error = null
            scope.launch {
                try {
                    val part = withContext(Dispatchers.IO) { filePartInbox(context, "file", uri) }
                    RetrofitProvider.api.acceptChallenge(cid, part)
                    challenges = challenges.filterNot { it.id == cid }
                    onAccepted()
                } catch (e: Exception) {
                    error = "No se pudo aceptar el reto."
                }
                busy = false
            }
        }
    }

    LaunchedEffect(Unit) {
        loading = true
        challenges = runCatching { RetrofitProvider.api.challenges("to").challenges.orEmpty() }.getOrDefault(emptyList())
        notifications = runCatching { RetrofitProvider.api.notifications().notifications.orEmpty() }.getOrDefault(emptyList())
        loading = false
    }

    Column(
        Modifier.fillMaxSize().background(Color.Black).verticalScroll(rememberScrollState())
            .statusBarsPadding().padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 110.dp),
    ) {
        Text("Buzón", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        error?.let { Spacer(Modifier.height(8.dp)); Text(it, color = Color(0xFFEF4444), fontSize = 12.sp) }

        Spacer(Modifier.height(16.dp))
        Text("Retos recibidos", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        Spacer(Modifier.height(8.dp))
        if (challenges.isEmpty()) {
            Text("No tienes retos pendientes.", color = Color.White.copy(alpha = 0.5f), fontSize = 13.sp)
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                challenges.forEach { ch ->
                    ChallengeRow(
                        ch = ch,
                        busy = busy,
                        onAccept = { pendingAcceptId = ch.id; pickResponse.launch("video/*") },
                        onReject = {
                            scope.launch {
                                runCatching { RetrofitProvider.api.rejectChallenge(ch.id) }
                                challenges = challenges.filterNot { it.id == ch.id }
                            }
                        },
                    )
                }
            }
        }

        Spacer(Modifier.height(22.dp))
        Text("Notificaciones", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        Spacer(Modifier.height(8.dp))
        when {
            loading -> Text("Cargando…", color = Color.White.copy(alpha = 0.5f), fontSize = 13.sp)
            notifications.isEmpty() -> Text("Sin notificaciones.", color = Color.White.copy(alpha = 0.5f), fontSize = 13.sp)
            else -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                notifications.forEach { NotificationRow(it) }
            }
        }
    }
}

@Composable
private fun ChallengeRow(ch: Challenge, busy: Boolean, onAccept: () -> Unit, onReject: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = 0.07f)).padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            val avatar = absoluteUrl(ch.from?.avatarUrl)
            if (avatar != null) {
                AsyncImage(model = avatar, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(38.dp).clip(CircleShape))
            } else {
                Box(Modifier.size(38.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.1f)))
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("@" + (ch.from?.username ?: "alguien") + " te ha retado", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                ch.message?.takeIf { it.isNotBlank() }?.let {
                    Text(it, color = Color.White.copy(alpha = 0.7f), fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(
                Modifier.weight(1f).clip(RoundedCornerShape(10.dp))
                    .background(if (busy) Color(0xFFEF2D56).copy(alpha = 0.5f) else Color(0xFFEF2D56))
                    .clickable(enabled = !busy) { onAccept() }.padding(vertical = 9.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Aceptar (subir vídeo)", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.SemiBold) }
            Box(
                Modifier.clip(RoundedCornerShape(10.dp)).background(Color.White.copy(alpha = 0.12f))
                    .clickable(enabled = !busy) { onReject() }.padding(horizontal = 18.dp, vertical = 9.dp),
                contentAlignment = Alignment.Center,
            ) { Text("Rechazar", color = Color.White, fontSize = 13.sp) }
        }
    }
}

@Composable
private fun NotificationRow(n: NotificationItem) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val avatar = absoluteUrl(n.user?.avatarUrl)
        if (avatar != null) {
            AsyncImage(model = avatar, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(36.dp).clip(CircleShape))
        } else {
            Box(Modifier.size(36.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.1f)))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(
                buildString {
                    n.user?.username?.let { append("@$it ") }
                    append(n.text ?: "")
                },
                color = Color.White, fontSize = 13.sp,
            )
            n.time?.let { Text(it, color = Color.White.copy(alpha = 0.45f), fontSize = 11.sp) }
        }
        if (!n.read) Box(Modifier.size(8.dp).clip(CircleShape).background(Color(0xFFEF2D56)))
    }
}

@Composable
internal fun LoginPrompt(message: String, onRequireAuth: () -> Unit) {
    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
            Text(message, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(16.dp))
            Box(
                Modifier.clip(RoundedCornerShape(10.dp)).background(Color(0xFF3B82F6))
                    .clickable { onRequireAuth() }.padding(horizontal = 24.dp, vertical = 10.dp),
            ) { Text("Entrar", color = Color.White, fontWeight = FontWeight.SemiBold) }
        }
    }
}

private fun filePartInbox(context: Context, name: String, uri: Uri): MultipartBody.Part {
    val input = context.contentResolver.openInputStream(uri)
        ?: throw IllegalStateException("No se pudo abrir el vídeo")
    val file = File.createTempFile("twyk_accept_", ".mp4", context.cacheDir)
    file.outputStream().use { out -> input.use { it.copyTo(out) } }
    val body = file.asRequestBody("video/*".toMediaTypeOrNull())
    return MultipartBody.Part.createFormData(name, file.name, body)
}
