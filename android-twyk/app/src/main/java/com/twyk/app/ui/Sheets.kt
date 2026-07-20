package com.twyk.app.ui

import android.app.DatePickerDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.outlined.Cake
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
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.withLink
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twyk.app.Config
import com.twyk.app.data.Comment
import com.twyk.app.data.CreateCommentRequest
import com.twyk.app.data.LoginRequest
import com.twyk.app.data.Post
import com.twyk.app.data.RegisterRequest
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import kotlinx.coroutines.launch
import java.util.Calendar

// Compartir una publicación con el selector nativo de Android.
fun sharePost(context: Context, post: Post) {
    val text = (post.description ?: "Mira este Twyk") + "\n" + Config.BASE_URL
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, "Share"))
}

// ── Hoja de COMPARTIR — réplica de ShareModal.jsx: grid de 5 opciones (Send
// to/Copy link/Instagram/WhatsApp/X) en vez de abrir directamente el selector
// nativo de Android. Se abre desde el icono de compartir del SocialRail
// (feed/VersusFeed.kt), igual que ShareModal se abre desde CarouselSlide.jsx.
@Composable
fun ShareSheet(postId: String, onClose: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var copied by remember { mutableStateOf(false) }
    val shareUrl = Config.BASE_URL.trimEnd('/') + "/?post=" + postId

    fun copyLink() {
        runCatching {
            val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
            cm.setPrimaryClip(android.content.ClipData.newPlainText("twyk", shareUrl))
        }
        copied = true
        scope.launch { delay(1800); copied = false }
    }

    fun openUrl(url: String) {
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
    }

    fun sendTo() {
        runCatching {
            val intent = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, shareUrl) }
            context.startActivity(Intent.createChooser(intent, "Share").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)).clickable(onClick = onClose),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
                .background(Color(0xFF18181B))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { }
                .navigationBarsPadding(),
        ) {
            Box(Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 4.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.size(width = 36.dp, height = 4.dp).clip(RoundedCornerShape(2.dp)).background(Color.White.copy(alpha = 0.2f)))
            }
            Text(
                "Share", color = Color.White.copy(alpha = 0.85f), fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
            )
            HorizontalDivider(color = Color.White.copy(alpha = 0.06f))
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 22.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                ShareOptionIcon("Send to", Icons.Filled.Send, Color(0xFF27272A), Color.White) { sendTo(); onClose() }
                ShareOptionIcon(
                    if (copied) "Copied" else "Copy link",
                    if (copied) Icons.Filled.Check else Icons.Filled.Link,
                    Color(0xFF27272A), if (copied) Color(0xFF4ADE80) else Color.White,
                ) { copyLink() }
                ShareOptionIcon(
                    "Instagram", Icons.Filled.PhotoCamera, null, Color.White,
                    gradient = Brush.linearGradient(listOf(Color(0xFFFACC15), Color(0xFFEC4899), Color(0xFF9333EA))),
                ) { openUrl("https://www.instagram.com/"); onClose() }
                ShareOptionIcon("WhatsApp", Icons.AutoMirrored.Filled.Chat, Color(0xFF25D366), Color.White) {
                    openUrl("https://wa.me/?text=" + Uri.encode(shareUrl)); onClose()
                }
                ShareOptionText("X", Color.Black, Color.White) {
                    openUrl("https://twitter.com/intent/tweet?url=" + Uri.encode(shareUrl)); onClose()
                }
            }
        }
    }
}

