package com.twyk.app.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Link
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
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.res.vectorResource
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
import com.twyk.app.R
import com.twyk.app.data.Comment
import com.twyk.app.data.CreateCommentRequest
import com.twyk.app.data.LoginRequest
import com.twyk.app.data.Post
import com.twyk.app.data.PostEvents
import com.twyk.app.data.RegisterRequest
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

// Compartir una publicación con el selector nativo de Android.
fun sharePost(context: Context, post: Post) {
    val text = (post.description ?: "Mira este Twyk") + "\n" + Config.BASE_URL
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, "Share"))
}

// ── Hoja de COMPARTIR — réplica EXACTA de ShareModal.jsx: hoja BLANCA (no
// oscura, como estaba antes) con flecha-abajo para cerrar, título "Share",
// grid de 5 opciones (Send to/Copy link/Instagram/WhatsApp/X) con círculos
// gris claro (zinc-100) e icono oscuro (zinc-700), en vez de abrir
// directamente el selector nativo de Android. Se abre desde el icono de
// compartir del SocialRail (feed/VersusFeed.kt), igual que ShareModal se
// abre desde CarouselSlide.jsx.
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

    val zinc100 = Color(0xFFF4F4F5)
    val zinc700 = Color(0xFF3F3F46)
    val zinc800 = Color(0xFF27272A)
    val zinc500 = Color(0xFF71717A)
    val green600 = Color(0xFF16A34A)

    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)).clickable(onClick = onClose),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Column(
            Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .background(Color.White)
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { }
                .navigationBarsPadding(),
        ) {
            // Flecha abajo para cerrar — réplica exacta del botón "close" de ShareModal.jsx.
            Box(
                Modifier.fillMaxWidth().clickable(onClick = onClose).padding(top = 10.dp, bottom = 2.dp),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.KeyboardArrowDown, "close", tint = zinc500, modifier = Modifier.size(18.dp)) }
            Text(
                "Share", color = zinc800, fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp),
            )
            HorizontalDivider(color = zinc100)
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 24.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                ShareOptionIcon("Send to", Icons.Filled.Send, zinc100, zinc700) { sendTo(); scope.launch { PostEvents.emitShared(postId) }; onClose() }
                ShareOptionIcon(
                    if (copied) "Copied" else "Copy link",
                    if (copied) Icons.Filled.Check else Icons.Filled.Link,
                    zinc100, if (copied) green600 else zinc700,
                ) { copyLink(); scope.launch { PostEvents.emitShared(postId) } }
                ShareOptionIcon(
                    "Instagram", ImageVector.vectorResource(R.drawable.ic_instagram), null, Color.White,
                    gradient = Brush.linearGradient(listOf(Color(0xFFFACC15), Color(0xFFEC4899), Color(0xFF9333EA))),
                ) { openUrl("https://www.instagram.com/"); scope.launch { PostEvents.emitShared(postId) }; onClose() }
                ShareOptionIcon("WhatsApp", ImageVector.vectorResource(R.drawable.ic_whatsapp), Color(0xFF25D366), Color.White) {
                    openUrl("https://wa.me/?text=" + Uri.encode(shareUrl)); scope.launch { PostEvents.emitShared(postId) }; onClose()
                }
                ShareOptionIcon("X", ImageVector.vectorResource(R.drawable.ic_x_logo), Color.Black, Color.White) {
                    openUrl("https://twitter.com/intent/tweet?url=" + Uri.encode(shareUrl)); scope.launch { PostEvents.emitShared(postId) }; onClose()
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
        // Etiqueta oscura (zinc-600) — la hoja ahora es BLANCA, ya no oscura;
        // antes este texto quedaba en blanco sobre blanco (invisible).
        Text(label, color = Color(0xFF52525B), fontSize = 11.sp, textAlign = TextAlign.Center)
    }
}

