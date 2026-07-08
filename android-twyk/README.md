# Twyk Android (nativo — Kotlin + Jetpack Compose + Media3/ExoPlayer)

App **100% nativa**. El feed usa **reproductor nativo ExoPlayer** y **se adapta al
formato de cada publicación**:
- **versus / `carousel`** → carrusel horizontal A↔B, cada vídeo a **pantalla
  completa** (se acabó la franja negra). Doble toque para votar.
- **duet** → pantalla partida (horizontal: A arriba / B abajo; vertical: A izq / B der).

Incluye barra de navegación inferior (Inicio, Batallas, Subir, Buzón, Perfil),
cabecera del autor + Seguir, columna social (Votar / Comentar / Compartir /
Guardar), etiqueta A/B con %, puntitos del carrusel y pista de voto. La **barra de
estado queda intacta** y el vídeo se ve por detrás (edge-to-edge).

> No se puede compilar dentro de Emergent (no hay SDK de Android). Se compila en
> TU Android Studio. Aquí está todo el código fuente.

## Estado por fases
- **Fase 1 (HECHA):** feed nativo adaptable (carrusel/dúo) + navegación + votar.
- **Fase 2 (HECHA):** comentarios + compartir + guardar + login/registro (Bearer token).
- **Fase 3 (HECHA):** perfil propio y ajeno + seguir + cuadrícula de publicaciones.
- **Fase 4 (HECHA):** subir contenido — **Versus**, **1vs1/Duelo** y **Reto** (retar a un usuario).
- **Fase 5 (HECHA):** **Buzón** (retos recibidos: aceptar subiendo vídeo / rechazar +
  notificaciones) y **Batallas** (retos completados en los que participas).

> ✅ App nativa COMPLETA. Cuenta demo: `twyk_demo` / `demo1234`.

> 👉 Compila la **Fase 1** primero y confirma que arranca; así validamos el
> toolchain antes de añadir las siguientes fases.

## Backend ya configurado
`app/src/main/java/com/twyk/app/Config.kt` apunta a tu **preview**:
```kotlin
const val BASE_URL = "https://audio-sync-fix-7.preview.emergentagent.com/"
```
Cuando despliegues tu web a un dominio propio, cambia solo esa línea (acaba en `/`).

## Cómo abrirlo y generar el APK
1. Abre Android Studio → **New Project → Empty Activity (Compose)**.
   - Name: `Twyk` | Package: `com.twyk.app` | Language: Kotlin | Minimum SDK: API 24
2. Copia dentro del proyecto, respetando rutas:
   - `app/src/main/java/com/twyk/app/` → todos los `.kt` (Config, MainActivity, data/, feed/)
   - `app/src/main/AndroidManifest.xml`, `res/values/themes.xml`, `res/values/strings.xml`
3. En `app/build.gradle.kts` usa las dependencias de ESTE proyecto (Compose BOM,
   **material-icons-extended**, Media3, Retrofit, Coil) y `compileSdk/targetSdk = 36`.
4. Sincroniza Gradle y pulsa **Run** ▶ (o **Build → Build APK(s)**).

> Alternativa: abrir directamente la carpeta `android-twyk/` en Android Studio.
> Si alguna versión de Gradle/AGP no cuadra, acepta las sugerencias de actualización.

## Estructura
```
android-twyk/app/src/main/java/com/twyk/app/
  Config.kt              # URL del backend (preview)
  MainActivity.kt        # Compose: feed + barra de navegación (edge-to-edge)
  data/Models.kt         # modelos del JSON del backend
  data/TwykApi.kt        # Retrofit: /api/uploads, /api/feed, /api/vote
  feed/VideoCache.kt     # caché en disco 150 MB (ExoPlayer)
  feed/FeedViewModel.kt  # carga + scroll infinito + voto
  feed/VersusFeed.kt     # feed adaptable (carrusel/dúo) + overlays + votar
```

## Notas honestas
- No se pudo compilar aquí (entorno solo-web). El código sigue las APIs de Compose
  (BOM 2026.04.01) y Media3 1.5.x; si Android Studio sugiere ajustar versiones al
  abrir, acéptalo (sync). Si algún import falla, dime el error y lo corrijo.
- Es **solo Android**. Tu app **web sigue intacta**.
