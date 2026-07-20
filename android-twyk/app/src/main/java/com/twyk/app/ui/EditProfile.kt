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
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
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
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.vectorResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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

// Pantalla "Edit profile" — réplica del EditProfileModal de ProfilePage.jsx:
// avatar (con recorte circular ajustable), nombre y bio. Guarda con
// POST /api/profile (multipart: name, bio, avatar?).
private const val CROP_DIAMETER_DP = 260
private const val MIN_CROP_SCALE = 1f
private const val MAX_CROP_SCALE = 4f
private const val CROP_OUTPUT_PX = 640

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
    var scale by remember(imageUri) { mutableStateOf(1f) }
    var offset by remember(imageUri) { mutableStateOf(Offset.Zero) }
    var saving by remember { mutableStateOf(false) }

    val cropDiameterPx = with(density) { CROP_DIAMETER_DP.dp.toPx() }

    LaunchedEffect(imageUri) {
        val decoded = withContext(Dispatchers.IO) { decodeOrientedBitmap(context, imageUri) }
        bitmap = decoded
        loadError = decoded == null
    }

    fun clamp(o: Offset, s: Float): Offset {
        val maxOffset = (cropDiameterPx * (s - 1f) / 2f).coerceAtLeast(0f)
        return Offset(o.x.coerceIn(-maxOffset, maxOffset), o.y.coerceIn(-maxOffset, maxOffset))
    }

    Box(Modifier.fillMaxSize().background(Color.White)) {
        Column(Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxWidth().statusBarsPadding().height(72.dp), contentAlignment = Alignment.Center) {
                Text("Crop", color = Color.Black, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
            }

            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                val bmp = bitmap
                when {
                    bmp != null -> {
                        Box(
                            Modifier
                                .size(CROP_DIAMETER_DP.dp)
                                .clip(CircleShape)
                                .border(3.dp, Color(0xFFE5E7EB), CircleShape)
                                .pointerInput(imageUri) {
                                    detectTransformGestures { _, pan, zoom, _ ->
                                        val newScale = (scale * zoom).coerceIn(MIN_CROP_SCALE, MAX_CROP_SCALE)
                                        scale = newScale
                                        offset = clamp(offset + pan, newScale)
                                    }
                                },
                        ) {
                            Image(
                                bitmap = bmp.asImageBitmap(),
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .fillMaxSize()
                                    .graphicsLayer(
                                        scaleX = scale,
                                        scaleY = scale,
                                        translationX = offset.x,
                                        translationY = offset.y,
                                    ),
                            )
                        }
                    }
                    loadError -> Text("No se pudo cargar la imagen", color = Color(0xFF71717A), fontSize = 14.sp)
                    else -> CircularProgressIndicator(color = Color.Black, strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
                }
            }

            Row(
                Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 24.dp, vertical = 24.dp),
                horizontalArrangement = Arrangement.Center,
            ) {
                Box(
                    Modifier.weight(1f).widthIn(max = 150.dp).height(52.dp).clip(RoundedCornerShape(14.dp))
                        .background(Color(0xFFE5E7EB)).clickable { onCancel() },
                    contentAlignment = Alignment.Center,
                ) { Text("Cancel", color = Color.Black, fontWeight = FontWeight.Medium, fontSize = 15.sp) }
                Spacer(Modifier.width(16.dp))
                Box(
                    Modifier.weight(1f).widthIn(max = 150.dp).height(52.dp).clip(RoundedCornerShape(14.dp))
                        .background(Color(0xFFB061FF))
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
                    if (saving) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                    else Text("Save", color = Color.White, fontWeight = FontWeight.Medium, fontSize = 15.sp)
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
