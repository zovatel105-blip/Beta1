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
import androidx.compose.material.icons.Icons
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twyk.app.R
import com.twyk.app.data.NotificationItem
import com.twyk.app.data.MarkReadRequest
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import kotlinx.coroutines.launch

private data class NotiFilter(val key: String, val label: String, val types: List<String>?)

private val NOTI_FILTERS = listOf(
    NotiFilter("all", "Todo", null),
    NotiFilter("challenge", "Retos", listOf("challenge", "accepted")),
    NotiFilter("vote", "Votos", listOf("vote")),
    NotiFilter("follow", "Seguidores", listOf("follow")),
    NotiFilter("comment", "Comentarios", listOf("comment")),
)

// BUZÓN / NOTIFICACIONES — réplica de NotificationsInbox.jsx.
@Composable
fun InboxScreen(onRequireAuth: () -> Unit, onAccepted: () -> Unit) {
    if (Session.token == null) {
        LoginPrompt("Necesitas iniciar sesión para ver tus notificaciones", onRequireAuth)
        return
    }

    val scope = rememberCoroutineScope()
    var list by remember { mutableStateOf<List<NotificationItem>>(emptyList()) }
    var filter by remember { mutableStateOf("all") }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        loading = true
        list = runCatching { RetrofitProvider.api.notifications().notifications.orEmpty() }.getOrDefault(emptyList())
        loading = false
    }

    val activeFilter = NOTI_FILTERS.first { it.key == filter }
    val filtered = activeFilter.types?.let { t -> list.filter { it.type in t } } ?: list
    val hasUnread = list.any { !it.read }

    Box(Modifier.fillMaxSize().background(TwykBg)) {
        GoldGlow(height = 176.dp, alpha = 0.07f)

        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            // Header
            Row(
                Modifier.fillMaxWidth().padding(start = 14.dp, end = 8.dp, top = 8.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Notificaciones", color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                if (hasUnread) {
                    Box(
                        Modifier.clip(RoundedCornerShape(50)).clickable {
                            list = list.map { it.copy(read = true) }
                            scope.launch { runCatching { RetrofitProvider.api.markNotificationsRead(MarkReadRequest(all = true)) } }
                        }.padding(horizontal = 10.dp, vertical = 6.dp),
                    ) {
                        Text("Marcar leídas", color = ZincText, fontSize = 13.sp, fontWeight = FontWeight.Medium)
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
                    val count = f.types?.let { t -> list.count { it.type in t } } ?: list.size
                    FilterChip(label = f.label, count = count, active = active) { filter = f.key }
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
                    items(filtered) { n -> NotificationCard(n) }
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
private fun NotificationCard(n: NotificationItem) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
            .then(if (!n.read) Modifier.background(Color.White.copy(alpha = 0.04f)).border(1.dp, Color.White.copy(alpha = 0.06f), RoundedCornerShape(16.dp)) else Modifier)
            .padding(horizontal = 12.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
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
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = Color.White)) { append("@${n.user?.username ?: "usuario"}") }
                    append("  ")
                    withStyle(SpanStyle(color = Color(0xFFD4D4D8))) { append(n.text ?: "") }
                },
                fontSize = 14.sp, lineHeight = 18.sp,
            )
            n.time?.let {
                Spacer(Modifier.height(2.dp))
                Text(it, color = Color(0xFF71717A), fontSize = 12.sp)
            }
        }
        if (!n.read) {
            Spacer(Modifier.width(8.dp))
            Box(Modifier.size(8.dp).clip(CircleShape).background(TwykRed))
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
        Text(if (filter == "all") "Sin notificaciones" else "Nada por aquí", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(
            if (filter == "all") "Cuando haya actividad en tus retos, aparecerá aquí." else "No tienes notificaciones de tipo \"$label\".",
            color = ZincText, fontSize = 15.sp,
            modifier = Modifier.fillMaxWidth(),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }
}
