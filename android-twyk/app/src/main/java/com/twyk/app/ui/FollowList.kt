package com.twyk.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twyk.app.data.ProfileUser
import com.twyk.app.data.RetrofitProvider

// Pantalla "Followers / Following" — réplica de FollowListModal en ProfilePage.jsx:
// cabecera con conmutador Followers/Following y lista de usuarios (tocar uno
// abre su perfil). Solo lectura (sin botón de seguir inline, igual que la web).
@Composable
fun FollowListScreen(
    username: String,
    initialType: String, // "followers" | "following"
    onClose: () -> Unit,
    onOpenUser: (String) -> Unit,
) {
    var type by remember(username) { mutableStateOf(initialType) }
    var users by remember(username) { mutableStateOf<List<ProfileUser>>(emptyList()) }
    var loading by remember(username) { mutableStateOf(true) }

    LaunchedEffect(username, type) {
        loading = true
        users = runCatching { RetrofitProvider.api.followList(username, type).users.orEmpty() }.getOrDefault(emptyList())
        loading = false
    }

    Box(Modifier.fillMaxSize().background(TwykBg)) {
        Column(Modifier.fillMaxSize()) {
            // ── Cabecera: atrás + conmutador Followers/Following ──
            Row(
                Modifier.fillMaxWidth().statusBarsPadding().height(56.dp).padding(horizontal = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Box(Modifier.size(36.dp).clip(CircleShape).clickable { onClose() }, contentAlignment = Alignment.Center) {
                    Icon(ImageVector.vectorResource(com.twyk.app.R.drawable.ic_arrow_left), "back", tint = Color.White, modifier = Modifier.size(22.dp))
                }
                Row(
                    Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.06f)).padding(3.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    SwitchTab("Followers", type == "followers") { type = "followers" }
                    SwitchTab("Following", type == "following") { type = "following" }
                }
                Spacer(Modifier.width(36.dp))
            }

            // ── Lista ──
            when {
                loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
                }
                users.isEmpty() -> Column(
                    Modifier.fillMaxSize().padding(top = 80.dp, start = 24.dp, end = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        Modifier.size(64.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.04f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(ImageVector.vectorResource(com.twyk.app.R.drawable.ic_users), null, tint = Color(0xFF71717A), modifier = Modifier.size(28.dp))
                    }
                    Spacer(Modifier.height(16.dp))
                    Text(
                        if (type == "followers") "No followers yet" else "Not following anyone yet",
                        color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        if (type == "followers") "When someone follows them it will appear here" else "The users they follow will appear here",
                        color = Color(0xFF71717A), fontSize = 13.sp, textAlign = TextAlign.Center,
                    )
                }
                else -> LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp),
                ) {
                    items(users) { u -> FollowRow(u, onClick = { u.username?.let(onOpenUser) }) }
                }
            }
        }
    }
}

@Composable
private fun SwitchTab(label: String, active: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.clip(RoundedCornerShape(50)).background(if (active) Color.White else Color.Transparent)
            .clickable { onClick() }.padding(horizontal = 16.dp, vertical = 7.dp),
    ) {
        Text(label, color = if (active) Color.Black else Color(0xFFD4D4D8), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun FollowRow(u: ProfileUser, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable { onClick() }
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TwykAvatar(u.avatarUrl, Modifier.size(44.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                u.name?.takeIf { it.isNotBlank() } ?: u.username ?: "usuario",
                color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            Text(
                "@" + (u.username ?: ""), color = Color(0xFF71717A), fontSize = 12.sp,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        if (u.isFollowing) {
            Box(
                Modifier.clip(RoundedCornerShape(50))
                    .border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(50))
                    .padding(horizontal = 12.dp, vertical = 5.dp),
            ) {
                Text("Following", color = Color(0xFF71717A), fontSize = 11.sp)
            }
        }
    }
}