// ── Hoja de COMENTARIOS — réplica de CommentsModal.jsx ────────────────────────
@Composable
fun CommentsSheet(
    postId: String,
    onClose: () -> Unit,
    onRequireAuth: () -> Unit,
    // Voto ACTUAL del usuario sobre esta publicación (réplica de
    // votedSide={userVote} que CarouselSlide.jsx/DuetSlide.jsx pasan a
    // <CommentsModal>): (1) tus propios comentarios muestran el punto de
    // color según tu voto ACTUAL, no el guardado al comentar; (2) los
    // comentarios NUEVOS se envían con este voto para llevar el punto de
    // color desde el primer instante.
    votedSide: String? = null,
) {
    val scope = rememberCoroutineScope()
    var comments by remember { mutableStateOf<List<Comment>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var input by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    // Expandir/contraer la hoja (75% <-> 95%) — réplica del botón
    // ChevronUp/ChevronDown de CommentsModal.jsx (antes la app nativa tenía
    // una altura fija del 80%, sin esta opción).
    var expanded by remember { mutableStateOf(false) }
    val sheetHeightFraction by animateFloatAsState(if (expanded) 0.95f else 0.75f, label = "commentsHeight")
    // Hilos de respuestas ABIERTOS (por id del comentario raíz) — réplica de
    // expandedReplies en CommentsModal.jsx: las respuestas empiezan OCULTAS
    // detrás de "View N replies" (antes la app nativa las mostraba siempre,
    // todas expandidas de una).
    var expandedReplies by remember { mutableStateOf(setOf<String>()) }
    // Comentario al que se está respondiendo (hilo plano de 1 nivel, igual
    // que la web: el backend aplana automáticamente cualquier parentId a la
    // raíz, así que basta enviar el id del comentario tocado).
    var replyTarget by remember { mutableStateOf<Comment?>(null) }

    fun toggleReplies(rootId: String) {
        expandedReplies = if (expandedReplies.contains(rootId)) expandedReplies - rootId else expandedReplies + rootId
    }

    LaunchedEffect(postId) {
        loading = true
        comments = runCatching { RetrofitProvider.api.comments(postId).comments.orEmpty() }.getOrDefault(emptyList())
        loading = false
        PostEvents.emitCommentCountChanged(postId, comments.size)
    }

    // Borra un comentario (o hilo padre completo, en cascada) y refleja al
    // instante el nuevo total en el icono de comentarios del feed/rail —
    // réplica de onCountChange en la web.
    fun handleCommentDeleted(id: String) {
        comments = comments.filterNot { it.id == id || it.parentId == id }
        scope.launch { PostEvents.emitCommentCountChanged(postId, comments.size) }
    }

    val roots = remember(comments) { comments.filter { it.parentId == null } }
    val repliesByParent = remember(comments) { comments.filter { it.parentId != null }.groupBy { it.parentId!! } }
    val orphanReplies = remember(comments, roots) {
        val knownRootIds = roots.map { it.id }.toSet()
        comments.filter { it.parentId != null && it.parentId !in knownRootIds }
    }
    // Lista PLANA de solo lo VISIBLE ahora mismo (raíces + respuestas de los
    // hilos abiertos) para el conector avatar-a-avatar — réplica del mismo
    // propósito que threadComments() tenía antes, pero respetando qué hilos
    // están colapsados.
    val visibleForConnectors = remember(roots, repliesByParent, expandedReplies, orphanReplies) {
        val out = mutableListOf<Pair<Comment, Boolean>>()
        roots.forEach { root ->
            out.add(root to false)
            if (expandedReplies.contains(root.id)) repliesByParent[root.id]?.forEach { out.add(it to true) }
        }
        orphanReplies.forEach { out.add(it to false) }
        out
    }

    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)).pointerInput(Unit) { detectTapGestures(onTap = { onClose() }) },
    ) {
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().fillMaxHeight(sheetHeightFraction)
                .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                .background(Color.White)
                .pointerInput(Unit) { detectTapGestures(onTap = {}) },
        ) {
            // Flecha expandir/contraer — SOLO esto arriba (sin botón "X" al lado
            // del título, a diferencia de la versión anterior de esta hoja
            // nativa) — réplica exacta de CommentsModal.jsx.
            Box(
                Modifier.fillMaxWidth().clickable { expanded = !expanded }.padding(top = 8.dp, bottom = 2.dp),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (expanded) Icons.Filled.KeyboardArrowDown else Icons.Filled.KeyboardArrowUp,
                    if (expanded) "collapse" else "expand",
                    tint = Color(0xFF71717A), modifier = Modifier.size(16.dp),
                )
            }
            // Header
            Box(Modifier.fillMaxWidth().padding(horizontal = 20.dp, bottom = 6.dp)) {
                val n = comments.size
                Text(
                    if (n == 1) "1 comment" else "$n comments",
                    color = Color(0xFF27272A), fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                    textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth(),
                )
            }
            HorizontalDivider(color = Color(0xFFF4F4F5))

            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Color(0xFF3F3F46), strokeWidth = 2.dp, modifier = Modifier.size(26.dp))
                    }
                    comments.isEmpty() -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Text("No comments yet", color = Color(0xFF71717A), fontSize = 15.sp)
                        Spacer(Modifier.height(4.dp))
                        Text("Be the first to comment", color = Color(0xFFA1A1AA), fontSize = 13.sp)
                    }
                    else -> {
                        // Posiciones reales de cada avatar (medidas con
                        // onGloballyPositioned, réplica del getBoundingClientRect
                        // de ReplyThread en CommentsModal.jsx) + la posición del
                        // contenedor, para dibujar la línea conectora avatar-a-
                        // avatar SOLO entre una respuesta y la respuesta EXACTA a
                        // la que respondió (nunca con el comentario raíz).
                        //
                        // BUG reportado por el usuario ("la línea... se mueve al
                        // hacer scroll"): antes el `Canvas` conector vivía FUERA
                        // del contenedor con `verticalScroll` (como HERMANO,
                        // midiendo posiciones con onGloballyPositioned) — durante
                        // un gesto de scroll, Compose no garantiza que esas
                        // callbacks se disparen en CADA fotograma (el scroll
                        // puede aplicarse a nivel de capa gráfica sin relayout
                        // inmediato), así que el Canvas quedaba dibujando con
                        // coordenadas ligeramente DESFASADAS respecto a los
                        // avatares reales mientras se desplazaba la lista,
                        // dando la sensación de que "la línea se mueve" por su
                        // cuenta. FIX: el `verticalScroll` y el `Canvas` ahora
                        // viven en el MISMO Box (como hermanos DENTRO de él,
                        // ambos hijos directos), así que Compose los desplaza
                        // como UNA SOLA UNIDAD durante el scroll — sus
                        // posiciones relativas entre sí NUNCA cambian mientras
                        // se hace scroll (solo cambian de verdad si la lista de
                        // comentarios se modifica), eliminando por completo la
                        // dependencia de que onGloballyPositioned se dispare en
                        // cada fotograma de scroll.
                        val avatarCoords = remember { mutableStateMapOf<String, LayoutCoordinates>() }
                        var containerCoords by remember { mutableStateOf<LayoutCoordinates?>(null) }
                        Box(
                            Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                                .onGloballyPositioned { containerCoords = it },
                        ) {
                            Column(
                                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp),
                                verticalArrangement = Arrangement.spacedBy(16.dp),
                            ) {
                                roots.forEach { root ->
                                    Column {
                                        CommentRow(
                                            c = root,
                                            isReply = false,
                                            onReply = { replyTarget = root },
                                            onDeleted = ::handleCommentDeleted,
                                            viewerVotedSide = votedSide,
                                            onRequireAuth = onRequireAuth,
                                            onAvatarPositioned = { coords -> avatarCoords[root.id] = coords },
                                        )
                                        val replies = repliesByParent[root.id].orEmpty()
                                        if (replies.isNotEmpty()) {
                                            val isExpanded = expandedReplies.contains(root.id)
                                            // "View N replies" / "Hide replies" — réplica exacta
                                            // del botón con línea corta de CommentsModal.jsx.
                                            Row(
                                                Modifier.padding(start = 44.dp, top = 8.dp).clickable { toggleReplies(root.id) },
                                                verticalAlignment = Alignment.CenterVertically,
                                            ) {
                                                Box(Modifier.width(24.dp).height(1.dp).background(Color(0xFFD4D4D8)))
                                                Spacer(Modifier.width(8.dp))
                                                Text(
                                                    if (isExpanded) "Hide replies" else "View ${replies.size} ${if (replies.size == 1) "reply" else "replies"}",
                                                    color = Color(0xFF71717A), fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                                                )
                                            }
                                            if (isExpanded) {
                                                Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                                    replies.forEach { r ->
                                                        CommentRow(
                                                            c = r,
                                                            isReply = true,
                                                            onReply = { replyTarget = r },
                                                            onDeleted = ::handleCommentDeleted,
                                                            viewerVotedSide = votedSide,
                                                            onRequireAuth = onRequireAuth,
                                                            onAvatarPositioned = { coords -> avatarCoords[r.id] = coords },
                                                        )
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                orphanReplies.forEach { o ->
                                    CommentRow(
                                        c = o,
                                        isReply = false,
                                        onReply = { replyTarget = o },
                                        onDeleted = ::handleCommentDeleted,
                                        viewerVotedSide = votedSide,
                                        onRequireAuth = onRequireAuth,
                                        onAvatarPositioned = { coords -> avatarCoords[o.id] = coords },
                                    )
                                }
                            }
                            ReplyConnectors(visibleForConnectors, avatarCoords, containerCoords)
                        }
                    }
                }
            }

            HorizontalDivider(color = Color(0xFFF4F4F5))

            // Pill "Replying to @username" (igual que la web) — solo visible con
            // sesión. Icono "X" para cancelar (antes un texto "Cancel").
            if (replyTarget != null && Session.token != null) {
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 20.dp, top = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "Replying to @${replyTarget?.author?.username ?: "user"}",
                        color = Color(0xFF71717A), fontSize = 12.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f),
                    )
                    Box(Modifier.size(24.dp).clickable { replyTarget = null }, contentAlignment = Alignment.Center) {
                        Icon(Icons.Filled.Close, "cancel reply", tint = Color(0xFFA1A1AA), modifier = Modifier.size(14.dp))
                    }
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
                                    runCatching { RetrofitProvider.api.createComment(CreateCommentRequest(postId, text, parentId, votedSide)) }
                                        .onSuccess { r ->
                                            r.comment?.let { newComment ->
                                                comments = comments + newComment
                                                // Abre el hilo raíz al instante si era una respuesta,
                                                // igual que la web.
                                                newComment.parentId?.let { pid -> expandedReplies = expandedReplies + pid }
                                            }
                                            input = ""; replyTarget = null
                                            PostEvents.emitCommentCountChanged(postId, comments.size)
                                        }
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
private fun CommentRow(
    c: Comment,
    isReply: Boolean,
    onReply: () -> Unit,
    onDeleted: (String) -> Unit,
    // Voto ACTUAL del usuario que tiene abierta la hoja (réplica de
    // `votedSide` en CommentsModal.jsx): solo se usa para TUS PROPIOS
    // comentarios (ver effectiveSide más abajo).
    viewerVotedSide: String? = null,
    // Réplica de startReply() en CommentsModal.jsx: un invitado SÍ ve el
    // botón "Reply" (a diferencia de antes, que ocultaba la fila entera sin
    // sesión); al tocarlo se le pide iniciar sesión en vez de responder.
    onRequireAuth: () -> Unit = {},
    onAvatarPositioned: (LayoutCoordinates) -> Unit = {},
) {
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
    // Punto de color según el voto: para TUS PROPIOS comentarios se usa tu
    // voto ACTUAL (viewerVotedSide, prop en vivo desde la tarjeta del feed),
    // no el que tenías guardado al comentar — réplica exacta de
    // `effectiveSide` en CommentsModal.jsx. Para comentarios AJENOS se usa
    // siempre el voto guardado en el propio comentario (c.votedSide).
    val effectiveSide = if (c.isOwn && viewerVotedSide != null) viewerVotedSide else c.votedSide
    val voteDotColor = when (effectiveSide) {
        "a" -> Color(0xFFA855F7)
        "b" -> Color(0xFF3B82F6)
        else -> null
    }

    Row(Modifier.fillMaxWidth().padding(start = if (isReply) 44.dp else 0.dp)) {
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
                        if (voteDotColor != null) {
                            Box(Modifier.size(8.dp).clip(CircleShape).background(voteDotColor))
                            Spacer(Modifier.width(6.dp))
                        }
                        Text(c.author?.username ?: "User", color = Color(0xFF18181B), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        if (showReplyTarget && c.replyToUsername != null) {
                            Icon(Icons.Filled.ChevronRight, null, tint = Color(0xFFA1A1AA), modifier = Modifier.size(12.dp))
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
            // Fila de acciones (Reply/Delete) — visible SIEMPRE, también para
            // invitados: réplica exacta de la web, donde un invitado SÍ ve
            // "Reply" (al tocarlo se le pide iniciar sesión); antes esta fila
            // entera desaparecía sin sesión, a diferencia de CommentsModal.jsx.
            if (confirmingDelete) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
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
                }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Text(
                        "Reply", color = Color(0xFF71717A), fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clickable { if (Session.token == null) onRequireAuth() else onReply() },
                    )
                    if (c.canDelete) {
                        Text("Delete", color = Color(0xFFA1A1AA), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { confirmingDelete = true })
                    }
                }
            }
        }
    }
}

