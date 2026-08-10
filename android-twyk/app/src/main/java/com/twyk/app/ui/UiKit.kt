package com.twyk.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.twyk.app.absoluteUrl

// ─── Paleta Twyk (idéntica a la web) ─────────────────────────────────────────
// La web reemplazó el dorado por blanco puro en toda la app (UploadDialog.jsx
// `const GOLD = '#FFFFFF'`, NotificationsInbox.jsx `color: '#FFFFFF'`,
// ActiveChallengesPage.jsx `const GOLD = '#FFFFFF'`, etc.). Se mantiene el
// NOMBRE `TwykGold` (misma "deuda técnica de naming" que la web conservó al
// renombrar su propia constante `GOLD` sin cambiarle el nombre) pero ahora
// vale blanco, de modo que TODOS los usos existentes (glow, iconos vacíos,
// spinners, pastilla "Challenge", etc.) se actualizan automáticamente.
val TwykGold = Color.White
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
            // Réplica EXACTA del <DefaultAvatar> de la web (Avatar.jsx /
            // BottomNav.jsx): fondo gris claro (#E5E7EB) + silueta SVG
            // personalizada (cabeza circular + hombros triangulares en #9CA3AF).
            // Se usa el mismo vector `ic_avatar_default.xml` que el feed y el
            // botón de perfil de la barra inferior — antes se dibujaba el
            // `Icons.Filled.Person` de Material (círculo lleno) que NO
            // coincidía con la silueta de la web.
            Image(
                imageVector = ImageVector.vectorResource(com.twyk.app.R.drawable.ic_avatar_default),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
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

// Glow blanco muy sutil en la parte superior — réplica del
// `radial-gradient(60% 100% at 50% 0%, rgba(255,255,255,0.07|0.10), transparent 70%)`
// que usa la web (NotificationsInbox.jsx/UploadDialog.jsx=0.07,
// CompletedBattlesPage.jsx=0.10). Antes era un `verticalGradient` (banda
// horizontal de arriba a abajo); ahora es un radial centrado en el borde
// superior (BoxWithConstraints para conocer el ancho real en dp -> px y
// calcular el centro/radio como hace la web con posición y tamaño en %).
@Composable
fun GoldGlow(height: androidx.compose.ui.unit.Dp = 320.dp, alpha: Float = 0.09f) {
    BoxWithConstraints(Modifier.fillMaxWidth().height(height)) {
        val density = LocalDensity.current
        val widthPx = with(density) { maxWidth.toPx() }
        val heightPx = with(density) { maxHeight.toPx() }
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(TwykGold.copy(alpha = alpha), Color.Transparent),
                        center = Offset(widthPx / 2f, 0f),
                        radius = maxOf(widthPx * 0.6f, heightPx).coerceAtLeast(1f),
                    ),
                ),
        )
    }
}

// Icono de "cuadrícula" (pestaña de publicaciones) — réplica EXACTA del SVG
// personalizado de la web (ver ColumnsIcon en components/ProfilePage.jsx):
// 6 rectángulos redondeados en una cuadrícula de 3x2 (NO líneas cruzadas,
// que es lo que dibujaba esta función antes por error). viewBox de referencia
// 24x24, coordenadas escaladas al tamaño real del composable.
// `filled`: con la pestaña ACTIVA los 6 rectángulos se RELLENAN de blanco
// (petición del usuario: igual que el icono de Saved, que pasa a
// ic_bookmark_filled al seleccionarse; en la web es `fill-current` /
// fill=currentColor). Se dibuja el RELLENO y ADEMÁS el trazo (la web
// mantiene stroke=currentColor junto al fill, así que el rectángulo lleno
// abarca también el medio trazo exterior — misma silueta exacta).
@Composable
fun ColumnsIcon(modifier: Modifier = Modifier, color: Color = Color.White, filled: Boolean = false) {
    Canvas(modifier) {
        val scale = size.width / 24f
        val strokeW = 1.1f * scale
        val rectW = 4.4f * scale
        val rectH = 7.3f * scale
        val radius = 1.1f * scale
        val xs = listOf(3.7f, 9.8f, 15.9f)
        val ys = listOf(3.85f, 12.85f)
        val stroke = Stroke(width = strokeW, cap = StrokeCap.Round, join = StrokeJoin.Round)
        ys.forEach { fy ->
            xs.forEach { fx ->
                if (filled) {
                    drawRoundRect(
                        color = color,
                        topLeft = Offset(fx * scale, fy * scale),
                        size = Size(rectW, rectH),
                        cornerRadius = CornerRadius(radius, radius),
                        style = Fill,
                    )
                }
                drawRoundRect(
                    color = color,
                    topLeft = Offset(fx * scale, fy * scale),
                    size = Size(rectW, rectH),
                    cornerRadius = CornerRadius(radius, radius),
                    style = stroke,
                )
            }
        }
    }
}

// RÉPLICA EXACTA de components/ProfilePage.jsx (formatNumber, usada TANTO en
// las stats del perfil como en la píldora del grid): `(n/1000).toFixed(1)+'K'`
// / `(n/1000000).toFixed(1)+'M'` — SIN quitar el ".0" en números redondos
// (1000 -> "1.0K", no "1K"). Antes esta función SÍ lo quitaba (trimZero),
// causando un contador distinto al de la web en cualquier múltiplo exacto de
// 1000/1000000 (ej. exactamente 1000 votos: web "1.0K" vs nativo, antes,
// "1K") — token por token, la web NUNCA elimina ese ".0" aquí.
fun formatCount(n: Int): String = when {
    n >= 1_000_000 -> String.format("%.1f", n / 1_000_000.0) + "M"
    n >= 1_000 -> String.format("%.1f", n / 1_000.0) + "K"
    else -> n.toString()
}

// Estado "Inicia sesión" premium (centrado, icono en círculo dorado) — estilo web.
@Composable
fun LoginPrompt(message: String, onRequireAuth: () -> Unit, icon: ImageVector? = null) {
    Box(Modifier.fillMaxSize().background(TwykBg), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
            Box(
                Modifier.size(80.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.03f))
                    .border(1.dp, Color.White.copy(alpha = 0.10f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                // Icono por defecto: mismo ic_circle_user_round (lucide `circle-user-round`)
                // que usa la web en el perfil propio de invitado; se puede
                // sobreescribir por llamador para otras pantallas.
                Icon(icon ?: ImageVector.vectorResource(com.twyk.app.R.drawable.ic_circle_user_round), null, tint = TwykGold, modifier = Modifier.size(36.dp))
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
