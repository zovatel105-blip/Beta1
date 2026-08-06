package com.twyk.app.push

import android.app.PendingIntent
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
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

    // NUEVA FEATURE (usuario: "el logo... adaptarlo si es un círculo cuadrado
    // etc"): recorta el avatar SIEMPRE en un círculo perfecto antes de
    // pasarlo a `setLargeIcon`, en vez de confiar en que cada launcher/
    // versión de Android lo enmascare igual — algunos OEM no aplican ninguna
    // máscara y mostraban el avatar recortado a lo bruto en forma
    // cuadrada/rectangular. Recorta primero al CUADRADO central más grande
    // posible (por si el avatar de origen no es cuadrado) y luego aplica una
    // máscara circular con `PorterDuff.Mode.SRC_IN` (mismo principio que
    // `CircularCrop.jsx`/`TwykAvatar` en el resto de la app, aplicado aquí a
    // mano porque las notificaciones no tienen acceso a Compose/Coil).
    private fun cropToCircle(bitmap: Bitmap): Bitmap {
        val size = minOf(bitmap.width, bitmap.height)
        val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val rectF = RectF(0f, 0f, size.toFloat(), size.toFloat())
        canvas.drawOval(rectF, paint)
        paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
        val srcLeft = (bitmap.width - size) / 2
        val srcTop = (bitmap.height - size) / 2
        val srcRect = Rect(srcLeft, srcTop, srcLeft + size, srcTop + size)
        val dstRect = Rect(0, 0, size, size)
        canvas.drawBitmap(bitmap, srcRect, dstRect, paint)
        return output
    }

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
            // Logo REAL de la app, pero como silueta MONOCROMA dedicada
            // (res/drawable-*dpi/ic_notification_logo.png) en vez de la capa
            // "foreground" completa del ícono adaptativo — esa capa incluye
            // el resplandor/glow difuso del logo (degradado de transparencia
            // gradual), que a 24dp en la barra de estado se veía como una
            // mancha borrosa en vez de la marca nítida. Este recurso nuevo
            // se generó (con Pillow) umbralizando el canal alpha del mismo
            // ícono original para aislar SOLO la silueta sólida de la marca,
            // descartando el halo — mismo logo, reconocible y nítido incluso
            // en tamaño pequeño. Android sigue renderizándolo en un solo
            // color (blanco), igual que hacen todas las apps.
            .setSmallIcon(R.drawable.ic_notification_logo)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)

        // Avatar de quien interactuó — icono circular pequeño junto al
        // título (mismo lugar donde WhatsApp/Instagram muestran la foto del
        // remitente), visible tanto colapsada como expandida. Recortado a
        // círculo explícitamente (ver cropToCircle) para que se vea igual
        // en cualquier dispositivo/launcher, sin depender del enmascarado
        // automático del sistema.
        if (avatarBitmap != null) builder.setLargeIcon(runCatching { cropToCircle(avatarBitmap) }.getOrDefault(avatarBitmap))

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
