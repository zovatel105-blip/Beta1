# Twyk Android (app nativa — Kotlin + Jetpack Compose)

App nativa de Android con **reproductor nativo Media3/ExoPlayer**, feed vertical
tipo TikTok y publicaciones **1vs1 (2 videos por pagina)** con votacion. Usa la
misma tecnica que `compose-reels` (ExoPlayer + **cache en disco 150 MB** +
**precarga del vecino** con `beyondViewportPageCount`), adaptada a 2 videos por
pagina. Reutiliza tu **backend Next.js** existente.

> No se puede compilar dentro de Emergent (no hay SDK de Android). Se compila en
> TU Android Studio. Aqui esta todo el codigo fuente.

## Forma recomendada de abrirlo (la mas fiable)
Como las versiones exactas de Gradle/AGP dependen de tu Android Studio, lo mas
seguro es:

1. Abre Android Studio -> **New Project -> Empty Activity (Compose)**.
   - Name: `Twyk`  | Package name: `com.twyk.app`  | Language: Kotlin
   - Minimum SDK: API 24
2. Copia DENTRO del proyecto recien creado, respetando rutas:
   - `app/src/main/java/com/twyk/app/`  -> los `.kt` de aqui (Config, MainActivity, data/, feed/)
   - `app/src/main/AndroidManifest.xml` -> reemplaza por el de aqui (anade permiso INTERNET + cleartext)
   - `app/src/main/res/values/themes.xml` y `strings.xml`
3. En `app/build.gradle.kts` anade las dependencias de la seccion `dependencies`
   de ESTE proyecto (Media3, Retrofit, Coil) y `compileSdk/targetSdk = 36`.
4. Sincroniza Gradle.

> Alternativa: abrir directamente esta carpeta `android-twyk/` en Android Studio.
> Trae `build.gradle.kts` y `settings.gradle.kts` listos; Android Studio te
> pedira el Gradle Wrapper y, si alguna version no cuadra con tu instalacion,
> acepta sus sugerencias de actualizacion (son cambios de un clic).

## Configura tu backend (OBLIGATORIO)
Edita `app/src/main/java/com/twyk/app/Config.kt`:
```kotlin
const val BASE_URL = "https://TU-BACKEND.com/"   // termina en /
```
- El movil NO puede usar `localhost`. Usa tu web desplegada (https) o, para
  pruebas en local, la IP LAN de tu PC (p. ej. `http://192.168.1.50:3000/`).
  (El cleartext http ya esta permitido para desarrollo en el Manifest.)

## Ejecutar / generar APK
- Conecta tu telefono (Depuracion USB) o abre un emulador, y pulsa **Run** ▶.
- APK de prueba: **Build -> Build Bundle(s)/APK(s) -> Build APK(s)**.
  El APK queda en `app/build/outputs/apk/debug/app-debug.apk`.

## Como funciona la fluidez (igual que TikTok)
- **Media3/ExoPlayer** nativo por cada lado del 1vs1 (2 reproductores/pagina).
- **Cache en disco (150 MB LRU)**: un video ya visto se reabre al instante.
- **Precarga del vecino** (`beyondViewportPageCount = 1`): la siguiente pagina se
  prepara/bufferiza por adelantado -> al deslizar arranca sin espera. Solo la
  pagina activa reproduce; las demas quedan en pausa (no agota decoders).

## Estructura
```
android-twyk/
  app/src/main/java/com/twyk/app/
    Config.kt                 # <- pon aqui tu BASE_URL
    MainActivity.kt
    data/Models.kt            # modelos del JSON del backend
    data/TwykApi.kt           # Retrofit: /api/uploads, /api/feed, /api/vote
    feed/VideoCache.kt        # cache en disco (ExoPlayer)
    feed/FeedViewModel.kt     # carga + scroll infinito + voto
    feed/VersusFeed.kt        # VerticalPager + pagina 1vs1 (2 ExoPlayer)
```

## Notas honestas
- No pude compilar esto aqui (entorno solo-web). El codigo sigue las APIs
  actuales de Media3 1.5.x y Compose BOM 2026.04.01; si Android Studio marca
  alguna version, deja que la ajuste (sync) — es lo normal al abrir en otra maquina.
- Es **solo Android** (Compose). iOS seria un proyecto aparte mas adelante.
- Tu app **web sigue intacta**; esto es un proyecto independiente.
