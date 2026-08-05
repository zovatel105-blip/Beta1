package com.twyk.app.push

import android.app.PendingIntent
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.twyk.app.MainActivity
import com.twyk.app.R
import com.twyk.app.data.PushTokenManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.net.URL

// Servicio de mensajería (Firebase Cloud Messaging) — ver
// data/PushTokenManager.kt y backend lib/push.js.
//
// NUEVA FEATURE (usuario: "las notificaciones tienen que tener el logo de la
// apk y mostrar el avatar y la publicación en la que se interactuó"): el
// backend (lib/push.js) ahora envía el push como payload SOLO-DATOS (sin
// bloque "notification") — esto es DELIBERADO, no un descuido: con un
// payload "notification", Android pinta la notificación él MISMO mientras
// la app está en segundo plano/cerrada, sin pasar nunca por
// `onMessageReceived`, así que el avatar/imagen NUNCA podrían mostrarse en
// ese caso (solo funcionaría con la app abierta). Con SOLO "data", Android
// entrega el mensaje aquí SIEMPRE (primer plano, segundo plano O cerrada —
// comportamiento oficial y documentado de Firebase), así que este servicio
// es el ÚNICO responsable de construir la notificación, en todos los casos
// por igual — de ahí que ya no haya ninguna rama especial "solo en primer
// plano" como antes.
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
        val data = message.data
        val title = data["title"] ?: "New activity"
        val body = data["body"] ?: ""
        val avatarUrl = data["avatarUrl"]
        val postImageUrl = data["postImageUrl"]

        // `onMessageReceived` se invoca en el hilo principal, pero descargar
        // las imágenes (red) requiere un hilo de fondo — FCM concede un
        // margen de ejecución adicional (~10s de wakelock) tras este método
        // para trabajo asíncrono ya iniciado, suficiente para 2 descargas
        // pequeñas (avatar + miniatura) con timeout corto.
        CoroutineScope(Dispatchers.IO).launch {
            val avatarBitmap = avatarUrl?.takeIf { it.isNotBlank() }?.let { downloadBitmap(it) }
            val postBitmap = postImageUrl?.takeIf { it.isNotBlank() }?.let { downloadBitmap(it) }
            showNotification(title, body, avatarBitmap, postBitmap)
        }
    }

    // Descarga simple y con timeout corto — si falla (red lenta, URL rota,
    // avatar demo sin imagen real) simplemente se omite ese elemento visual,
    // la notificación de texto sigue mostrándose igual (nunca bloquea nada).
    private fun downloadBitmap(urlStr: String): Bitmap? = runCatching {
        val connection = URL(urlStr).openConnection()
        connection.connectTimeout = 4000
        connection.readTimeout = 4000
        connection.getInputStream().use { input -> BitmapFactory.decodeStream(input) }
    }.getOrNull()

    private fun showNotification(title: String, body: String, avatarBitmap: Bitmap?, postBitmap: Bitmap?) {
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
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            // Logo REAL de la app (capa "foreground" del ícono adaptativo,
            // res/mipmap-*/ic_launcher_foreground.png — YA tiene canal alpha
            // recortando la marca exacta, verificado con Pillow) en vez del
            // icono genérico de bandeja (antes `ic_inbox`) — Android SIEMPRE
            // renderiza el icono pequeño de la barra de estado en un solo
            // color (silueta), igual que hacen todas las apps (Instagram,
            // WhatsApp, etc.); es el comportamiento normal del sistema, no
            // una limitación de este cambio.
            .setSmallIcon(R.mipmap.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)

        // Avatar de quien interactuó — icono circular pequeño junto al
        // título (mismo lugar donde WhatsApp/Instagram muestran la foto del
        // remitente), visible tanto colapsada como expandida.
        if (avatarBitmap != null) builder.setLargeIcon(avatarBitmap)

        // Miniatura de la publicación implicada — imagen grande SOLO al
        // expandir la notificación (deslizar hacia abajo o mantener
        // pulsada), mismo patrón que usan las apps de fotos/redes sociales.
        if (postBitmap != null) {
            builder.setStyle(
                NotificationCompat.BigPictureStyle()
                    .bigPicture(postBitmap)
                    .setBigContentTitle(title)
                    .setSummaryText(body),
            )
        }

        runCatching {
            NotificationManagerCompat.from(this).notify(System.currentTimeMillis().toInt(), builder.build())
        }
    }
}
