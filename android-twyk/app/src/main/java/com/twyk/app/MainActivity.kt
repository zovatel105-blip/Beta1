package com.twyk.app

import android.graphics.Color as AndroidColor
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddBox
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Whatshot
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.twyk.app.feed.VersusFeed
import com.twyk.app.ui.AuthSheet
import com.twyk.app.ui.CommentsSheet
import com.twyk.app.ui.ProfileScreen
import com.twyk.app.ui.UploadScreen

// Twyk Android — app NATIVA (Jetpack Compose + Media3/ExoPlayer).
// El feed se adapta al formato de cada publicación; la barra inferior navega
// entre secciones. La barra de estado queda intacta y el vídeo se ve por detrás.
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

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

private enum class Tab(val label: String, val icon: ImageVector) {
    Home("Inicio", Icons.Filled.Home),
    Battles("Batallas", Icons.Filled.Whatshot),
    Upload("Subir", Icons.Filled.AddBox),
    Inbox("Buzón", Icons.Filled.Inbox),
    Profile("Perfil", Icons.Filled.Person),
}

@Composable
private fun TwykApp() {
    var tab by remember { mutableStateOf(Tab.Home) }
    var commentsPostId by remember { mutableStateOf<String?>(null) }
    var authOpen by remember { mutableStateOf(false) }
    var profileUsername by remember { mutableStateOf<String?>(null) }
    var feedReloadKey by remember { mutableStateOf(0) }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        when (tab) {
            Tab.Home -> key(feedReloadKey) {
                VersusFeed(
                    onOpenComments = { commentsPostId = it },
                    onRequireAuth = { authOpen = true },
                    onOpenProfile = { profileUsername = it },
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
            else -> ComingSoon(tab.label)
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
    }
}

@Composable
private fun ComingSoon(title: String) {
    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(title, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("Próximamente (nativo)", color = Color.White.copy(alpha = 0.6f), fontSize = 13.sp)
        }
    }
}

@Composable
private fun TwykBottomNav(current: Tab, onSelect: (Tab) -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(Color(0xF20A0A0B))
            .navigationBarsPadding()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceAround,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        for (t in Tab.values()) {
            val selected = t == current
            val tint = if (selected) Color.White else Color.White.copy(alpha = 0.5f)
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .clickable { onSelect(t) }
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            ) {
                Icon(t.icon, contentDescription = t.label, tint = tint, modifier = Modifier.size(26.dp))
                Spacer(Modifier.height(2.dp))
                Text(t.label, color = tint, fontSize = 10.sp)
            }
        }
    }
}