@Composable
private fun ShareOptionIcon(label: String, icon: ImageVector, bg: Color?, tint: Color, gradient: Brush? = null, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(56.dp).clickable { onClick() }) {
        Box(
            Modifier.size(56.dp).clip(CircleShape)
                .then(if (gradient != null) Modifier.background(gradient) else Modifier.background(bg ?: Color(0xFF27272A))),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, null, tint = tint, modifier = Modifier.size(24.dp)) }
        Spacer(Modifier.height(6.dp))
        Text(label, color = Color.White.copy(alpha = 0.75f), fontSize = 11.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun ShareOptionText(label: String, bg: Color, tint: Color, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(56.dp).clickable { onClick() }) {
        Box(Modifier.size(56.dp).clip(CircleShape).background(bg), contentAlignment = Alignment.Center) {
            Text(label, color = tint, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(6.dp))
        Text(label, color = Color.White.copy(alpha = 0.75f), fontSize = 11.sp, textAlign = TextAlign.Center)
    }
}

// ── Hoja de COMENTARIOS — réplica de CommentsModal.jsx ────────────────────────
@Composable
fun CommentsSheet(postId: String, onClose: () -> Unit, onRequireAuth: () -> Unit) {
    val scope = rememberCoroutineScope()
    var comments by remember { mutableStateOf<List<Comment>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var input by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    // Comentario al que se está respondiendo (hilo plano de 1 nivel, igual
    // que la web: el backend aplana automáticamente cualquier parentId a la
    // raíz, así que basta enviar el id del comentario tocado).
    var replyTarget by remember { mutableStateOf<Comment?>(null) }

    LaunchedEffect(postId) {
        loading = true
        comments = runCatching { RetrofitProvider.api.comments(postId).comments.orEmpty() }.getOrDefault(emptyList())
        loading = false
    }

    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)).pointerInput(Unit) { detectTapGestures(onTap = { onClose() }) },
    ) {
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().fillMaxHeight(0.80f)
                .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .background(Color.White)
                .pointerInput(Unit) { detectTapGestures(onTap = {}) },
        ) {
            Box(Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 2.dp), contentAlignment = Alignment.Center) {
                Box(Modifier.size(width = 40.dp, height = 4.dp).clip(RoundedCornerShape(2.dp)).background(Color(0xFFA1A1AA)))
            }
            // Header
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val n = comments.size
                Text(if (n == 1) "1 comment" else "$n comments", color = Color(0xFF27272A), fontSize = 16.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                Box(Modifier.size(36.dp).clip(CircleShape).clickable { onClose() }, contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Close, "close", tint = Color(0xFF71717A), modifier = Modifier.size(20.dp))
                }
            }
            HorizontalDivider(color = Color(0xFFF4F4F5))

            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Color(0xFF3F3F46), strokeWidth = 2.dp, modifier = Modifier.size(26.dp))
                    }
                    comments.isEmpty() -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Text("No comments yet", color = Color(0xFF71717A), fontSize = 14.sp)
                        Spacer(Modifier.height(4.dp))
                        Text("Be the first to comment", color = Color(0xFFA1A1AA), fontSize = 13.sp)
                    }
                    else -> {
                        val ordered = threadComments(comments)
                        // Posiciones reales de cada avatar (medidas con
                        // onGloballyPositioned, réplica del getBoundingClientRect
                        // de ReplyThread en CommentsModal.jsx) + la posición del
                        // contenedor, para dibujar la línea conectora avatar-a-
                        // avatar SOLO entre una respuesta y la respuesta EXACTA a
                        // la que respondió (nunca con el comentario raíz). Antes
                        // no existía ningún conector en la app nativa.
                        val avatarCoords = remember { mutableStateMapOf<String, LayoutCoordinates>() }
                        var containerCoords by remember { mutableStateOf<LayoutCoordinates?>(null) }
                        Box(Modifier.fillMaxSize().onGloballyPositioned { containerCoords = it }) {
                            Column(
                                Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                                    .padding(horizontal = 20.dp, vertical = 16.dp),
                                verticalArrangement = Arrangement.spacedBy(20.dp),
                            ) {
                                ordered.forEach { (c, isReply) ->
                                    CommentRow(
                                        c = c,
                                        isReply = isReply,
                                        onReply = { replyTarget = c },
                                        onDeleted = { id -> comments = comments.filterNot { it.id == id || it.parentId == id } },
                                        onAvatarPositioned = { coords -> avatarCoords[c.id] = coords },
                                    )
                                }
                            }
                            ReplyConnectors(ordered, avatarCoords, containerCoords)
                        }
                    }
                }
            }

            HorizontalDivider(color = Color(0xFFF4F4F5))

            // Pill "Replying to @username" (igual que la web) — solo visible con sesión.
            if (replyTarget != null && Session.token != null) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 20.dp, top = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "Replying to @${replyTarget?.author?.username ?: "user"}",
                        color = Color(0xFF71717A), fontSize = 12.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f),
                    )
                    Text("Cancel", color = Color(0xFF3F3F46), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { replyTarget = null })
                }
            }

            // Barra de entrada
            Row(
                Modifier.fillMaxWidth().navigationBarsPadding().imePadding().padding(horizontal = 20.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (Session.token == null) {
                    Box(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(Color(0xFF18181B)).clickable { onRequireAuth() }.padding(vertical = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text("Log in to comment", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Medium) }
                } else {
                    Box(
                        Modifier.weight(1f).clip(RoundedCornerShape(50)).background(Color(0xFFF4F4F5)).padding(horizontal = 16.dp, vertical = 12.dp),
                    ) {
                        if (input.isEmpty()) Text(if (replyTarget != null) "Reply to @${replyTarget?.author?.username ?: "user"}..." else "Add a comment...", color = Color(0xFFA1A1AA), fontSize = 14.sp)
                        BasicTextField(value = input, onValueChange = { input = it }, textStyle = TextStyle(color = Color(0xFF18181B), fontSize = 14.sp), cursorBrush = SolidColor(Color(0xFF18181B)), maxLines = 4, modifier = Modifier.fillMaxWidth())
                    }
                    Spacer(Modifier.width(8.dp))
                    val canSend = input.isNotBlank() && !sending
                    Box(
                        Modifier.size(44.dp).clip(CircleShape).background(if (canSend) Color(0xFF18181B) else Color(0xFFE4E4E7))
                            .clickable(enabled = canSend) {
                                val text = input.trim()
                                val parentId = replyTarget?.id
                                sending = true
                                scope.launch {
                                    runCatching { RetrofitProvider.api.createComment(CreateCommentRequest(postId, text, parentId)) }
                                        .onSuccess { r -> r.comment?.let { comments = comments + it }; input = ""; replyTarget = null }
                                        .onFailure { onRequireAuth() }
                                    sending = false
                                }
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (sending) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                        else Icon(Icons.Filled.Send, "send", tint = if (canSend) Color.White else Color(0xFFA1A1AA), modifier = Modifier.size(16.dp))
                    }
                }
            }
        }
    }
}

