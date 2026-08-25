package com.twyk.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.media.ExifInterface
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas as ComposeCanvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.twyk.app.data.ProfileUser
import com.twyk.app.data.RetrofitProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.io.FileOutputStream
import kotlin.math.roundToInt
import kotlin.math.sqrt

// Pantalla "Edit profile" — réplica del EditProfileModal de ProfilePage.jsx:
// avatar (con recorte circular ajustable), nombre y bio. Guarda con
// POST /api/profile (multipart: name, bio, avatar?).
// CROP_DIAMETER_DP=330 (antes 260): réplica EXACTA de CANVAS_SIZE=330 (px) en
// components/CircularCrop.jsx — el círculo de recorte nativo se veía
// notablemente más pequeño que el de la web (260/~380dp de ancho típico de
// pantalla ≈65% vs 330/390px ≈85% en la web), reportado por el usuario como
// "el diseño del crop debe ser igual al de la web".
private const val CROP_DIAMETER_DP = 330
// `MIN_CROP_SCALE`=1 es un multiplicador RELATIVO sobre `baseCoverScale`
// (calculado más abajo a partir del tamaño real del bitmap, réplica de
// `getMinCoverScale` en CircularCrop.jsx) — 1 = "recién cubre el círculo,
// sin zoom extra". `MAX_ABSOLUTE_SCALE`=4 es la escala ABSOLUTA máxima
// (píxeles del bitmap -> píxeles de pantalla), idéntica a `MAX_SCALE` de la
// web.
private const val MIN_CROP_SCALE = 1f
private const val MAX_ABSOLUTE_SCALE = 4f
// 660 = CANVAS_SIZE(330) * resolutionMultiplier(2) en CircularCrop.jsx (misma
// resolución de exportación exacta que la web).
private const val CROP_OUTPUT_PX = 660

