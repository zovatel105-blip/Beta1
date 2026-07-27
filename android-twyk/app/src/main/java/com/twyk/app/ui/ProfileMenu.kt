package com.twyk.app.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Insights
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
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twyk.app.Config
import kotlin.math.roundToInt

// Menú de Ajustes del perfil propio (icono ☰) — réplica VISUAL Y FUNCIONAL de
// SettingsDrawer en ProfilePage.jsx (web): panel que entra deslizándose desde
// el BORDE DERECHO (antes era una hoja inferior, diferencia reportada por el
// usuario: "en la app aparece un modal desde abajo y en la web desde la
// derecha"), fondo #0a0a0b, resplandor morado decorativo en la esquina
// superior, sección "Administration" (Moderation panel / Engine dashboard)
// SOLO para cuentas con role=='admin' (igual que isAdmin en la web), y "Log
// out" anclado siempre al final. Igual que la web: SIN botón "X" y SIN cierre
// al tocar el fondo — se cierra deslizando el panel hacia la derecha (gesto,
// réplica del Pointer Events de SettingsDrawer) o con el botón/gesto "Atrás"
// del sistema (affordance nativa estándar de Android, no rompe la paridad).
@Composable
fun ProfileMenuSheet(
    open: Boolean,
    onClose: () -> Unit,
    onLogout: () -> Unit,
    isAdmin: Boolean,
) {
    val context = LocalContext.current

    // Desplazamiento manual (arrastre) aplicado POR ENCIMA de la animación de
    // entrada/salida — mismo patrón que dragX en SettingsDrawer.jsx: solo se
    // usa mientras el usuario arrastra; se resetea a 0 cada vez que el panel
    // vuelve a abrirse.
    var dragOffsetPx by remember { mutableStateOf(0f) }
    var panelWidthPx by remember { mutableStateOf(0f) }
    LaunchedEffect(open) { if (open) dragOffsetPx = 0f }

    BackHandler(enabled = open) { onClose() }

    // Fondo oscuro: solo decorativo, NO cierra al tocarlo (igual que la web
    // tras el ajuste "el cierre es solo deslizando el panel").
    AnimatedVisibility(
        visible = open,
        enter = fadeIn(tween(300)),
        exit = fadeOut(tween(300)),
    ) {
        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.6f)))
    }

    Box(Modifier.fillMaxSize()) {
        AnimatedVisibility(
            visible = open,
            enter = slideInHorizontally(animationSpec = tween(300)) { fullWidth -> fullWidth },
            exit = slideOutHorizontally(animationSpec = tween(300)) { fullWidth -> fullWidth },
            modifier = Modifier.align(Alignment.CenterEnd),
        ) {
            Box(
                Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(0.82f)
                    .widthIn(max = 384.dp)
                    .onGloballyPositioned { panelWidthPx = it.size.width.toFloat() }
                    .offset { IntOffset(dragOffsetPx.roundToInt(), 0) }
                    // `shadow-2xl` de la web -> sombra de elevación nativa. Se
                    // aplica ANTES de `clipToBounds()` para que la propia
                    // sombra (que se dibuja FUERA del borde del panel) no
                    // quede recortada por ese clip.
                    .shadow(24.dp)
                    // `overflow-hidden` de la web -> recorta el resplandor
                    // decorativo (ver más abajo) para que no sangre hacia la
                    // zona oscurecida de fondo, fuera del propio panel.
                    .clipToBounds()
                    .pointerInput(Unit) {
                        detectHorizontalDragGestures(
                            onDragEnd = {
                                val max = panelWidthPx.takeIf { it > 0f } ?: 1000f
                                if (dragOffsetPx > max * 0.28f) onClose()
                                else dragOffsetPx = 0f
                            },
                            onDragCancel = { dragOffsetPx = 0f },
                        ) { change, dragAmount ->
                            change.consume()
                            val max = panelWidthPx.takeIf { it > 0f } ?: 1000f
                            dragOffsetPx = (dragOffsetPx + dragAmount).coerceIn(0f, max)
                        }
                    }
                    .background(TwykBg),
            ) {
                // Borde izquierdo sutil (`border-l border-white/[0.06]` de la
                // web) — Compose no tiene un modificador de "borde en un solo
                // lado", así que se dibuja como una línea de 1dp pegada al
                // borde izquierdo del panel, ANTES del resto del contenido
                // (para que quede detrás del resplandor/filas, igual que un
                // borde CSS normal).
                Box(
                    Modifier.align(Alignment.CenterStart).fillMaxHeight().width(1.dp)
                        .background(Color.White.copy(alpha = 0.06f)),
                )

                // Resplandor de marca sutil en la esquina superior derecha —
                // réplica EXACTA de `-top-24 -right-24 w-56 h-56` +
                // `radial-gradient(circle, rgba(168,85,247,0.14) 0%,
                // rgba(168,85,247,0) 70%)` de SettingsDrawer.jsx: forma de
                // 224dp (56×4), desplazada 96dp (24×4) MÁS ALLÁ de la esquina
                // superior-derecha en ambos ejes (antes 40dp, un valor
                // inventado que no correspondía a ningún token de la web), y
                // el degradado se apaga del todo al 70% del radio (antes
                // llegaba hasta el 100%, dejando un halo visualmente más
                // ancho/difuso que en la web).
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .offset(x = 96.dp, y = (-96).dp)
                        .size(224.dp)
                        .background(
                            Brush.radialGradient(
                                0f to Color(0xFFA855F7).copy(alpha = 0.14f),
                                0.7f to Color.Transparent,
                            ),
                        ),
                )

                // Indicador de arrastre: flecha ">" en el borde izquierdo del
                // panel, centrada verticalmente, en blanco muy tenue —
                // réplica de `absolute left-1 top-1/2 -translate-y-1/2
                // text-white/25` + `ChevronRight w-4 h-4` de la web. Faltaba
                // por completo en el nativo.
                Icon(
                    Icons.Filled.ChevronRight,
                    contentDescription = null,
                    tint = Color.White.copy(alpha = 0.25f),
                    modifier = Modifier.align(Alignment.CenterStart).padding(start = 4.dp).size(16.dp),
                )

                Column(Modifier.fillMaxSize()) {
                    // Cabecera: solo el título "Settings", sin botón de cierre
                    // (igual que la web).
                    Row(
                        Modifier.fillMaxWidth().statusBarsPadding().height(56.dp).padding(horizontal = 20.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            "Settings", color = Color.White, fontWeight = FontWeight.SemiBold,
                            fontSize = 19.sp, letterSpacing = (-0.4).sp,
                        )
                    }

                    // Zona CENTRAL con peso flexible (ocupa el espacio restante
                    // entre la cabecera y el pie) y scroll propio — solo la
                    // sección "Administration" vive aquí. NO se combina
                    // weight()+verticalScroll() en la MISMA Column que el pie:
                    // eso dejaría la altura sin límite y "Log out" no podría
                    // anclarse abajo. En su lugar, el pie es un bloque HERMANO
                    // fuera del scroll (ver más abajo), igual que "mt-auto" en
                    // SettingsDrawer.jsx.
                    Column(
                        Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState())
                            .padding(horizontal = 20.dp),
                    ) {
                        if (isAdmin) {
                            // `pt-5` (20px) de la web antes de esta sección —
                            // antes solo 6dp, un valor sin relación con la web.
                            Spacer(Modifier.height(20.dp))
                            Text(
                                "ADMINISTRATION", color = Color(0xFF71717A), fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp,
                                modifier = Modifier.padding(bottom = 4.dp),
                            )
                            // `divide-y divide-white/[0.05]` de la web: línea
                            // sutil de 1dp ENTRE las 2 filas de Administración
                            // (faltaba por completo en el nativo).
                            MenuRow(
                                icon = Icons.Filled.AdminPanelSettings,
                                label = "Moderation panel",
                                onClick = { openUrl(context, Config.BASE_URL.trimEnd('/') + "/admin/reports") },
                            )
                            Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.05f)))
                            MenuRow(
                                icon = Icons.Filled.Insights,
                                label = "Engine dashboard",
                                onClick = { openUrl(context, Config.BASE_URL.trimEnd('/') + "/admin/reco") },
                            )
                        }
                    }

                    // Pie FIJO (nunca se desplaza con el scroll de arriba):
                    // divisor sutil + "Log out", siempre anclado al final del
                    // panel — réplica de "mt-auto pt-8" + border-t en la web.
                    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
                        Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.06f)))
                        // `pt-4` (16px) de la web ENTRE el borde y la fila —
                        // antes solo 4dp, un valor sin relación con la web.
                        Spacer(Modifier.height(16.dp))
                        MenuRow(
                            icon = ImageVector.vectorResource(com.twyk.app.R.drawable.ic_log_out),
                            label = "Log out",
                            tone = "danger",
                            onClick = { onLogout(); onClose() },
                        )
                        Spacer(Modifier.navigationBarsPadding())
                        // `pb-6` (24px) de la web al final del panel — antes
                        // solo 12dp.
                        Spacer(Modifier.height(24.dp))
                    }
                }
            }
        }
    }
}

