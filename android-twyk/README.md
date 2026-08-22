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
- **Fase 4 (HECHA):** subir contenido — **Versus**, **1vs1/Duelo** y **Reto** (retar a un usuario), con soporte de **foto o vídeo** (mismo tipo en A/B, vídeo máx 80MB / foto máx 15MB, igual que la web).
- **Fase 5 (HECHA):** **Buzón** (retos recibidos: aceptar subiendo vídeo / rechazar +
  notificaciones) y **Batallas** (retos completados en los que participas).

> ✅ App nativa COMPLETA. Cuenta demo: `twyk_demo` / `demo1234`.

> 🆕 Última sesión (paridad con la web): soporte de FOTOS al publicar, Reportar
> y Bloquear usuario reales (antes "Reportar" no llamaba a ningún endpoint),
> Eliminar publicación propia, Responder/Eliminar comentarios, modal de
> Términos y Condiciones, y selector de música (iTunes) al publicar.
>
> 🆕 Sesión más reciente (modales — paridad 1:1 con la web):
> - **Retar**: oculto en tu PROPIA publicación (antes se veía siempre); mismo
>   check `headAuthor !== user` que CarouselSlide.jsx/DuetSlide.jsx.
> - **Compartir**: hoja BLANCA (antes oscura, no coincidía con ShareModal.jsx),
>   flecha para cerrar, logos REALES de WhatsApp y X (antes aproximados/letra
>   de texto) — mismos paths oficiales que la web.
> - **Más opciones**: mismo orden de filas que OptionsModal.jsx, cabecera con
>   flecha atrás + título en Reportar/Eliminar, bloqueo DIRECTO sin paso de
>   confirmación (igual que la web), feedback "Link copied".
> - **Comentarios**: flecha para expandir/contraer (75%↔95%), respuestas
>   ocultas detrás de "View N replies" (antes siempre expandidas), punto de
>   color según el voto del autor del comentario.
> - **Retar rápido**: flecha para cerrar (antes un tirador), icono de espadas
>   en "Send challenge".
> - Pendiente conocido: el paso de fecha de nacimiento del registro usa el
>   `DatePickerDialog` nativo en vez de la rueda de 3 columnas de la web
>   (decisión deliberada por fiabilidad, ya que este entorno no compila
>   Android).
>
> 🆕 Sesión más reciente (barra de navegación inferior — paridad 1:1 con la web):
> - **Visibilidad por pantalla**: la barra ahora es CONDICIONAL, replicando
>   exactamente qué páginas la muestran en la web — antes se veía SIEMPRE, en
>   cualquier pantalla.
>   - Visible: Inicio, Perfil (propio o ajeno), Batallas > Completados.
>   - Oculta: Subir, Buzón, Batallas > Activos, Buscador de usuarios.
> - **Avatar de perfil**: con sesión iniciada, el icono de Perfil de la barra
>   ahora muestra tu avatar REAL (foto subida o silueta gris por defecto),
>   igual que la web — antes mostraba siempre el icono genérico de invitado.
> - **Globos rojos de notificación**: ahora se anclan al tamaño EXACTO del
>   icono (24dp), no al área táctil completa (36dp) — antes quedaban
>   "flotando" separados del icono (Batallas y Buzón).
> - **Contadores grises de los filtros de Notificaciones** (Challenges/Votes/
>   Followers/Comments): ahora usan ancho MÍNIMO en vez de tamaño FIJO — con
>   2+ dígitos (10, 23…) el número no cabía en el círculo fijo de 18dp y se
>   salía de él, pareciendo un número suelto flotando junto a la pestaña.
>
> 🆕 Sesión más reciente (paridad con la web — botón "Fire" 🔥 en
> publicaciones 'Single'/reto abierto): la web sustituyó el antiguo "Vote"
> A/B de estas publicaciones por una reacción tipo "me gusta"
> (`OpenChallengeSlide.jsx`). Réplica exacta en nativo
> (`VersusFeed.kt::OpenChallengePage`): DOBLE-toque en el vídeo/foto AÑADE
> el fuego (nunca lo quita; burst naranja `#F97316` con el icono de llama,
> reutilizando la animación ya existente de `VoteBurst`); tocar el icono en
> la columna social es lo que lo QUITA. Se añadieron
> `Post.voteCount`/`Post.hasVoted` (Models.kt) y el endpoint Retrofit
> `singleVote` (`POST /api/single-vote`, backend sin cambios).
>
> 🆕 Sesión más reciente (2 diferencias pendientes con la web, ambas
> aplicadas):
> - **Tarjeta de "Ganador" reproduce vídeo**: antes SIEMPRE mostraba una
>   imagen estática (poster) de fondo, aunque el ganador fuera un vídeo —
>   ahora reproduce el vídeo del ganador (silenciado, en bucle, autoplay),
>   réplica de `winnerVideoUrl` en `VSWinnerCard.jsx`. Reutiliza el mismo
>   composable `ContentOption` ya usado por la "content card" (long-press).
> - **Retroceso paso a paso** en los 2 flujos multi-paso que quedaban
>   pendientes: "Subir" (`Upload.kt`: reto→archivo→modo) y la hoja de
>   login/registro (`Sheets.kt` `AuthSheet`: métodos→formulario→pasos de
>   registro) — antes el botón/gesto "Atrás" del sistema cerraba la pantalla
>   COMPLETA en vez de retroceder un solo paso dentro del flujo. Nuevo
>   `BackHandler` LOCAL en cada uno (mismo patrón ya usado en
>   Profile.kt/Battles.kt), con la MISMA lógica que ya usaban sus propios
>   botones de flecha "atrás"/"cerrar" visibles en pantalla.

> 👉 Compila la **Fase 1** primero y confirma que arranca; así validamos el
> toolchain antes de añadir las siguientes fases.

## Backend ya configurado
`app/src/main/java/com/twyk/app/Config.kt` apunta a tu **preview**:
```kotlin
const val BASE_URL = "https://native-web-gap.preview.emergentagent.com/"
```
Cuando despliegues tu web a un dominio propio, cambia solo esa línea (acaba en `/`).

## Notificaciones push (Firebase Cloud Messaging)
> ⚠️ **Paso obligatorio antes de compilar** tras esta sesión: descarga tu
> `google-services.json` desde la consola de Firebase (Configuración del
> proyecto → Tus apps → Android, package `com.twyk.app`) y colócalo en
> `android-twyk/app/google-services.json`. **Sin ese archivo, Gradle
> FALLARÁ al sincronizar** ("File google-services.json is missing").
>
> También necesitas generar una clave del "Admin SDK" (Configuración del
> proyecto → Cuentas de servicio → Generar nueva clave privada) y pegar sus
> 3 campos (`project_id`, `client_email`, `private_key`) en `/app/.env`
> (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)
> — eso es lo que permite al BACKEND enviar las notificaciones.
>
> Sin ninguno de los 2 archivos, la app compila igual pero las push quedan
> desactivadas (no rompe nada más).

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
