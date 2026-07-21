package com.twyk.app.data

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

// Estado global de los overlays "modales" que se abren DESDE DENTRO del feed
// (Más opciones ⋮, Compartir, tarjeta de Ganador tras votar) — ver
// feed/VersusFeed.kt. MOTIVO DEL FIX (pedido por el usuario: "todos los
// modales... deben estar por encima de la barra de navegación inferior, solo
// en el feed"): estos overlays vivían como estado LOCAL dentro de
// SocialRail/CarouselPage/DuetPage, varios niveles anidados DENTRO del
// VerticalPager del feed. En Compose, el orden de dibujado entre los HIJOS
// DIRECTOS de un mismo Box depende del orden de DECLARACIÓN, no de cuán
// anidado esté el contenido: como TwykBottomNav (MainActivity.kt) se declara
// DESPUÉS de "VersusFeed(...)" dentro del mismo Box raíz, la barra de
// navegación se dibujaba SIEMPRE por encima de estos overlays (tapaba su
// parte inferior), sin importar que estuvieran anidados muchos niveles más
// adentro. En la web el equivalente no tiene este problema porque
// OptionsModal.jsx/ShareModal.jsx usan z-[70]+ (por encima de la barra, que
// es z-50) y VSWinnerCard.jsx usa un PORTAL a document.body.
//
// FIX: el estado se eleva a este singleton observable (mismo patrón YA usado
// en este proyecto por ChallengeBanner/UploadQueue, ver UploadQueue.kt) y
// MainActivity renderiza el contenido real como HERMANO de TwykBottomNav pero
// DESPUÉS de él en el mismo Box — igual que ya hace con CommentsSheet/
// AuthSheet, que por eso nunca tuvieron este problema.
data class MoreOptionsRequest(
    val postId: String,
    val targetUsername: String?,
    val isOwnPost: Boolean,
)

data class WinnerRequest(
    val postId: String,
    val votedSide: String,
    val chosenSide: Side?,
    val otherSide: Side?,
    val votes: Votes,
    val onShare: () -> Unit,
    val onComments: () -> Unit,
    val onClose: () -> Unit,
    val onNext: () -> Unit,
)

object FeedOverlays {
    var moreOptions by mutableStateOf<MoreOptionsRequest?>(null)
        private set
    var share by mutableStateOf<String?>(null)
        private set
    var winner by mutableStateOf<WinnerRequest?>(null)
        private set

    fun openMoreOptions(req: MoreOptionsRequest) { moreOptions = req }
    fun closeMoreOptions() { moreOptions = null }

    fun openShare(postId: String) { share = postId }
    fun closeShare() { share = null }

    // El emisor (CarouselPage/DuetPage) sigue siendo la fuente de verdad de
    // "¿está votada esta tarjeta / debe pausarse el vídeo?" (estado local
    // `showWinner`); esto solo refleja ESE estado hacia fuera para poder
    // pintarlo por encima de la barra de navegación. Por eso `showWinner` y
    // `closeWinnerFor` comprueban el postId: evita que una tarjeta ya
    // reciclada/descartada borre por error el overlay de otra distinta.
    fun showWinner(req: WinnerRequest) { winner = req }
    fun closeWinnerFor(postId: String) { if (winner?.postId == postId) winner = null }
}
