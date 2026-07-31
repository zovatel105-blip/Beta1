# Twyk — PRD / Registro de progreso

## Qué es Twyk
App tipo "versus" (compara y vota entre A/B, estilo TikTok) con:
- **Web** (Next.js + MongoDB) en `/app` — funcional, es la fuente de verdad del diseño/comportamiento.
- **App nativa Android** (Kotlin + Jetpack Compose + Media3/ExoPlayer) en `/app/android-twyk` — replica 1:1
  el feed, modales y navegación de la web. **No se puede compilar ni ejecutar en este entorno** (sin SDK de
  Android/emulador); el código se escribe/revisa a mano y el usuario lo compila en su propio Android Studio.

## Estado general
- Web: funcional (feed, votar, comentar, retar, subir, perfil, batallas, buzón, admin).
- Nativa: fase de **paridad visual/funcional con la web**, en progreso por rondas.

## Ronda: anillo negro del avatar + tipografía "A vs B" en publicaciones tipo Reto
Usuario reportó (con captura) que en publicaciones tipo Reto, el avatar de delante (abajo-derecha) de
la cabecera mostraba un anillo negro que no existe en la web; corregido en `HeaderOverlay`
(VersusFeed.kt) quitando el fondo negro/padding artificial y añadiendo un recorte circular
(`drawCircle`+`BlendMode.DstOut` sobre capa offscreen) en el avatar de atrás, réplica exacta del
`mask-image` CSS de CarouselSlide.jsx/DuetSlide.jsx. Después pidió que la TIPOGRAFÍA del texto
"usuario vs usuario" también fuera 100% igual: corregidos tamaño (13.sp->14.sp), peso ("vs" en Light
vs nombre en SemiBold, antes todo igual) y orden (el "vs" ahora se coloca junto al nombre más corto,
antes siempre tras A). Detalle completo en `test_result.md`. El usuario pidió explícitamente NO usar
el agente de testing para estos cambios nativos (no compilable en este entorno de todas formas).


## Sesión actual — cambios aplicados (app nativa Android)

### Ronda 1 — Modales + botón Retar
- `feed/VersusFeed.kt`: botón "Retar" (espadas) ahora se OCULTA en tu propia publicación
  (antes se mostraba siempre) — replica `headAuthor?.username !== user?.username` de CarouselSlide.jsx/DuetSlide.jsx.
- `ui/Sheets.kt` — `ShareSheet`: convertida de hoja OSCURA a BLANCA (coincidía mal con `ShareModal.jsx`),
  con flecha de cerrar y logos REALES de WhatsApp/Instagram/X (antes aproximados). Mismos paths oficiales
  también aplicados en `components/ShareModal.jsx` (web) porque el bug era compartido.
- `feed/VersusFeed.kt` — `MoreOptionsSheet`: mismo orden de filas que `OptionsModal.jsx`, cabecera con
  flecha atrás + título en Reportar/Eliminar, bloqueo DIRECTO sin confirmación extra, feedback "Link copied".
- `ui/Sheets.kt` — `CommentsSheet`: flecha expandir/contraer (75%↔95%), respuestas colapsadas detrás de
  "View N replies", punto de color según el voto del autor del comentario.
- `ui/QuickChallenge.kt`: flecha para cerrar (antes un tirador) + icono de espadas en "Send challenge".
- Nuevos drawables: `ic_instagram.xml`, `ic_whatsapp.xml`, `ic_x_logo.xml` (logos reales, paths de simple-icons).
- **Infra**: `/app/.env` había desaparecido (Mongo es efímero + `.env` gitignored) → recreado; usuarios y
  posts demo re-sembrados (`node scripts/seed-core-users.mjs`, `node seed-posts.mjs`).

### Ronda 2 — Barra de navegación inferior (visibilidad por pantalla)
- `MainActivity.kt`: la barra ahora es CONDICIONAL (`showBottomNav`), replicando exactamente qué páginas
  la muestran en la web (Feed.jsx + z-index de cada overlay):
  - **Visible**: Inicio, Perfil (propio o ajeno), Batallas > Completados.
  - **Oculta**: Subir, Buzón, Batallas > Activos, Buscador.
- `ui/Battles.kt` (`BattlesScreen`): nuevo callback `onShowNavChange` que avisa al padre si está en
  "Completados" (nav visible) o "Activos"/"Sugeridos" (nav oculta).