@Composable
fun EditProfileScreen(
    initial: ProfileUser,
    onClose: () -> Unit,
    onSaved: (ProfileUser) -> Unit,
) {
    val scope = rememberCoroutineScope()

    var name by remember { mutableStateOf(initial.name ?: initial.username ?: "") }
    var bio by remember { mutableStateOf(initial.bio ?: "") }
    var remoteAvatarUrl by remember { mutableStateOf(initial.avatarUrl) }
    var croppedFile by remember { mutableStateOf<File?>(null) }
    var rawImageUri by remember { mutableStateOf<Uri?>(null) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) rawImageUri = uri
    }

    fun handleSave() {
        if (saving) return
        saving = true
        error = null
        scope.launch {
            try {
                val avatarPart: MultipartBody.Part? = croppedFile?.let { f ->
                    MultipartBody.Part.createFormData(
                        "avatar", f.name, f.asRequestBody("image/jpeg".toMediaTypeOrNull())
                    )
                }
                val res = RetrofitProvider.api.updateProfile(
                    name.toRequestBody("text/plain".toMediaTypeOrNull()),
                    bio.toRequestBody("text/plain".toMediaTypeOrNull()),
                    avatarPart,
                )
                if (res.ok && res.user != null) {
                    onSaved(res.user)
                } else {
                    error = "Couldn't save. Please try again."
                }
            } catch (e: Exception) {
                error = "Couldn't save. Please try again."
            } finally {
                saving = false
            }
        }
    }

    Box(Modifier.fillMaxSize().background(TwykBg)) {
        Column(Modifier.fillMaxSize()) {
            // ── Header: Cancelar / título / Guardar ──
            Row(
                Modifier.fillMaxWidth().statusBarsPadding().height(56.dp).padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(40.dp).clip(CircleShape).clickable { onClose() }, contentAlignment = Alignment.Center) {
                    Icon(ImageVector.vectorResource(com.twyk.app.R.drawable.ic_x), "cancelar", tint = Color.White, modifier = Modifier.size(20.dp))
                }
                Text(
                    "Edit profile", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp,
                    modifier = Modifier.weight(1f), textAlign = TextAlign.Center,
                )
                Box(
                    Modifier.height(32.dp).clip(RoundedCornerShape(50)).background(Color.White)
                        .clickable(enabled = !saving) { handleSave() }
                        .padding(horizontal = 16.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    if (saving) {
                        CircularProgressIndicator(color = Color.Black, strokeWidth = 2.dp, modifier = Modifier.size(14.dp))
                    } else {
                        Text("Save", color = Color.Black, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    }
                }
            }

            Column(
                Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 8.dp),
            ) {
                // ── Avatar ──
                Column(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    val currentCropped = croppedFile
                    Box(
                        Modifier.size(104.dp).clip(CircleShape).background(Color(0xFF18181B))
                            .border(2.dp, Color.White.copy(alpha = 0.10f), CircleShape)
                            .clickable { pickImage.launch("image/*") },
                    ) {
                        if (currentCropped != null) {
                            AsyncImage(model = currentCropped, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                        } else {
                            TwykAvatar(remoteAvatarUrl, Modifier.fillMaxSize())
                        }
                        Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)), contentAlignment = Alignment.Center) {
                            Icon(ImageVector.vectorResource(com.twyk.app.R.drawable.ic_camera), null, tint = Color.White, modifier = Modifier.size(22.dp))
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Change photo", color = Color.White.copy(alpha = 0.9f), fontWeight = FontWeight.SemiBold, fontSize = 13.sp,
                        modifier = Modifier.clickable { pickImage.launch("image/*") },
                    )
                }

                Spacer(Modifier.height(28.dp))
                Text("Name", color = Color(0xFF71717A), fontSize = 12.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = 4.dp, bottom = 6.dp))
                Box(
                    Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(12.dp))
                        .background(Color.White.copy(alpha = 0.05f))
                        .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 16.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (name.isEmpty()) Text("Your name", color = Color(0xFF71717A), fontSize = 15.sp)
                    BasicTextField(
                        value = name,
                        onValueChange = { if (it.length <= 60) name = it },
                        singleLine = true,
                        textStyle = TextStyle(color = Color.White, fontSize = 15.sp),
                        cursorBrush = SolidColor(Color.White),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                Spacer(Modifier.height(20.dp))
                Text("Bio", color = Color(0xFF71717A), fontSize = 12.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = 4.dp, bottom = 6.dp))
                Box(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                        .background(Color.White.copy(alpha = 0.05f))
                        .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                ) {
                    if (bio.isEmpty()) Text("Tell the world who you are", color = Color(0xFF71717A), fontSize = 15.sp)
                    BasicTextField(
                        value = bio,
                        onValueChange = { if (it.length <= 300) bio = it },
                        textStyle = TextStyle(color = Color.White, fontSize = 15.sp),
                        cursorBrush = SolidColor(Color.White),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 88.dp),
                    )
                }
                Text(
                    "${bio.length}/300", color = Color(0xFF71717A), fontSize = 11.sp,
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp, end = 4.dp), textAlign = TextAlign.End,
                )

                error?.let {
                    Spacer(Modifier.height(16.dp))
                    Text(it, color = Color(0xFFFB7185), fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
                }
                Spacer(Modifier.height(24.dp))
            }
        }

        // Recorte circular al elegir una nueva foto (se dibuja encima de todo).
        rawImageUri?.let { uri ->
            CircularCropOverlay(
                imageUri = uri,
                onCancel = { rawImageUri = null },
                onCropped = { file ->
                    croppedFile = file
                    rawImageUri = null
                },
            )
        }
    }
}