// Réplica de formatTime() en CommentsModal.jsx: "Now" (<1min), "Xmin" (<1h),
// "Xh" (<24h), "Xd" (<7d), o una fecha corta para comentarios más antiguos.
// ANTES esta función solo cortaba el string ISO (ts.take(10)), mostrando algo
// como "2025-07-15" en TODOS los casos — bug visual claro frente a la web.
private val ISO_TIMESTAMP_FORMATS = listOf("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'")

private fun parseIsoMillis(ts: String): Long? {
    for (pattern in ISO_TIMESTAMP_FORMATS) {
        try {
            val sdf = SimpleDateFormat(pattern, Locale.US)
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            return sdf.parse(ts)?.time
        } catch (_: Exception) {
        }
    }
    return null
}

private fun relativeTime(ts: String): String {
    val millis = parseIsoMillis(ts) ?: return ""
    val diff = System.currentTimeMillis() - millis
    val minutes = diff / 60000
    val hours = diff / 3600000
    val days = diff / 86400000
    return when {
        minutes < 1 -> "Now"
        minutes < 60 -> "${minutes}min"
        hours < 24 -> "${hours}h"
        days < 7 -> "${days}d"
        else -> SimpleDateFormat("M/d/yy", Locale.getDefault()).format(Date(millis))
    }
}

