package com.twyk.app.push

import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.twyk.app.MainActivity
import com.twyk.app.R
import com.twyk.app.data.PushTokenManager

// Servicio de mensajería (Firebase Cloud Messaging) — ver
// data/PushTokenManager.kt y backend lib/push.js. IMPORTANTE (comportamiento
// documentado de Firebase, NO un bug): `onMessageReceived` SOLO se invoca
// mientras la app está en PRIMER PLANO. Con la app en segundo plano/cerrada,
// el payload "notification" del mensaje lo pinta el propio sistema
// Android directamente en la bandeja (usando el canal/icono por defecto
// declarados en AndroidManifest.xml), SIN pasar por aquí — por eso este
// servicio solo necesita mostrar la notificación manualmente para el caso
// de primer plano (evita duplicados: nunca se muestra 2 veces el mismo push).
class TwykFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val CHANNEL_ID = "social"
    }

    // Firebase rota el token periódicamente (o al reinstalar la app /
    // restaurar un backup) — hay que volver a subirlo al backend.
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        PushTokenManager.uploadToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val title = message.notification?.title ?: message.data["title"] ?: "New activity"
        val body = message.notification?.body ?: message.data["body"] ?: ""
        showNotification(title, body)
    }

    private fun showNotification(title: String, body: String) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("open_inbox", true)
        }
        val pending = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_inbox)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        runCatching {
            NotificationManagerCompat.from(this).notify(System.currentTimeMillis().toInt(), notification)
        }
    }
}