### Ronda 3 — Avatar de perfil + posición de globos rojos
- `MainActivity.kt` — `ProfileNavIcon` (nuevo): con sesión iniciada muestra el AVATAR real (foto subida o
  silueta gris por defecto), igual que la web; antes SIEMPRE mostraba el icono genérico de invitado.
- `MainActivity.kt` — `NavIcon`: el globo rojo de contador ahora se ancla al tamaño EXACTO del icono (24dp),
  no al área táctil completa (36dp) — antes quedaba "flotando" separado del icono.
- Revisado `ui/Inbox.kt` (Notificaciones) a fondo: no se encontró otro badge con el mismo patrón de "flotar"
  (los contadores de las pestañas de filtro y el punto de no-leído ya están bien anclados, inline, igual que
  `NotificationsInbox.jsx`). La barra inferior (con sus globos) ya no aparece en absoluto en esta pantalla
  por la Ronda 2, así que no hay nada más "flotando" ahí.

### Ronda 4 — Paridad EXACTA del modal de comentarios del feed (`CommentsSheet` vs `CommentsModal.jsx`)
Petición del usuario: "En el feed el modal de comentarios con todas las funciones de la web y diseño debe
ser exactamente igual con cada pequeño detalle en la aplicación nativa". `CommentsSheet` (`ui/Sheets.kt`) ya
estaba bastante avanzado de rondas anteriores (hilos con conector avatar-a-avatar, expandir/contraer 75%↔95%,
respuestas colapsadas, borrar en cascada); esta ronda cierra las diferencias reales que quedaban:
- **Fecha relativa del comentario (bug visual)**: `relativeTime()` solo cortaba el ISO string
  (`ts.take(10)`, mostraba "2025-07-15" siempre). Ahora replica `formatTime()` de `CommentsModal.jsx`:
  "Now" / "Xmin" / "Xh" / "Xd" / fecha corta, parseando el ISO con `SimpleDateFormat` (sin `java.time`,
  por compatibilidad con `minSdk 24`).
- **Punto de color por voto EN VIVO + comentarios nuevos con voto actual**: `CommentsSheet` ahora recibe
  `votedSide` (voto ACTUAL del usuario sobre la publicación, igual que `votedSide={userVote}` que
  `CarouselSlide.jsx`/`DuetSlide.jsx` pasan a `<CommentsModal>`). Se usa en `CommentRow` para
  `effectiveSide` (tus propios comentarios muestran tu voto ACTUAL, no el guardado al comentar) y se envía
  en `CreateCommentRequest.votedSide` al crear un comentario nuevo. Hilo completo: `voted` (estado local de
  `CarouselPage`/`DuetPage`) → `onOpenComments(postId, voted)` → `commentsVotedSide`
  (`MainActivity`)/`viewerVotedSide` (`Profile.kt`) → `CommentsSheet(votedSide = ...)`.
- **Contador de comentarios del rail sin refrescar**: comentar/borrar desde `CommentsSheet` no actualizaba
  el número junto al icono de comentarios hasta recargar el feed. Nuevo evento
  `PostEvents.commentCountChanged` (mismo patrón que `postDeleted`), emitido al cargar/crear/borrar
  comentarios; `FeedViewModel` (Inicio), `BattlesScreen` (Completados) y `ProfileScreen` (visor) lo
  suscriben para parchear `post.stats.comments` al instante.
- **Botón "Reply" oculto para invitados**: antes la fila Reply/Delete entera desaparecía sin sesión; ahora
  "Reply" se ve SIEMPRE (réplica de `startReply()` en la web) y, sin sesión, pide login (`onRequireAuth`)
  en vez de responder directamente.
- **Ajustes finos de diseño** (pixel-parity): indentación de respuestas 44dp (antes 40dp, ya no coincidía
  con el indent de "View replies"); espacio vertical entre respuestas de un mismo hilo 12dp (antes 16dp,
  la web usa `space-y-3` ahí y `space-y-4` solo en la lista raíz); icono expandir/contraer 16dp (antes
  18dp, la web usa `w-4 h-4`); icono "▶" del reply-target 12dp (antes 13dp, la web usa `w-3 h-3`); texto
  "No comments yet" 15sp (antes 14sp, la web usa `text-[15px]`).
