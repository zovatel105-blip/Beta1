package com.twyk.app

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

// ─────────────────────────────────────────────────────────────────────────────
// Iconos personalizados de Twyk recreados como ImageVector para que la app
// NATIVA se vea IGUAL que la web:
//   · Vote  -> "papeleta marcada" (tick en forma de V). Igual que components/icons/VoteIcon.jsx
//   · Share -> flecha curva estilo TikTok. Igual que components/icons/ShareIcon.jsx
//   · Swords-> espadas cruzadas (lucide "swords"), usado en Retar y Batallas.
// El color se aplica con el `tint` del Icon (ColorFilter), por eso los paths se
// definen en negro: el tint los recolorea.
// ─────────────────────────────────────────────────────────────────────────────
object TwykIcons {

    // Path SÓLIDO (V relleno) -> estado "votado".
    private const val VOTE_SOLID =
        "M4303 4958 c-92 -87 -446 -436 -1361 -1343 -216 -215 -401 -394 -412 -399 -35 -16 -71 4 -163 92 -79 75 -155 145 -462 423 -22 20 -83 75 -135 123 -52 47 -103 86 -112 86 -17 0 -18 -80 -20 -1475 -2 -811 -2 -1480 0 -1485 9 -26 49 -3 134 78 51 48 156 146 233 217 77 71 167 155 200 186 33 30 125 116 205 189 80 74 172 159 204 189 33 31 96 90 140 131 44 41 114 107 156 145 41 39 106 100 145 135 38 36 113 106 165 156 52 49 239 225 415 389 686 641 719 676 778 831 22 59 22 63 25 733 3 682 2 690 -30 691 -4 0 -51 -41 -105 -92z"

    // Path OUTLINE (doble contorno) -> estado "sin votar".
    private const val VOTE_OUTLINE =
        "M4303 4958 c-92 -87 -446 -436 -1361 -1343 -216 -215 -401 -394 -412 -399 -35 -16 -71 4 -163 92 -79 75 -155 145 -462 423 -22 20 -83 75 -135 123 -52 47 -103 86 -112 86 -17 0 -18 -80 -20 -1475 -2 -811 -2 -1480 0 -1485 9 -26 49 -3 134 78 51 48 156 146 233 217 77 71 167 155 200 186 33 30 125 116 205 189 80 74 172 159 204 189 33 31 96 90 140 131 44 41 114 107 156 145 41 39 106 100 145 135 38 36 113 106 165 156 52 49 239 225 415 389 686 641 719 676 778 831 22 59 22 63 25 733 3 682 2 690 -30 691 -4 0 -51 -41 -105 -92z m99 35 c-6 -2 -9 -9 -6 -14 9 -15 8 -1269 -1 -1309 -11 -52 -84 -194 -114 -224 -14 -13 -81 -79 -148 -145 -68 -67 -123 -119 -123 -117 0 4 -16 -11 -161 -149 -46 -44 -114 -108 -152 -142 -37 -35 -64 -63 -61 -63 4 0 -9 -12 -28 -27 -19 -16 -46 -39 -60 -53 -14 -14 -74 -70 -133 -125 -94 -87 -153 -142 -313 -293 -19 -17 -39 -32 -44 -32 -4 0 -8 -7 -8 -17 0 -9 -2 -14 -5 -11 -6 5 -91 -71 -221 -197 -40 -38 -89 -83 -109 -98 -19 -16 -33 -33 -29 -38 3 -5 2 -8 -3 -7 -10 3 -33 -16 -122 -102 -149 -144 -221 -210 -221 -206 0 2 -31 -26 -68 -62 -38 -37 -113 -107 -167 -157 -55 -49 -128 -117 -163 -150 -36 -33 -72 -60 -81 -60 -9 0 -15 -7 -14 -15 1 -8 -19 -32 -43 -52 -25 -21 -42 -38 -38 -38 4 0 -7 -11 -26 -25 -19 -14 -38 -32 -43 -40 -4 -8 -13 -15 -20 -15 -9 0 -11 144 -10 622 2 343 3 994 3 1448 1 728 2 823 15 806 8 -11 15 -16 15 -10 0 5 5 1 11 -9 6 -9 15 -14 21 -11 6 4 8 3 5 -3 -4 -6 6 -19 21 -29 15 -9 33 -26 40 -36 7 -10 18 -16 23 -13 5 4 9 1 9 -4 0 -11 36 -51 45 -51 3 0 40 -34 82 -75 42 -40 81 -71 87 -68 6 3 8 2 3 -2 -4 -5 5 -17 20 -27 16 -10 24 -18 19 -18 -12 0 46 -45 59 -45 5 -1 9 -6 8 -13 -2 -6 9 -20 24 -29 15 -10 66 -56 113 -102 171 -168 210 -187 280 -136 19 14 31 25 27 25 -3 0 23 29 60 65 36 36 70 65 75 65 5 0 7 4 3 9 -3 5 4 12 15 16 11 4 18 11 15 16 -4 5 1 9 9 9 9 0 16 4 16 9 0 5 36 46 80 90 44 45 80 79 80 76 0 -3 8 3 18 13 11 9 18 20 16 23 -2 3 9 14 24 25 47 34 87 76 84 88 -2 6 -1 8 3 4 4 -4 40 27 80 69 48 49 78 72 86 68 7 -5 10 -4 6 2 -4 6 2 18 13 28 11 10 17 23 13 29 -3 6 -3 8 2 4 4 -4 16 2 26 14 11 11 19 17 19 12 0 -5 12 8 27 29 14 20 33 37 41 37 9 0 13 3 10 6 -7 7 302 314 315 314 6 0 7 3 4 6 -7 7 42 54 56 54 4 0 7 5 7 10 0 10 36 50 45 50 2 0 47 43 99 95 52 52 99 95 105 95 6 0 11 5 11 11 0 14 61 75 72 72 4 -2 8 1 8 6 0 11 212 225 237 240 10 6 23 10 28 10 6 0 4 -3 -3 -6z"

