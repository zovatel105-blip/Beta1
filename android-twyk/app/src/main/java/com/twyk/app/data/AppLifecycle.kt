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
}
