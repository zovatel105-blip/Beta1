package com.twyk.app.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

// BUG reportado por el usuario ("cuando cierro la aplicación y la mantengo
// en segundo plano... el audio sigue reproduciéndose aunque no esté dentro
// de la aplicación nativa"): a diferencia de la web (que pausa TODO al
// detectar `document.visibilitychange` -> `document.hidden`, ver `onVis` en
// Feed.jsx), el nativo no tenía NINGÚN concepto global de "la app está en
// segundo plano" — cada reproductor (feed principal, "Batallas > Retos
// activos", vista previa de subida) solo decidía reproducir/pausar según su
// propia visibilidad LOCAL (qué página del pager está centrada, qué lado del
// carrusel se ve), algo que NO cambia al enviar la app a Home/cambiar de app/
// apagar pantalla -> el audio de lo que estuviera activo en ese momento
// seguía sonando indefinidamente de fondo.
//
// FIX: un único singleton observable, actualizado UNA sola vez desde
// MainActivity (onStop/onStart de la Activity — único Activity de la app,
// equivalente exacto a "visibilitychange" en una SPA de una sola pestaña).
// Cada composable que decide si un ExoPlayer reproduce audio (FeedPager en
// feed/VersusFeed.kt, ChallengeMediaBox en ui/Battles.kt, la vista previa de
// ui/Upload.kt) combina su propia condición de visibilidad LOCAL con
// `AppLifecycle.inForeground`, replicando exactamente `effectivePlayback =
// playbackEnabled && !overlayOpen` de Feed.jsx.
object AppLifecycle {
    var inForeground by mutableStateOf(true)

    // BUG reportado por el usuario ("las publicaciones siguen reproduciendo
    // el audio cuando me dirijo a un perfil ajeno"): `inForeground` (arriba)
    // solo replica la mitad de `effectivePlayback = playbackEnabled &&
    // !overlayOpen` de Feed.jsx — la parte de "la app entera está en
    // segundo plano" (onStop/onStart de la Activity), pero NUNCA la parte de
    // "otra PANTALLA cubre el feed mientras la app sigue en primer plano"
    // (perfil ajeno, buscador, reto rápido, comentarios, login/registro —
    // en la web esto es `profileOpen || searchOpen || ... || authOpen`,
    // ver Feed.jsx). El perfil ajeno se pinta como un OVERLAY sobre el
    // propio `VersusFeed` (que sigue montado debajo, para poder volver
    // exactamente a la misma posición de scroll al cerrarlo) — sin esta
    // señal, `FeedPager` (feed/VersusFeed.kt) no tenía ninguna forma de
    // saber que debía pausarse mientras esa pantalla está encima.
    // Actualizado desde MainActivity/TwykApp() con un `SideEffect` que
    // combina todos los overlays de nivel superior que cubren el feed.
    var overlayOpen by mutableStateOf(false)
}
