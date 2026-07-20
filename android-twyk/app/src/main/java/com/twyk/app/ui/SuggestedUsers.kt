package com.twyk.app.ui

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PersonAddAlt
import androidx.compose.material.icons.outlined.People
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twyk.app.R
import com.twyk.app.data.Author
import com.twyk.app.data.ProfileUser
import com.twyk.app.data.QuickChallengeTarget
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import kotlinx.coroutines.launch

// Página de "Sugeridos" (personas que quizá conozcas) — réplica de
// SuggestedUsersPage.jsx. Se abre SOLO desde la página de Retos/Batallas
// (icono superior izquierdo, ver ui/Battles.kt), igual que en la web.
@Composable
fun SuggestedUsersScreen(
    onClose: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onChallenge: (QuickChallengeTarget) -> Unit,
    onRequireAuth: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var users by remember { mutableStateOf<List<ProfileUser>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf<Set<String>>(emptySet()) }

    LaunchedEffect(Unit) {
        loading = true
        users = runCatching { RetrofitProvider.api.suggestedUsers().users.orEmpty() }.getOrDefault(emptyList())
        loading = false
    }

    fun toggleFollow(username: String) {
        if (Session.token == null) { onRequireAuth(); return }
        if (username in busy) return
        busy = busy + username
        val idx = users.indexOfFirst { it.username == username }
        if (idx < 0) { busy = busy - username; return }
        val prev = users[idx]
        val optimistic = prev.copy(
            isFollowing = !prev.isFollowing,
            followers = (prev.followers + if (prev.isFollowing) -1 else 1).coerceAtLeast(0),
        )
        users = users.toMutableList().also { it[idx] = optimistic }
        scope.launch {
            runCatching { RetrofitProvider.api.toggleFollow(username) }
                .onSuccess { res ->
                    users = users.map { u -> if (u.username == username) u.copy(isFollowing = res.following, followers = res.followers) else u }
                }
                .onFailure {
                    users = users.map { u -> if (u.username == username) prev else u }
                }
            busy = busy - username
        }
    }

    Box(Modifier.fillMaxSize().background(TwykBg)) {
        Column(Modifier.fillMaxSize()) {
            // ── Cabecera ──
            Row(
                Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 10.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(36.dp).clip(CircleShape).clickable { onClose() }, contentAlignment = Alignment.Center) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "close", tint = Color.White.copy(alpha = 0.85f), modifier = Modifier.size(20.dp))
                }
                Spacer(Modifier.width(6.dp))
                Column {
                    Text("Suggested for you", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                    Text("People you may know", color = Color.White.copy(alpha = 0.45f), fontSize = 12.sp)
                }
            }

            when {
                loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Color.White.copy(alpha = 0.6f), strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
                }
                users.isEmpty() -> Column(
                    Modifier.fillMaxSize().padding(top = 80.dp, start = 24.dp, end = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(Modifier.size(56.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.05f)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Outlined.People, null, tint = Color.White.copy(alpha = 0.3f), modifier = Modifier.size(24.dp))
                    }
                    Spacer(Modifier.height(12.dp))
                    Text("No suggestions yet", color = Color.White.copy(alpha = 0.7f), fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(4.dp))
                    Text("Interact, follow and challenge others to see people here.", color = Color.White.copy(alpha = 0.4f), fontSize = 13.sp)
                }
                else -> LazyColumn(contentPadding = PaddingValues(vertical = 4.dp)) {
                    items(users, key = { it.username ?: it.hashCode().toString() }) { u ->
                        SuggestedRow(
                            u = u,
                            busy = u.username in busy,
                            onOpenProfile = { u.username?.let(onOpenProfile) },
                            onFollow = { u.username?.let(::toggleFollow) },
                            onChallenge = {
                                onChallenge(
                                    QuickChallengeTarget(
                                        postId = "",
                                        author = Author(username = u.username, name = u.name ?: u.username, avatarUrl = u.avatarUrl),
                                        videoUrl = null,
                                        posterUrl = null,
                                        description = null,
                                        music = null,
                                    ),
                                )
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SuggestedRow(
    u: ProfileUser,
    busy: Boolean,
    onOpenProfile: () -> Unit,
    onFollow: () -> Unit,
    onChallenge: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier.weight(1f).clickable { onOpenProfile() },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TwykAvatar(u.avatarUrl, Modifier.size(40.dp))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        u.name?.takeIf { it.isNotBlank() } ?: u.username ?: "usuario",
                        color = Color.White, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                    if (u.verified) {
                        Spacer(Modifier.width(3.dp))
                        Icon(Icons.Filled.Check, null, tint = Color(0xFF38BDF8), modifier = Modifier.size(12.dp))
                    }
                }
                Text("@" + (u.username ?: ""), color = Color.White.copy(alpha = 0.5f), fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (!u.reason.isNullOrBlank()) {
                    Text(u.reason.orEmpty(), color = Color.White.copy(alpha = 0.4f), fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        Spacer(Modifier.width(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(
                Modifier.size(32.dp).clip(CircleShape)
                    .background(if (u.isFollowing) Color.White.copy(alpha = 0.06f) else Color.White)
                    .clickable(enabled = !busy) { onFollow() },
                contentAlignment = Alignment.Center,
            ) {
                when {
                    busy -> CircularProgressIndicator(color = if (u.isFollowing) Color.White else Color.Black, strokeWidth = 1.5.dp, modifier = Modifier.size(13.dp))
                    u.isFollowing -> Icon(Icons.Filled.Check, null, tint = Color.White, modifier = Modifier.size(14.dp))
                    else -> Icon(Icons.Filled.PersonAddAlt, null, tint = Color.Black, modifier = Modifier.size(14.dp))
                }
            }
            Row(
                Modifier.height(32.dp).clip(RoundedCornerShape(50))
                    .background(Color.Transparent)
                    .clickable { onChallenge() }
                    .padding(horizontal = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(ImageVector.vectorResource(R.drawable.ic_swords), null, tint = Color.White, modifier = Modifier.size(12.dp))
                Text("Challenge", color = Color.White, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