    // Flecha de compartir (TikTok). viewBox 24x24.
    private const val SHARE =
        "M21.6 12 L12.8 4.4 V8.6 C7.4 8.9 3.7 11.9 2.4 19 C5 15.2 8.2 13.9 12.8 13.9 V18.1 Z"

    // Espadas cruzadas (lucide "swords"). viewBox 24x24, trazo.
    private const val SWORDS =
        "M14.5 17.5 L3 6 L3 3 L6 3 L17.5 14.5 M13 19 L19 13 M16 16 L20 20 M19 21 L21 19 M14.5 6.5 L18 3 L21 3 L21 6 L17.5 9.5 M5 14 L9 18 M7 17 L4 20 M3 19 L5 21"

    private var voteSolid: ImageVector? = null
    private var voteOutline: ImageVector? = null
    private var share: ImageVector? = null
    private var swords: ImageVector? = null

    fun vote(filled: Boolean): ImageVector =
        if (filled) {
            voteSolid ?: buildVote(VOTE_SOLID, PathFillType.NonZero).also { voteSolid = it }
        } else {
            voteOutline ?: buildVote(VOTE_OUTLINE, PathFillType.EvenOdd).also { voteOutline = it }
        }

    val Share: ImageVector
        get() = share ?: ImageVector.Builder(
            name = "TwykShare",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            addPath(
                pathData = addPathNodes(SHARE),
                fill = null,
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 1.6f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }.build().also { share = it }

    val Swords: ImageVector
        get() = swords ?: ImageVector.Builder(
            name = "TwykSwords",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            addPath(
                pathData = addPathNodes(SWORDS),
                fill = null,
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 2f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }.build().also { swords = it }

    // El path original se define en un sistema de coordenadas grande con el
    // transform SVG "translate(0,600) scale(0.1,-0.1)". Lo replicamos con un
    // grupo (mismo orden: primero escala, luego traslada).
    private fun buildVote(path: String, fillType: PathFillType): ImageVector =
        ImageVector.Builder(
            name = "TwykVote",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 600f,
            viewportHeight = 600f,
        ).apply {
            group(
                scaleX = 0.1f,
                scaleY = -0.1f,
                translationX = 0f,
                translationY = 600f,
            ) {
                addPath(
                    pathData = addPathNodes(path),
                    pathFillType = fillType,
                    fill = SolidColor(Color.Black),
                )
            }
        }.build()
}
