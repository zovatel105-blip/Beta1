package com.twyk.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.statusBarsPadding
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import coil.compose.AsyncImage
import com.twyk.app.absoluteUrl
import com.twyk.app.data.Post
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session

// BATALLAS: retos completados (publicados como versus) en los que participas.
@Composable
fun BattlesScreen(onRequireAuth: () -> Unit) {
    if (Session.token == null) {
        LoginPrompt("Inicia sesión para ver tus batallas", onRequireAuth)
        return
    }

    var posts by remember { mutableStateOf<List<Post>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        loading = true
        posts = runCatching { RetrofitProvider.api.completedBattles().posts.orEmpty() }.getOrDefault(emptyList())
        loading = false
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 100.dp),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    "Batallas",
                    color = Color.White,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.statusBarsPadding().padding(start = 16.dp, top = 16.dp, bottom = 12.dp),
                )
            }
            items(posts) { p -> BattleCell(p) }
        }

        if (!loading && posts.isEmpty()) {
            Text(
                "Aún no tienes batallas.\nCrea un reto o acéptalo desde el Buzón.",
                color = Color.White.copy(alpha = 0.5f),
                fontSize = 13.sp,
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
            )
        }
    }
}

@Composable
private fun BattleCell(post: Post) {
    val poster = absoluteUrl(post.posterUrl ?: post.sideA?.posterUrl ?: post.thumbnailUrl)
    Box(Modifier.padding(1.dp).aspectRatio(0.62f).background(Color.White.copy(alpha = 0.06f))) {
        if (poster != null) {
            AsyncImage(model = poster, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
        Box(
            Modifier.align(Alignment.TopStart).padding(6.dp)
                .clip(RoundedCornerShape(6.dp)).background(Color(0xCCEF2D56)).padding(horizontal = 6.dp, vertical = 2.dp),
        ) {
            Text("VS", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }
    }
}