// Agrupa los comentarios en hilo plano de 1 nivel: cada raíz (parentId=null)
// seguida INMEDIATAMENTE de sus respuestas (parentId==id de la raíz), en el
// mismo orden ascendente que ya envía el backend. Réplica de repliesByParent
// en CommentsModal.jsx. Devuelve pares (comentario, esRespuesta).
private fun threadComments(list: List<Comment>): List<Pair<Comment, Boolean>> {
    val roots = list.filter { it.parentId == null }
    val repliesByParent = list.filter { it.parentId != null }.groupBy { it.parentId }
    val result = mutableListOf<Pair<Comment, Boolean>>()
    for (root in roots) {
        result.add(root to false)
        repliesByParent[root.id]?.forEach { result.add(it to true) }
    }
    // Respuestas "huérfanas" (su raíz no está en esta lista, caso raro) se
    // muestran igualmente al final en vez de perderse.
    val knownRootIds = roots.map { it.id }.toSet()
    list.filter { it.parentId != null && it.parentId !in knownRootIds }.forEach { result.add(it to false) }
    return result
}

// Línea conectora avatar-a-avatar entre una respuesta y la respuesta EXACTA
// a la que respondió (nunca con el comentario raíz) — réplica nativa de
// ReplyThread en CommentsModal.jsx. La web mide posiciones reales del DOM
// (getBoundingClientRect) porque la adyacencia en la lista NO garantiza que
// el objetivo esté justo antes (dos respuestas distintas al mismo comentario
// quedan como hermanas, no como padre-hijo consecutivo). Aquí se replica esa
// misma idea con `onGloballyPositioned`: cada CommentRow reporta la posición
// real de su propio avatar (avatarCoords[id]); este Canvas mide la distancia
// EXACTA entre el avatar de destino (replyToId) y el de la respuesta, sin
// importar cuántas otras filas se interpongan entre medias, y dibuja la
// línea SOLO si el objetivo es otra respuesta (no la raíz del hilo, que ya
// se identifica en el propio `parentId` aplanado por el backend).
@Composable
private fun BoxScope.ReplyConnectors(
    ordered: List<Pair<Comment, Boolean>>,
    avatarCoords: Map<String, LayoutCoordinates>,
    containerCoords: LayoutCoordinates?,
) {
    val container = containerCoords ?: return
    if (!container.isAttached) return
    Canvas(Modifier.matchParentSize()) {
        val gapPx = 6.dp.toPx()
        for ((c, isReply) in ordered) {
            if (!isReply) continue
            val targetId = c.replyToId ?: continue
            if (targetId == c.parentId) continue // responde a la raíz, no a otra respuesta -> sin conector
            val targetCoords = avatarCoords[targetId] ?: continue
            val selfCoords = avatarCoords[c.id] ?: continue
            if (!targetCoords.isAttached || !selfCoords.isAttached) continue
            val targetBottom = runCatching {
                container.localPositionOf(targetCoords, Offset(targetCoords.size.width / 2f, targetCoords.size.height.toFloat()))
            }.getOrNull() ?: continue
            val selfTop = runCatching {
                container.localPositionOf(selfCoords, Offset(selfCoords.size.width / 2f, 0f))
            }.getOrNull() ?: continue
            // Solo si el objetivo queda REALMENTE arriba (con hueco suficiente
            // para el gap en ambos extremos); evita líneas invertidas/superpuestas.
            if (selfTop.y - targetBottom.y <= gapPx * 2) continue
            drawLine(
                color = Color(0xFFE4E4E7),
                start = Offset(targetBottom.x, targetBottom.y + gapPx),
                end = Offset(selfTop.x, selfTop.y - gapPx),
                strokeWidth = 2.dp.toPx(),
            )
        }
    }
}