// Fila de ajuste: icono en círculo tenue + etiqueta + chevron (o círculo/
// texto rojo sin chevron para la acción destructiva "Log out") — réplica de
// SettingsRow en ProfilePage.jsx.
@Composable
private fun MenuRow(icon: ImageVector, label: String, tone: String = "default", onClick: () -> Unit) {
    val isDanger = tone == "danger"
    // `bg-red-500/10` de la web (Tailwind red-500 = #EF4444) — antes usaba
    // red-400 (#F87171, el mismo tono ya correcto del ICONO/texto) también
    // para el FONDO del círculo, un color distinto al que usa la web ahí.
    val iconBg = if (isDanger) Color(0xFFEF4444).copy(alpha = 0.1f) else Color.White.copy(alpha = 0.06f)
    val iconTint = if (isDanger) Color(0xFFF87171) else Color(0xFFD4D4D8)
    val labelColor = if (isDanger) Color(0xFFF87171) else Color.White

    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(32.dp).clip(CircleShape).background(iconBg),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, null, tint = iconTint, modifier = Modifier.size(16.dp))
        }
        Spacer(Modifier.width(12.dp))
        Text(
            label, color = labelColor, fontSize = 15.sp, fontWeight = FontWeight.Medium,
            letterSpacing = (-0.3).sp,
            modifier = Modifier.weight(1f),
        )
        if (!isDanger) {
            Icon(Icons.Filled.ChevronRight, null, tint = Color(0xFF52525B), modifier = Modifier.size(16.dp))
        }
    }
}

// Abre una URL en el navegador externo del sistema — mismo patrón (Intent
// ACTION_VIEW) ya usado por ShareSheet (Sheets.kt) para Instagram/WhatsApp/X.
// Las páginas de administración (React, web) leen el token de sesión desde
// localStorage del navegador: al abrirse fuera de la app, un admin puede
// necesitar iniciar sesión ahí por separado la primera vez.
private fun openUrl(context: android.content.Context, url: String) {
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
}
