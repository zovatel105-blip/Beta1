package com.twyk.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twyk.app.Config
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import kotlinx.coroutines.launch

// Modal de Términos y Condiciones — réplica de ConsentBanner.jsx (web). Regla
// EXACTA (misma que la web tras el último ajuste pedido por el usuario en esa
// sesión): SOLO se muestra a un usuario CON SESIÓN cuyo `termsAccepted` no sea
// `true` (recién registrado, o que inició sesión sin haberlo aceptado nunca);
// los INVITADOS nunca lo ven. No tiene botón de cerrar ni se descarta tocando
// fuera ni con el gesto/botón de "Atrás" (BackHandler lo consume sin hacer
// nada) — la ÚNICA salida es pulsar "Accept and Continue", que persiste
// `termsAccepted=true` en la cuenta (POST /api/auth/accept-terms), no solo en
// este dispositivo.
@Composable
fun ConsentGate() {
    val token = Session.token
    val user = Session.user
    if (token == null || user == null || user.termsAccepted) return

    // Consume el botón/gesto de "Atrás" mientras el modal está visible, para
    // que no se pueda saltar sin aceptar (igual que la web, que ignora Escape
    // y el click fuera del banner).
    BackHandler(enabled = true) { }

    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf(false) }

    Box(
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.60f)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.widthIn(max = 380.dp).fillMaxWidth().padding(horizontal = 20.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(Color(0xFF18181B))
                .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(24.dp)),
        ) {
            // Texto EXACTO de components/ConsentBanner.jsx (web), sin cabecera
            // adicional (la web no tiene título "Antes de continuar", solo
            // este párrafo centrado + el botón). "Terms of Use"/"Privacy
            // Policy"/"Cookies" son enlaces reales (abren el navegador),
            // igual que los <Link> de la web (antes solo texto en negrita).
            val linkStyle = TextLinkStyles(style = SpanStyle(color = Color.White, fontWeight = FontWeight.Bold, textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline))
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(color = Color.White.copy(alpha = 0.80f))) {
                        append("By continuing to use Twyk, you acknowledge our ")
                    }
                    withLink(LinkAnnotation.Url(Config.BASE_URL.trimEnd('/') + "/terms", linkStyle)) { append("Terms of Use") }
                    withStyle(SpanStyle(color = Color.White.copy(alpha = 0.80f))) {
                        append(" and confirm that you have reviewed our ")
                    }
                    withLink(LinkAnnotation.Url(Config.BASE_URL.trimEnd('/') + "/privacy", linkStyle)) { append("Privacy Policy") }
                    withStyle(SpanStyle(color = Color.White.copy(alpha = 0.80f))) {
                        append(", which explains how your personal data is collected, processed and shared. You also consent to our use of essential ")
                    }
                    withLink(LinkAnnotation.Url(Config.BASE_URL.trimEnd('/') + "/privacy", linkStyle)) { append("Cookies") }
                    withStyle(SpanStyle(color = Color.White.copy(alpha = 0.80f))) {
                        append(" required for the platform to function properly.")
                    }
                },
                fontSize = 15.sp, lineHeight = 21.sp, textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 28.dp),
            )
            if (error) {
                Text(
                    "Couldn't save. Check your connection and try again.",
                    color = Color(0xFFFB7185), fontSize = 12.sp, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 4.dp),
                )
            }
            Box(
                Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.10f)),
            )
            Box(
                Modifier.fillMaxWidth().height(54.dp)
                    .clickable(enabled = !busy) {
                        busy = true
                        error = false
                        scope.launch {
                            val r = runCatching { RetrofitProvider.api.acceptTerms() }.getOrNull()
                            if (r?.ok == true) {
                                Session.set(token, r.user ?: user.copy(termsAccepted = true))
                            } else {
                                error = true
                            }
                            busy = false
                        }
                    },
                contentAlignment = Alignment.Center,
            ) {
                if (busy) {
                    CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                } else {
                    Text("Accept and Continue", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