@Composable
private fun CommentRow(c: Comment, isReply: Boolean, onReply: () -> Unit, onDeleted: (String) -> Unit, onAvatarPositioned: (LayoutCoordinates) -> Unit = {}) {
    val scope = rememberCoroutineScope()
    var confirmingDelete by remember(c.id) { mutableStateOf(false) }
    var deleting by remember(c.id) { mutableStateOf(false) }
    val avatarSize = if (isReply) 28.dp else 36.dp
    // "autor ▶ usuario_respondido" (réplica de `targetsAnotherReply` en
    // CommentsModal.jsx): solo se muestra cuando esta respuesta respondió a
    // OTRA respuesta (replyToId distinto de la raíz del hilo, que es
    // `parentId` ya que el backend aplana cualquier respuesta a la raíz),
    // nunca cuando responde directamente al comentario principal.
    val showReplyTarget = isReply && c.replyToId != null && c.replyToId != c.parentId

    Row(Modifier.fillMaxWidth().padding(start = if (isReply) 40.dp else 0.dp)) {
        // Avatar (foto real, o silueta gris por defecto vía TwykAvatar —
        // igual que el resto de la app y que <Avatar> en la web). Reporta
        // su posición real (onGloballyPositioned) para que ReplyConnectors
        // pueda dibujar la línea avatar-a-avatar cuando corresponda.
        Box(
            Modifier.size(avatarSize).clip(CircleShape).background(Color(0xFFE4E4E7)).onGloballyPositioned(onAvatarPositioned),
            contentAlignment = Alignment.Center,
        ) {
            TwykAvatar(c.author?.avatarUrl, Modifier.fillMaxSize())
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            // Burbuja neutral (bg-zinc-100 en la web) — el color del voto
            // se indica solo con el puntito, no con la burbuja entera.
            Box(Modifier.clip(RoundedCornerShape(16.dp)).background(Color(0xFFF4F4F5)).padding(horizontal = 14.dp, vertical = 10.dp)) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(c.author?.username ?: "User", color = Color(0xFF18181B), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        if (showReplyTarget && c.replyToUsername != null) {
                            Icon(Icons.Filled.ChevronRight, null, tint = Color(0xFFA1A1AA), modifier = Modifier.size(13.dp))
                            Text(c.replyToUsername, color = Color(0xFF71717A), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }
                        c.timestamp?.let {
                            Spacer(Modifier.width(8.dp))
                            Text(relativeTime(it), color = Color(0xFFA1A1AA), fontSize = 11.sp)
                        }
                    }
                    Spacer(Modifier.height(1.dp))
                    Text(c.text, color = Color(0xFF3F3F46), fontSize = 14.sp, lineHeight = 18.sp)
                }
            }
            Spacer(Modifier.height(6.dp))
            if (Session.token != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    if (confirmingDelete) {
                        Text("Delete this comment?", color = Color(0xFF71717A), fontSize = 12.sp)
                        if (deleting) {
                            Text("Deleting…", color = Color(0xFFDC2626), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        } else {
                            Text(
                                "Delete", color = Color(0xFFDC2626), fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.clickable {
                                    deleting = true
                                    scope.launch {
                                        val ok = runCatching { RetrofitProvider.api.deleteComment(c.id) }.getOrNull()?.ok == true
                                        if (ok) onDeleted(c.id) else { deleting = false; confirmingDelete = false }
                                    }
                                },
                            )
                            Text("Cancel", color = Color(0xFFA1A1AA), fontSize = 12.sp, fontWeight = FontWeight.Medium, modifier = Modifier.clickable { confirmingDelete = false })
                        }
                    } else {
                        Text("Reply", color = Color(0xFF71717A), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { onReply() })
                        if (c.canDelete) {
                            Text("Delete", color = Color(0xFFA1A1AA), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { confirmingDelete = true })
                        }
                    }
                }
            }
        }
    }
}