// ── Hoja de LOGIN / REGISTRO — réplica EXACTA de AuthModal.jsx: hoja inferior
// BLANCA (antes era un diálogo centrado oscuro, diseño antiguo) con splash de
// "métodos" y registro PASO A PASO estilo TikTok (fecha de nacimiento -> email
// -> contraseña -> usuario, cada uno en su propia pantalla con indicador de
// progreso), en vez de un único formulario con pestañas Login/Registro. ─────
private val AuthPurple = Color(0xFFA855F7)
private val AuthBlue = Color(0xFF3B82F6)
private val AuthGradient = Brush.horizontalGradient(listOf(AuthPurple, AuthBlue))

// ── Selector de fecha de nacimiento tipo TikTok (3 columnas Día/Mes/Año) —
// réplica EXACTA de DateWheelPicker.jsx. BUG reportado por el usuario ("el
// primer paso del registro, el de la fecha de nacimiento, no es igual token
// por token al de la web"): el nativo NO tenía esta rueda — al tocar el
// bloque de vista previa abría el DIÁLOGO NATIVO de Android (DatePickerDialog,
// un calendario del sistema), una interacción y un aspecto totalmente
// distintos a la rueda de 3 columnas con scroll/snap embebida en el propio
// paso que usa la web. FIX: réplica 1:1 de esa rueda (mismas 40dp de alto por
// fila, 5 filas visibles, banda central con líneas superior/inferior en
// rgba(139,92,246,0.35) — nótese que es un morado LIGERAMENTE distinto
// (violet-500 #8B5CF6) al AuthPurple (#A855F7) del resto del modal, exactamente
// como en la web —, degradados blancos arriba/abajo, y el mismo interpolado
// de tamaño/peso/opacidad de fuente según la distancia al centro).
private val WheelAccent = Color(0xFF8B5CF6)
private const val WHEEL_ITEM_H_DP = 40
private const val WHEEL_VISIBLE = 5

