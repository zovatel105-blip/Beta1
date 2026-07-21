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