- Archivos: `ui/Sheets.kt` (`CommentsSheet`, `CommentRow`, `relativeTime`), `feed/VersusFeed.kt` (hilo
  `onOpenComments`/`onCommentsLocal` en `CarouselPage`/`DuetPage`/`FeedPager`), `MainActivity.kt`,
  `ui/Profile.kt`, `ui/Battles.kt` (wiring + suscripción a `commentCountChanged`), `data/Models.kt`
  (`CreateCommentRequest.votedSide`), `data/UploadQueue.kt` (`PostEvents.commentCountChanged`),
  `feed/FeedViewModel.kt` (suscripción). Backend SIN cambios: `votedSide` ya estaba soportado en
  `POST /api/comments` desde una ronda anterior de la web.

## Pendiente conocido
- El paso de fecha de nacimiento del registro (`AuthSheet`) usa el `DatePickerDialog` nativo de Android en
  vez de la rueda de 3 columnas (día/mes/año) de la web (`DateWheelPicker.jsx`) — decisión deliberada por
  fiabilidad, ya que no se puede compilar/probar Android en este entorno. Pendiente si el usuario quiere el
  wheel picker exacto en una ronda futura.
- Ninguna de las rondas de la app nativa ha sido verificada por un agente de testing automático (imposible:
  no hay SDK de Android en este entorno). Verificación = revisión manual de código (balance de llaves,
  imports, referencias) + comparación línea a línea con los componentes web equivalentes. El usuario compila
  y prueba el APK en su propio Android Studio.

## Ronda: perfil nativo NO se colapsaba/solapaba como la web con pocas publicaciones
Usuario reportó (con captura: cuenta twykadmin, 3 publicaciones, máximo scroll) que el header del
perfil se quedaba casi completo (avatar 104dp, stats, botones) con un "fantasma" tenue de la barra
colapsada superpuesto, en vez de colapsar del todo y anclar las pestañas bajo la barra superior como
la web. CAUSA: `collapseProgress` (Profile.kt) depende del scroll REAL del `LazyVerticalGrid`
(`firstVisibleItemScrollOffset`); con pocas publicaciones no hay suficiente contenido para desplazarse
lo bastante, así que el progreso de colapso nunca llega a 1. La web NUNCA tiene este problema porque
reserva `contentMinH` (altura mínima del contenedor del grid) para garantizar SIEMPRE suficiente
distancia de scroll (ver comentario en ProfilePage.jsx). FIX: nuevo `minContentFillerPx` en
`ui/Profile.kt` — calcula, a partir del tamaño real medido de la pantalla (`onSizeChanged`) y del
número de publicaciones (filas de 3, aspecto 9:16), cuánto le falta al contenido real para llenar el
alto de pantalla, y añade un item de relleno invisible al final del grid con esa altura. Así, con 0/pocas
publicaciones, siempre hay suficiente distancia de scroll para que el header colapse del todo y las
pestañas se anclen — igual que la web. NO COMPILABLE en este contenedor; verificado por revisión manual
+ recuento de llaves/paréntesis balanceado del archivo completo (219/219, 698/698). Pendiente que el
usuario compile el APK y confirme que ahora el perfil colapsa/solapa 100% igual que la web incluso con
pocas publicaciones.

## Credenciales de prueba
Ver `/app/memory/test_credentials.md` (twykadmin/Admin12345, lucia/marcos/laura con Test12345).

## Ronda: barra de "Añadir comentario" (envío directo) al abrir publicaciones desde el grid del perfil — WEB
Petición del usuario (con captura de referencia de TikTok): que aparezca un campo de texto tipo
"Add a comment..." al abrir publicaciones desde el grid del perfil propio y ajeno, tanto en web
como en la app nativa. Aclarado con el usuario: solo en el visor del grid (no en el feed principal),
envío DIRECTO sin abrir el modal completo, sin iconos decorativos (solo botón enviar), placeholder
en inglés, web primero y nativo pendiente de luz verde. Implementado en la WEB: nuevo
`components/QuickCommentInput.jsx` (POST directo a `/api/comments`), nueva prop `showCommentInput`
en `CarouselSlide.jsx`/`DuetSlide.jsx`, `ProfilePage.jsx` la activa solo en su `PostViewer`.
AJUSTE (feedback inmediato del usuario): la barra de navegación inferior (BottomNav, z-50) seguía
visible sobre el visor y competía en espacio con la nueva barra -> ahora se OCULTA POR COMPLETO
mientras se ve una publicación del grid (estilo inmersivo, igual que TikTok): nuevo
`onPostViewerChange` (ProfilePage.jsx -> Feed.jsx) que renderiza `<BottomNav>` condicionalmente.
Verificado visualmente en viewport MÓVIL (390x844) con capturas Playwright manuales (usuario pidió
explícitamente no usar el agente de testing): al abrir un post del grid, 0 elementos `<nav>` en el
DOM y la barra 'Add a comment...' queda anclada al borde inferior real, sin overlaps, en
publicaciones tipo carrusel y 1vs1; comentario persistido en Mongo (id UUID) y contador del rail
social actualizado en vivo. Se dejaron 2 posts de prueba en el perfil de lucia (grid) para que el
usuario los use para verificar sin subir contenido real. Pendiente: luz verde del usuario para
replicar en la app nativa Android.

