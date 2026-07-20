package com.twyk.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.PersonAdd
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
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twyk.app.R
import com.twyk.app.data.CreateCommentRequest
import com.twyk.app.data.MarkReadRequest
import com.twyk.app.data.NotificationItem
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import kotlinx.coroutines.launch

private data class NotiFilter(val key: String, val label: String, val types: List<String>?)

private val NOTI_FILTERS = listOf(
    NotiFilter("all", "All", null),
    NotiFilter("challenge", "Challenges", listOf("challenge", "accepted")),
    NotiFilter("vote", "Votes", listOf("vote")),
    NotiFilter("follow", "Followers", listOf("follow")),
    NotiFilter("comment", "Comments", listOf("comment", "reply")),
)

// Solo las notificaciones de comentario/respuesta con post+comentario
// identificables se pueden responder directamente desde aquí.
private fun isReplyable(n: NotificationItem) =
    (n.type == "comment" || n.type == "reply") && !n.postId.isNullOrBlank() && !n.commentId.isNullOrBlank()

// BUZÓN / NOTIFICACIONES — réplica de NotificationsInbox.jsx.
@Composable
fun InboxScreen(onRequireAuth: () -> Unit, onAccepted: () -> Unit, onBack: () -> Unit = {}) {
    if (Session.token == null) {
        LoginPrompt("Sign in to view your notifications", onRequireAuth)
        return
    }

    val scope = rememberCoroutineScope()
    var list by remember { mutableStateOf<List<NotificationItem>>(emptyList()) }
    var filter by remember { mutableStateOf("all") }
    var loading by remember { mutableStateOf(true) }
    var replyOpenId by remember { mutableStateOf<String?>(null) }
    var replyText by remember { mutableStateOf("") }
    var replySubmitting by remember { mutableStateOf(false) }
    var repliedIds by remember { mutableStateOf<Set<String>>(emptySet()) }

    LaunchedEffect(Unit) {
        loading = true
        list = runCatching { RetrofitProvider.api.notifications().notifications.orEmpty() }.getOrDefault(emptyList())
        loading = false
    }

    // Cambiar de pestaña (excepto "Todo") marca esas notificaciones como leídas
    // al instante, solo con abrir la pestaña — igual que la web. "Todo" se
    // marca solo con el botón "Marcar leídas".
    fun selectFilter(f: NotiFilter) {
        filter = f.key
        replyOpenId = null
        replyText = ""
        val types = f.types ?: return
        val hasUnread = list.any { it.type in types && !it.read }
        if (!hasUnread) return
        list = list.map { if (it.type in types) it.copy(read = true) else it }
        scope.launch { runCatching { RetrofitProvider.api.markNotificationsRead(MarkReadRequest(types = types)) } }
    }

    fun submitReply(n: NotificationItem) {
        val pid = n.postId
        val cid = n.commentId
        if (replyText.isBlank() || replySubmitting || pid == null || cid == null) return
        replySubmitting = true
        scope.launch {
            runCatching { RetrofitProvider.api.createComment(CreateCommentRequest(postId = pid, text = replyText.trim(), parentId = cid)) }
                .onSuccess {
                    repliedIds = repliedIds + n.id
                    replyOpenId = null
                    replyText = ""
                }
            replySubmitting = false
        }
    }

    val activeFilter = NOTI_FILTERS.first { it.key == filter }
    val filtered = activeFilter.types?.let { t -> list.filter { it.type in t } } ?: list
    val hasUnread = list.any { !it.read }

    Box(Modifier.fillMaxSize().background(TwykBg)) {
        GoldGlow(height = 176.dp, alpha = 0.07f)

        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            // Header
            Row(
                Modifier.fillMaxWidth().padding(start = 4.dp, end = 8.dp, top = 8.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(36.dp).clip(CircleShape).clickable { onBack() }, contentAlignment = Alignment.Center) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White, modifier = Modifier.size(22.dp))
                }
                Spacer(Modifier.width(2.dp))
                Text("Notifications", color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                if (hasUnread) {
                    Box(
                        Modifier.clip(RoundedCornerShape(50)).clickable {
                            list = list.map { it.copy(read = true) }
                            scope.launch { runCatching { RetrofitProvider.api.markNotificationsRead(MarkReadRequest(all = true)) } }
                        }.padding(horizontal = 10.dp, vertical = 6.dp),
                    ) {
                        Text("Mark as read", color = ZincText, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }

            // Filtros
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                NOTI_FILTERS.forEach { f ->
                    val active = filter == f.key
                    // Solo NO LEÍDAS (igual que la web) — si contáramos el total
                    // histórico, la insignia nunca desaparecería al marcar como leído.
                    val count = list.count { (f.types == null || it.type in f.types) && !it.read }
                    FilterChip(label = f.label, count = count, active = active) { selectFilter(f) }
                }
            }

            Spacer(Modifier.height(10.dp))

            when {
                loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(30.dp))
                }
                filtered.isEmpty() -> NotiEmpty(filter, activeFilter.label)
                else -> LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 8.dp, end = 8.dp, bottom = 120.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    items(filtered) { n ->
                        NotificationCard(
                            n = n,
                            replying = replyOpenId == n.id,
                            replied = n.id in repliedIds,
                            replyText = replyText,
                            replySubmitting = replySubmitting,
                            onStartReply = { replyOpenId = n.id; replyText = "" },
                            onCancelReply = { replyOpenId = null; replyText = "" },
                            onReplyTextChange = { replyText = it },
                            onSubmitReply = { submitReply(n) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FilterChip(label: String, count: Int, active: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.height(36.dp).clip(RoundedCornerShape(50))
            .then(if (active) Modifier.background(Color.White) else Modifier.background(Color.White.copy(alpha = 0.04f)).border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(50)))
            .clickable { onClick() }.padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(label, color = if (active) Color.Black else ZincText, fontSize = 13.sp, fontWeight = FontWeight.Medium)
        if (count > 0) {
            Box(
                Modifier.size(18.dp).clip(CircleShape).background(if (active) Color.Black.copy(alpha = 0.10f) else Color.White.copy(alpha = 0.10f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(count.toString(), color = if (active) Color.Black else Color(0xFFD4D4D8), fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun NotificationCard(
    n: NotificationItem,
    replying: Boolean,
    replied: Boolean,
    replyText: String,
    replySubmitting: Boolean,
    onStartReply: () -> Unit,
    onCancelReply: () -> Unit,
    onReplyTextChange: (String) -> Unit,
    onSubmitReply: () -> Unit,
) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
            .then(if (!n.read) Modifier.background(Color.White.copy(alpha = 0.04f)).border(1.dp, Color.White.copy(alpha = 0.06f), RoundedCornerShape(16.dp)) else Modifier)
            .padding(horizontal = 12.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box {
                TwykAvatar(n.user?.avatarUrl, Modifier.size(44.dp).border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape))
                Box(
                    Modifier.align(Alignment.BottomEnd).size(20.dp).clip(CircleShape)
                        .background(Color(0xFF18181B)).border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    NotiTypeIcon(n)
                }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = Color.White)) { append("@${n.user?.username ?: "user"}") }
                        append("  ")
                        withStyle(SpanStyle(color = Color(0xFFD4D4D8))) { append(n.text ?: "") }
                    },
                    fontSize = 14.sp, lineHeight = 18.sp,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    n.time?.let {
                        Text(it, color = Color(0xFF71717A), fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))
                    }
                    if (isReplyable(n) && !replying) {
                        Spacer(Modifier.width(8.dp))
                        Text(
                            if (replied) "Reply sent ✓" else "Reply",
                            color = Color(0xFF9F9FA8), fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.clickable { onStartReply() },
                        )
                    }
                }
            }
            if (!n.read) {
                Spacer(Modifier.width(8.dp))
                Box(Modifier.size(8.dp).clip(CircleShape).background(TwykRed))
            }
        }

        // Respuesta en línea (sin salir de Notificaciones).
        if (replying) {
            Row(
                Modifier.fillMaxWidth().padding(start = 56.dp, top = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.weight(1f).height(36.dp).clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.06f))
                        .padding(horizontal = 14.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (replyText.isEmpty()) Text("Reply to @${n.user?.username ?: "user"}…", color = Color(0xFF71717A), fontSize = 13.sp)
                    BasicTextField(
                        value = replyText,
                        onValueChange = onReplyTextChange,
                        singleLine = true,
                        enabled = !replySubmitting,
                        textStyle = TextStyle(color = Color.White, fontSize = 13.sp),
                        cursorBrush = SolidColor(Color.White),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Spacer(Modifier.width(6.dp))
                Box(
                    Modifier.size(32.dp).clip(CircleShape)
                        .background(if (replyText.isNotBlank() && !replySubmitting) Color.White else Color.White.copy(alpha = 0.10f))
                        .clickable(enabled = replyText.isNotBlank() && !replySubmitting) { onSubmitReply() },
                    contentAlignment = Alignment.Center,
                ) {
                    if (replySubmitting) CircularProgressIndicator(color = Color.Black, strokeWidth = 2.dp, modifier = Modifier.size(14.dp))
                    else Icon(Icons.AutoMirrored.Filled.Send, "enviar", tint = if (replyText.isNotBlank()) Color.Black else Color(0xFF71717A), modifier = Modifier.size(14.dp))
                }
                Spacer(Modifier.width(6.dp))
                Text(
                    "Cancel", color = Color(0xFF71717A), fontSize = 12.sp,
                    modifier = Modifier.clickable(enabled = !replySubmitting) { onCancelReply() },
                )
            }
        }
    }
}

@Composable
private fun NotiTypeIcon(n: NotificationItem) {
    val size = Modifier.size(12.dp)
    when (n.type) {
        "challenge" -> Icon(ImageVector.vectorResource(R.drawable.ic_swords), null, tint = TwykGold, modifier = size)
        "vote" -> Icon(ImageVector.vectorResource(R.drawable.ic_vote), null, tint = if (n.side == "b") TwykBlue else TwykPurple, modifier = size)
        "accepted" -> Icon(Icons.Filled.Check, null, tint = Color(0xFF6EE7A8), modifier = size)
        "follow" -> Icon(Icons.Outlined.PersonAdd, null, tint = Color(0xFF7DB7FF), modifier = size)
        "comment" -> Icon(Icons.Outlined.ChatBubbleOutline, null, tint = TwykGold, modifier = size)
        "reply" -> Icon(Icons.Outlined.ChatBubbleOutline, null, tint = TwykGold, modifier = size)
        else -> Icon(Icons.Outlined.Notifications, null, tint = ZincText, modifier = size)
    }
}

@Composable
private fun NotiEmpty(filter: String, label: String) {
    Column(
        Modifier.fillMaxSize().padding(top = 100.dp, start = 24.dp, end = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(80.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.03f)).border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Outlined.Notifications, null, tint = TwykGold, modifier = Modifier.size(36.dp))
        }
        Spacer(Modifier.height(22.dp))
        Text(if (filter == "all") "No notifications" else "Nothing here yet", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(
            if (filter == "all") "When there's activity on your challenges, it will appear here." else "You don't have any \"$label\" notifications.",
            color = ZincText, fontSize = 15.sp,
            modifier = Modifier.fillMaxWidth(),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}