private fun relativeTime(ts: String): String {
    // El backend envía un ISO date; mostramos algo corto sin parsear con precisión.
    return ts.take(10)
}

// ── Hoja de LOGIN / REGISTRO — réplica EXACTA de AuthModal.jsx: hoja inferior
// BLANCA (antes era un diálogo centrado oscuro, diseño antiguo) con splash de
// "métodos" y registro PASO A PASO estilo TikTok (fecha de nacimiento -> email
// -> contraseña -> usuario, cada uno en su propia pantalla con indicador de
// progreso), en vez de un único formulario con pestañas Login/Registro. ─────
private val AuthPurple = Color(0xFFA855F7)
private val AuthBlue = Color(0xFF3B82F6)
private val AuthGradient = Brush.horizontalGradient(listOf(AuthPurple, AuthBlue))

private data class RegStep(val key: String, val title: String, val subtitle: String)
private val REG_STEPS = listOf(
    RegStep("birthdate", "What's your date of birth?", "Your date of birth won't be shown publicly."),
    RegStep("email", "What's your email?", "We'll send important information to this email."),
    RegStep("password", "Create a password", "Use at least 6 characters."),
    RegStep("username", "Create your username", "This is how people will find you on Twyk. You can change it later."),
)

@Composable
fun AuthSheet(onClose: () -> Unit, onAuthed: () -> Unit) {
    val scope = rememberCoroutineScope()
    var view by remember { mutableStateOf("register") } // "login" | "register"
    var step by remember { mutableStateOf("methods") }  // "methods" | "form"
    var regStep by remember { mutableStateOf(0) }
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    // Fecha de nacimiento ('YYYY-MM-DD'), OBLIGATORIA para registrarse — el
    // backend la exige (gating de edad COPPA) y sin ella /api/auth/register
    // devuelve 400 'birthdate_required'. Antes este campo no existía en la
    // app nativa: NINGÚN registro podía completarse nunca.
    var birthDate by remember { mutableStateOf<String?>(null) }
    var loginUsername by remember { mutableStateOf("") }
    var loginPassword by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var ageBlocked by remember { mutableStateOf(false) }

    fun switchMode(mode: String) {
        view = mode; step = "methods"; regStep = 0; error = null; ageBlocked = false
    }

    fun goBack() {
        error = null
        if (view == "register" && step == "form") {
            if (regStep > 0) regStep -= 1 else step = "methods"
        } else {
            step = "methods"
        }
    }

    fun doRegister() {
        busy = true
        scope.launch {
            runCatching { RetrofitProvider.api.register(RegisterRequest(username.trim(), email.trim(), password, birthDate ?: "")) }
                .onSuccess { r ->
                    if (r.token != null) {
                        Session.set(r.token, r.user); onAuthed()
                    } else {
                        val msg = r.message ?: r.error ?: "Sign up error"
                        if (msg.contains("under 13", ignoreCase = true)) ageBlocked = true else error = msg
                    }
                }
                .onFailure { error = "Sign up error" }
            busy = false
        }
    }

    fun handleRegisterNext() {
        error = null
        when (REG_STEPS[regStep].key) {
            "birthdate" -> {
                if (birthDate == null) { error = "Enter your date of birth"; return }
                val age = ageFromBirthDate(birthDate)
                if (age < 0) { error = "Invalid date of birth"; return }
                if (age < 13) { ageBlocked = true; return }
            }
            "email" -> if (!email.contains("@") || !email.substringAfter("@").contains(".")) { error = "Enter a valid email"; return }
            "password" -> if (password.length < 6) { error = "Password must be at least 6 characters"; return }
            "username" -> {
                if (username.trim().length < 3) { error = "Username must be at least 3 characters"; return }
                doRegister(); return
            }
        }
        regStep += 1
    }

    fun handleLogin() {
        error = null
        busy = true
        scope.launch {
            runCatching { RetrofitProvider.api.login(LoginRequest(loginUsername.trim(), loginPassword)) }
                .onSuccess { r ->
                    if (r.token != null) { Session.set(r.token, r.user); onAuthed() }
                    else error = r.message ?: r.error ?: "Sign in error"
                }
                .onFailure { error = "Sign in error" }
            busy = false
        }
    }

    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.60f)),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            Modifier.fillMaxWidth().fillMaxHeight(0.94f).imePadding()
                .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .background(Color.White),
        ) {
            // Header: flecha abajo (cerrar) en el splash/bloqueo por edad; flecha atrás en los pasos.
            Box(Modifier.fillMaxWidth().statusBarsPadding().height(48.dp)) {
                if (step == "methods" || ageBlocked) {
                    Box(Modifier.align(Alignment.Center).size(36.dp).clip(CircleShape).clickable { onClose() }, contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.KeyboardArrowDown, "cerrar", tint = Color(0xFF52525B), modifier = Modifier.size(26.dp))
                    }
                } else {
                    Box(Modifier.align(Alignment.CenterStart).padding(start = 6.dp).size(36.dp).clip(CircleShape).clickable { goBack() }, contentAlignment = Alignment.Center) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "back", tint = Color(0xFF18181B), modifier = Modifier.size(22.dp))
                    }
                }
            }

            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    ageBlocked -> AgeBlockedScreen { ageBlocked = false; switchMode("login") }
                    step == "methods" -> AuthMethodsScreen(
                        isRegister = view == "register",
                        onUseForm = { step = "form"; regStep = 0; error = null },
                        onSwitch = { switchMode(if (view == "register") "login" else "register") },
                    )
                    view == "register" -> AuthRegisterStepScreen(
                        regStep = regStep,
                        birthDate = birthDate, onBirthDate = { birthDate = it },
                        email = email, onEmail = { email = it },
                        password = password, onPassword = { password = it },
                        username = username, onUsername = { username = it },
                        error = error, busy = busy,
                        onSubmit = { handleRegisterNext() },
                    )
                    else -> AuthLoginScreen(
                        username = loginUsername, onUsername = { loginUsername = it },
                        password = loginPassword, onPassword = { loginPassword = it },
                        error = error, busy = busy,
                        onSubmit = { handleLogin() },
                        onSwitch = { switchMode("register") },
                    )
                }
            }
        }
    }
}