// Índice del ítem más cercano al centro del viewport (equivalente a leer
// `scrollTop` en la web y dividir por ITEM_H, pero calculado a partir de la
// info de layout real de la LazyColumn, que ya tiene en cuenta el contentPadding).
private fun centerIndexOf(state: androidx.compose.foundation.lazy.LazyListState): Int {
    val info = state.layoutInfo
    if (info.visibleItemsInfo.isEmpty()) return state.firstVisibleItemIndex
    val center = (info.viewportStartOffset + info.viewportEndOffset) / 2
    return info.visibleItemsInfo.minByOrNull { kotlin.math.abs((it.offset + it.size / 2) - center) }?.index
        ?: state.firstVisibleItemIndex
}

@Composable
private fun WheelColumn(items: List<String>, selectedIndex: Int, onSelectedChange: (Int) -> Unit, width: androidx.compose.ui.unit.Dp) {
    val itemHeight = WHEEL_ITEM_H_DP.dp
    val listState = rememberLazyListState()
    val flingBehavior = rememberSnapFlingBehavior(listState)
    val scope = rememberCoroutineScope()

    // Mantiene la rueda sincronizada cuando `selectedIndex` cambia DESDE FUERA
    // (p.ej. el día se recorta al cambiar a un mes más corto) — réplica del
    // `useEffect` con `el.scrollTop = target` (sin animación) de la web.
    LaunchedEffect(selectedIndex, items.size) {
        if (!listState.isScrollInProgress && centerIndexOf(listState) != selectedIndex && selectedIndex in items.indices) {
            listState.scrollToItem(selectedIndex)
        }
    }
    // Al soltar el dedo (scroll asentado en el snap), reporta el nuevo índice
    // centrado — réplica del `handleScroll` con debounce de la web.
    LaunchedEffect(listState) {
        snapshotFlow { listState.isScrollInProgress }.collect { scrolling ->
            if (!scrolling) {
                val idx = centerIndexOf(listState)
                if (idx in items.indices && idx != selectedIndex) onSelectedChange(idx)
            }
        }
    }

    LazyColumn(
        state = listState,
        flingBehavior = flingBehavior,
        modifier = Modifier.width(width).height(itemHeight * WHEEL_VISIBLE),
        contentPadding = PaddingValues(vertical = itemHeight * (WHEEL_VISIBLE / 2)),
    ) {
        itemsIndexed(items) { i, label ->
            val dist = kotlin.math.abs(i - selectedIndex)
            val isSel = i == selectedIndex
            Box(
                Modifier.height(itemHeight).fillMaxWidth()
                    .clickable { scope.launch { listState.animateScrollToItem(i) } },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    fontSize = if (isSel) 20.sp else 17.sp,
                    fontWeight = if (isSel) FontWeight.ExtraBold else FontWeight.Medium,
                    color = if (isSel) WheelAccent else Color(0xFF18181B).copy(alpha = maxOf(0.22f, 0.55f - dist * 0.15f)),
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

// value: "YYYY-MM-DD" | null   onChange: (String) -> Unit — mismo contrato que
// la web (DateWheelPicker.jsx value/onChange).
@Composable
private fun DateWheelPicker(birthDate: String?, onBirthDate: (String) -> Unit) {
    val now = remember { Calendar.getInstance() }
    val currentYear = now.get(Calendar.YEAR)
    val minYear = currentYear - 100
    // Años en orden DESCENDENTE (el más reciente arriba), igual que la web.
    val years = remember { (currentYear downTo minYear).toList() }

    val parsed = birthDate?.split("-")?.takeIf { it.size == 3 }?.mapNotNull { it.toIntOrNull() }
    var year by remember { mutableStateOf(parsed?.getOrNull(0) ?: (currentYear - 18)) }
    var month by remember { mutableStateOf(parsed?.getOrNull(1) ?: 1) } // 1-12
    var day by remember { mutableStateOf(parsed?.getOrNull(2) ?: 1) }

    fun daysInMonth(y: Int, m: Int): Int {
        val cal = Calendar.getInstance()
        cal.set(y, m - 1, 1)
        return cal.getActualMaximum(Calendar.DAY_OF_MONTH)
    }
    val dim = daysInMonth(year, month)
    if (day > dim) day = dim

    // Emite el valor combinado hacia el formulario en cada cambio (igual que
    // el `useEffect([year, month, day, dim])` de la web).
    LaunchedEffect(year, month, day, dim) {
        onBirthDate(String.format("%04d-%02d-%02d", year, month, minOf(day, dim)))
    }

    val dayItems = remember(dim) { (1..dim).map { String.format("%02d", it) } }
    val yearItems = remember(years) { years.map { it.toString() } }

    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White)
            .padding(horizontal = 8.dp, vertical = 4.dp),
    ) {
        // Banda de selección central: solo líneas finas arriba y abajo (borderTop/
        // borderBottom en la web, NO un rectángulo completo) en el acento violeta
        // de la rueda (sin relleno ni sombra), igual que la web.
        Box(
            Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(horizontal = 8.dp)
                .padding(top = (WHEEL_ITEM_H_DP * (WHEEL_VISIBLE / 2)).dp)
                .height(1.dp).background(WheelAccent.copy(alpha = 0.35f)),
        )
        Box(
            Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(horizontal = 8.dp)
                .padding(top = (WHEEL_ITEM_H_DP * (WHEEL_VISIBLE / 2) + WHEEL_ITEM_H_DP).dp)
                .height(1.dp).background(WheelAccent.copy(alpha = 0.35f)),
        )
        Row(Modifier.align(Alignment.Center).fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            WheelColumn(items = dayItems, selectedIndex = minOf(day, dim) - 1, onSelectedChange = { day = it + 1 }, width = 64.dp)
            Spacer(Modifier.width(4.dp))
            WheelColumn(items = MONTH_NAMES, selectedIndex = month - 1, onSelectedChange = { month = it + 1 }, width = 140.dp)
            Spacer(Modifier.width(4.dp))
            WheelColumn(
                items = yearItems,
                selectedIndex = years.indexOf(year).let { if (it == -1) 0 else it },
                onSelectedChange = { year = years[it] },
                width = 80.dp,
            )
        }
        // Degradados superior/inferior (efecto "rueda") — se dibujan AL FINAL
        // para quedar por encima del contenido, igual que el z-10 de la web.
        Box(
            Modifier.align(Alignment.TopCenter).fillMaxWidth().height(60.dp)
                .background(Brush.verticalGradient(listOf(Color.White, Color.White.copy(alpha = 0f)))),
        )
        Box(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().height(60.dp)
                .background(Brush.verticalGradient(listOf(Color.White.copy(alpha = 0f), Color.White))),
        )
    }
}

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
        Box(
            Modifier.fillMaxWidth().fillMaxHeight(0.96f)
                // `shadow-2xl` de la web -> sombra de elevación nativa, aplicada
                // ANTES de clipToBounds() para que no quede recortada por él.
                .shadow(24.dp)
                .clipToBounds(),
        ) {
            // Glow superior de marca — réplica EXACTA de AuthModal.jsx
            // (`radial-gradient(70% 100% at 50% 0%, rgba(168,85,247,0.10),
            // transparent 70%)`, altura h-40=160dp) — faltaba por completo en
            // el nativo.
            Box(
                Modifier.fillMaxWidth().height(160.dp).align(Alignment.TopCenter)
                    .background(Brush.radialGradient(0f to Color(0xFFA855F7).copy(alpha = 0.10f), 0.7f to Color.Transparent)),
            )

            Column(
                Modifier.fillMaxSize().imePadding()
                    .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
                    .background(Color.White),
            ) {
                // Borde superior sutil (`border-t border-zinc-200` de la web) —
                // faltaba por completo en el nativo.
                Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFE4E4E7)))
                // Header: flecha abajo (cerrar) en el splash/bloqueo por edad; flecha atrás en los pasos.
                Box(Modifier.fillMaxWidth().statusBarsPadding().height(48.dp)) {
                    if (step == "methods" || ageBlocked) {
                        Box(Modifier.align(Alignment.Center).size(36.dp).clip(CircleShape).clickable { onClose() }, contentAlignment = Alignment.Center) {
                            Icon(Icons.Filled.KeyboardArrowDown, "cerrar", tint = Color(0xFF52525B), modifier = Modifier.size(28.dp))
                        }
                    } else {
                        Box(Modifier.align(Alignment.CenterStart).padding(start = 6.dp).size(36.dp).clip(CircleShape).clickable { goBack() }, contentAlignment = Alignment.Center) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, "back", tint = Color(0xFF18181B), modifier = Modifier.size(24.dp))
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
                color = Color(0xFF18181B), fontSize = 29.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center,
                letterSpacing = (-0.4).sp,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                if (isRegister) "Create your profile, vote on challenges, upload your videos and challenge other creators."
                else "Log in to vote on challenges, upload your videos and challenge others.",
                color = Color(0xFF71717A), fontSize = 15.sp, textAlign = TextAlign.Center, lineHeight = 20.sp,
                modifier = Modifier.widthIn(max = 320.dp),
            )
            Spacer(Modifier.height(32.dp))
            AuthGradientButton(if (isRegister) "Use email or username" else "Use username and password", busy = false, height = 54.dp, onClick = onUseForm)
            Spacer(Modifier.height(24.dp))
            LegalFooterText("By continuing you accept our ")
        }
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 24.dp, top = 16.dp).navigationBarsPadding(),
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

    Column(Modifier.fillMaxSize()) {
        Column(
            Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Indicador de progreso (1 punto por paso del registro, igual que la web).
            Row(Modifier.fillMaxWidth().padding(bottom = 28.dp), horizontalArrangement = Arrangement.Center) {
                REG_STEPS.forEachIndexed { i, _ ->
                    Box(
                        Modifier.padding(horizontal = 3.dp).height(6.dp).width(if (i == regStep) 26.dp else 8.dp)
                            .clip(RoundedCornerShape(50))
                            .background(if (i <= regStep) AuthGradient else SolidColor(Color(0xFFE5E5E5))),
                    )
                }
            }

            if (stepCfg.key == "birthdate") {
                Icon(Icons.Outlined.Cake, null, tint = AuthPurple, modifier = Modifier.size(44.dp))
                Spacer(Modifier.height(12.dp))
                Text(stepCfg.title, color = Color(0xFF18181B), fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center, letterSpacing = (-0.3).sp, modifier = Modifier.widthIn(max = 300.dp))
                Spacer(Modifier.height(8.dp))
                Text(stepCfg.subtitle, color = Color(0xFF71717A), fontSize = 14.sp, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 280.dp))

                val age = ageFromBirthDate(birthDate)
                val underAge = birthDate != null && age in 0..12
                Box(Modifier.fillMaxWidth().padding(top = 28.dp).height(1.dp).background(Color(0xFFF4F4F5)))
                Column(
                    Modifier.fillMaxWidth().padding(vertical = 16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        birthDate?.let { displayDateLong(it) } ?: "Select your date",
                        color = Color(0xFF18181B), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center, letterSpacing = (-0.3).sp,
                    )
                    Spacer(Modifier.height(5.dp))
                    // uppercase + tracking-wide + font-semibold — réplica exacta de la
                    // web (antes decía "Tap to pick your date" en minúscula/negrita, un
                    // texto y estilo distintos, pensados para el diálogo nativo que ya
                    // no se usa).
                    Text(
                        when {
                            underAge -> "You must be 13 or older to join Twyk"
                            birthDate != null && age >= 0 -> "You're $age years old"
                            else -> "Scroll to pick day, month and year"
                        }.uppercase(),
                        color = if (underAge) Color(0xFFEF4444) else WheelAccent, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 0.4.sp,
                    )
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFFF4F4F5)))
                // mb-6 (24dp) entre el borde inferior de la vista previa y la rueda —
                // réplica exacta del espaciado de la web.
                Spacer(Modifier.height(24.dp))
                DateWheelPicker(birthDate = birthDate, onBirthDate = onBirthDate)
            } else {
                Text(stepCfg.title, color = Color(0xFF18181B), fontSize = 25.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center, letterSpacing = (-0.3).sp, modifier = Modifier.widthIn(max = 300.dp))
                Spacer(Modifier.height(10.dp))
                Text(stepCfg.subtitle, color = Color(0xFF71717A), fontSize = 14.sp, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 280.dp))
                Spacer(Modifier.height(32.dp))
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
                Spacer(Modifier.height(24.dp))
                LegalFooterText("By creating your account you accept our ")
            }
            Spacer(Modifier.height(12.dp))
        }
        Box(Modifier.fillMaxWidth().padding(horizontal = 24.dp, top = 16.dp).navigationBarsPadding()) {
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
            Text("Log in", color = Color(0xFF18181B), fontSize = 25.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-0.3).sp)
            Spacer(Modifier.height(10.dp))
            Text("Enter your username or email and password.", color = Color(0xFF71717A), fontSize = 14.sp, textAlign = TextAlign.Center, modifier = Modifier.widthIn(max = 280.dp))
            Spacer(Modifier.height(32.dp))
            MinimalAuthInput(username, "Username or email", onChange = onUsername)
            Spacer(Modifier.height(24.dp))
            MinimalAuthInput(password, "Password", isPassword = true, onChange = onPassword)
            error?.let { Spacer(Modifier.height(16.dp)); AuthErrorChip(it) }
        }
        Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp, top = 16.dp).navigationBarsPadding(), horizontalAlignment = Alignment.CenterHorizontally) {
            AuthGradientButton("Log in", busy = busy, onClick = onSubmit)
            Spacer(Modifier.height(16.dp))
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
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(top = 64.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Twyk isn't available for users under 13", color = Color(0xFF18181B), fontSize = 20.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(
            "In accordance with the U.S. COPPA law, we don't allow registration for users under 13. We can't create your account.",
            color = Color(0xFF71717A), fontSize = 14.sp, textAlign = TextAlign.Center, lineHeight = 19.sp,
            modifier = Modifier.widthIn(max = 320.dp),
        )
        Spacer(Modifier.height(28.dp))
        Box(
            Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(50)).background(Color(0xFFF4F4F5)).clickable { onGotIt() },
            contentAlignment = Alignment.Center,
        ) { Text("Got it", color = Color(0xFF18181B), fontSize = 15.sp, fontWeight = FontWeight.SemiBold) }
    }
}

