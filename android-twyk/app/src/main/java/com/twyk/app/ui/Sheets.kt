package com.twyk.app.ui

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.twyk.app.Config
import com.twyk.app.absoluteUrl
import com.twyk.app.data.Comment
import com.twyk.app.data.CreateCommentRequest
import com.twyk.app.data.LoginRequest
import com.twyk.app.data.Post
import com.twyk.app.data.RegisterRequest
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import kotlinx.coroutines.launch

// Compartir una publicación con el selector nativo de Android.
fun sharePost(context: Context, post: Post) {
    val text = (post.description ?: "Mira este Twyk") + "\n" + Config.BASE_URL
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, "Compartir"))
}

// ── Hoja de COMENTARIOS — réplica de CommentsModal.jsx ────────────────────────
@Composable
fun CommentsSheet(postId: String, onClose: () -> Unit, onRequireAuth: () -> Unit) {
    val scope = rememberCoroutineScope()
    var comments by remember { mutableStateOf<List<Comment>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var input by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }

    LaunchedEffect(postId) {
        loading = true
        comments = runCatching { RetrofitProvider.api.comments(postId).comments.orEmpty() }.getOrDefault(emptyList())
        loading = false
    }

    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)).pointerInput(Unit) { detectTapGestures(onTap = { onClose() }) },
    ) {
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().fillMaxHeight(0.80f)
                .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .background(Color(0xFF18181B)).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .pointerInput(Unit) { detectTapGestures(onTap = {}) },
        ) {
            // Header
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 18.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val n = comments.size
                Text(if (n == 1) "1 Comentario" else "$n Comentarios", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                Box(Modifier.size(36.dp).clip(CircleShape).clickable { onClose() }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Close, "cerrar", tint = Color.White.copy(alpha = 0.6f), modifier = Modifier.size(20.dp))
                }
            }
            HorizontalDivider(color = Color.White.copy(alpha = 0.05f))

            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(26.dp))
                    }
                    comments.isEmpty() -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Text("Sin comentarios", color = Color.White.copy(alpha = 0.4f), fontSize = 14.sp)
                        Spacer(Modifier.height(4.dp))
                        Text("Sé el primero en comentar", color = Color.White.copy(alpha = 0.25f), fontSize = 13.sp)
                    }
                    else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                        items(comments) { c -> CommentRow(c) }
                    }
                }
            }

            HorizontalDivider(color = Color.White.copy(alpha = 0.05f))
            // Barra de entrada
            Row(
                Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(horizontal = 20.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (Session.token == null) {
                    Box(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(Color.White).clickable { onRequireAuth() }.padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text("Inicia sesión para comentar", color = Color.Black, fontSize = 14.sp, fontWeight = FontWeight.Medium) }
                } else {
                    Box(
                        Modifier.weight(1f).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.05f)).border(1.dp, Color.White.copy(alpha = 0.05f), RoundedCornerShape(50)).padding(horizontal = 16.dp, vertical = 12.dp),
                    ) {
                        if (input.isEmpty()) Text("Escribe un comentario...", color = Color.White.copy(alpha = 0.3f), fontSize = 14.sp)
                        BasicTextField(value = input, onValueChange = { input = it }, textStyle = TextStyle(color = Color.White, fontSize = 14.sp), cursorBrush = SolidColor(Color.White), maxLines = 4, modifier = Modifier.fillMaxWidth())
                    }
                    Spacer(Modifier.width(8.dp))
                    val canSend = input.isNotBlank() && !sending
                    Box(
                        Modifier.size(44.dp).clip(CircleShape).background(if (canSend) Color.White else Color.White.copy(alpha = 0.10f))
                            .clickable(enabled = canSend) {
                                val text = input.trim()
                                sending = true
                                scope.launch {
                                    runCatching { RetrofitProvider.api.createComment(CreateCommentRequest(postId, text)) }
                                        .onSuccess { r -> r.comment?.let { comments = listOf(it) + comments }; input = "" }
                                        .onFailure { onRequireAuth() }
                                    sending = false
                                }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (sending) CircularProgressIndicator(color = Color.Black, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                        else Icon(Icons.Filled.Send, "enviar", tint = if (canSend) Color.Black else Color.White.copy(alpha = 0.3f), modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun CommentRow(c: Comment) {
    Row(Modifier.fillMaxWidth()) {
        // Avatar (foto real o degradado morado→azul con inicial)
        val avatar = c.author?.avatarUrl
        Box(Modifier.size(32.dp).clip(CircleShape), contentAlignment = Alignment.Center) {
            if (avatar != null && !isGeneratedAvatar(avatar)) {
                AsyncImage(model = absoluteUrl(avatar), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else {
                Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(TwykPurple, TwykBlue))), contentAlignment = Alignment.Center) {
                    Text((c.author?.username?.firstOrNull()?.uppercase() ?: "U"), color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(c.author?.username ?: "Usuario", color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp, fontWeight = FontWeight.Medium)
                c.timestamp?.let {
                    Spacer(Modifier.width(8.dp))
                    Text(relativeTime(it), color = Color.White.copy(alpha = 0.3f), fontSize = 11.sp)
                }
            }
            Spacer(Modifier.height(3.dp))
            Text(c.text, color = Color.White.copy(alpha = 0.7f), fontSize = 14.sp, lineHeight = 18.sp)
        }
    }
}

private fun relativeTime(ts: String): String {
    // El backend envía un ISO date; mostramos algo corto sin parsear con precisión.
    return ts.take(10)
}

// ── Hoja de LOGIN / REGISTRO — réplica de AuthModal.jsx (modal centrado) ──────
@Composable
fun AuthSheet(onClose: () -> Unit, onAuthed: () -> Unit) {
    val scope = rememberCoroutineScope()
    var isRegister by remember { mutableStateOf(false) }
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.70f)).pointerInput(Unit) { detectTapGestures(onTap = { onClose() }) },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.widthIn(max = 420.dp).fillMaxWidth().padding(horizontal = 16.dp).imePadding()
                .clip(RoundedCornerShape(24.dp)).background(Color(0xFF18181B)).border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(24.dp))
                .pointerInput(Unit) { detectTapGestures(onTap = {}) },
        ) {
            // Header
            Row(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 18.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(if (isRegister) "Crear cuenta" else "Iniciar sesión", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Box(Modifier.size(36.dp).clip(CircleShape).clickable { onClose() }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Close, "cerrar", tint = Color.White.copy(alpha = 0.6f), modifier = Modifier.size(20.dp))
                }
            }
            HorizontalDivider(color = Color.White.copy(alpha = 0.05f))

            // Tabs
            Row(Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, top = 20.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AuthTab("Iniciar sesión", !isRegister, Modifier.weight(1f)) { isRegister = false; error = null }
                AuthTab("Registrarse", isRegister, Modifier.weight(1f)) { isRegister = true; error = null }
            }

            Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 24.dp)) {
                error?.let {
                    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color(0xFFEF4444).copy(alpha = 0.10f)).border(1.dp, Color(0xFFEF4444).copy(alpha = 0.20f), RoundedCornerShape(12.dp)).padding(horizontal = 16.dp, vertical = 12.dp)) {
                        Text(it, color = Color(0xFFF87171), fontSize = 13.sp)
                    }
                    Spacer(Modifier.height(16.dp))
                }

                AuthField("USUARIO", username, Icons.Outlined.Person) { username = it }
                if (isRegister) {
                    Spacer(Modifier.height(16.dp))
                    AuthField("EMAIL", email, Icons.Outlined.Email) { email = it }
                }
                Spacer(Modifier.height(16.dp))
                AuthField("CONTRASEÑA", password, Icons.Outlined.Lock, isPassword = true) { password = it }
                if (isRegister) {
                    Spacer(Modifier.height(6.dp))
                    Text("Mínimo 6 caracteres", color = Color.White.copy(alpha = 0.4f), fontSize = 11.sp)
                }

                Spacer(Modifier.height(24.dp))
                Box(
                    Modifier.fillMaxWidth().height(50.dp).clip(RoundedCornerShape(12.dp)).background(if (busy) Color.White.copy(alpha = 0.20f) else Color.White)
                        .clickable(enabled = !busy) {
                            error = null
                            if (isRegister && password.length < 6) { error = "La contraseña debe tener al menos 6 caracteres"; return@clickable }
                            busy = true
                            scope.launch {
                                runCatching {
                                    if (isRegister) RetrofitProvider.api.register(RegisterRequest(username.trim(), email.trim(), password))
                                    else RetrofitProvider.api.login(LoginRequest(username.trim(), password))
                                }.onSuccess { r ->
                                    if (r.token != null) {
                                        Session.set(r.token, r.user)
                                        onAuthed()
                                    } else if (isRegister) {
                                        // Si el registro no devuelve token, iniciamos sesión automáticamente.
                                        val lr = runCatching { RetrofitProvider.api.login(LoginRequest(username.trim(), password)) }.getOrNull()
                                        if (lr?.token != null) { Session.set(lr.token, lr.user); onAuthed() }
                                        else error = "Cuenta creada. Inicia sesión para continuar."
                                    } else {
                                        error = r.message ?: r.error ?: "No se pudo continuar"
                                    }
                                }.onFailure {
                                    error = if (isRegister) "No se pudo registrar (¿usuario o email en uso?)" else "Usuario o contraseña incorrectos"
                                }
                                busy = false
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    if (busy) {
                        CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(if (isRegister) Icons.Outlined.PersonAdd else Icons.AutoMirrored.Filled.Login, null, tint = Color.Black, modifier = Modifier.size(18.dp))
                            Text(if (isRegister) "Crear cuenta" else "Iniciar sesión", color = Color.Black, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AuthTab(label: String, active: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Box(
        modifier.clip(RoundedCornerShape(12.dp)).background(if (active) Color.White else Color.White.copy(alpha = 0.05f)).clickable { onClick() }.padding(vertical = 11.dp),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = if (active) Color.Black else Color.White.copy(alpha = 0.6f), fontSize = 14.sp, fontWeight = FontWeight.Medium) }
}

@Composable
private fun AuthField(label: String, value: String, icon: ImageVector, isPassword: Boolean = false, onChange: (String) -> Unit) {
    Column {
        Text(label, color = Color.White.copy(alpha = 0.6f), fontSize = 11.sp, fontWeight = FontWeight.Medium)
        Spacer(Modifier.height(8.dp))
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.05f)).border(1.dp, Color.White.copy(alpha = 0.05f), RoundedCornerShape(12.dp)).padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, null, tint = Color.White.copy(alpha = 0.4f), modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(12.dp))
            Box(Modifier.weight(1f)) {
                if (value.isEmpty()) Text(if (isPassword) "••••••••" else if (label == "EMAIL") "tu@email.com" else "tu_usuario", color = Color.White.copy(alpha = 0.3f), fontSize = 14.sp)
                BasicTextField(
                    value = value, onValueChange = onChange, singleLine = true,
                    visualTransformation = if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
                    textStyle = TextStyle(color = Color.White, fontSize = 14.sp), cursorBrush = SolidColor(Color.White),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}
