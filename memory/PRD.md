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

## Credenciales de prueba
Ver `/app/memory/test_credentials.md` (twykadmin/Admin12345, lucia/marcos/laura con Test12345).

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
