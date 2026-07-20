package com.twyk.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.twyk.app.absoluteUrl

// ─── Paleta Twyk (idéntica a la web) ─────────────────────────────────────────
val TwykGold = Color(0xFFE4C79B)
val TwykBg = Color(0xFF0A0A0B)
val TwykPurple = Color(0xFFA855F7)
val TwykBlue = Color(0xFF3B82F6)
val TwykRed = Color(0xFFEF4444)
val ZincText = Color(0xFFA1A1AA)

// Los avatares autogenerados (dicebear/pravatar) son SVG → Coil no los pinta y,
// además, la web los muestra como una silueta gris. Replicamos ese mismo aspecto.
fun isGeneratedAvatar(src: String?): Boolean =
    src.isNullOrBlank() || src.contains("dicebear") || src.contains("pravatar")

@Composable
fun TwykAvatar(src: String?, modifier: Modifier = Modifier) {
    Box(modifier.clip(CircleShape), contentAlignment = Alignment.Center) {
        if (isGeneratedAvatar(src)) {
            Box(Modifier.fillMaxSize().background(Color(0xFFE5E7EB)), contentAlignment = Alignment.Center) {
                Icon(
                    Icons.Filled.Person,
                    contentDescription = null,
                    tint = Color(0xFF9CA3AF),
                    modifier = Modifier.fillMaxSize(0.82f),
                )
            }
        } else {
            AsyncImage(
                model = absoluteUrl(src),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

// Glow cálido dorado en la parte superior (igual que el radial-gradient de la web).
@Composable
fun GoldGlow(height: androidx.compose.ui.unit.Dp = 320.dp, alpha: Float = 0.09f) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(height)
            .background(
                Brush.verticalGradient(
                    colors = listOf(TwykGold.copy(alpha = alpha), Color.Transparent),
                ),
            ),
    )
}

// Icono de columnas (4 verticales + 1 horizontal) usado en el perfil — igual a la web.
@Composable
fun ColumnsIcon(modifier: Modifier = Modifier, color: Color = Color.White) {
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        val sw = w * 0.075f
        val xs = listOf(0.125f, 0.375f, 0.625f, 0.875f)
        xs.forEach { fx ->
            drawLine(color, Offset(w * fx, h * 0.13f), Offset(w * fx, h * 0.87f), strokeWidth = sw, cap = StrokeCap.Round)
        }
        drawLine(color, Offset(w * 0.125f, h * 0.5f), Offset(w * 0.875f, h * 0.5f), strokeWidth = sw, cap = StrokeCap.Round)
    }
}

fun formatCount(n: Int): String = when {
    n >= 1_000_000 -> trimZero(n / 1_000_000.0) + "M"
    n >= 1_000 -> trimZero(n / 1_000.0) + "K"
    else -> n.toString()
}

private fun trimZero(v: Double): String {
    val s = String.format("%.1f", v)
    return if (s.endsWith(".0")) s.dropLast(2) else s
}

// Estado "Inicia sesión" premium (centrado, icono en círculo dorado) — estilo web.
@Composable
fun LoginPrompt(message: String, onRequireAuth: () -> Unit, icon: ImageVector = Icons.Outlined.Notifications) {
    Box(Modifier.fillMaxSize().background(TwykBg), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
            Box(
                Modifier.size(80.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.03f))
                    .border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, null, tint = TwykGold, modifier = Modifier.size(36.dp))
            }
            Spacer(Modifier.height(22.dp))
            Text("Sign in", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            Text(message, color = ZincText, fontSize = 15.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(22.dp))
            Box(
                Modifier.clip(RoundedCornerShape(50)).background(Color.White)
                    .clickable { onRequireAuth() }.padding(horizontal = 32.dp, vertical = 12.dp),
            ) {
                Text("Log in", color = Color.Black, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            }
        }
    }
}
