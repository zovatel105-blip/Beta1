package com.twyk.app.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

// Registro/baja del token FCM (notificaciones push, ver backend lib/push.js)
// para ESTE dispositivo — único punto de entrada, usado desde:
// - MainActivity.kt (al arrancar con sesión ya restaurada, y cada vez que
//   `Session.token` pasa a no-nulo tras login/registro).
// - push/TwykFirebaseMessagingService.kt::onNewToken (cuando Firebase rota
//   el token — reinstalación, restauración de backup, etc.).
// - ui/Profile.kt (al pulsar "Log out": da de baja el token de este
//   dispositivo ANTES de limpiar la sesión).
object PushTokenManager {
    // Scope propio (no ligado a ninguna Activity/Composable) — sobrevive a
    // cambios de pantalla; usa Main porque las funciones suspend de Retrofit
    // ya delegan la I/O real a OkHttp sin bloquear el hilo principal.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    // Último token FCM subido con éxito para el usuario de la sesión ACTUAL
    // — se necesita para poder darlo de baja en el logout ANTES de limpiar
    // Session.token (el interceptor de OkHttp lee Session.token en el
    // momento exacto de cada petición; si se limpiara primero, la petición
    // de baja saldría sin Authorization y el backend la rechazaría con 401).
    @Volatile private var lastUploadedToken: String? = null

    // Llamado al arrancar la app (con sesión ya restaurada, ver
    // MainActivity.onCreate) y cada vez que `Session.token` cambia a
    // no-nulo (login/registro, ver el LaunchedEffect en TwykApp()).
    fun registerCurrentDeviceIfLoggedIn() {
        if (Session.token == null) return
        runCatching {
            FirebaseMessaging.getInstance().token.addOnSuccessListener { token -> uploadToken(token) }
        }
    }

    // Sube (o refresca) el token FCM de este dispositivo. Llamado tanto
    // desde arriba como desde onNewToken() del servicio de mensajería.
    fun uploadToken(token: String) {
        if (Session.token == null) return
        scope.launch {
            runCatching { RetrofitProvider.api.registerPushToken(RegisterPushTokenRequest(token = token)) }
                .onSuccess { lastUploadedToken = token }
        }
    }

    // Da de baja el token de ESTE dispositivo (si se subió alguno) y LUEGO
    // limpia la sesión — en ese orden exacto, para que la petición de baja
    // siga autenticada con el Bearer token todavía válido (ver nota de
    // `lastUploadedToken` más arriba). Fire-and-forget: el logout en la UI
    // no espera a que termine esta llamada de red.
    fun unregisterAndClearSession() {
        val token = lastUploadedToken
        scope.launch {
            if (token != null) {
                runCatching { RetrofitProvider.api.unregisterPushToken(UnregisterPushTokenRequest(token = token)) }
            }
            lastUploadedToken = null
            Session.clear()
        }
    }
}

// Puente entre TwykFirebaseMessagingService (Activity/Service, fuera del
// árbol de Compose) y TwykApp() (Composable) para navegar al tocar una
// notificación push — mismo patrón que otros singletons observables de la
// app (FeedOverlays, ChallengeBanner, FullScreenOverlays). V1: cualquier tap
// abre la bandeja de notificaciones (Inbox), donde ya existe la lógica para
// ver el detalle de cada tipo (vote/comment/challenge/follow); una mejora
// futura podría navegar directo al post/perfil/reto concreto usando los
// `data` extra del payload (postId/fromUsername/type).
object PushNavigation {
    var openInboxRequested by mutableStateOf(false)
}
