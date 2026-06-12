# Twyk Android (Kotlin)

App Android que muestra **EXACTAMENTE la misma interfaz que tu app web Twyk**.
Internamente carga tu web (`Config.BASE_URL`) dentro de un **WebView a pantalla
completa**, así obtienes paridad total: feed de batallas (A vs B), votar, retar,
comentar, compartir, guardar, perfil, subir contenido, notificaciones… todo igual
que en la web, y se actualiza solo cuando actualizas tu web (sin recompilar).

> No se puede compilar dentro de Emergent (no hay SDK de Android). Se compila en
> TU Android Studio. Aquí está todo el código fuente.

## Barra de estado / pantalla
- **Edge-to-edge**: la barra de estado queda **intacta y visible**, y el vídeo del
  feed se dibuja **por detrás** de ella (la web ya usa `env(safe-area-inset-top)`,
  así que la interfaz superior no se solapa con el reloj/batería).
- La barra de navegación inferior del sistema **no tapa** la barra inferior de la
  web (se aplica padding por insets).

## Backend ya configurado
`app/src/main/java/com/twyk/app/Config.kt` ya apunta a tu **preview**:
```kotlin
const val BASE_URL = "https://8908c8d2-df22-4065-a399-daef14bf1723.preview.emergentagent.com/"
```
Cuando despliegues tu web a un dominio propio, cambia solo esa línea (debe acabar en `/`).

## Cómo abrirlo y generar el APK
1. Abre Android Studio → **New Project → Empty Activity (Compose)**.
   - Name: `Twyk` | Package: `com.twyk.app` | Language: Kotlin | Minimum SDK: API 24
2. Copia dentro del proyecto, respetando rutas:
   - `app/src/main/java/com/twyk/app/` → los `.kt` de aquí
   - `app/src/main/AndroidManifest.xml`, `res/values/themes.xml`, `res/values/strings.xml`
3. Sincroniza Gradle y pulsa **Run** ▶ (o **Build → Build APK(s)**).
   El APK queda en `app/build/outputs/apk/debug/app-debug.apk`.

> Alternativa: abrir directamente esta carpeta `android-twyk/` en Android Studio
> (trae `build.gradle.kts` y `settings.gradle.kts`). Si alguna versión de Gradle/AGP
> no cuadra con tu instalación, acepta las sugerencias de actualización (un clic).

## Qué hace el WebView
- JavaScript, almacenamiento (DOM/localStorage) y **autoplay de vídeo** activados.
- **Subir archivos** (`<input type="file">`) abriendo el selector del sistema.
- **Vídeo a pantalla completa** (HTML5 fullscreen) y permisos web (cámara/micro).
- Botón **Atrás** del teléfono navega el historial de la web.

## Estructura relevante
```
android-twyk/app/src/main/
  java/com/twyk/app/
    Config.kt          # <- aquí está la URL del backend (preview)
    MainActivity.kt    # WebView a pantalla completa (edge-to-edge)
    data/, feed/       # código del antiguo feed nativo (sin usar; se puede borrar)
  AndroidManifest.xml  # permiso INTERNET + cleartext
  res/values/themes.xml
```

## Notas
- No se pudo compilar aquí (entorno solo-web). El código usa APIs estándar de
  WebView + AndroidX; si Android Studio sugiere ajustar alguna versión al abrir,
  acéptalo (es lo normal en otra máquina).
- Tu app **web sigue intacta**; esto es un proyecto independiente que la muestra.