// Texto legal del footer con "Terms of Use"/"Privacy Policy" como enlaces
// REALES (abren el navegador vía LinkAnnotation.Url, disponible en el BOM de
// Compose usado por este proyecto) — antes era texto plano no interactivo,
// a diferencia de los <a href="/terms">/<a href="/privacy"> de AuthModal.jsx.
@Composable
private fun LegalFooterText(prefix: String) {
    val linkStyle = TextLinkStyles(style = SpanStyle(color = Color(0xFF52525B), fontWeight = FontWeight.SemiBold, textDecoration = TextDecoration.Underline))
    Text(
        buildAnnotatedString {
            withStyle(SpanStyle(color = Color(0xFFA1A1AA))) { append(prefix) }
            withLink(LinkAnnotation.Url(Config.BASE_URL.trimEnd('/') + "/terms", linkStyle)) { append("Terms of Use") }
            withStyle(SpanStyle(color = Color(0xFFA1A1AA))) { append(" and ") }
            withLink(LinkAnnotation.Url(Config.BASE_URL.trimEnd('/') + "/privacy", linkStyle)) { append("Privacy Policy") }
        },
        fontSize = 12.sp, textAlign = TextAlign.Center, lineHeight = 16.sp,
    )
}

@Composable
private fun AuthMethodsScreen(isRegister: Boolean, onUseForm: () -> Unit, onSwitch: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(20.dp))
            Text(
                if (isRegister) "Sign up for Twyk" else "Log in to Twyk",
                color = Color(0xFF18181B), fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                if (isRegister) "Create your profile, vote on challenges, upload your videos and challenge other creators."
                else "Log in to vote on challenges, upload your videos and challenge others.",
                color = Color(0xFF71717A), fontSize = 14.sp, textAlign = TextAlign.Center, lineHeight = 19.sp,
                modifier = Modifier.widthIn(max = 300.dp),
            )
            Spacer(Modifier.height(28.dp))
            AuthGradientButton(if (isRegister) "Use email or username" else "Use username and password", busy = false, onClick = onUseForm)
            Spacer(Modifier.height(20.dp))
            LegalFooterText("By continuing you accept our ")
        }
        Row(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 16.dp),
            horizontalArrangement = Arrangement.Center,
        ) {
            Text(if (isRegister) "Already have an account? " else "Don't have an account? ", color = Color(0xFF71717A), fontSize = 14.sp)
            Text(
                if (isRegister) "Log in" else "Sign up",
                color = AuthPurple, fontWeight = FontWeight.Bold, fontSize = 14.sp,
                modifier = Modifier.clickable { onSwitch() },
            )
        }
    }
}

