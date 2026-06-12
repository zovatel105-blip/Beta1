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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File

// Pantalla SUBIR: crea un Versus (carrusel A/B) o un 1vs1/Duelo (pantalla partida).
@Composable
fun UploadScreen(onRequireAuth: () -> Unit, onDone: () -> Unit) {
    if (Session.token == null) {
        Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
                Text("Inicia sesión para publicar", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(16.dp))
                Box(
                    Modifier.clip(RoundedCornerShape(10.dp)).background(Color(0xFF3B82F6))
                        .clickable { onRequireAuth() }.padding(horizontal = 24.dp, vertical = 10.dp),
                ) { Text("Entrar", color = Color.White, fontWeight = FontWeight.SemiBold) }
            }
        }
        return
    }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var type by remember { mutableStateOf("versus") } // "versus" | "duet"
    var uriA by remember { mutableStateOf<Uri?>(null) }
    var uriB by remember { mutableStateOf<Uri?>(null) }
    var description by remember { mutableStateOf("") }
    var layout by remember { mutableStateOf("horizontal") } // duet: horizontal | vertical
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val pickA = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uriA = it }
    val pickB = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uriB = it }

    Column(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .verticalScroll(rememberScrollState())
            .statusBarsPadding()
            .padding(start = 18.dp, end = 18.dp, top = 16.dp, bottom = 110.dp),
    ) {
        Text("Crear publicación", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(16.dp))

        // Tipo
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Chip("Versus", type == "versus", Modifier.weight(1f)) { type = "versus" }
            Chip("1vs1 / Duelo", type == "duet", Modifier.weight(1f)) { type = "duet" }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            if (type == "versus") "Carrusel: se desliza entre A y B." else "Pantalla partida: A y B a la vez.",
            color = Color.White.copy(alpha = 0.55f), fontSize = 12.sp,
        )
        Spacer(Modifier.height(18.dp))

        // Vídeos
        PickRow("Vídeo A", uriA != null) { pickA.launch("video/*") }
        Spacer(Modifier.height(10.dp))
        PickRow("Vídeo B", uriB != null) { pickB.launch("video/*") }

        if (type == "duet") {
            Spacer(Modifier.height(18.dp))
            Text("Disposición", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Chip("Arriba / Abajo", layout == "horizontal", Modifier.weight(1f)) { layout = "horizontal" }
                Chip("Izq / Der", layout == "vertical", Modifier.weight(1f)) { layout = "vertical" }
            }
        }

        Spacer(Modifier.height(18.dp))
        Text("Descripción", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
        Spacer(Modifier.height(8.dp))
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Color.White.copy(alpha = 0.08f))
                .padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            if (description.isEmpty()) Text("Escribe una descripción…", color = Color.White.copy(alpha = 0.4f), fontSize = 14.sp)
            BasicTextField(
                value = description,
                onValueChange = { description = it },
                textStyle = TextStyle(color = Color.White, fontSize = 14.sp),
                cursorBrush = SolidColor(Color.White),
                maxLines = 4,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        error?.let {
            Spacer(Modifier.height(10.dp))
            Text(it, color = Color(0xFFEF4444), fontSize = 12.sp)
        }

        Spacer(Modifier.height(22.dp))
        val canPublish = uriA != null && uriB != null && !busy
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                .background(if (canPublish) Color(0xFFEF2D56) else Color.White.copy(alpha = 0.15f))
                .clickable(enabled = canPublish) {
                    val a = uriA; val b = uriB ?: return@clickable
                    if (a == null) return@clickable
                    error = null
                    busy = true
                    scope.launch {
                        try {
                            val parts = withContext(Dispatchers.IO) {
                                filePart(context, "fileA", a) to filePart(context, "fileB", b)
                            }
                            val desc = (description.ifBlank {
                                if (type == "versus") "¿Cuál prefieres? 🅰️🆚🅱️" else "¿Quién gana? 🥊 #1vs1"
                            }).toRequestBody("text/plain".toMediaTypeOrNull())
                            if (type == "versus") {
                                RetrofitProvider.api.uploadVersus(parts.first, parts.second, desc)
                            } else {
                                RetrofitProvider.api.uploadDuet(
                                    parts.first, parts.second, desc,
                                    layout.toRequestBody("text/plain".toMediaTypeOrNull()),
                                )
                            }
                            busy = false
                            onDone()
                        } catch (e: Exception) {
                            busy = false
                            error = "No se pudo publicar. Revisa tu sesión y los vídeos."
                        }
                    }
                }
                .padding(vertical = 13.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(if (busy) "Publicando…" else "Publicar", color = Color.White, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun Chip(label: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) Color(0xFF3B82F6) else Color.White.copy(alpha = 0.08f))
            .clickable { onClick() }
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, color = Color.White, fontSize = 13.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal)
    }
}

@Composable
private fun PickRow(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.07f))
            .clickable { onClick() }.padding(horizontal = 14.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.VideoLibrary, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(12.dp))
        Text(if (selected) "$label seleccionado" else "Elegir $label", color = Color.White, fontSize = 14.sp, modifier = Modifier.weight(1f))
        if (selected) Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Color(0xFF22C55E), modifier = Modifier.size(22.dp))
    }
}

// Copia el contenido del Uri a un archivo temporal y crea la parte multipart.
private fun filePart(context: Context, name: String, uri: Uri): MultipartBody.Part {
    val input = context.contentResolver.openInputStream(uri)
        ?: throw IllegalStateException("No se pudo abrir el vídeo")
    val file = File.createTempFile("twyk_upload_", ".mp4", context.cacheDir)
    file.outputStream().use { out -> input.use { it.copyTo(out) } }
    val body = file.asRequestBody("video/*".toMediaTypeOrNull())
    return MultipartBody.Part.createFormData(name, file.name, body)
}