## Notas de infraestructura
Ver `/app/memory/ENV_BACKUP.md` — causa raíz y procedimiento si `.env` o los datos de MongoDB desaparecen
de nuevo (almacenamiento efímero del pod).

## Ronda: paridad 100% pantalla de creación/subida (Upload.kt vs UploadDialog.jsx) — COMPLETADA (pendiente compilación del usuario)
- **Rediseño completo del paso "file"** para replicar la vista previa a PANTALLA COMPLETA de la web
  (`fixed inset-0 z-30`): el header genérico del diálogo queda cubierto y el paso muestra su propio
  header superpuesto (círculos negros 35% con flecha atrás y X).
- **Vista previa en vivo del media**: vídeo local con ExoPlayer (autoplay + loop + silenciado, TextureView
  `twyk_texture_player` con resize_mode=zoom = object-cover) y fotos con Coil `AsyncImage` (crop).
- **1vs1 (duet)**: split en vivo 50/50 con gap de 2px (fondo blanco 20% visible en el gap) horizontal o
  vertical, y conmutador de formato centrado en el header (pill negro 45% + iconos TableRows/ViewColumn
  ≈ Rows3/Columns3 de lucide, activo = fondo blanco texto negro).
- **Versus**: carrusel de 1 vídeo a la vez con swipe horizontal (umbral 40, igual que la web) y puntitos
  clicables abajo (activo 20x6dp blanco, inactivo 6dp blanco 40%).
- **Reto**: vídeo/foto único a pantalla completa (placeholder grande 64dp "Tap to upload…").
- **Botón "Change"** sobre el media (pill negro 55%, 11sp semibold, arriba-derecha de cada slot).
- **Degradados de legibilidad**: superior 176dp (negro 85%→30%→transparente) e inferior 320dp
  (transparente→negro 65%→negro), como los `bg-gradient-to-*` de la web.
- **Panel inferior flotante** (fondo del degradado): error rose-300, textarea descripción (negro 45%,
  borde blanco 10%, radio 16, texto 15sp zinc-100, placeholder zinc-400), fila de música y botón publicar
  (blanco redondo py-14dp, bold 16sp; deshabilitado blanco 20% / texto blanco 40%).
- **Fila de música réplica exacta**: sin música → botón centrado "Add music" (icono 17 + 14sp semibold);
  con música → artwork 40dp radio 8 (fondo zinc-800), título 13sp semibold + artista 11.5sp zinc-400,
  botón "Change" (12sp, blanco 80%) y X (16dp zinc-400) — antes faltaba "Change" y el artwork era 32dp.
- **Paso "mode"**: pestaña "Retos"→"Challenges", textos descriptivos EXACTOS de la web (sin "or 2 photos"),
  ancho máx. 304dp + lineHeight 24sp (max-w-[19rem] leading-relaxed), glow radial blanco detrás de la caja
  del icono (box-shadow web), ChevronRight 18dp, segmentado sin gap.
- **Lógica**: la descripción se envía TAL CUAL (antes Android auto-rellenaba el placeholder; la web manda
  `description || ''`). El resto del pipeline (WorkManager, UploadQueue, música iTunes) intacto.
- **Infra restaurada en esta sesión**: `/app/.env` había desaparecido de nuevo (causa raíz conocida) →
  restaurado con la NUEVA URL de preview (77b55a13-….preview.emergentagent.com), nextjs reiniciado,
  usuarios re-sembrados (seed-core-users.mjs), ENV_BACKUP.md y test_credentials.md actualizados.
  Verificado: GET /, /api/feed, POST /api/auth/login → 200.