@Composable
private fun AuthRegisterStepScreen(
    regStep: Int,
    birthDate: String?, onBirthDate: (String) -> Unit,
    email: String, onEmail: (String) -> Unit,
    password: String, onPassword: (String) -> Unit,
    username: String, onUsername: (String) -> Unit,
    error: String?, busy: Boolean,
    onSubmit: () -> Unit,
) {
    val stepCfg = REG_STEPS[regStep]
    val isLast = regStep == REG_STEPS.lastIndex
    val context = LocalContext.current

    Column(Modifier.fillMaxSize()) {
        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Indicador de progreso (1 punto por paso del registro, igual que la web).
            Row(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 26.dp), horizontalArrangement = Arrangement.Center) {
                REG_STEPS.forEachIndexed { i, _ ->
                    Box(
                        Modifier.padding(horizontal = 3.dp).height(6.dp).width(if (i == regStep) 26.dp else 8.dp)
                            .clip(RoundedCornerShape(50))
                            .background(if (i <= regStep) AuthGradient else SolidColor(Color(0xFFE5E5E5))),
                    )
                }
            }

            if (stepCfg.key == "birthdate") {
                Icon(Icons.Outlined.Cake, null, tint = AuthPurple, modifier = Modifier.size(42.dp))
                Spacer(Modifier.height(10.dp))
                Text(stepCfg.title, color = Color(0xFF18181B), fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 280.dp))
                Spacer(Modifier.height(6.dp))
                Text(stepCfg.subtitle, color = Color(0xFF71717A), fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 260.dp))

                val age = ageFromBirthDate(birthDate)
                val underAge = birthDate != null && age in 0..12
                Box(Modifier.fillMaxWidth().padding(top = 22.dp).height(1.dp).background(Color(0xFFF4F4F5)))
                Column(
                    Modifier.fillMaxWidth().padding(vertical = 16.dp).clickable {
                        val cal = Calendar.getInstance()
                        val parsed = birthDate?.split("-")
                        if (parsed != null && parsed.size == 3) runCatching { cal.set(parsed[0].toInt(), parsed[1].toInt() - 1, parsed[2].toInt()) }
                        else cal.add(Calendar.YEAR, -18)
                        DatePickerDialog(
                            context,
                            { _, y, m, d -> onBirthDate(String.format("%04d-%02d-%02d", y, m + 1, d)) },
                            cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH),
                        ).apply { datePicker.maxDate = System.currentTimeMillis() }.show()
                    },
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        birthDate?.let { displayDateLong(it) } ?: "Select your date",
                        color = Color(0xFF18181B), fontSize = 19.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(5.dp))
                    Text(
                        when {
                            underAge -> "You must be 13 or older to join Twyk"
                            birthDate != null && age >= 0 -> "You're $age years old"
                            else -> "Tap to pick your date"
                        },
                        color = if (underAge) Color(0xFFEF4444) else AuthPurple, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                    )
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFF4F4F5)))
            } else {
                Text(stepCfg.title, color = Color(0xFF18181B), fontSize = 23.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 280.dp))
                Spacer(Modifier.height(8.dp))
                Text(stepCfg.subtitle, color = Color(0xFF71717A), fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 270.dp))
                Spacer(Modifier.height(26.dp))
                when (stepCfg.key) {
                    "email" -> MinimalAuthInput(email, "you@email.com", onChange = onEmail)
                    "password" -> MinimalAuthInput(password, "Password", isPassword = true, onChange = onPassword)
                    "username" -> MinimalAuthInput(username, "username", onChange = onUsername)
                }
            }

            error?.let {
                Spacer(Modifier.height(16.dp))
                AuthErrorChip(it)
            }

            if (isLast) {
                Spacer(Modifier.height(20.dp))
                LegalFooterText("By creating your account you accept our ")
            }
            Spacer(Modifier.height(12.dp))
        }
        Box(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 24.dp, vertical = 14.dp)) {
            AuthGradientButton(if (isLast) "Create account" else "Continue", busy = busy, onClick = onSubmit)
        }
    }
}

@Composable
private fun AuthLoginScreen(
    username: String, onUsername: (String) -> Unit,
    password: String, onPassword: (String) -> Unit,
    error: String?, busy: Boolean,
    onSubmit: () -> Unit, onSwitch: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(16.dp))
            Text("Log in", color = Color(0xFF18181B), fontSize = 23.sp, fontWeight = FontWeight.ExtraBold)
            Spacer(Modifier.height(8.dp))
            Text("Enter your username or email and password.", color = Color(0xFF71717A), fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 270.dp))
            Spacer(Modifier.height(26.dp))
            MinimalAuthInput(username, "Username or email", onChange = onUsername)
            Spacer(Modifier.height(16.dp))
            MinimalAuthInput(password, "Password", isPassword = true, onChange = onPassword)
            error?.let { Spacer(Modifier.height(16.dp)); AuthErrorChip(it) }
        }
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 24.dp, vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            AuthGradientButton("Log in", busy = busy, onClick = onSubmit)
            Spacer(Modifier.height(12.dp))
            Row {
                Text("Don't have an account? ", color = Color(0xFF71717A), fontSize = 14.sp)
                Text("Sign up", color = AuthPurple, fontWeight = FontWeight.Bold, fontSize = 14.sp, modifier = Modifier.clickable { onSwitch() })
            }
        }
    }
}

