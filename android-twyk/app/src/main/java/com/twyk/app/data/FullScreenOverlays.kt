package com.twyk.app.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

// Señaliza a MainActivity cuándo hay una pantalla A PANTALLA COMPLETA abierta
// DENTRO de otra pestaña (p.ej. "Edit profile" y su recorte circular de
// avatar anidado, ambos dentro de ProfileScreen -> ver ui/Profile.kt /
// ui/EditProfile.kt) que debe OCULTAR la barra de navegación inferior — igual
// que ya hace `showBottomNav` en MainActivity.kt con Subir/Buzón/Buscador/
// Batallas>Activos. BUG reportado por el usuario: la barra de navegación
// (declarada DESPUÉS del contenido de la pestaña activa dentro del mismo Box
// de MainActivity) se sigue pintando ENCIMA de EditProfileScreen/el recorte
// circular aunque sean fullscreen, porque el orden de dibujado en Compose
// depende del orden de DECLARACIÓN de los hijos directos de un Box, no de
// cuán "por encima" parezca estar el contenido dentro de su propio árbol
// anidado (misma causa raíz que FeedOverlays.kt, ver comentario ahí). En la
// web esto nunca ocurre porque EditProfileModal/CircularCrop son overlays
// `fixed inset-0` con z-index muy alto (82/95), sin ningún concepto de "barra
// de navegación inferior persistente" que puedan tapar.
object FullScreenOverlays {
    var editProfileOpen by mutableStateOf(false)
}
