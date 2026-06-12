package com.twyk.app.ui

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Send
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectTapGestures
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

// ── Hoja de COMENTARIOS ───────────────────────────────────────────────────────
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
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f))
            .pointerInput(Unit) { detectTapGestures(onTap = { onClose() }) },
    ) {
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .fillMaxHeight(0.72f)
                .clip(RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp))
                .background(Color(0xFF0A0A0B))
                .pointerInput(Unit) { detectTapGestures(onTap = {}) },
        ) {
            Box(
                Modifier
                    .padding(top = 8.dp)
                    .align(Alignment.CenterHorizontally)
                    .size(width = 40.dp, height = 4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color.White.copy(alpha = 0.25f)),
            )
            Text(
                "Comentarios",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                modifier = Modifier.align(Alignment.CenterHorizontally).padding(vertical = 10.dp),
            )
            HorizontalDivider(color = Color.White.copy(alpha = 0.08f))

            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    loading -> Text("Cargando…", color = Color.White.copy(alpha = 0.6f), modifier = Modifier.align(Alignment.Center))
                    comments.isEmpty() -> Text("Sé el primero en comentar", color = Color.White.copy(alpha = 0.6f), modifier = Modifier.align(Alignment.Center))
                    else -> LazyColumn(Modifier.fillMaxSize().padding(horizontal = 14.dp)) {
                        items(comments) { c -> CommentRow(c) }
                    }
                }
            }

            Row(
                Modifier.fillMaxWidth().navigationBarsPadding().padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(20.dp))
                        .background(Color.White.copy(alpha = 0.08f))
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                ) {
                    if (input.isEmpty()) Text("Añade un comentario…", color = Color.White.copy(alpha = 0.4f), fontSize = 14.sp)
                    BasicTextField(
                        value = input,
                        onValueChange = { input = it },
                        textStyle = TextStyle(color = Color.White, fontSize = 14.sp),
                        cursorBrush = SolidColor(Color.White),
                        maxLines = 4,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Spacer(Modifier.width(8.dp))
                val canSend = input.isNotBlank() && !sending
                Icon(
                    Icons.Filled.Send,
                    contentDescription = "enviar",
                    tint = if (canSend) Color(0xFF3B82F6) else Color.White.copy(alpha = 0.3f),
                    modifier = Modifier
                        .size(26.dp)
                        .clickable(enabled = canSend) {
                            if (Session.token == null) {
                                onRequireAuth()
                            } else {
                                val text = input.trim()
                                sending = true
                                scope.launch {
                                    runCatching { RetrofitProvider.api.createComment(CreateCommentRequest(postId, text)) }
                                        .onSuccess { r ->
                                            r.comment?.let { comments = listOf(it) + comments }
                                            input = ""
                                        }
                                        .onFailure { onRequireAuth() }
                                    sending = false
                                }
                            }
                        },
                )
            }
        }
    }
}

@Composable
private fun CommentRow(c: Comment) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        val avatar = absoluteUrl(c.author?.avatarUrl)
        if (avatar != null) {
            AsyncImage(model = avatar, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(34.dp).clip(CircleShape))
        } else {
            Box(Modifier.size(34.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.1f)))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(c.author?.username ?: "usuario", color = Color.White.copy(alpha = 0.7f), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(2.dp))
            Text(c.text, color = Color.White, fontSize = 14.sp)
        }
        Spacer(Modifier.width(8.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                if (c.userLiked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                contentDescription = null,
                tint = if (c.userLiked) Color(0xFFEF4444) else Color.White.copy(alpha = 0.5f),
                modifier = Modifier.size(16.dp),
            )
            if (c.likes > 0) Text(c.likes.toString(), color = Color.White.copy(alpha = 0.5f), fontSize = 10.sp)
        }
    }
}

// ── Hoja de LOGIN / REGISTRO ──────────────────────────────────────────────────
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
        Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.6f))
            .pointerInput(Unit) { detectTapGestures(onTap = { onClose() }) },
    ) {
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp))
                .background(Color(0xFF0A0A0B))
                .pointerInput(Unit) { detectTapGestures(onTap = {}) }
                .navigationBarsPadding()
                .padding(20.dp),
        ) {
            Text(if (isRegister) "Crear cuenta" else "Iniciar sesión", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(14.dp))
            Field("Usuario", username) { username = it }
            if (isRegister) {
                Spacer(Modifier.height(10.dp))
                Field("Email", email) { email = it }
            }
            Spacer(Modifier.height(10.dp))
            Field("Contraseña", password, isPassword = true) { password = it }
            error?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = Color(0xFFEF4444), fontSize = 12.sp)
            }
            Spacer(Modifier.height(16.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (busy) Color(0xFF3B82F6).copy(alpha = 0.5f) else Color(0xFF3B82F6))
                    .clickable(enabled = !busy) {
                        error = null
                        busy = true
                        scope.launch {
                            runCatching {
                                if (isRegister) RetrofitProvider.api.register(RegisterRequest(username.trim(), email.trim(), password))
                                else RetrofitProvider.api.login(LoginRequest(username.trim(), password))
                            }.onSuccess { r ->
                                if (r.token != null) {
                                    Session.token = r.token
                                    Session.user = r.user
                                    onAuthed()
                                } else {
                                    error = r.message ?: "No se pudo continuar"
                                }
                            }.onFailure {
                                error = if (isRegister) "No se pudo registrar (¿usuario o email en uso?)" else "Usuario o contraseña incorrectos"
                            }
                            busy = false
                        }
                    }
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(if (isRegister) "Crear cuenta" else "Entrar", color = Color.White, fontWeight = FontWeight.SemiBold)
            }
            Spacer(Modifier.height(10.dp))
            Text(
                if (isRegister) "¿Ya tienes cuenta? Inicia sesión" else "¿No tienes cuenta? Regístrate",
                color = Color.White.copy(alpha = 0.6f),
                fontSize = 13.sp,
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .clickable { isRegister = !isRegister; error = null },
            )
        }
    }
}

@Composable
private fun Field(label: String, value: String, isPassword: Boolean = false, onChange: (String) -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(Color.White.copy(alpha = 0.08f))
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        if (value.isEmpty()) Text(label, color = Color.White.copy(alpha = 0.4f), fontSize = 14.sp)
        BasicTextField(
            value = value,
            onValueChange = onChange,
            singleLine = true,
            visualTransformation = if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
            textStyle = TextStyle(color = Color.White, fontSize = 14.sp),
            cursorBrush = SolidColor(Color.White),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