- Archivos: `ui/Upload.kt` (reescrito FileStep + nuevos MediaSlot/LocalVideoPreview/LayoutSeg/MusicRow,
  eliminados VideoSlot/MusicRowPicker). Verificación: llaves 201/201, paréntesis 788/788, imports OK.

## Ronda: persistencia del voto (SharedPreferences) + sombra del burst
Petición del usuario: "El voto de la aplicación nativa debe ser igual en todo a la web aplicando cada
pequeño detalle". Auditoría de `submitVote()`/`handleTapSide()` (web) vs `CarouselPage`/`DuetPage`
(nativo) encontró:
- **Persistencia del voto**: la web restaura `userVote` de `localStorage` al montar (`versus_vote_<id>`
  / `duet_vote_<id>`); el nativo SIEMPRE arrancaba `voted=null`, perdiendo la marca visual de "ya
  votado" al reabrir la app o reciclar la tarjeta lejos en el scroll. Nuevo `data/VoteStore.kt`
  (SharedPreferences, mismo patrón que `Session.kt`), inicializado en `MainActivity.onCreate`.
  CUIDADO evitado: la restauración NO debe reabrir la tarjeta de "Ganador" (la web tampoco lo hace) —
  se separó un nuevo estado `voteTrigger` (solo se actualiza al votar de verdad) del que depende ese
  `LaunchedEffect`, en vez de depender directamente de `voted`.
- **Sombra del burst**: añadida una aproximación (icono negro duplicado, offset 6dp) de
  `drop-shadow(0 6px 20px rgba(0,0,0,.55))` — sin blur real (requeriría API 31+, la app da soporte
  desde minSdk 24), documentado como limitación deliberada.
- Confirmado que otros detalles YA coincidían: sin ring en CarouselSlide (solo en dueto, ya estaba);
  `audibleSide` del dueto sigue arrancando siempre en 'a' aunque se restaure un voto en 'b' (así lo
  hace también la web).
NO COMPILABLE aquí; requiere rebuild del APK. Verificado por revisión manual + recuento de llaves/
paréntesis balanceado. INFRA: `.env` había desaparecido de nuevo durante la sesión (misma causa raíz
recurrente); restaurado + nextjs reiniciado + usuarios re-sembrados.

## Ronda: pausar vídeo (toque simple), cambiar audio en 1vs1, y animación de voto igual a la web
Petición del usuario: "En la aplicación nativa no puedo parar el vídeo y en las publicaciones 1vs1 no
puedo cambiar el audio haciendo click sobre la otra opción y cuando realizo un voto no tiene la misma
animación tamaño etc que la web debe ser igual a la web 100%". Los 3 fixes viven en
`feed/VersusFeed.kt` (`VideoSurface`, `CarouselPage`, `DuetPage`, `VoteBurst`):
- **Toque simple para pausar** (versus Y 1vs1): antes `VideoSurface` solo tenía `onDoubleTap` (votar);
  ningún toque simple estaba conectado, por eso era imposible pausar. Ahora acepta `onSingleTap`;
  Compose espera la ventana de doble-toque automáticamente al haber ambos callbacks. Nuevo estado
  `paused` + overlay `PlayArrow` (72dp) igual que el `<Play size={72}/>` de la web.
- **Cambiar audio en 1vs1**: nuevo estado `audibleSide` en `DuetPage` (antes A tenía el audio fijo y B
  siempre muted, sin forma de cambiarlo). Tocar el lado sin audio se lo pasa; tocarlo si YA lo tiene
  pausa/reanuda ambos. Votar por un lado también le pasa el audio (réplica de `setAudibleSide` en
  DuetSlide.jsx).
- **Animación de voto**: la `VoteBurst` antigua era un tween lineal 750ms sin rebote/rotación, siempre
  centrada en pantalla. Reescrita con 3 `Animatable` (escala/opacidad/rotación) vía `keyframes{}`
  replicando EXACTAMENTE `voteIconPop` de globals.css (rebote elástico 0.15→1.4→0.92→1.1→1→1.08,
  rotación -18°→8°→-4°→2°→0°, 800ms), posicionada en el punto real del doble toque (60dp por encima),
  y solo se muestra si había sesión iniciada (igual que la web).
NO COMPILABLE en este contenedor; requiere rebuild del APK del usuario. Verificado solo por revisión
manual + recuento de llaves/paréntesis balanceado (352/352, 1097/1097). Sin cambios de backend/web.