// ── Recorte circular (equivalente nativo de components/CircularCrop.jsx) ──────
// Título "Crop" arriba, imagen dentro de un círculo (arrastrar para mover,
// pellizcar para zoom) y botones Cancel / Save abajo. Sin botón X ni controles
// de zoom extra (igual que la versión final acordada en la web).
//
// HISTORIAL DE BUGS (réplica "100% igual a la web" pedida por el usuario):
// (1) "no puedo moverla, solo puedo hacer zoom" — ya corregido en una ronda
// anterior (`baseCoverScale`/`clamp` calculados sobre el tamaño real del
// bitmap, ver esas funciones más abajo, sin cambios).
// (2) "no puedo moverlo a mi gusto izquierda-derecha arriba-abajo" +
// "cuando subo una imagen que debería rellenar el círculo no lo rellena":
// CAUSA — `detectTransformGestures` (usado antes aquí) calcula pan+zoom
// SIMULTÁNEAMENTE a partir del centroide/distancia de TODOS los punteros
// activos, sin importar cuántos haya. La web, en cambio, tiene 2 manejadores
// TOTALMENTE separados (`handleTouchStart`/`handleTouchMove` en
// CircularCrop.jsx): con 1 dedo SOLO mueve (pan), con 2 dedos SOLO hace zoom
// (el pan se ignora por completo mientras haya 2 dedos). Con
// `detectTransformGestures`, al pellizcar con 2 dedos el pequeño movimiento
// del centroide entre ambos también se aplicaba como pan, y por la
// naturaleza de cómo la mano sostiene el gesto, un intento de "solo mover"
// con un dedo podía registrar micro-variaciones de escala si el segundo
// dedo tocaba por accidente — sensación de que "no se puede mover a gusto"
// (el desplazamiento real y el previsto no coincidían) y, si la escala
// fluctuaba por debajo de `baseCoverScale` en algún instante, el límite de
// `clamp()` se recalculaba con una imagen efectivamente más pequeña,
// pudiendo dejar un borde del círculo temporalmente sin cubrir. FIX: gesto
// de bajo nivel escrito a mano (`awaitEachGesture`) que replica EXACTAMENTE
// la separación de la web — mientras haya EXACTAMENTE 1 puntero activo, solo
// se aplica pan (delta de posición de ESE dedo); en cuanto hay 2+ punteros,
// el pan se ignora por completo y solo se aplica zoom (a partir de la razón
// de distancia entre los 2 primeros punteros, igual que `getTouchDistance`
// + `scaleChange` de la web). ADEMÁS, el renderizado pasó de un
// `Image`+`ContentScale`+`Modifier.size(dp)`+`graphicsLayer` (con varias
// conversiones px<->dp de por medio) a un `Canvas` que dibuja la imagen con
// `drawImage(dstOffset, dstSize)` en PÍXELES EXACTOS calculados con la MISMA
// fórmula que ya usaba `exportCircularCrop` (recorte final) — elimina
// cualquier redondeo/conversión intermedia entre la vista previa y el
// resultado exportado, y garantiza matemáticamente que la imagen SIEMPRE
// cubre el círculo por completo (mismo principio "cover" que `getMinCoverScale`
// de la web, ahora aplicado de forma idéntica en la vista previa y en el
// export).
@Composable
private fun CircularCropOverlay(
    imageUri: Uri,
    onCancel: () -> Unit,
    onCropped: (File) -> Unit,
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()

    var bitmap by remember(imageUri) { mutableStateOf<Bitmap?>(null) }
    var loadError by remember(imageUri) { mutableStateOf(false) }
    // `scale` es un multiplicador RELATIVO sobre `baseCoverScale` (1 = recién
    // cubre el círculo, igual semántica que la web). `offset` sigue en
    // píxeles de PANTALLA (no de bitmap), igual que antes.
    var scale by remember(imageUri) { mutableStateOf(1f) }
    var offset by remember(imageUri) { mutableStateOf(Offset.Zero) }
    var saving by remember { mutableStateOf(false) }

    val cropDiameterPx = with(density) { CROP_DIAMETER_DP.dp.toPx() }

    LaunchedEffect(imageUri) {
        val decoded = withContext(Dispatchers.IO) { decodeOrientedBitmap(context, imageUri) }
        bitmap = decoded
        loadError = decoded == null
        scale = 1f
        offset = Offset.Zero
    }

    // Escala "cover" real (píxeles de bitmap -> píxeles de pantalla) que hace
    // que la imagen cubra el círculo por completo en AMBOS ejes — solo el eje
    // más corto queda exacto, el otro sobra (y por tanto se puede arrastrar en
    // él incluso sin zoom extra). Réplica exacta de `getMinCoverScale`.
    val baseCoverScale = remember(bitmap, cropDiameterPx) {
        val bmp = bitmap
        if (bmp == null || bmp.width <= 0 || bmp.height <= 0) 1f
        else maxOf(cropDiameterPx / bmp.width.toFloat(), cropDiameterPx / bmp.height.toFloat())
    }

    // Límite de arrastre real (réplica de `clampPosition`): calculado sobre
    // la escala ABSOLUTA (baseCoverScale * scale) y el tamaño real del
    // bitmap, no sobre `scale` a solas.
    fun clamp(o: Offset, relativeScale: Float): Offset {
        val bmp = bitmap ?: return Offset.Zero
        val effectiveScale = baseCoverScale * relativeScale
        val scaledW = bmp.width * effectiveScale
        val scaledH = bmp.height * effectiveScale
        val radius = cropDiameterPx / 2f
        val maxOffsetX = maxOf(0f, (scaledW / 2f) - radius)
        val maxOffsetY = maxOf(0f, (scaledH / 2f) - radius)
        return Offset(o.x.coerceIn(-maxOffsetX, maxOffsetX), o.y.coerceIn(-maxOffsetY, maxOffsetY))
    }

    Box(Modifier.fillMaxSize().background(Color.White)) {
        Column(Modifier.fillMaxSize()) {
            // Cabecera: título "Crop" centrado, SIN botón (el Cancel vive en el
            // footer) — réplica exacta de CircularCrop.jsx (`py-6` + `text-2xl
            // font-semibold`). Altura DINÁMICA (ya no fija a 72dp: con una barra
            // de estado más alta de lo normal el texto podía quedar recortado
            // dentro de una caja de tamaño fijo, algo que la web nunca sufre al
            // ser su alto siempre el del propio contenido + padding).
            Box(
                Modifier.fillMaxWidth().statusBarsPadding().padding(vertical = 20.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text("Crop", color = Color.Black, fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
            }

            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                val bmp = bitmap
                when {
                    bmp != null -> {
                        Box(
                            Modifier
                                .size(CROP_DIAMETER_DP.dp)
                                .clip(CircleShape)
                                // rgba(229,231,235,0.8) en CircularCrop.jsx — el borde nativo
                                // usaba el mismo gris pero SIN la transparencia del 80%.
                                .border(3.dp, Color(0xFFE5E7EB).copy(alpha = 0.8f), CircleShape)
                                .pointerInput(imageUri, baseCoverScale) {
                                    // Réplica EXACTA de handleTouchStart/handleTouchMove de la
                                    // web: con 1 puntero SOLO se mueve (pan); con 2+ punteros SOLO
                                    // se hace zoom (el pan se ignora por completo mientras haya 2+).
                                    awaitEachGesture {
                                        var lastDistance = 0f
                                        var lastPositions = emptyMap<Long, Offset>()
                                        do {
                                            val event = awaitPointerEvent()
                                            val pressed = event.changes.filter { it.pressed }
                                            when {
                                                pressed.size == 1 -> {
                                                    val p = pressed[0]
                                                    val prev = lastPositions[p.id.value]
                                                    if (prev != null) {
                                                        offset = clamp(offset + (p.position - prev), scale)
                                                    }
                                                    lastDistance = 0f
                                                }
                                                pressed.size >= 2 -> {
                                                    val p1 = pressed[0]
                                                    val p2 = pressed[1]
                                                    val dx = p1.position.x - p2.position.x
                                                    val dy = p1.position.y - p2.position.y
                                                    val distance = sqrt(dx * dx + dy * dy)
                                                    if (lastDistance > 0f) {
                                                        val maxRelative = (MAX_ABSOLUTE_SCALE / baseCoverScale.coerceAtLeast(0.0001f))
                                                            .coerceAtLeast(MIN_CROP_SCALE)
                                                        val scaleChange = distance / lastDistance
                                                        val newScale = (scale * scaleChange).coerceIn(MIN_CROP_SCALE, maxRelative)
                                                        offset = clamp(offset, newScale)
                                                        scale = newScale
                                                    }
                                                    lastDistance = distance
                                                }
                                            }
                                            lastPositions = pressed.associate { it.id.value to it.position }
                                            event.changes.forEach { if (it.positionChanged()) it.consume() }
                                        } while (pressed.isNotEmpty())
                                    }
                                },
                        ) {
                            ComposeCanvas(Modifier.fillMaxSize()) {
                                val effectiveScale = baseCoverScale * scale
                                val w = bmp.width * effectiveScale
                                val h = bmp.height * effectiveScale
                                val left = size.width / 2f - w / 2f + offset.x
                                val top = size.height / 2f - h / 2f + offset.y
                                drawImage(
                                    image = bmp.asImageBitmap(),
                                    dstOffset = IntOffset(left.roundToInt(), top.roundToInt()),
                                    dstSize = IntSize(w.roundToInt().coerceAtLeast(1), h.roundToInt().coerceAtLeast(1)),
                                )
                            }
                        }
                    }
                    loadError -> Text("No se pudo cargar la imagen", color = Color(0xFF71717A), fontSize = 14.sp)
                    else -> CircularProgressIndicator(color = Color.Black, strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
                }
            }

            // Footer: Cancel (pastilla blanca, borde negro) + Save (pastilla
            // negra, texto blanco) — réplica EXACTA de CircularCrop.jsx (pedido
            // explícito del usuario: "el diseño del crop debe ser igual al de
            // la web"; antes el nativo usaba esquinas redondeadas de 14dp -no
            // pastilla completa- y colores gris/púrpura en vez de blanco/negro
            // -misma paridad que ya se corrigió solo en la web en una sesión
            // anterior, nunca se replicó aquí-).
            Row(
                Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 24.dp, vertical = 24.dp),
                horizontalArrangement = Arrangement.Center,
            ) {
                Box(
                    Modifier.weight(1f).widthIn(max = 150.dp).height(52.dp).clip(RoundedCornerShape(50))
                        .background(Color.White)
                        .border(2.dp, Color.Black, RoundedCornerShape(50))
                        .clickable { onCancel() },
                    contentAlignment = Alignment.Center,
                ) { Text("Cancel", color = Color.Black, fontWeight = FontWeight.SemiBold, fontSize = 15.sp) }
                Spacer(Modifier.width(16.dp))
                Box(
                    Modifier.weight(1f).widthIn(max = 150.dp).height(52.dp).clip(RoundedCornerShape(50))
                        .background(Color.Black)
                        .clickable(enabled = bitmap != null && !saving) {
                            val current = bitmap ?: return@clickable
                            saving = true
                            scope.launch {
                                val file = withContext(Dispatchers.IO) {
                                    exportCircularCrop(context, current, scale, offset, cropDiameterPx)
                                }
                                saving = false
                                onCropped(file)
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    // Web muestra el texto "Saving..." (sin spinner) mientras
                    // guarda — réplica exacta en vez del spinner que había antes.
                    Text(if (saving) "Saving..." else "Save", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                }
            }
        }
    }
}

// Decodifica el bitmap desde el Uri elegido y corrige la rotación EXIF (fotos
// de cámara que vienen "de lado" si no se corrigen).
private fun decodeOrientedBitmap(context: Context, uri: Uri): Bitmap? = try {
    val resolver = context.contentResolver
    val original = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
    if (original == null) {
        null
    } else {
        val orientation = resolver.openInputStream(uri)?.use { stream ->
            runCatching { ExifInterface(stream).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
                .getOrDefault(ExifInterface.ORIENTATION_NORMAL)
        } ?: ExifInterface.ORIENTATION_NORMAL
        val degrees = when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
        if (degrees == 0f) {
            original
        } else {
            val matrix = Matrix().apply { postRotate(degrees) }
            Bitmap.createBitmap(original, 0, 0, original.width, original.height, matrix, true)
        }
    }
} catch (e: Exception) {
    null
}

// Renderiza el recorte circular final a alta resolución (independiente del
// tamaño en pantalla) y lo guarda como JPEG temporal listo para subir.
private fun exportCircularCrop(
    context: Context,
    bitmap: Bitmap,
    scale: Float,
    offset: Offset,
    displayDiameterPx: Float,
): File {
    val outSize = CROP_OUTPUT_PX
    val output = Bitmap.createBitmap(outSize, outSize, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(output)
    val clipPath = Path().apply { addCircle(outSize / 2f, outSize / 2f, outSize / 2f, Path.Direction.CW) }
    canvas.clipPath(clipPath)

    val bw = bitmap.width.toFloat()
    val bh = bitmap.height.toFloat()
    val baseCoverScale = maxOf(outSize / bw, outSize / bh)
    val finalScale = baseCoverScale * scale
    val scaledW = bw * finalScale
    val scaledH = bh * finalScale
    val ratio = outSize / displayDiameterPx
    val imgX = outSize / 2f - scaledW / 2f + offset.x * ratio
    val imgY = outSize / 2f - scaledH / 2f + offset.y * ratio

    val matrix = Matrix().apply {
        postScale(finalScale, finalScale)
        postTranslate(imgX, imgY)
    }
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    canvas.drawBitmap(bitmap, matrix, paint)

    val file = File.createTempFile("twyk_avatar_", ".jpg", context.cacheDir)
    FileOutputStream(file).use { out -> output.compress(Bitmap.CompressFormat.JPEG, 92, out) }
    return file
}
