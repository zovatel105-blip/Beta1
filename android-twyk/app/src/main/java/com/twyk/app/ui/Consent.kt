package com.twyk.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.twyk.app.data.RetrofitProvider
import com.twyk.app.data.Session
import kotlinx.coroutines.launch

// Modal de Términos y Condiciones — réplica de ConsentBanner.jsx (web). Regla
// EXACTA (misma que la web tras el último ajuste pedido por el usuario en esa
// sesión): SOLO se muestra a un usuario CON SESIÓN cuyo `termsAccepted` no sea
// `true` (recién registrado, o que inició sesión sin haberlo aceptado nunca);
// los INVITADOS nunca lo ven. No tiene botón de cerrar ni se descarta tocando
// fuera ni con el gesto/botón de "Atrás" (BackHandler lo consume sin hacer
// nada) — la ÚNICA salida es pulsar "Aceptar y continuar", que persiste
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
        Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.75f)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.widthIn(max = 420.dp).fillMaxWidth().padding(horizontal = 20.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(Color(0xFF18181B))
                .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(20.dp))
                .padding(22.dp),
        ) {
            Text("Antes de continuar", color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(10.dp))
            Text(
                "Al continuar usando Twyk, aceptas nuestros Términos de Uso y la Política de Privacidad, incluido el uso de las cookies esenciales para el funcionamiento de la app.",
                color = Color.White.copy(alpha = 0.65f), fontSize = 13.sp, lineHeight = 19.sp,
            )
            if (error) {
                Spacer(Modifier.height(10.dp))
                Text("No se pudo guardar. Comprueba tu conexión e inténtalo de nuevo.", color = Color(0xFFFB7185), fontSize = 12.sp)
            }
            Spacer(Modifier.height(18.dp))
            Box(
                Modifier.fillMaxWidth().height(48.dp).clip(RoundedCornerShape(50))
                    .background(if (busy) Color.White.copy(alpha = 0.4f) else Color.White)
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
                    CircularProgressIndicator(color = Color.Black, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                } else {
                    Text("Aceptar y continuar", color = Color.Black, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}