## Avatares y barra inferior — paridad 100% con la web (session actual)
- **`ui/UiKit.kt` → `TwykAvatar`**: reemplazado `Icons.Filled.Person` de Material (círculo lleno) por
  `ImageVector.vectorResource(R.drawable.ic_avatar_default)` — silueta SVG idéntica a la web
  (`components/Avatar.jsx`: circle cx50 cy40 r16 + path M16,100 C16,75 31,62 50,62 S84,75 84,100).
  Ahora el avatar por defecto en **búsqueda** (`Search.kt` → `SearchResultRow`) y **perfil**
  (`Profile.kt`, header y sticky) coincide 100% con `SearchOverlay.jsx` y `ProfilePage.jsx` de la web.
- **`MainActivity.kt` → `NavIcon`**: icono interior 24.dp → **20.dp** (`w-5 h-5` de la web).
  Esto restaura la proporción correcta con el avatar de perfil (23dp): en la web el avatar es 1.15×
  más grande que los iconos, no al revés como estaba.
- **`MainActivity.kt` → botón `+` (Upload)**: contenedor 38.dp → **36.dp** (`w-9 h-9`); Plus 22.dp → **20.dp**
  (`w-5 h-5`). Ahora el botón queda alineado con el resto de iconos y el gradiente lila→azul rodea un
  glifo del tamaño correcto.
- **`MainActivity.kt` → `ProfileNavIcon`** (invitado): User icon 24.dp → **20.dp** para igualar iconos.
- Verificación: llaves y paréntesis balanceados en `UiKit.kt` (20/20, 106/106) y `MainActivity.kt`
  (97/97, 208/208). Sin compilación local (limitación del contenedor); requiere validación del usuario.

## Ronda: reproductor nativo nivel TikTok/Reels — "el usuario NUNCA espera" (jul-2026)
Petición: "Quiero que mi reproductor nativo sea igual o superior al de TikTok/reels; el usuario no
debe esperar a que cargue, el contenido tiene que estar listo siempre". Confirmado con el usuario:
plan completo + precarga agresiva de 4 publicaciones (~8-12 MB/ventana, prioridad máxima a fluidez).
Implementado (solo app nativa Android, cero cambios web/backend), siguiendo PERFORMANCE_BLUEPRINT_TWYK.md:
1. **`feed/FeedPrefetcher.kt` (NUEVO)**: al cambiar la página activa, descarga en background
   (CacheWriter -> la MISMA SimpleCache de los ExoPlayer) los primeros ~1.5 MB (init MP4 + 3-6 s)
   de CADA vídeo (lados A y B) de las publicaciones i+1..i+4 e i-1, en orden de prioridad por
   cercanía (Semaphore(3) FIFO, máx 3 descargas simultáneas para no robar ancho de banda al vídeo
   activo); cancela (writer.cancel()+job.cancel()) lo que sale de la ventana en scroll rápido;
   `alreadyCached()` compara contra min(contentLength, 1.5MB) para no re-descargar clips cortos ya
   completos; pósters precalentados vía Coil (memoria+disco). Wiring en `FeedPager` (VersusFeed.kt,
   LaunchedEffect(currentPage, posts.size)) -> beneficia a feed principal, Batallas>Completados y
   visor del perfil (todos usan FeedPager).
2. **Arranque instantáneo** (`buildPlayer`, VersusFeed.kt): DefaultLoadControl custom
   (300 ms para arrancar / 750 ms tras rebuffer, en vez de 2500/5000 por defecto; búfer 15-30 s en
   vez de 50 s — hay hasta 6 players montados (activa ±1 × 2 vídeos), el default desperdiciaba RAM/red).
3. **Póster = frame 1** (`VideoSurface`, VersusFeed.kt): el JPG del primer fotograma (que el backend
   YA genera con ffmpeg, posterFor() en route.js, y la web ya usa como <video poster>) se pinta a
   0 ms POR ENCIMA del PlayerView y se desvanece (AnimatedVisibility fadeOut 120 ms) al dispararse
   onRenderedFirstFrame — nunca más pantalla negra; el listener se re-arma en cada reciclado del
   pager (la superficie nueva vuelve a disparar onRenderedFirstFrame). Spinner de buffering se
   mantiene (se dibuja sobre el póster solo si de verdad hay stall).
4. **`feed/VideoCache.kt`**: caché de disco 150 MB -> 512 MB; accessor `cache(context)` ahora público
   (lo usa el prefetcher); timeouts HTTP 8 s conexión/lectura (fallar rápido + póster cubre el hueco).
