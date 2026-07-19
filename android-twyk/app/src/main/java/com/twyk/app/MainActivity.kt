package com.twyk.app

import android.graphics.Color as AndroidColor
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.twyk.app.feed.VersusFeed
import com.twyk.app.ui.AuthSheet
import com.twyk.app.ui.BattlesScreen
import com.twyk.app.ui.CommentsSheet
import com.twyk.app.ui.ConsentGate
import com.twyk.app.ui.InboxScreen
import com.twyk.app.ui.ProfileScreen
import com.twyk.app.ui.SearchScreen
import com.twyk.app.ui.UploadScreen

// Twyk Android — app NATIVA (Jetpack Compose + Media3/ExoPlayer).
// El feed se adapta al formato de cada publicación; la barra inferior navega
// entre secciones. La barra de estado queda intacta y el vídeo se ve por detrás.
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Restaura la sesión guardada (token + usuario) -> sobrevive al cerrar la app.
        com.twyk.app.data.Session.init(applicationContext)

        // Edge-to-edge: el contenido se dibuja detrás de las barras del sistema.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = AndroidColor.TRANSPARENT
        window.navigationBarColor = AndroidColor.TRANSPARENT
        WindowInsetsControllerCompat(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }

        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                TwykApp()
            }
        }
    }
}

private enum class Tab {
    Home, Battles, Upload, Inbox, Profile,
}

@Composable
private fun TwykApp() {
    var tab by remember { mutableStateOf(Tab.Home) }
    var commentsPostId by remember { mutableStateOf<String?>(null) }
    var authOpen by remember { mutableStateOf(false) }
    var profileUsername by remember { mutableStateOf<String?>(null) }
    var feedReloadKey by remember { mutableStateOf(0) }
    var searchOpen by remember { mutableStateOf(false) } // buscador de usuarios (lupa del feed)
    var quickChallengeTarget by remember { mutableStateOf<com.twyk.app.data.QuickChallengeTarget?>(null) } // "Retar rápido" a una publicación
    // Tocar TU propio autor abre tu perfil propio (no la vista de perfil ajeno).
    val openProfile: (String) -> Unit = { uname ->
        if (uname == com.twyk.app.data.Session.user?.username) tab = Tab.Profile
        else profileUsername = uname
    }
    // No puedes retarte a ti mismo (igual que la web: se ignora en silencio).
    val onChallenge: (com.twyk.app.data.QuickChallengeTarget) -> Unit = { target ->
        val authorUsername = target.author?.username
        if (authorUsername != null && authorUsername != com.twyk.app.data.Session.user?.username) {
            quickChallengeTarget = target
        }
    }

    // Al abrir la app con una sesión guardada, refresca el usuario desde el
    // backend (no solo la copia local en disco) — así, si `termsAccepted` (o
    // el avatar/nombre) cambió desde otro dispositivo o la web, el modal de
    // Términos (ConsentGate, más abajo) decide con el dato REAL, no uno
    // desactualizado.
    LaunchedEffect(Unit) {
        if (com.twyk.app.data.Session.token != null) {
            val me = runCatching { com.twyk.app.data.RetrofitProvider.api.me() }.getOrNull()
            me?.user?.let { com.twyk.app.data.Session.set(com.twyk.app.data.Session.token, it) }
        }
    }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        when (tab) {
            Tab.Home -> key(feedReloadKey) {
                VersusFeed(
                    onOpenComments = { commentsPostId = it },
                    onRequireAuth = { authOpen = true },
                    onOpenProfile = openProfile,
                    onChallenge = onChallenge,
                )
            }
            Tab.Upload -> UploadScreen(
                onRequireAuth = { authOpen = true },
                onDone = { feedReloadKey++; tab = Tab.Home },
            )
            Tab.Profile -> ProfileScreen(
                username = null,
                isOverlay = false,
                onClose = {},
                onRequireAuth = { authOpen = true },
            )
            Tab.Inbox -> InboxScreen(
                onRequireAuth = { authOpen = true },
                onAccepted = { feedReloadKey++ },
            )
            Tab.Battles -> BattlesScreen(
                onRequireAuth = { authOpen = true },
                onChanged = { feedReloadKey++ },
                onOpenComments = { commentsPostId = it },
                onOpenProfile = openProfile,
                onOpenUpload = { tab = Tab.Upload },
                onChallenge = onChallenge,
            )
        }
        // Buscador de usuarios: lupa fija arriba a la derecha (solo en Inicio,
        // igual que la web).
        if (tab == Tab.Home) {
            Box(
                Modifier.align(Alignment.TopEnd).statusBarsPadding().padding(top = 4.dp, end = 12.dp)
                    .size(36.dp).clickable { searchOpen = true },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Search, "Buscar usuarios", tint = Color.White, modifier = Modifier.size(24.dp))
            }
        }
        TwykBottomNav(
            current = tab,
            onSelect = { tab = it },
            modifier = Modifier.align(Alignment.BottomCenter),
        )
        // Perfil ajeno (al tocar un autor en el feed) como overlay sobre todo.
        profileUsername?.let { uname ->
            ProfileScreen(
                username = uname,
                isOverlay = true,
                onClose = { profileUsername = null },
                onRequireAuth = { authOpen = true },
            )
        }
        // Hojas por encima de la barra de navegación.
        commentsPostId?.let { pid ->
            CommentsSheet(
                postId = pid,
                onClose = { commentsPostId = null },
                onRequireAuth = { authOpen = true },
            )
        }
        if (authOpen) {
            AuthSheet(onClose = { authOpen = false }, onAuthed = { authOpen = false })
        }
        if (searchOpen) {
            SearchScreen(
                onClose = { searchOpen = false },
                onOpenProfile = { uname -> searchOpen = false; openProfile(uname) },
            )
        }
        quickChallengeTarget?.let { target ->
            com.twyk.app.ui.QuickChallengeSheet(target = target, onClose = { quickChallengeTarget = null })
        }
        // Banner de reto enviándose en segundo plano (visible sobre cualquier pestaña).
        com.twyk.app.ui.ChallengeBannerHost()
        // Modal de Términos y Condiciones (bloqueante, ver ui/Consent.kt) — se
        // dibuja al final para quedar SIEMPRE por encima de todo lo demás.
        ConsentGate()
    }
}