@Composable
private fun AgeBlockedScreen(onGotIt: () -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(top = 56.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Twyk isn't available for users under 13", color = Color(0xFF18181B), fontSize = 20.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(
            "In accordance with the U.S. COPPA law, we don't allow registration for users under 13. We can't create your account.",
            color = Color(0xFF71717A), fontSize = 14.sp, textAlign = TextAlign.Center, lineHeight = 19.sp,
            modifier = Modifier.widthIn(max = 300.dp),
        )
        Spacer(Modifier.height(28.dp))
        Box(
            Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(50)).background(Color(0xFFF4F4F5)).clickable { onGotIt() },
            contentAlignment = Alignment.Center,
        ) { Text("Got it", color = Color(0xFF18181B), fontSize = 15.sp, fontWeight = FontWeight.SemiBold) }
    }
}

@Composable
private fun AuthGradientButton(label: String, busy: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(50))
            .background(if (busy) SolidColor(Color(0xFFD4D4D8)) else AuthGradient)
            .clickable(enabled = !busy) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        if (busy) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        else Text(label, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun AuthErrorChip(msg: String) {
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color(0xFFFEF2F2))
            .border(1.dp, Color(0xFFFEE2E2), RoundedCornerShape(14.dp)).padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) { Text(msg, color = Color(0xFFDC2626), fontSize = 13.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center) }
}

// Input minimalista centrado (réplica de `minimalStepInput` en AuthModal.jsx:
// caja gris muy clara, sin icono, texto centrado grande) — usado en los pasos
// de email/contraseña/usuario del registro y en las 2 casillas del login.
@Composable
private fun MinimalAuthInput(value: String, placeholder: String, isPassword: Boolean = false, onChange: (String) -> Unit) {
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color(0xFFFAFAFA)).padding(vertical = 14.dp, horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (value.isEmpty()) Text(placeholder, color = Color(0xFFA1A1AA), fontSize = 17.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
        BasicTextField(
            value = value, onValueChange = onChange, singleLine = true,
            visualTransformation = if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
            textStyle = TextStyle(color = Color(0xFF18181B), fontSize = 17.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center),
            cursorBrush = SolidColor(Color(0xFF18181B)),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY' (uso interno, no visible tras el rediseño de
// la FASE 4 — se mantiene por si se reutiliza en otra pantalla).
private fun displayDate(iso: String): String {
    val p = iso.split("-")
    return if (p.size == 3) "${p[2]}/${p[1]}/${p[0]}" else iso
}

// 'YYYY-MM-DD' -> "July 15, 2005" (réplica de formatDateLong() en AuthModal.jsx,
// usado en la vista previa en vivo del paso de fecha de nacimiento).
private val MONTH_NAMES = listOf(
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)
private fun displayDateLong(iso: String): String {
    val p = iso.split("-")
    if (p.size != 3) return iso
    return runCatching {
        val m = p[1].toInt() - 1
        val d = p[2].toInt()
        "${MONTH_NAMES[m]} $d, ${p[0]}"
    }.getOrDefault(iso)
}

// Réplica de computeAge() en route.js (mismo criterio de años cumplidos),
// para bloquear en el cliente ANTES de llamar al backend (misma validación
// que ya hace el servidor, gating de edad COPPA, edad mínima 13 años).
// Devuelve -1 si la fecha es nula/inválida.
private fun ageFromBirthDate(iso: String?): Int {
    if (iso == null) return -1
    val p = iso.split("-")
    if (p.size != 3) return -1
    return runCatching {
        val cal = Calendar.getInstance()
        val now = Calendar.getInstance()
        cal.set(p[0].toInt(), p[1].toInt() - 1, p[2].toInt())
        var age = now.get(Calendar.YEAR) - cal.get(Calendar.YEAR)
        if (now.get(Calendar.DAY_OF_YEAR) < cal.get(Calendar.DAY_OF_YEAR)) age--
        age
    }.getOrDefault(-1)
}
