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
    // Réplica del mismo mecanismo (ver comentario de arriba) para el visor de
    // publicaciones abierto desde el GRID del perfil (propio/ajeno) — BUG
    // reportado por el usuario: la barra de navegación inferior seguía
    // visible al abrir una publicación del grid, tapando/compitiendo con la
    // nueva barra de "Añadir comentario" (QuickCommentInput), a diferencia
    // de la web (Feed.jsx: `<BottomNav>` se oculta por completo vía
    // `onPostViewerChange` mientras el visor esté abierto).
    var profileViewerOpen by mutableStateOf(false)
    // Réplica del mismo mecanismo para el panel de Ajustes del perfil propio
    // (icono ☰ -> ProfileMenuSheet, ui/ProfileMenu.kt) — BUG reportado por el
    // usuario: el panel (deslizado desde el borde derecho) se pintaba DEBAJO
    // de la barra de navegación inferior en vez de por encima. En la web,
    // SettingsDrawer también es un overlay `fixed inset-0 z-[85]`, y
    // ProfilePage.jsx eleva su PROPIO contenedor a `z-[90]` mientras
    // `menuOpen` es true (línea ~738 de ProfilePage.jsx) — precisamente para
    // quedar por encima de <BottomNav> (z-50). El nativo no tiene un concepto
    // continuo de z-index, así que el equivalente exacto es ocultar la barra
    // de navegación mientras este panel esté abierto (mismo resultado visual
    // final: el panel queda "por encima", ya que no hay nada que lo tape).
    var settingsOpen by mutableStateOf(false)
}