@Composable
private fun TwykBottomNav(current: Tab, onSelect: (Tab) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp))
            .background(Color.Black)
            .navigationBarsPadding()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceAround,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Inicio — relleno al estar activo (igual que la web).
        NavIcon(
            icon = ImageVector.vectorResource(if (current == Tab.Home) R.drawable.ic_home_filled else R.drawable.ic_home),
            selected = current == Tab.Home,
        ) { onSelect(Tab.Home) }

        // Batallas — espadas cruzadas (icono de la web).
        NavIcon(icon = ImageVector.vectorResource(R.drawable.ic_swords), selected = current == Tab.Battles) { onSelect(Tab.Battles) }

        // Crear / Subir — borde con degradado lila → azul.
        Box(
            Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(12.dp))
                .border(
                    width = 2.dp,
                    brush = Brush.linearGradient(listOf(Color(0xFFA855F7), Color(0xFF3B82F6))),
                    shape = RoundedCornerShape(12.dp),
                )
                .clickable { onSelect(Tab.Upload) },
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.Add, contentDescription = "Subir", tint = Color.White, modifier = Modifier.size(22.dp))
        }

        // Buzón
        NavIcon(icon = ImageVector.vectorResource(R.drawable.ic_inbox), selected = current == Tab.Inbox) { onSelect(Tab.Inbox) }

        // Perfil
        NavIcon(icon = ImageVector.vectorResource(R.drawable.ic_user), selected = current == Tab.Profile) { onSelect(Tab.Profile) }
    }
}

@Composable
private fun NavIcon(icon: ImageVector, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(36.dp).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = if (selected) Color.White else Color.White.copy(alpha = 0.5f),
            modifier = Modifier.size(24.dp),
        )
    }
}