NO COMPILABLE aquí (sin SDK Android): verificado por revisión manual línea a línea + balance de
llaves/paréntesis del CÓDIGO sin comentarios/strings (VersusFeed 463/463 y 1291/1291; FeedPrefetcher
17/17, 50/50; VideoCache 5/5, 18/18). Pendiente: usuario compila el APK y valida.

INFRA de esta sesión: /app estaba VACÍO salvo .git (working tree perdido con el pod); restaurado con
`git checkout -f main` + .env recreado con la URL actual (3c5fe045-d14d-422d-a98b-ec6052fa01ca) +
usuarios/posts re-sembrados + `Config.kt` (BASE_URL nativa) actualizada a la URL actual. Login
lucia/twykadmin verificado 200. OJO: el usuario en una ronda anterior pidió mantener una URL vieja en
Config.kt; esta vez se actualizó a la vigente porque la vieja (ec45bf55) ya no existe — si el usuario
compila contra otro backend, debe ajustar Config.kt él mismo.

## Ronda: barra de navegación inferior "un poquito más grande" (web + nativa)
Petición: "haz los botones de la barra de navegación inferior un poquito más grandes tanto en la
web como en la apk". Cambio aplicado EN PARALELO manteniendo paridad 1:1:
- **Web (`components/BottomNav.jsx`)**: área táctil de los 5 botones w-9→w-10 (36→40px); iconos
  w-5→w-6 (20→24px, incluido el Plus del botón Crear); avatar de perfil 23→27px (misma proporción
  ~1.13x que antes). Verificado en vivo (viewport 390x844): los 5 botones a 40px con glifos de 24px.
- **Nativa (`MainActivity.kt`)**: `NavIcon` 36→40dp con glifo 20→24dp; botón Crear 36→40dp con
  Plus 20→24dp (borde degradado y radio 12dp intactos); `ProfileNavIcon` 36→40dp con avatar
  23→27dp e icono de invitado 20→24dp. El offset del globo rojo (align TopEnd + offset 10,-10)
  NO cambia: el margen lateral glifo-botón sigue siendo 8dp por lado ((40-24)/2 = (36-20)/2),
  así que la misma matemática deja el globo en la posición equivalente de la web. NO COMPILABLE
  aquí; verificado por revisión manual + balance de llaves/paréntesis del código (113/113, 202/202).
  El único 36dp restante en MainActivity es el botón de búsqueda de la barra SUPERIOR (no se toca).

## Ronda: Splash Screen nativo — logo un pelín arriba y un poco más grande
Petición: "El logo del Splash Screen debe estar centrado un pelín arriba y hacerlo un poco más
grande, muéstrame una captura". Cambio en `SplashScreen()` (MainActivity.kt): logo 140dp -> 170dp
(~20% más) y `offset(y = -30dp)` sobre el centro exacto (offset ANTES de size). Al no poder
compilar Android aquí, la captura mostrada al usuario se generó con una maqueta HTML 1:1
(mismo asset auth_logo.png del APK, viewport 390x844, 170px translateY(-30px)) servida
temporalmente desde /public y borrada después. Kotlin verificado por balance de código.

## Ajuste fino (misma sesión): splash 170->185dp, barra inferior 40/24 -> 38/22
"Un pelín más grande [el splash] y los botones de la barra de navegación un pelín más pequeños".
- Splash nativo (MainActivity.kt): logo 170dp -> 185dp (offset -30dp intacto). Captura mostrada
  (maqueta HTML 1:1 con el asset real, borrada tras capturar).
- Barra inferior WEB (BottomNav.jsx): botones w-10 (40px) -> w-[38px], iconos w-6 (24px) ->
  w-[22px] (incl. Plus), avatar 27 -> 25px. Verificado en vivo: 5 botones a 38px/22px.
- Barra inferior NATIVA (MainActivity.kt): NavIcon 38dp/22dp, Crear 38dp/Plus 22dp,
  ProfileNavIcon 38dp/avatar 25dp/invitado 22dp. Margen glifo-botón sigue 8dp/lado
  ((38-22)/2), así que el offset del globo rojo (TopEnd+10,-10) sigue siendo correcto.
  Balance de código verificado (113/113, 204/204). Historial de tamaños: 36/20 (original,
  paridad web) -> 40/24 (agrandar "un poquito") -> 38/22 (ajuste final "un pelín más pequeño").