// `height` — 52dp por defecto (h-[52px] de la web), salvo el CTA del splash
// (AuthMethodsScreen), que la web sube a 54dp (`gradientBtn + ' h-[54px]'`).
@Composable
private fun AuthGradientButton(label: String, busy: Boolean, height: androidx.compose.ui.unit.Dp = 52.dp, onClick: () -> Unit) {
    Box(
        Modifier.fillMaxWidth().height(height)
            // Réplica de `shadow-[0_12px_28px_-10px_rgba(168,85,247,0.5)]` de
            // la web — faltaba por completo en el nativo.
            .shadow(12.dp, RoundedCornerShape(50), spotColor = Color(0xFFA855F7).copy(alpha = 0.5f))
            .clip(RoundedCornerShape(50))
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
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color(0xFFFEF2F2))
            .border(1.dp, Color(0xFFFEE2E2), RoundedCornerShape(12.dp)).padding(horizontal = 16.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) { Text(msg, color = Color(0xFFDC2626), fontSize = 13.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center) }
}

// Input minimalista centrado (réplica de `minimalStepInput` en AuthModal.jsx:
// caja gris muy clara, sin icono, texto centrado grande) — usado en los pasos
// de email/contraseña/usuario del registro y en las 2 casillas del login.
@Composable
private fun MinimalAuthInput(value: String, placeholder: String, isPassword: Boolean = false, onChange: (String) -> Unit) {
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color(0xFFFAFAFA)).padding(vertical = 10.dp, horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        // `placeholder:font-light` de la web — antes usaba el mismo peso
        // (Medium) que el texto ya escrito; solo el placeholder debe ser Light.
        if (value.isEmpty()) Text(placeholder, color = Color(0xFFA1A1AA), fontSize = 17.sp, fontWeight = FontWeight.Light, letterSpacing = (-0.2).sp, textAlign = TextAlign.Center)
        BasicTextField(
            value = value, onValueChange = onChange, singleLine = true,
            visualTransformation = if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
            textStyle = TextStyle(color = Color(0xFF18181B), fontSize = 17.sp, fontWeight = FontWeight.Medium, letterSpacing = (-0.2).sp, textAlign = TextAlign.Center),
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
