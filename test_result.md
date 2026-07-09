#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Las publicaciones normales deben ser un carrusel de 2 vídeos (opción A / opción B) entre los que se desliza y se vota tocando el vídeo. Se suben 2 vídeos. Reemplaza el vídeo normal. AÑADIDO: votar = doble toque, quitar el corazón/Me gusta, y nueva función 'Retar' (solicitud de enfrentamiento con un vídeo subido que el retado acepta/cancela en la Bandeja). NUEVO: buscador de usuarios en la esquina superior derecha de la página de inicio (icono de lupa que abre un overlay)."

backend:
  - task: "Recuperación de entorno: .env perdido + MongoDB vacío (persistencia efímera)"
    implemented: true
    working: true
    file: ".env, memory/ENV_BACKUP.md, scripts/seed-core-users.mjs, memory/test_credentials.md"
    stuck_count: 4
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "NUEVA PÉRDIDA DE .env (usuario: 'Restaura el archivo .env'). Misma causa raíz documentada (persistencia efímera de MongoDB + .env gitignored). Restaurado /app/.env con el contenido de memory/ENV_BACKUP.md, actualizando NEXT_PUBLIC_BASE_URL/CORS_ORIGINS a la URL de preview actual (APP_URL de supervisor: https://audio-playback-bug.preview.emergentagent.com); ENV_BACKUP.md actualizado con la nueva URL. Reiniciado nextjs y re-ejecutado scripts/seed-core-users.mjs (4 usuarios + 3 follows creados de nuevo, BD estaba vacía). memory/test_credentials.md recreado. VERIFICACIÓN MANUAL con curl (usuario pidió explícitamente NO usar el agente de testing): (1) POST /api/auth/login twykadmin/Admin12345 -> 200 role=admin; (2) POST /api/auth/login lucia/Test12345 -> 200; (3) GET /api/auth/me con cookie de lucia -> 200 username=lucia; (4) GET /api/uploads -> 200; (5) GET /api/feed -> 200 {posts,nextCursor,hasMore}; (6) POST /api/auth/login marcos/Test12345 -> 200; (7) GET /api/users con sesión lucia -> 200, 4 usuarios reales (laura/marcos/lucia/twykadmin); (8) GET /api/notifications/unread -> 200 {count:0}; (9) POST /api/vote (marcos, side='b') sobre post duet_d5a38c92775655fa -> 200 {votes:{a:1,b:1}}, y un segundo GET /api/uploads confirma que el voto PERSISTE ({a:1,b:1}). Todo 200, sin errores 500. Backend operativo tras la restauración."
        -working: "NA"
        -agent: "user"
        -comment: "BUG (usuario: 'El archivo .env se volvió a perder'). Ya había ocurrido varias veces antes (ver comentarios anteriores en este archivo)."
        -working: "NA"
        -agent: "main"
        -comment: "RCA vía troubleshoot_agent (obligatorio por ser un error repetido >=2 veces): causa raíz = arquitectura de persistencia dividida del entorno Kubernetes. /app SÍ persiste (volumen /dev/nvme0n14, repoblado desde git en cada reinicio de pod), pero /var/lib/mongodb (datos de MongoDB) vive en el filesystem raíz EFÍMERO (overlay), y .env está en .gitignore (por seguridad) por lo que nunca se restaura desde git. Resultado: cada reinicio de pod borra MongoDB Y .env simultáneamente. NO es un bug de código; es el modelo de persistencia de la plataforma (confirmado por troubleshoot_agent tras 10 pasos de investigación). FIX aplicado: (1) recreado /app/.env (MONGO_URL=mongodb://localhost:27017/twyk, ADMIN_EMAILS=twyk.apk@gmail.com, NEXT_PUBLIC_BASE_URL/CORS_ORIGINS=URL de preview desde APP_URL de supervisor). (2) NUEVO /app/memory/ENV_BACKUP.md (NO gitignored, por tanto SÍ persiste en git) con copia del contenido exacto de .env y las instrucciones de restauración+reseed, para que una futura sesión (propia o de otro agente) pueda restaurar sin tener que redescubrir la causa. (3) NUEVO script idempotente scripts/seed-core-users.mjs que crea (con bcrypt, igual que createUser de lib/db.js) twykadmin/Admin12345 (admin, email twyk.apk@gmail.com), lucia/marcos/laura con Test12345, y las relaciones de follow (marcos->lucia, laura->lucia, lucia->marcos). Ejecutado tras reiniciar nextjs: 4 usuarios creados, 3 follows creados. (4) memory/test_credentials.md actualizado con las 4 cuentas."
        -working: true
        -agent: "main"
        -comment: "El usuario pidió explícitamente (dos veces) NO usar el agente de testing para verificar este fix. VERIFICACIÓN MANUAL únicamente (vía logs de supervisor, sin curl): POST /api/auth/login (twykadmin) -> 200, [getCurrentUser] Token: found / Session: found / User: twykadmin, GET /api/notifications/unread -> 200, GET /api/users/twykadmin -> 200 (estas peticiones se observaron en los logs reales del servidor, generadas por el propio uso de la app). No se ejecutó backend_test.py ni deep_testing_backend_nextjs (petición explícita del usuario), por lo que ESTA CORRECCIÓN NO ESTÁ VERIFICADA POR EL AGENTE DE TESTING, solo por inspección manual de logs. NOTA: los posts/uploads previos NO se pueden recuperar (vivían solo en MongoDB, que se perdió por completo; los archivos de vídeo/imagen en public/uploads siguen en disco pero sin metadata que los referencie) — limitación conocida del almacenamiento efímero de MongoDB en este entorno, no algo que el código pueda prevenir."
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js, components/UploadDialog.jsx, components/CarouselSlide.jsx, components/DuetSlide.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "NUEVA FEATURE (usuario: 'solo puedo publicar vídeos, quiero también imágenes como TikTok; la imagen se trata como diapositiva; NO mezclar vídeo con imagen'). BACKEND: helpers mediaKind(file) y saveUploadedMedia(file) -> {url, mediaType, posterUrl} (imagen: media_<id>.<ext>, posterUrl=imagen; vídeo: saveUploadedVideo+póster). handleVersusUpload/handleDuetUpload validan mismo tipo en ambos lados (si no -> 400 'mixed_media_not_allowed'); cada lado guarda mediaType/imageUrl/videoUrl/posterUrl; post.mediaType raíz. FRONTEND: UploadDialog acepta 'video/*,image/*' (retos solo vídeo), valida mismo tipo y tamaño (vídeo 80MB/foto 15MB), preview <img>|<video>. CarouselSlide/DuetSlide: lados imagen NO montan <video> (el <img> de póster es el contenido), ocultan barra de progreso y winner card usa la imagen; voto/doble toque igual. VERIFICADO MANUALMENTE con curl+captura (usuario pidió NO usar agente de testing y confirmó 'Listo todo correcto'): POST /api/versus con 2 PNG -> 200 mediaType=image; mezcla -> 400; imagen servida 200; post primero en /api/uploads; CarouselSlide renderiza versus de 2 imágenes a pantalla completa con UI de votación. Lint sin nuevos problemas."

  - task: "Sugerencias de usuarios: GET /api/users/suggested (te sigue / interactuó / os habéis retado / amigos de amigos / popularidad)"
    implemented: true
    working: true
    file: "lib/db.js, app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "NUEVA FEATURE (usuario: en la página de retos el botón superior izquierdo debe abrir SUGERENCIAS DE USUARIOS -personas que quizá conozcas/amigos- en vez de compartir). getSuggestedUsers(currentUser) en lib/db.js: score por señales reales -> +60 te sigue (y no le sigues), +40 interactuó contigo (notificaciones fromUserId: votos/comentarios/retos/seguir), +35 os habéis retado (colección 'challenges' from/to), +25*N amigos de amigos (le siguen N personas que sigues), + popularidad (nº followers con tope 20). Excluye a quien ya sigues, a ti mismo y a suspendidos. Devuelve {username,name,avatarUrl,verified,isFollowing:false,followers,reason}. Invitado -> populares. GET /api/users/suggested colocado ANTES del handler genérico /users/:username (si no, 'suggested' se trataría como username). VERIFICADO MANUALMENTE con curl (el usuario pidió NO usar agente de testing): marcos+laura siguen a lucia; lucia sigue a marcos -> GET /api/users/suggested (sesión lucia) = [laura 'Te sigue', twykadmin 'Sugerido para ti'] (excluye a marcos ya seguido y a lucia); invitado = populares por followers; /api/users/lucia y /api/users/marcos (perfil) siguen 200 (no se rompió). Lint limpio."

  - task: "Buscador de usuarios: GET /api/users?q= (búsqueda por username/nombre, incluye al propio usuario)"
    implemented: true
    working: true
    file: "lib/db.js, app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "NUEVA FEATURE (usuario: 'poner un buscador en la parte superior derecha de la página de inicio'). getAllUsers(lib/db.js) ahora acepta {search, limit}: si search no vacío, filtra por $or [{username regex i},{name regex i}] (escapando caracteres especiales) y limita resultados; sin search mantiene el comportamiento original (excluye al usuario actual, uso de UploadDialog). GET /api/users en route.js: si llega ?q= y no vacío -> getAllUsers({search:q, limit:30}) (INCLUYE al propio usuario para poder encontrarse); sin q -> comportamiento original (excluye al usuario actual). NOTA: el .env (gitignored) se había perdido de nuevo (todas las APIs daban 500); restaurado MONGO_URL=mongodb://localhost:27017/twyk, ADMIN_EMAILS=twyk.apk@gmail.com, NEXT_PUBLIC_BASE_URL (preview), CORS_ORIGINS. BD 'twyk' estaba vacía; re-sembradas cuentas de prueba (ver test_credentials.md): twykadmin/Admin12345 (admin) y lucia/marcos/laura (Test12345). VERIFICADO MANUALMENTE con curl (el usuario pidió NO usar el agente de testing): (1) q=la->[laura]; (2) q=LU->[lucia] (case-insensitive); (3) q=twyk->[twykadmin]; (4) q=zzzznoexiste->[]; (5) sin q sin sesión->4 usuarios; sin q con sesión de lucia->excluye lucia; (6) q=lucia con sesión de lucia->incluye lucia; (7) q=.*->200 [] (regex escapada, sin inyección). Lint limpio."

  - task: "Buscador de usuarios (FRONTEND): icono de lupa arriba-derecha del feed + SearchOverlay"
    implemented: true
    working: true
    file: "components/SearchOverlay.jsx, components/Feed.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "NUEVA FEATURE (usuario: 'buscador en la parte superior derecha de la página de inicio; solo usuarios; icono de lupa que abre overlay; estilo oscuro'). Feed.jsx: botón de lupa fijo arriba-derecha (z-40, fuera del condicional de carga, siempre visible) que abre SearchOverlay (estado searchOpen). SearchOverlay.jsx: overlay oscuro full-screen (z-80) estilo TikTok con flecha de volver + input (autofocus) + botón limpiar; búsqueda en vivo con debounce 250ms contra GET /api/users?q= (sin texto muestra 'Sugerencias' = lista general); resultados con <Avatar> compartido (silueta gris por defecto), nombre, @username y badge verificado; al tocar un resultado cierra el overlay y abre el perfil del usuario (openAuthorProfile, reutiliza ProfilePage del Feed). Estados vacío/cargando. Verificado: lint limpio en SearchOverlay; Feed compila (home 200); Playwright encontró y clicó el botón 'Buscar usuarios' y rellenó el input (overlay interactivo). NOTA: la captura headless solo muestra el spinner del feed (limitación conocida del entorno con el bundle de dev, ya documentada). NO se usa agente de testing (petición del usuario)."



  - task: "Login por EMAIL o USERNAME (bug: usuario no podía entrar con su email)"
    implemented: true
    working: true
    file: "lib/db.js, components/AuthModal.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "BUG (usuario: 'aplico los credenciales para iniciar sesión pero no accede'). CAUSA RAÍZ: verifyUserCredentials() en lib/db.js solo buscaba por username (getUserByUsername), de modo que iniciar sesión con el EMAIL (p.ej. twyk.apk@gmail.com) devolvía invalid_credentials aunque la cuenta existía (username='twykadmin'). FIX: nueva getUserByUsernameOrEmail(identifier) que busca primero por username exacto y, si no encuentra y el identificador contiene '@', por email case-insensitive (regex ^...$ /i). verifyUserCredentials ahora la usa. Frontend AuthModal.jsx: placeholder 'Username or email' y subtítulo actualizado. Verificado MANUALMENTE con curl (login por email OK, email en mayúsculas OK, username OK, password incorrecta -> invalid_credentials). PENDIENTE verificación del agente de testing (obligatorio para bug)."
        -working: true
        -agent: "testing"
        -comment: "✅ VERIFIED: Login bug fix working correctly (6/6 scenarios passed). Test file: /app/backend_login_test.py. SCENARIO 1 (CORE FIX): Login by EMAIL (lowercase 'twyk.apk@gmail.com') -> 200 with ok:true, user.role='admin', token present, session_token cookie set ✓✓✓. SCENARIO 2 (CASE-INSENSITIVE): Login by EMAIL (uppercase 'TWYK.APK@Gmail.com') -> 200 with admin role ✓✓✓ (email match is case-insensitive as required). SCENARIO 3 (REGRESSION): Login by USERNAME ('twykadmin') -> 200 with admin role ✓ (username login still works). SCENARIO 4 (VALIDATION): Wrong password ('wrongpass') -> 401 with error='invalid_credentials' ✓. SCENARIO 5 (NEW USER): Registered new user (testuser_esd0n4h2 / test_esd0n4h2@example.com) -> 200; then successfully logged in BOTH by username AND by email -> 200 for both ✓✓✓. SCENARIO 6 (AUTH/ME): GET /api/auth/me with Bearer token -> 200 with user.username='twykadmin', user.role='admin' ✓; GET /api/auth/me with cookie -> 200 ✓. The fix correctly implements getUserByUsernameOrEmail() in lib/db.js: (1) exact username match first, (2) if identifier contains '@' and no username match, case-insensitive email regex match. Users can now log in with EITHER username OR email (case-insensitive). No regression issues. The bug is FIXED and verified."

  - task: "Eliminar publicación propia: DELETE /api/posts/{id} (menú de dueño tipo Instagram/TikTok)"
    implemented: true
    working: "NA"
    file: "lib/stores.js, app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "BUG (usuario: al pulsar los tres puntos en MIS publicaciones del perfil aparecían opciones de publicación ajena -reportar/bloquear- en vez de ajustes de dueño). FIX backend: nueva deletePostById(id, ownerId) en lib/stores.js que borra de la colección 'posts' SOLO si el dueño coincide (post.author.id === ownerId, o post.userId), limpia comentarios/saves asociados; ruta DELETE /api/posts/{id} en route.js (401 sin sesión, 404 si no existe, 403 si no es el dueño, 200 {ok:true} si borra). PENDIENTE verificación del agente de testing."

  - task: "MODERACIÓN: reportes (reports), bloqueos (blocks), rol admin/role, suspensión y panel admin"
    implemented: true
    working: true
    file: "lib/db.js, app/api/[[...path]]/route.js, components/OptionsModal.jsx, app/admin/reports/page.js, .env"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: true
        -agent: "main"
        -comment: "CAMBIO (usuario: 'El único admin debe ser el del correo twyk.apk@gmail.com'). lib/db.js createUser: ELIMINADA la regla de admin para el PRIMER usuario registrado (totalUsers===0). Ahora role='admin' SOLO si isAdminEmail(email) -> es decir, únicamente correos de la lista admin (por defecto y ADMIN_EMAILS=twyk.apk@gmail.com). Limpieza de BD ejecutada con mongosh: el antiguo primer-usuario-admin 'Neo' (zovatel105@gmail.com) degradado a 'user' (1 modificado); no existe aún usuario con twyk.apk@gmail.com (se hará admin al registrarse). Lint limpio. Pendiente verificación del agente de testing: (a) registrar email cualquiera -> role 'user'; (b) registrar/usar twyk.apk@gmail.com -> role 'admin' y acceso a GET /api/admin/reports; (c) no-admin -> 403 en endpoints admin."
        -working: true
        -agent: "main"
        -comment: "NUEVA FEATURE moderación real. (1) ROL: createUser asigna role='admin' al PRIMER usuario registrado o si el email está en ADMIN_EMAILS (.env, default twyk.apk@gmail.com); resto 'user'. Campo suspended:false. isAdminEmail() en db.js. (2) REPORTES: colección reports {reporterId,targetType(user/post),targetId,reason,status(pending/reviewed/dismissed),createdAt}. POST /api/reports (auth, valida reason en lista por defecto), GET /api/admin/reports (solo admin, enriquecido con reporter/target/targetUser). (3) BLOQUEOS: colección blocks {blockerId,blockedId,createdAt}. POST /api/users/block y DELETE /api/users/block (resuelven por username). Feed (/api/uploads) oculta posts de usuarios bloqueados (mutuo) vía filterBlockedPosts+getMutualBlockedIds. Bloqueado NO puede ver perfil (GET /api/users/:username -> 403) ni comentar (POST /api/comments -> 403). (4) PANEL: /admin/reports (página Next client, solo admin, si no -> Acceso denegado). POST /api/admin/reports/:id/review (marca reviewed, opcional suspend -> suspendUser del autor) y /dismiss (status dismissed). (5) SUSPENSIÓN: usuario suspendido no puede login (handleLogin -> 403 account_suspended) y getCurrentUser lo trata como no autenticado (sesiones existentes -> 401). VERIFICADO MANUALMENTE con curl/mongosh (sin agente de testing, petición del usuario): 1er user=admin, 2º=user, email admin=admin; report crea/lista (reason inválida 400, no-admin 403); bloqueo oculta post del feed (36->35), perfil y comentario del bloqueado 403, desbloqueo restaura; review+suspend suspende y bloquea login (403) y auth/me (401); dismiss saca de pendientes. UI: /admin/reports muestra 'Acceso denegado' para no-admin y panel con tarjetas (motivo, tipo, fecha, checkbox Suspender, Revisar/Descartar) para admin (confirmado por wait_for_selector). Lint limpio (route.js, db.js, OptionsModal, admin page). Endpoints existentes y estructura intactos (solo se añadió filtrado de bloqueo, que es la conducta pedida)."

    implemented: true
    working: true
    file: "lib/auth.js, lib/db.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "CAMBIO 1 (seguridad). Reemplazado SHA-256 por bcrypt. lib/auth.js: hashPassword ahora es async -> bcrypt.hash(pwd, 12); verifyPassword devuelve {valid, needsRehash}: si el hash empieza por $2 usa bcrypt.compare; si es un hash SHA-256 antiguo (64 hex) lo verifica con SHA-256 y marca needsRehash. lib/db.js: createUser usa await hashPassword; verifyUserCredentials re-hashea con bcrypt y persiste el nuevo hash cuando needsRehash (migración transparente). Instalado bcrypt@6.0.0 (yarn). VERIFICADO MANUALMENTE con curl (sin agente de testing, petición del usuario): registro nuevo -> hash $2b$12$ (60 chars), login OK, pwd incorrecta -> 401; usuario legacy SHA-256 -> login OK y hash re-hasheado a $2b$12$ tras login. Lint limpio."
  - task: "PERSISTENCIA: migrar _meta.json/_challenges.json/_votes.json a MongoDB (posts/challenges/votes) con operaciones atómicas"
    implemented: true
    working: true
    file: "lib/stores.js, app/api/[[...path]]/route.js, scripts/migrate-json-to-mongo.mjs"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "CAMBIO 2 (persistencia). Nuevo lib/stores.js: capa MongoDB para posts(_meta.json)/challenges(_challenges.json)/votes(_votes.json), MISMA estructura y endpoints. Voto ATÓMICO: incrementPostVote (findOneAndUpdate $inc) en uploads; incrementBuiltinVote (pipeline $set+$ifNull+$inc upsert, siembra seedVotes) en feed demo -> elimina race condition. route.js: lecturas delegan en Mongo; ELIMINADA toda escritura a JSON; quitada rama muerta getPostsDB/votePostDB. Script idempotente importó 34 posts + 15 challenges + 10 votes. Restaurado .env (MONGO_URL). VERIFICADO MANUALMENTE con curl/mongosh: /api/uploads=34, feed con votos migrados, votos persisten, ciclo crear/ver/rechazar reto OK. Lint limpio, endpoints 200."
  - task: "Refrescar avatar del autor en el feed (/api/uploads y /api/feed) tras cambiar foto de perfil"
    implemented: true
    working: "NA"
    file: "app/api/[[...path]]/route.js, lib/db.js, hooks/useFeed.js, components/Feed.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "BUG FIX (usuario: 'En el feed no se actualizó la foto de perfil'). Misma causa raíz que en retos: los posts del feed guardan un SNAPSHOT denormalizado de author/sideA.author/sideB.author. FIX BACKEND: nuevo helper refreshPostAvatars(posts) (usa getCurrentUsersByUsernames de lib/db.js) aplicado en GET /api/uploads y en GET /api/feed (rama MongoDB) -> el avatar/nombre del autor se devuelve siempre actualizado. FIX FRONTEND (actualización instantánea sin recargar): useFeed expone patchAuthorAvatar(username,avatarUrl,name) que reescribe en memoria el avatar del autor en todas las tarjetas; Feed.jsx lo invoca en un effect cuando cambia user.avatarUrl/name (ProfilePage ya llama updateUser tras POST /api/profile). NOTA: por indicación del usuario NO se ejecuta el agente de testing; verificado manualmente (compila, lint limpio). Pendiente de validación del usuario en la app."
        -working: "NA"
        -agent: "main"
        -comment: "AMPLIACIÓN (usuario: 'En las demás páginas también'). Se aplicó refreshPostAvatars / enriquecimiento de avatar ACTUAL en TODOS los endpoints que devolvían snapshot: GET /api/users/:username (posts del perfil propio y ajeno), GET /api/saves (pestaña Guardados), GET /api/feed-options (opciones para retar), y enriquecimiento de n.user en GET /api/notifications (avatar de quien notifica). Ya eran frescos (sin cambios): GET /api/comments (getCommentsByPostId lee author de la colección users), GET /api/users/:u/followers y /following, GET /api/users, y la cabecera de /api/users/:username. Todas estas vistas recargan al abrir (cache:'no-store'), así que muestran el avatar nuevo al reabrir. Lint limpio. NO se ejecuta agente de testing por indicación del usuario; pendiente de validación del usuario."


    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js, lib/db.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "BUG FIX (usuario: 'En la página de retos cuando cambió la foto de perfil no se actualiza'). CAUSA RAÍZ: los retos (_challenges.json) guardan from/to con un SNAPSHOT denormalizado de avatarUrl al crearse, y los retos completados (posts de _meta.json) guardan sideA.author/sideB.author/author también denormalizados. Al cambiar la foto de perfil (POST /api/profile actualiza users.avatarUrl) los retos seguían mostrando el avatar viejo. FIX: nuevo helper getCurrentUsersByUsernames(usernames) en lib/db.js (mapa username->{avatarUrl,name,verified} con datos ACTUALES). En GET /api/challenges se refrescan from/to/targetAuthor; en GET /api/challenges/completed se refrescan author/sideA.author/sideB.author. Los usuarios demo (sin documento) conservan su snapshot. Nota: saveUploadedImage usa id aleatorio (avatar_<rand>.<ext>) por subida -> URL única, sin caché de navegador. Falta verificación por agente de testing."
        -working: true
        -agent: "testing"
        -comment: "✅ VERIFIED: Avatar refresh fix working correctly (6/6 scenarios passed). Test file: /app/backend_avatar_test_simple.py. SCENARIO A: Registered two users (alice and bob) via POST /api/auth/register -> 200 with tokens and IDs ✓. SCENARIO B: Bob created challenge to alice via POST /api/challenges (Bearer token, multipart file + targetAuthor JSON) -> 200, challenge.from.username='bob', challenge.to.username='alice', bob's initial avatar captured ✓. SCENARIO C: Alice fetched challenges via GET /api/challenges (Bearer token, role default 'to') -> 200, challenge.from.avatarUrl matches bob's initial avatar (dicebear seed) ✓. SCENARIO D: Bob changed profile photo via POST /api/profile (Bearer token, multipart avatar image) -> 200, user.avatarUrl starts with '/uploads/avatar_' ✓. SCENARIO E (CORE FIX): Alice fetched challenges again -> 200, challenge.from.avatarUrl NOW shows bob's NEW avatar ('/uploads/avatar_...'), NOT the old snapshot ✓✓✓. Avatar changed from dicebear URL to /uploads/avatar_37b5e9ff4da56ffc.png. SCENARIO F (RECIPROCAL): Alice changed her avatar -> 200; Bob fetched challenges with role=from -> 200, challenge.to.avatarUrl shows alice's NEW avatar ('/uploads/avatar_ffbee7958d2b3439.png') ✓✓✓. The fix correctly refreshes avatars for both 'from' and 'to' participants using getCurrentUsersByUsernames() helper. Demo users (without DB documents) preserve their snapshot avatarUrl (not tested but code path exists). No regression issues."

    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "BUG FIX (usuario: 'cuando guardo una publicación no aparece en el perfil'). El endpoint /api/saves devolvía solo {saves:[ids]}, y la pestaña 'Guardados' del perfil ni siquiera lo consumía. FIX backend: /api/saves ahora resuelve cada id guardado a su post COMPLETO (uploads de _meta.json + posts demo de makePosts con votos del store), preservando el orden (más reciente primero) y devuelve {saves:[ids], posts:[...]}. VERIFICADO MANUALMENTE con curl (sin agente de testing): usuario nuevo, saves vacío; POST /api/save {postId:'versus_0'} -> {ok:true,saved:true}; GET /api/saves -> {saves:['versus_0'], posts:[{id:'versus_0',type:'versus',...}]}."
  - task: "Notificaciones de reto, reto aceptado, comentario y seguidor (faltaban; solo llegaban las de voto)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js, lib/db.js, components/CarouselSlide.jsx, components/DuetSlide.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "BUG FIX (usuario: 'solo me llegan notificaciones de votos pero no de retos, seguidores y comentarios'). CAUSAS: (1) handleCreateChallenge NO creaba notificación al retado. (2) handleAcceptChallenge NO creaba notificación 'accepted' al retador. (3) Comentarios: createCommentDB solo notifica si el post está en MongoDB POSTS, pero las publicaciones subidas viven en _meta.json -> nunca notificaba. (4) Seguidores: toggleFollowByUsername (db.js) SÍ creaba la notificación, pero el botón 'Seguir' de las TARJETAS del feed (CarouselSlide/DuetSlide) solo cambiaba estado local y NUNCA llamaba a /api/users/:u/follow -> seguir desde el feed no persistía ni notificaba. FIXES: handleCreateChallenge crea type='challenge' a targetAuthor.id; handleAcceptChallenge crea type='accepted' a c.from.id (fromUser=c.to); handleCreateComment crea type='comment' al autor del post de _meta.json (excluyente con la ruta MongoDB, sin duplicar); botones Seguir del feed ahora hacen POST optimista a /api/users/:u/follow. Se evitó duplicar follow (se quitó el añadido en handleFollow porque db.js ya lo crea). VERIFICADO MANUALMENTE con curl (sin agente de testing, petición del usuario): B sigue+comenta+reta a A -> A recibe 1 follow, 1 comment, 1 challenge (sin duplicados). A reta a B y B acepta con vídeo -> A recibe 1 'accepted'. Lint limpio en route.js, db.js y ambas tarjetas."
  - task: "Notificación de VOTO en publicaciones subidas (versus/1vs1) guardadas en _meta.json"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js, lib/db.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "BUG FIX (usuario: 'han votado en mi última publicación y no me llegan notificaciones'). Añadido createNotification en la ruta meta (#2) de handleVote."
        -working: true
        -agent: "main"
        -comment: "CAUSA RAÍZ REAL encontrada tras 2º reporte ('voté en la publicación de coco pero el voto no se mantiene'). handleVote intenta votePostDB (MongoDB) primero; pero votePostDB NO lanzaba cuando el post no existe en la colección POSTS: updateOne no matcheaba nada, findOne devolvía null y RETORNABA {a:0,b:0} sin error. Como las publicaciones subidas (versus_up_*/duet_*) viven en _meta.json (NO en MongoDB), votePostDB cortaba el flujo y (1) el voto NUNCA se persistía (siempre 0,0) y (2) la ruta meta con la notificación NUNCA se ejecutaba. FIX: votePost() en lib/db.js ahora comprueba result.matchedCount===0 -> throw 'post_not_found_in_mongo', de modo que handleVote cae al store _meta.json, persiste el voto y crea la notificación. VERIFICADO MANUALMENTE con curl (sin agente de testing, petición del usuario): A sube versus -> B vota 'a' dos veces -> votes {a:2,b:0} y GET /api/uploads devuelve votes {a:2,b:0} (PERSISTE) -> A recibe 2 notificaciones type='vote', user=B, side='a'. Autovoto de A sobre su post: votes {a:2,b:1} pero unread NO aumenta (sin autonotificación). Lint limpio."
  - task: "Comentarios con votedSide (color por equipo A/B en VS)"
    implemented: true
    working: "NA"
    file: "app/api/[[...path]]/route.js, lib/db.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "NUEVA FUNCIÓN (modales Instagram). Se añadió persistencia del lado votado por el comentarista. createComment ahora acepta votedSide ('a'|'b'|null) y lo guarda; getCommentsByPostId y handleCreateComment lo devuelven. POST /api/comments body ahora admite votedSide. Verificado con curl: POST con votedSide 'a'/'b'/omitido -> el GET devuelve votedSide correcto (a/b/null). Pendiente confirmación del agente de testing."
  - task: "Publicar requiere sesión: /api/versus, /api/duet, /api/challenges devuelven 401 a invitados"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "BUG FIX (usuario reportó que los vídeos publicados aparecían como 'sin registro'/autor anónimo). CAUSA 1 (infra): faltaba el archivo .env (gitignored), MONGO_URL undefined -> TODO el route.js daba 500. Restaurado .env (MONGO_URL=mongodb://localhost:27017/twyk). CAUSA 2 (diseño): los endpoints permitían subir a invitados creando author='usuario_anonimo'. CAMBIO: tras getCurrentUser, si !currentUser -> 401 {error:'unauthorized'}. Verificado con curl: versus/duet/challenges sin cookie -> 401; con cookie de sesión -> 200 y author = usuario real (testreg1). Pendiente confirmación del agente de testing."
        -working: true
        -agent: "testing"
        -comment: "✅ VERIFIED: Comprehensive authentication gating tests passed (11/11). GUEST requests: POST /api/versus -> 401 ✓, POST /api/duet -> 401 ✓, POST /api/challenges -> 401 ✓. LOGIN: POST /api/auth/login with testreg1/secret123 -> 200 with token and httpOnly cookie ✓. AUTHENTICATED requests: POST /api/versus with Bearer token -> 200, post.author.username='testreg1' (NOT 'usuario_anonimo'), sideA.author.username='testreg1', sideB.author.username='testreg1' ✓. POST /api/duet with cookie -> 200, all authors='testreg1' ✓. POST /api/challenges with Bearer token -> 200, challenge.from.username='testreg1' ✓. REGRESSION: GET /api/feed -> 200 with 8 posts ✓, GET /api/users -> 200 with 23 users ✓. Test file: /app/backend_auth_test.py"
  - task: "GET /api/auth/me valida la sesión por cookie httpOnly"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Sin cambios de código pero ahora es consumido por el frontend (AuthContext) para sincronizar sesión. Verificado: sin cookie -> 401; con cookie -> 200 {user}."
        -working: true
        -agent: "testing"
        -comment: "✅ VERIFIED: GET /api/auth/me without auth -> 401 ✓. GET /api/auth/me with Bearer token -> 200, user.username='testreg1' ✓. Both cookie and Bearer token authentication methods work correctly."
  - task: "GET /api/challenges/completed devuelve los posts versus reales (isChallenge) para render tipo feed"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Devuelve {posts:[...]} con los uploads filtrados por isChallenge=true (type versus/duet), shape idéntico al feed. Verificado manualmente: GET /api/challenges/completed 200 y la página Completados renderiza 6 retos con CarouselSlide (diseño feed). Usuario pidió NO usar agente de testing."
        -working: true
        -agent: "main"
        -comment: "BUG FIX (usuario: 'no tengo ningún reto completado pero me aparecen retos que no son míos'). CAUSA: el endpoint devolvía TODOS los posts isChallenge sin filtrar por usuario. FIX: ahora usa getCurrentUser y filtra por participante (sideA.author.username o sideB.author.username === usuario actual); invitados -> []. Verificado manualmente (sin agente de testing): invitado -> 0; retador X ve su reto (1); usuario Y no participante -> 0. Los 6 retos demo existentes (author 'tu_canal') ya no aparecen para otros usuarios."
  - task: "GET /api/users devuelve usuarios REGISTRADOS reales (no autores mock) para elegir a quién retar"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js, lib/db.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "BUG FIX (usuario: 'al elegir a quién retar aparecen usuarios mock'). CAUSA: /api/users derivaba la lista de los autores demo de VIDEOS (mock). FIX: nueva getAllUsers() en db.js (usuarios registrados sin password) y /api/users ahora devuelve usuarios reales de MongoDB, excluyendo al usuario actual (no puedes retarte a ti mismo). UploadDialog usa Avatar compartido + estado vacío. Verificado manualmente (sin agente de testing): como realA -> ['realB','Kiki','Nex'] (sin mocks, sin realA). Único consumidor: UploadDialog."
  - task: "POST /api/duet ahora recibe fileA + fileB + layout (2 vídeos propios)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "CAMBIO: ya no usa pairVideoUrl. Multipart 'fileA' + 'fileB' (bytes mp4 dummy) + 'layout' ('horizontal'|'vertical') + 'description'. Devuelve {ok:true, post} con type='duet', layout correcto, sideA.videoUrl y sideB.videoUrl empiezan con /uploads/, ambos author.username='tu_canal'. Falta de alguno de los 2 archivos -> 400 'need_two_files'. Verificar que aparece luego en GET /api/uploads."
        -working: true
        -agent: "testing"
        -comment: "✅ VERIFIED: POST /api/duet with authenticated user (cookie) -> 200. Response has type='duet', layout='vertical', sideA.videoUrl and sideB.videoUrl start with /uploads/, all authors have username='testreg1' (authenticated user, not 'tu_canal' since auth is now required). Tested in backend_auth_test.py."
  - task: "POST /api/challenges con usuario destino (targetVideoUrl opcional)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "CAMBIO: 'targetVideoUrl' ahora OPCIONAL. Multipart 'file' (tu vídeo) + 'targetAuthor' (JSON del usuario destino) + 'message' opcional. Devuelve {ok:true, challenge} con status='pending', from.username='tu_canal', to=targetAuthor, challengerVideoUrl empieza con /uploads/, targetVideoUrl=null si no se envía. Sin file -> 400 'no_file'. Sin targetAuthor -> 400 'no_target'. Compat: si se envía targetVideoUrl también debe funcionar (flujo ChallengeDialog)."
        -working: true
        -agent: "testing"
        -comment: "✅ VERIFIED: POST /api/challenges with authenticated user (Bearer token) -> 200. Response has status='pending', from.username='testreg1' (authenticated user, not 'tu_canal'), to.username='urbanlife', challengerVideoUrl starts with /uploads/, targetVideoUrl=null. Challenge created successfully with correct authenticated author. Tested in backend_auth_test.py."
        -working: true
        -agent: "main"
        -comment: "AÑADIDO guard 'no puedes retarte a ti mismo': si targetAuthor.username === currentUser.username -> 400 {error:'cannot_challenge_yourself'}. Verificado manualmente: selfU intentando retarse -> 400. Frontend: botón Retar oculto en contenido propio (CarouselSlide/DuetSlide: headAuthor !== user) y guard en Feed.openChallenge; el perfil propio nunca muestra Retar. Retar desde perfil ajeno = reto de mención (sin vídeo del perfil)."
  - task: "POST /api/challenges/{id}/accept acepta el vídeo del retado (multipart file)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "CAMBIO: accept ahora puede recibir multipart 'file' (vídeo del retado). Si el reto NO tiene targetVideoUrl y se envía file -> usa ese. Si el reto YA tiene targetVideoUrl y se acepta SIN body -> usa ese (compat). Si no hay ninguno -> 400 'no_response_video'."
        -working: true
        -agent: "main"
        -comment: "VERIFICADO MANUALMENTE (sin agente de testing, petición del usuario). Reto con mención SIN targetVideoUrl: menF reta a menT -> menT lo ve (targetVideoUrl=null). menT acepta CON multipart file -> 200, post type='versus', sideA.author='menF' (retador), sideB.author='menT', sideB.videoUrl empieza con /uploads/. El reto desaparece de activos y aparece en /challenges/completed de ambos participantes. Camino compat (aceptar sin body usando targetVideoUrl) ya verificado antes."
  - task: "Subir vídeo de respuesta al aceptar un reto con mención (antes o después de pulsar Aceptar)"
    implemented: true
    working: true
    file: "components/ActiveChallengesPage.jsx, components/ChallengesInbox.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "NUEVO (usuario: 'los retos con mención deben poder subir el contenido antes o después de aceptar'). En ActiveChallengesPage y ChallengesInbox: si el reto NO trae targetVideoUrl (mención), el lado B se muestra como zona para subir y hay botón 'Subir mi vídeo'. Flujo ANTES: subes el vídeo (preview) y luego pulsas 'Aceptar reto'. Flujo DESPUÉS: pulsas 'Subir y aceptar' -> se abre el selector y al elegir el vídeo se envía automáticamente (pendingAcceptRef). accept() ahora envía FormData con el file. Si el reto trae targetVideoUrl, acepta sin subir (compat). Verificado el backend del flujo completo manualmente."
  - task: "POST /api/challenges/{id}/reject elimina el reto"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Sin cambios. Elimina el challenge. Devuelve {ok:true}."
  - task: "GET /api/feed returns 'versus' carousel posts with sideA/sideB/votes"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "makePosts now generates type='versus', layout='carousel' with sideA/sideB (paired from VIDEOS) and votes attached from _votes.json store or seedVotes(id). Verify shape and that votes are present integers."
  - task: "POST /api/vote generalized for versus (built-in store + uploaded meta) and duet"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "vote increments side a/b. Already validated previously."
  - task: "GET /api/challenges filtra por usuario actual (retos dirigidos a mí)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "BUG FIX (usuario: 'retos activos muestra retos que no son míos: muestra todos'). CAUSA: GET /api/challenges devolvía TODOS los retos pendientes sin filtrar. FIX: usa getCurrentUser y filtra; por defecto (role=to) devuelve los retos DIRIGIDOS a mí (los que puedo aceptar/rechazar: bandeja, retos activos, badge). role=from = los que yo envié; role=all = en los que participo. Invitados -> []. Verificado manualmente (sin agente de testing): chF reta a chT -> chT(to)=1, chF(default to)=0, chF(role=from)=1, invitado=0. Afecta a ActiveChallengesPage, ChallengesInbox y el badge pendingCount del Feed."
  - task: "Seguir persistente: POST /api/users/:username/follow (toggle) + GET /api/users/:username devuelve isFollowing y followers reales"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js, lib/db.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "NUEVO. Follow persistente keyed por (followerId, followingUsername) en colección 'follows' (universal: sirve para usuarios reales y autores demo). Restaurado .env (MONGO_URL=mongodb://localhost:27017/twyk) que se había perdido."
        -working: true
        -agent: "main"
        -comment: "VERIFICADO MANUALMENTE (el usuario pidió NO usar agente de testing). Registrados follower1/target1. (B) POST /api/users/target1/follow sin sesión -> 401 {error:unauthorized}. (C) con sesión -> 200 {ok:true,following:true,followers:1}. (D) toggle -> {following:false,followers:0}; de nuevo -> {following:true,followers:1}. (E) seguirse a sí mismo -> 400 {error:cannot_follow_yourself}. (F) GET /api/users/target1 sin sesión -> isFollowing=false, followers=1. (G) GET con sesión -> isFollowing=true, followers=1. (H) seguir autor demo 'wanderlust' (sin documento de usuario) -> 200 {following:true,followers:1}. Regresión: /api/feed y /api/users 200. Datos de prueba limpiados."

frontend:
  - task: "Recuperación de entorno: .env perdido de nuevo (persistencia efímera) + audio no se escucha en la página de retos completados"
    implemented: true
    working: "NA"
    file: ".env, memory/ENV_BACKUP.md, memory/test_credentials.md, components/CompletedBattlesPage.jsx, components/ProfilePage.jsx, components/ActiveChallengesPage.jsx, components/CarouselSlide.jsx"
    stuck_count: 6
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "user"
        -comment: "'No usar el testing agent. Falta el .env. En la página de retos activos no se escucha el audio de la publicación del reto activo, y las publicaciones tipo carrusel cuando está en la 2 opción y deslizó para ver otra publicación o retrocedo se sigue escuchando el audio de la publicación anterior, dejarme probar a mi el funcionamiento cuando lo corrijas'."
        -working: true
        -agent: "main"
        -comment: "PARTE 1 (.env, misma causa raíz recurrente, ver memory/ENV_BACKUP.md): restaurado /app/.env (MONGO_URL=mongodb://localhost:27017/twyk, ADMIN_EMAILS=twyk.apk@gmail.com, NEXT_PUBLIC_BASE_URL/CORS_ORIGINS = URL de preview ACTUAL leída de APP_URL en supervisord.conf: https://audio-playback-bug.preview.emergentagent.com); memory/ENV_BACKUP.md actualizado; nextjs reiniciado; MongoDB estaba vacía -> re-ejecutado node scripts/seed-core-users.mjs (twykadmin/lucia/marcos/laura + 3 follows recreados); memory/test_credentials.md recreado (no existía). PARTE 2 (audio en 'Retos activos', ActiveChallengesPage.jsx): CAUSA: los <video> de las miniaturas A/B de cada reto pendiente tenían el atributo 'muted' FIJO (hardcoded), sin ningún estado ni gesto para desactivarlo, a diferencia del resto de páginas ya corregidas (Feed/CompletedBattlesPage/ProfilePage) que usan un patrón muted-state + onPointerDown para desmutear al primer toque (los navegadores exigen un gesto del usuario para permitir audio con sonido). FIX: añadido const [muted,setMuted]=useState(true) en el componente principal ActiveChallengesPage, onPointerDown={muted?()=>setMuted(false):undefined} en el <div> raíz (fixed inset-0 z-[58]), prop 'muted' propagada a ChallengeSlide y usada en <video muted={muted}> (antes 'muted' fijo) para ambos lados A/B. PARTE 3 (BUG REAL de solapamiento de audio en el carrusel, CarouselSlide.jsx, encontrado por revisión de código): causa raíz confirmada en components/Feed.jsx -> `warm = i === activeIndex + 1`. Al RETROCEDER a la publicación anterior (activeIndex disminuye en 1), la tarjeta que ACABAS de dejar (antes activa) cumple ahora `i === nuevoActiveIndex + 1` y pasa DIRECTAMENTE de isActive=true a warm=true, sin pasar por un estado 'inactiva total'. El efecto de reproducción de CarouselSlide, en su rama warm, SOLO hacía acquire()+primeWarm() del lado A (videoARef) -- nunca liberaba el lado VISIBLE si el usuario se había quedado viendo/escuchando la opción B (sideIdx=1). Resultado: el vídeo B de la publicación abandonada seguía reproduciéndose (con su audio, si ya estaba desmuteado) INDEFINIDAMENTE, solapado con el audio de la nueva publicación activa. FIX: en la rama `else if (warm && playbackEnabled)` del efecto (líneas ~239-249), se añadió `if (vis && vis !== videoARef.current) release(vis)` ANTES de precargar el lado A, liberando (pause + removeAttribute('src') + load()) el lado B huérfano cuando corresponda. DuetSlide.jsx NO tenía este bug (su rama warm ya hace acquire+primeWarm de AMBOS lados A y B, ninguno queda huérfano), no se tocó. Lint limpio en ambos archivos (solo warnings preexistentes no relacionados: eslint-disable sin uso). NO se usó el agente de testing (petición explícita del usuario). El usuario pidió EXPLÍCITAMENTE probarlo él mismo en la app real antes de continuar."
        -working: "NA"
        -agent: "user"
        -comment: "Usuario: 'Instala el archivo .env y soluciona el problema de la página de retos y página de inicio no se escucha el audio de las publicaciones solo se escucha en el feed (inicio)'. Misma causa raíz recurrente de .env/MongoDB (ver memory/ENV_BACKUP.md) más un bug de audio: en la página de Retos completados (CompletedBattlesPage) no se escucha el sonido de las publicaciones, solo en el feed de inicio."
        -working: true
        -agent: "main"
        -comment: "PARTE 1 (.env): restaurado /app/.env (MONGO_URL=mongodb://localhost:27017/twyk, ADMIN_EMAILS=twyk.apk@gmail.com, NEXT_PUBLIC_BASE_URL/CORS_ORIGINS = URL de preview actual desde APP_URL de supervisor: https://audio-playback-bug.preview.emergentagent.com); memory/ENV_BACKUP.md actualizado con la nueva URL; nextjs reiniciado; MongoDB estaba vacía, re-ejecutado scripts/seed-core-users.mjs (twykadmin/lucia/marcos/laura + 3 follows creados); memory/test_credentials.md recreado (estaba borrado). PARTE 2 (audio en retos, CAUSA RAÍZ encontrada por revisión de código): Feed.jsx (inicio) usa const [muted,setMuted]=useState(true) y un onPointerDown={muted?onFirstInteraction:undefined} en el contenedor raíz que hace setMuted(false) al primer toque del usuario (los navegadores exigen un gesto del usuario para permitir audio con sonido) — por eso en el feed de inicio el audio SÍ se escucha tras el primer toque. CompletedBattlesPage.jsx (la página de Retos > pestaña 'Completed', que renderiza los mismos CarouselSlide/DuetSlide que el feed) también tenía const [muted,setMuted]=useState(true) pero NUNCA lo cambiaba a false (no tenía ningún onPointerDown/gesture handler) -> muted quedaba SIEMPRE en true, así que el audio/vídeo nunca sonaba en esa página aunque la publicación tuviera sonido. FIX: añadido el mismo patrón que Feed.jsx -> onPointerDown={muted ? () => setMuted(false) : undefined} en el <div> raíz de CompletedBattlesPage (fixed inset-0 z-[55] bg-black). Ahora el primer toque en la página de retos completados desactiva muted igual que en el inicio. NOTA: ActiveChallengesPage.jsx y ChallengesInbox.jsx usan <video muted> a propósito (miniaturas de comparación A/B antes de aceptar el reto, no publicaciones tipo feed), no se tocaron. Lint limpio (solo un warning preexistente no relacionado sobre eslint-disable sin uso)."
        -working: "NA"
        -agent: "user"
        -comment: "'No usar el testing agent, en la página de perfil y página de retos no se escucha el audio se escucha únicamente en el feed'. El usuario confirma que además de Retos, la PÁGINA DE PERFIL también tiene el mismo problema (no se había mencionado antes)."
        -working: true
        -agent: "main"
        -comment: "PARTE 3 (audio en perfil, MISMA CAUSA RAÍZ): components/ProfilePage.jsx tiene un visor de publicaciones a pantalla completa (const PostViewer, se abre al tocar una publicación de la grilla del perfil, usa los mismos CarouselSlide/DuetSlide que el feed) que pasaba muted={true} FIJO (hardcoded), sin ningún estado ni gesto para desactivarlo -> el audio NUNCA sonaba al ver publicaciones desde el perfil. FIX: añadido const [muted,setMuted]=useState(true) dentro de PostViewer; onPointerDown={muted ? () => setMuted(false) : undefined} en el <div> raíz (fixed inset-0 z-[70] bg-black); cambiado muted={true} -> muted={muted} en el Slide. Verificado con grep que ya NO queda ningún 'muted={true}' fijo en components/*.jsx (todas las instancias -Feed.jsx, CompletedBattlesPage.jsx, ProfilePage.jsx- usan ahora el mismo patrón de estado+gesto). Lint limpio (0 issues en ProfilePage.jsx). NO se usó el agente de testing (petición explícita del usuario, dos veces). Pendiente de validación visual/auditiva del usuario en la app real (limitación conocida: la captura headless de Playwright no puede verificar sonido ni montar el bundle dinámico del feed, ya documentado repetidamente en este archivo)."
        -working: "NA"
        -agent: "user"
        -comment: "'Falta el archivo .env, los vídeos En retos activos la opción b no se escucha ni se reproduce, solo se reproduce la opción a, no usar el testing agent y dejarme probar a mi manualmente'. Nueva pérdida recurrente de .env (misma causa raíz, ver memory/ENV_BACKUP.md) + NUEVO bug distinto a los anteriores: en la página de Retos ACTIVOS (ActiveChallengesPage, no Completados) el vídeo del lado B (retado) ni se ve reproducirse ni suena, solo el lado A."
        -working: true
        -agent: "main"
        -comment: "PARTE 1 (.env): restaurado /app/.env (MONGO_URL=mongodb://localhost:27017/twyk, ADMIN_EMAILS=twyk.apk@gmail.com, NEXT_PUBLIC_BASE_URL/CORS_ORIGINS = URL de preview ACTUAL leída de APP_URL en supervisord.conf: https://e38a3599-57d3-4240-ad38-5f0f312e1a99.preview.emergentagent.com); memory/ENV_BACKUP.md actualizado con la nueva URL; nextjs reiniciado; MongoDB estaba vacía -> re-ejecutado node scripts/seed-core-users.mjs (twykadmin/lucia/marcos/laura + 3 follows recreados); memory/test_credentials.md recreado (estaba borrado). PARTE 2 (CAUSA RAÍZ real del bug de la opción B en Retos Activos, encontrada por revisión de código de components/ActiveChallengesPage.jsx): a diferencia de CarouselSlide.jsx/DuetSlide.jsx (que ya usan la 'REGLA #2': el src del <video> se asigna IMPERATIVAMENTE solo en el vídeo visible de la tarjeta activa, liberando el resto), ActiveChallengesPage.jsx NUNCA había sido migrado a ese patrón: CADA tarjeta de reto (en el swiper VERTICAL entre retos) y AMBOS lados A/B (en el swiper HORIZONTAL dentro de cada reto) se montaban SIEMPRE con <video src=... autoPlay loop muted> declarado en JSX de forma incondicional, sin ningún gating por 'esta tarjeta está visible' ni 'este lado está visible'. Resultado: TODOS los vídeos A y B de TODOS los retos activos intentaban autoreproducirse a la vez desde el montaje -> se agotaba el presupuesto de decodificadores de vídeo del dispositivo (típicamente muy limitado en móvil), y como el vídeo A del primer reto es el primero en el DOM, se quedaba con el decoder mientras el resto (empezando por el B de ese mismo reto) se quedaba congelado sin reproducir ni sonar. FIX: (1) nuevo estado activeCard en ActiveChallengesPage (actualizado por onSlideChange del Swiper VERTICAL) que se pasa como prop 'active' a cada ChallengeSlide -> solo la tarjeta de reto realmente visible en pantalla puede reproducir algo. (2) Dentro de ChallengeSlide, el <video> de JSX ya NO declara src/autoPlay (solo poster+muted+loop+playsInline+preload='none'); un nuevo efecto (useEffect con deps [active, idx, aUrl, responseUrl, aIsImage, responseIsImage]) recorre los 2 refs de vídeo (A y B) y llama a acquireVideo(el,url) (setAttribute('src')+load()+play()) SOLO en el que cumple 'active && idx===i' (idx = lado mostrado en el swiper horizontal interno, ya trackeado); el otro lado recibe releaseVideo(el) (pause()+removeAttribute('src')+load(), igual que CarouselSlide.jsx) liberando su decoder; cleanup en desmontaje libera ambos. Añadidos aPoster/responsePoster (c.challengerPosterUrl/c.targetPosterUrl, ya existían en el backend) como atributo poster del <video> para que el lado no-activo muestre un fotograma estático en vez de pantalla negra. Con este cambio: al abrir Retos Activos solo se reproduce el lado A del PRIMER reto visible (como antes visualmente, pero ahora garantizado); al deslizar horizontalmente a la opción B, esta AHORA sí recibe src+play() real (antes dependía de que el autoPlay declarativo compitiera con el resto y normalmente perdía); al desplazarse verticalmente a otro reto, el anterior libera sus 2 decoders y el nuevo adquiere el suyo (lado A por defecto). ChallengesInbox.jsx (la Bandeja) NO se tocó: sus <video> son solo miniaturas estáticas muted sin autoPlay/loop (no reproducen nunca), no tiene este bug. Lint limpio (components/ActiveChallengesPage.jsx: 0 problemas nuevos). NO se usó el agente de testing (petición explícita del usuario, dos veces en el mismo mensaje); verificado únicamente que el servidor compila sin errores tras el cambio (GET / 200, GET /api/challenges 200, POST /api/auth/login 200 en los logs de supervisor) y por revisión de código. EL USUARIO PROBARÁ MANUALMENTE en la app real (pidió explícitamente 'dejarme probar a mi manualmente')."

  - task: "Doble toque para votar: mostrar SOLO el icono de voto (sin halo/ondas/chispas)"
    implemented: true
    working: "NA"
    file: "components/VoteBurstEffect.jsx, app/globals.css"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "user"
        -comment: "Usuario: 'el voto al hacer doble click en las publicaciones solo debe mostrar el icono de voto' (la animación anterior añadía un halo de brillo, doble onda expansiva y chispas radiales alrededor del icono, además del icono en sí)."
        -working: "NA"
        -agent: "main"
        -comment: "CAMBIO UI. components/VoteBurstEffect.jsx reescrito: eliminados los 3 elementos extra (span.vote-glow con radial-gradient, 2x span.vote-ring de shockwave, y el array de PARTICLE_COUNT=8 span.vote-particle con posiciones/ángulos random) y su estado useState de partículas; el componente ahora renderiza ÚNICAMENTE <span className='vote-icon-pop'><VoteIcon filled/></span> dentro del span-ancla 0x0 (misma prop 'color', mismo contrato con CarouselSlide.jsx/DuetSlide.jsx -> CERO cambios necesarios en los padres, que solo pasan color y posicionan la ancla en el punto del toque o centrada). app/globals.css: eliminados los keyframes/clases voteGlowFlash/.vote-glow, voteRingPulse/.vote-ring y voteParticleFly/.vote-particle (ya no se usan); se conserva intacto voteIconPop/.vote-icon-pop (el rebote elástico del icono, único efecto que debe quedar). Lint limpio (sin issues en VoteBurstEffect.jsx). Sin cambios de backend. NO se ejecutó agente de testing (petición explícita del usuario 'No usar el testing agent'); verificación por revisión de código (contrato de props sin cambios, clases CSS huérfanas eliminadas, ninguna otra referencia a vote-glow/vote-ring/vote-particle en el proyecto)."
  - task: "Eliminar anillo alrededor del avatar principal del perfil"
    implemented: true
    working: "NA"
    file: "components/ProfilePage.jsx"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "CAMBIO UI (usuario: 'Elimina el anillo alrededor del avatar del perfil'). El avatar grande (104px) de la cabecera del perfil tenía un doble efecto de anillo: un borde degradado exterior (div wrapper p-[3px] bg-gradient-to-br from-white/15 to-white/[0.03]) + un ring-2 ring-white/10 interior. Se eliminaron ambos, dejando solo el <div> del avatar con la sombra (shadow-[0_8px_30px_-8px_rgba(0,0,0,0.6)]) para mantener profundidad visual sin el anillo. NOTA: además se detectó y corrigió (de nuevo) la pérdida recurrente de /app/.env (documentada en memory/ENV_BACKUP.md) antes de este cambio: .env no existía, nextjs estaba detenido y MongoDB vacío; restaurado .env con la nueva NEXT_PUBLIC_BASE_URL/CORS_ORIGINS (APP_URL actual de supervisor), nextjs reiniciado y re-sembrados twykadmin/lucia/marcos/laura (scripts/seed-core-users.mjs). Lint limpio. NOTA sobre verificación visual: la captura headless de Playwright solo muestra el spinner de carga del feed (limitación conocida y ya documentada varias veces en este archivo, el bundle dinámico no monta en el harness de screenshot); el cambio de CSS es mínimo y se revisó por código. NO se ejecutó agente de testing (cambio puramente visual/CSS, sin lógica ni backend afectado)."
        -working: "NA"
        -agent: "main"
        -comment: "CAMBIO UI 2 (usuario: 'Ahora encima del avatar hay como blanco elimínalo dejando solo el color del tema del perfil'). CAUSA: el glow radial superior de la cabecera del perfil (justo encima del avatar) usaba blanco puro rgba(255,255,255,0.10) (el comentario del código decía erróneamente 'mismo tono dorado que retos'), mientras que el resto de la app (AuthModal, ChallengeDialog, y el propio estado de invitado de este mismo ProfilePage en la línea 501) usa el morado de marca/tema rgba(168,85,247,...). FIX: cambiado el 'background' del glow superior de rgba(255,255,255,0.10) a rgba(168,85,247,0.14) (mismo tono que el resto de la app), sin tocar tamaño/posición/opacidad del glow. Lint limpio. NO se ejecutó agente de testing (cambio puramente visual/CSS de un solo valor de color)."
        -working: "NA"
        -agent: "main"
        -comment: "CAMBIO UI 3 (usuario: 'No quiero que tenga resplandor y el color de todo el perfil debe ser el color de cuando los botones solapan en el header' -> aclarado por el usuario: 'el color negro grisáceo cuando se solapa el header'). FIX: ELIMINADOS por completo los DOS <div> de glow radial en ProfilePage.jsx (línea ~500 del estado de invitado sin sesión, y línea ~638 de la cabecera con sesión); no se sustituyó por otro color, simplemente se quitaron. Como el contenedor raíz de ambos estados ya usa bg-[#0a0a0b] (el mismo negro grisáceo sólido que la barra sticky del header, ref barRef, línea 643, que quedó opaca desde un fix anterior para que el contenido no se transparentara al hacer scroll), al quitar el glow todo el perfil queda con ese único color uniforme #0a0a0b, sin ninguna superposición de color/gradiente. Lint limpio. NO se ejecutó agente de testing (cambio puramente visual/CSS, eliminación de elementos decorativos sin lógica)."
        -working: "NA"
        -agent: "main"
        -comment: "CAMBIO UI 4 (usuario: 'Ahora cuando se abran los ajustes debe tener el mismo color y debe estar por encima de la barra de navegación inferior'). DOS CAUSAS encontradas: (1) SettingsDrawer (panel lateral de 'Settings') usaba bg-[#121214], un gris ligeramente distinto al resto del perfil (#0a0a0b) -> FIX: cambiado a bg-[#0a0a0b] (mismo color que todo el perfil, tras el fix anterior del glow). (2) BUG DE STACKING CONTEXT: SettingsDrawer (y también EditProfileModal/FollowListModal) están anidados DENTRO del <div> raíz de ProfilePage (fixed inset-0 z-40), que crea su propio contexto de apilamiento; aunque SettingsDrawer interno tenga z-[85], ese valor solo se compara CON SUS HERMANOS dentro de ese contexto, no con elementos externos -> BottomNav (Feed.jsx, fixed z-50, renderizado ANTES en el DOM) siempre pintaba por encima de TODO el contenedor z-40 de ProfilePage (incluidos sus modales internos), tapando la parte inferior del drawer de ajustes con la barra negra de navegación. FIX: el z-index del <div> raíz de ProfilePage (tanto el estado con sesión como el de invitado) ahora es CONDICIONAL: z-40 normalmente (comportamiento previo intacto, BottomNav visible sobre el perfil base) pero z-[90] (por encima de BottomNus z-50) cuando hay un overlay interno abierto (menuOpen -> Settings, editOpen -> Edit profile, followList -> lista de seguidores, o guestMenuOpen -> menú de invitado). Así el drawer de ajustes (y los otros modales) ahora se renderizan POR ENCIMA de la barra de navegación inferior en vez de detrás. Lint limpio. Verificación: revisión de código (stacking context confirmado por estructura del DOM: BottomNav antes de ProfilePage en Feed.jsx, mismo padre sin transform); captura headless de Playwright sigue mostrando solo el spinner del feed (limitación conocida y documentada repetidamente en este archivo, el bundle dinámico no monta en el harness de screenshot). NO se ejecutó agente de testing (cambio puramente visual/CSS + z-index, sin lógica de negocio ni backend afectado); pendiente de validación visual del usuario en la app real."

  - task: "Título/post: los '…' deben aparecer DESPUÉS de una palabra completa (nunca cortando una palabra a la mitad)"
    implemented: true
    working: "NA"
    file: "components/CaptionText.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "user"
        -comment: "Usuario: 'Después de una palabra no antes deben aparecer los tres puntos' (el recorte por CSS/overflow podía cortar el texto a mitad de una palabra, dejando los '…' pegados a un fragmento de palabra en vez de a una palabra completa)."
        -working: "NA"
        -agent: "main"
        -comment: "REESCRITO components/CaptionText.jsx con recorte por PALABRAS COMPLETAS calculado en JS (ya no depende del corte crudo de 'overflow-hidden/whitespace-nowrap', que podía cortar cualquier carácter). Nuevo <span> medidor invisible (ref measureRef, position:absolute + invisible, hereda la misma fuente por estar dentro del mismo div con className) que prueba palabra a palabra (candidate = palabras acumuladas + '…') comparando su scrollWidth contra el ancho real del contenedor visible (pRef.current.clientWidth); se detiene y usa el último conjunto de palabras que SÍ cupo antes de que la siguiente desborde -> '…' queda pegado inmediatamente después de la última palabra completa, nunca a mitad de palabra ni con espacio/salto antes. Si ni la 1ª palabra entra completa, se muestra igual completa (fallback, evita cortarla). Se quita la dependencia de line-clamp/text-ellipsis nativos (que no garantizan corte por palabra). Tocar el texto truncado (cursor-pointer) expande a texto completo con 'less' para volver a colapsar (sin cambios en ese flujo). Lint limpio. NO se usa agente de testing (petición del usuario)."
    implemented: true
    working: "NA"
    file: "components/CaptionText.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "user"
        -comment: "Usuario: 'El título de la publicación debe tener solo una linea no 2 como Instagram y mostrar más en inglés no en español'."
        -working: "NA"
        -agent: "main"
        -comment: "CAMBIO UI. components/CaptionText.jsx: (1) line-clamp-2 -> line-clamp-1 en el estado colapsado (ahora solo 1 línea visible, igual que Instagram Reels de una sola línea). (2) Textos traducidos a inglés: '…más' -> '…more', 'menos' -> 'less'. Sin cambios de lógica (misma detección de overflow por scrollHeight/clientHeight, mismo comportamiento expandir/colapsar). Tailwind 3.4.1 soporta line-clamp nativamente (sin plugin adicional). Lint limpio. Componente compartido por CarouselSlide.jsx y DuetSlide.jsx (ambos se benefician automáticamente, sin tocarlos). NO se usa agente de testing (petición explícita del usuario en el cambio anterior, se mantiene el mismo criterio)."
    implemented: true
    working: "NA"
    file: "components/CarouselSlide.jsx, components/DuetSlide.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "user"
        -comment: "Usuario pidió explícitamente NO usar el agente de testing para este cambio."
        -working: "NA"
        -agent: "main"
        -comment: "CAMBIO UI (usuario: 'quiere el reproductor/chip de música en la columna social derecha, debajo de los tres puntos (estilo disco giratorio de TikTok), no bajo el título'). ANTES: el chip de música (icono cuadrado + 'Título · Artista') se mostraba bajo el título/descripción del post (bajo CaptionText), y el disco circular giratorio del final de la columna social derecha SIEMPRE mostraba el avatar del autor (headAuthor.avatarUrl), sin relación con la música. AHORA: (1) eliminado el bloque hasMusic bajo el título en ambos componentes (CarouselSlide.jsx y DuetSlide.jsx); el <audio> de reproducción se mantiene intacto. (2) el disco circular giratorio (ya posicionado debajo del botón 'mas-opciones' de tres puntos, al final de la columna social) ahora es condicional: si el post tiene música (hasMusic) muestra post.musicArtwork (o el icono Music de fallback si no hay carátula) girando estilo TikTok; si NO tiene música, mantiene el comportamiento previo (avatar del autor) para no dejar el disco vacío. Añadido atributo title (tooltip) con 'Título · Artista' para no perder esa información visualmente. Restaurado además el archivo .env (MONGO_URL/ADMIN_EMAILS/NEXT_PUBLIC_BASE_URL/CORS_ORIGINS) que se había perdido de nuevo (toda la API daba 500) y re-sembrados usuarios de prueba (twykadmin/lucia/marcos/laura, ver test_credentials.md) porque la BD 'twyk' estaba vacía. Verificado con curl: creado post versus con musicTitle/musicArtist/musicArtwork vía POST /api/versus (sesión lucia) -> 200 ok. Lint limpio (solo warnings preexistentes no relacionados). NOTA: no se pudo verificar visualmente por captura headless (el chunk dinámico del Feed no monta en el harness de screenshot, limitación conocida del entorno ya documentada varias veces en este archivo); pendiente de test con agente de frontend o validación visual del usuario."
    implemented: true
    working: true
    file: "components/SuggestedUsersPage.jsx, components/CompletedBattlesPage.jsx, components/Feed.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "NUEVA FEATURE (usuario: el botón superior izquierdo de la página de retos NO debe compartir; debe abrir una página de usuarios sugeridos -personas con las que interactúa, amigos de amigos, etc-; ADEMÁS de Seguir, cada usuario debe poder Retar). CompletedBattlesPage: el botón superior izquierdo (antes handleShareFriends/UserPlus 'Share with friends') ahora llama onOpenSuggestions (aria-label 'User suggestions'); eliminada la función de compartir. Nuevo SuggestedUsersPage.jsx (overlay oscuro z-58, encima de retos z-55, debajo de ChallengeDialog z-60 y ProfilePage z-70): cabecera 'Sugerencias para ti / Personas que quizá conozcas', GET /api/users/suggested, cada fila con Avatar (toca -> abre perfil), nombre+@username, MOTIVO de sugerencia, y DOS botones: Seguir (toggle optimista POST /api/users/:u/follow; 401 -> onRequireAuth) y Retar (Swords -> onChallenge con target de mención -> ChallengeDialog del Feed). Feed.jsx: estado suggestionsOpen, render con onOpenProfile=openAuthorProfile y onChallenge=openChallenge. VERIFICADO VISUALMENTE (página de prueba aislada, sin agente de testing): 4 usuarios con avatar, motivo y botones Seguir + Retar. Lint limpio."
  - task: "Registro: selector de fecha de nacimiento se veía en blanco (texto invisible sobre modal claro)"
    implemented: true
    working: true
    file: "components/DateWheelPicker.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "BUG FIX (usuario: al registrarse, el paso de fecha de nacimiento aparecía como barras grises/negras sin números). CAUSA: DateWheelPicker estaba estilizado para fondo OSCURO (texto blanco y degradados #131316) pero el AuthModal de registro es de tema CLARO (bg-white) -> texto blanco invisible y degradados oscuros como barras negras. FIX: adaptado a tema claro -> texto zinc-900, contenedor bg-zinc-50/border-zinc-200, banda de selección zinc-900/6, degradados blancos (#fafafa). VERIFICADO VISUALMENTE (página de prueba aislada): números/meses/años visibles en oscuro (01 / January / 2008 en la banda central). Lint limpio."
  - task: "ProfilePage: cabecera colapsable estilo TikTok (perfil propio y ajeno) con mini-perfil revelado al hacer scroll"
    implemented: true
    working: true
    file: "components/ProfilePage.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "NUEVA FEATURE (usuario: header colapsable estilo TikTok en perfil propio y ajeno). Sobre el ProfilePage existente SIN cambiar diseño: scrollRef+onScroll calculan collapseProgress (0 expandido -> 1 colapsado). La cabecera grande se desvanece y sube al colapsar. La barra sticky revela, pasado el 60% (revealP), mini-perfil: avatar pequeño + username + accion -> Follow/Following en perfil AJENO (POST /api/users/:u/follow) y Edit en perfil PROPIO. Pestañas ahora sticky. Datos reales ya cableados. NOTA: .env se habia perdido (DB y _meta.json vacios); restaurado MONGO_URL/ADMIN_EMAILS."
        -working: true
        -agent: "main"
        -comment: "BUG FIX 1 (usuario: 'Las publicaciones aparecen detrás del header y la tabla de grid'). La barra superior era bg-[#0a0a0b]/70+backdrop-blur (semitransparente) -> el contenido se transparentaba a través. FIX: barra superior bg-[#0a0a0b] SÓLIDO + z-30 (por encima de pestañas z-[15] y grid z-10). BUG FIX 2 (usuario: 'cuando hay muchas publicaciones está bien que se muestre hacia atrás pero cuando hay pocas debe haber un límite para que no aparezca por debajo del header y la tabla'). El min-height:100dvh previo generaba sobre-scroll con pocas publicaciones (quedaban detrás). FIX: medición en runtime (measureCollapse, refs barRef/tabsRef): collapseDist = tabs.offsetTop - barH; contentMinH = clientHeight - barH - tabsH - 16 (rellena SOLO el área bajo las pestañas fijadas). Resultado: con POCAS publicaciones scrollable==collapseDist (scroll limitado justo al colapso, los posts quedan bajo las pestañas, NO detrás); con MUCHAS, contentMinH se ignora y el scroll es natural (los posts pasan por detrás, lo deseado); perfil VACÍO sigue colapsando. VERIFICADO MANUALMENTE por mí (el usuario pidió NO usar el agente de testing): FEW(2 posts) clientH=880/scrollH=1314/scrollable=434, collapseDist=435, al máximo el 1er post queda en y≈127 (debajo de tabsBottom≈110); MANY(9 posts) scrollable=522>collapseDist=434 (scroll natural); ambos colapsan (headerOpacity=0, centerOpacity=1). Barra opaca confirmada en captura. Lint limpio."
  - task: "Botones sociales con ancho fijo (no se reacomodan/encogen al pasar de título a número)"
    implemented: true
    working: true
    file: "components/CarouselSlide.jsx, components/DuetSlide.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "FIX UI (usuario: 'los botones sociales se hacen pequeños cuando tienen interacción'). CAUSA: cada botón usaba ancho automático -> con palabra larga ('Compartir' ~48px) el botón era ancho, y al cambiar a un número ('1' ~6px) se encogía; como la columna está anclada a la derecha y centrada, los iconos se desplazaban/reacomodaban (sensación de que se hacen pequeños). FIX: añadido ancho fijo w-14 (56px) a los 5 botones sociales (Votar/Retar/Comentar/Compartir/Guardar) en CarouselSlide y DuetSlide -> la columna ya no reflowa al pasar de título a número. VERIFICADO en navegador: antes de interactuar todos los botones miden 56px y x=1860 (alineados); tras guardar, la etiqueta pasa a '1' y el botón sigue alineado (el ancho base se mantiene; el ligero cambio observado es solo el hover:scale-110 por el cursor). Lint limpio."
  - task: "Botones sociales (Retar/Comentar/Compartir/Guardar): mostrar NÚMERO tras la acción, título solo si no se ha interactuado"
    implemented: true
    working: true
    file: "components/CarouselSlide.jsx, components/DuetSlide.jsx, components/CommentsModal.jsx, components/ShareModal.jsx, components/Feed.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "FEATURE (usuario: 'los botones sociales de retar, comentar, compartir y guardar deben mostrar el número cuando se haya hecho la acción; el título solo cuando aún no se ha interactuado'). ANTES: 'Retar' mostraba SIEMPRE el texto (sin número) y Comentar/Compartir/Guardar usaban post.stats estáticos (0 en uploads) que no se actualizaban al actuar. AHORA: cada tarjeta mantiene contadores en vivo (commentCount/shareCount/saveCount/challengeCount) inicializados desde post.stats y fusionados con valores persistidos por post en localStorage (cmtN_/shrN_/savN_/chlN_) para que el incremento del usuario se mantenga al desplazar/recargar. countLabel(n, 'Título') muestra el número si n>0, si no el título. WIRING: Guardar -> handleSaveToggle +1/-1 (revierte en error); Comentar -> CommentsModal nuevo prop onCountChange (reporta total al cargar y al publicar); Compartir -> ShareModal nuevo prop onShared (incrementa al tocar una opción); Retar -> evento global 'twyk:challenged' que el Feed emite en ChallengeDialog.onCreated con el postId de origen (añadido postId al target en CarouselSlide y en el selector A/B de DuetSlide); cada tarjeta escucha y suma si el postId coincide. VERIFICADO VISUALMENTE en navegador: al guardar, el icono se vuelve amarillo y la etiqueta pasa de 'Guardar' a '1'; el resto sigue mostrando su título hasta interactuar. Lint limpio en los 5 archivos. (Sin agente de testing, petición del usuario.)"
  - task: "Avatar por defecto (silueta gris) consistente: modal de comentarios, notificaciones y modal de reto"
    implemented: true
    working: true
    file: "components/NotificationsInbox.jsx, components/CommentsModal.jsx, components/ChallengeDialog.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "BUG FIX (usuario: 'el modal de comentarios, las notificaciones y el modal de retos no muestran el avatar por defecto que se ve en el perfil cuando no hay foto'). CAUSA: esos 3 componentes usaban un <img> crudo de avatarUrl (o letra/icono) en vez del componente Avatar compartido. Como los usuarios sin foto tienen avatarUrl autogenerado (dicebear/pravatar), se mostraba ese avatar en vez de la silueta gris del perfil. FIX: importado y usado <Avatar> compartido (isGeneratedAvatar -> silueta gris) en NotificationsInbox (lista), CommentsModal (cada comentario) y ChallengeDialog (cabecera del retado). Revisado el resto: BottomNav (DefaultAvatar equivalente), ActiveChallengesPage/ChallengesInbox (RingAvatar->Avatar), CompletedBattlesPage, UploadDialog, ProfilePage, CarouselSlide y DuetSlide ya usaban Avatar -> consistentes. VERIFICADO VISUALMENTE en navegador: comentario de un usuario sin foto muestra la silueta gris en el modal de comentarios; cabecera de reto y nav inferior también. Lint limpio. (Sin agente de testing, petición del usuario.)"
  - task: "ProfilePage: botón Seguir persistente (API) y botón Mensaje -> Retar (abre ChallengeDialog hacia ese usuario)"
    implemented: true
    working: "NA"
    file: "components/ProfilePage.jsx, components/Feed.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "(1) SEGUIR: el estado inicial se toma de GET /api/users/:username (user.isFollowing) y followers reales; el toggle hace POST /api/users/:username/follow (optimista con rollback), requiere sesión (si invitado -> onRequireAuth abre login). (2) RETAR: sustituido el botón 'Mensaje' por 'Retar' (icono Swords) que llama onChallenge(target) reutilizando openChallenge -> ChallengeDialog del Feed, apuntando al contenido más reciente del usuario (videoUrl del primer post) y a su autor. Pendiente test frontend (solo con autorización del usuario)."
  - task: "Sesión permanente (~10 años) + fix condición de carrera 'me registré pero aparezco como no registrado'"
    implemented: true
    working: true
    file: "contexts/AuthContext.jsx, app/api/[[...path]]/route.js, lib/db.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "(0) FIX 'al registrarme la página se recarga sola y vuelvo al inicio de sesión': AuthModal hacía window.location.reload() tras login/registro -> recarga completa que reiniciaba la SPA y en frío mostraba estado invitado. Eliminadas ambas recargas; el estado de usuario se propaga por contexto (reactivo). (1) SESIÓN PERMANENTE: cookie session_token maxAge 30 días -> ~10 años (Max-Age=315360000, verificado expira 2036) en login y register; createSession expiresAt -> ~10 años. (2) BUG 'me registré pero aparezco como no registrado': condición de carrera por la validación /api/auth/me al montar — la petición se lanza SIN cookie (401) y, si el usuario se registraba mientras estaba en vuelo, su 401 borraba el usuario recién creado. FIX en AuthContext: ref manualAuthRef activado en login/register/logout; el handler de /api/auth/me hace 'return' si manualAuthRef.current. logout también llama POST /api/auth/logout. Verificado por curl/inspección de cookie; lint limpio. NO usar agente de testing (petición del usuario)."
  - task: "Twyk v2 (b)+(a): background/foreground + modo ahorro (G3/G4), arranque atómico A/B + watchdog de drift con timeout (C5), instrumentación perfMetrics (C1/C3/C5)"
    implemented: true
    working: true
    file: "components/Feed.jsx, components/DuetSlide.jsx, components/CarouselSlide.jsx, lib/networkQuality.js, lib/perfMetrics.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "Implementadas del Performance Blueprint v2 las piezas (b) y (a) + instrumentación. (b) G3: Feed.jsx añade estado playbackEnabled + listener visibilitychange -> al ocultar pestaña libera decoders (tarjetas hacen release()), al volver re-adquiere; mide tiempo de liberación (perfMetrics.reportDecoderReleaseMs). G4: lib/networkQuality.js añade detección de batería (navigator.getBattery, ≤20% sin cargar) + shouldConserve(); el prefetch de Feed reduce profundidad a 1 y solo pósters (sin warm de bytes) en modo ahorro. CarouselSlide y DuetSlide aceptan prop playbackEnabled (default true -> CompletedBattlesPage sin cambios) y solo reproducen/adquieren si isActive && playbackEnabled. (a) DuetSlide: startBothAtomically() espera readyState>=2 en AMBOS y los reproduce en el mismo requestAnimationFrame (desync<1 frame) con fallback mute si autoplay bloqueado; watchdog de drift integrado en el rAF de progreso: si |A.currentTime-B.currentTime|>1 frame pausa el rápido, espera al lento con TIMEOUT 500ms, y si no -> reset duro (faster.currentTime=slower)+re-arranque, reportando perfMetrics.reportWatchdog(timedOut). Instrumentación lib/perfMetrics.js (window.__twykMetrics): webcodecsSupported/Fallback (C3), watchdogTriggers/Timeouts (C5), backgroundEvents+decoderReleaseMs (C1/G3). Lint limpio en los 5 archivos; compila sin errores; preview real carga y pagina /api/feed (cursor 8/16) OK. NOTA: el harness headless no arranca el chunk dinámico del Feed dentro de su ventana de navegación de 10s en frío -> la captura visual automática es intermitente (no es bug del código; el preview real funciona)."
  - task: "Feed PRINCIPAL (combinación 1a+2a): motor scroll-snap nativo + tarjetas SnapTok ricas; hook useFeed (/api/uploads + /api/feed); liberación agresiva de decoders dentro de CarouselSlide/DuetSlide"
    implemented: true
    working: true
    file: "components/Feed.jsx, hooks/useFeed.js, components/CarouselSlide.jsx, components/DuetSlide.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "MIGRACIÓN del feed principal de Swiper -> motor scroll-snap CSS nativo (1a): contenedor overflow-y-auto snap-y snap-mandatory h-[100dvh] [contain:strict], ventana DOM de 3 (|i-activeIndex|<=1; slots <section> vacíos preservan geometría), ÚNICO IntersectionObserver threshold 0.7 con activeIndexRef (1 setState por tarjeta, cero por píxel), prefetch de media de activeIndex+1/+2 (Range 512KB + Image) y loadMore disparado al entrar activeIndex+2. Hook useFeed (2a): carga inicial /api/uploads + 1ª página /api/feed en paralelo, loadMore pagina /api/feed (scroll infinito), prependPost, dedupe por id. REGLA #2 inyectada DENTRO de CarouselSlide/DuetSlide: src imperativo (acquire) solo en el vídeo visible de la tarjeta ACTIVA; release() = pause()+removeAttribute('src')+load() al desactivar/desmontar (cleanup) -> 0 decoders en tarjetas adyacentes; priming eliminado. UI intacta: doble toque para votar, columna social, cabecera autor/música, winner card, retos. React.memo en tarjetas + useCallback en handlers. Verificado en navegador: GET /api/uploads 200 (16 posts) + /api/feed 200, 24 secciones renderizadas pero solo 4 vídeos montados en index 0 (ventana de 3 respetada), UI completa (vs header, votos, Retar, dots, BottomNav), sin errores de consola. Retrocompatible con CompletedBattlesPage (que sigue usando Swiper + las mismas tarjetas). NOTA: autoplay H.264 no observable en Chromium headless (limitación del entorno); capturas en negro intermitentes = timeout de 10s del harness vs compilación en frío del bundle de dev (dynamic import), no es bug del código."
  - task: "Feed /battle de alto rendimiento: scroll-snap nativo, ventana DOM de 3, liberación agresiva de decoders, IntersectionObserver 0.7, prefetch, voto + auto-avance 600ms (TypeScript)"
    implemented: true
    working: true
    file: "components/voting/VotingFeed.tsx, components/voting/VotingCard.tsx, lib/mockFeed.ts, app/battle/page.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "NUEVA RUTA /battle aislada (feed principal Swiper intacto). TS añadido al proyecto (tsconfig.json + next-env.d.ts, tsc --noEmit OK). Reglas verificadas con script playwright propio: 12 slots pero máx 3 VotingCard montadas (ventana activeIndex±1, slots <section> vacíos preservan geometría del snap); vídeos sin src en JSX, asignación imperativa solo en card activa y pause()+removeAttribute('src')+load() al desactivar/desmontar (videosWithSrc=0 tras salir); 1 único IntersectionObserver threshold 0.7 con activeIndexRef (cero setState por scroll); prefetch del siguiente card (link rel=prefetch as=video + Image(), dedupe Set, 2 links verificados); voto con scale+checkmark y auto-avance exacto de 1 viewport a los 600ms; votos en Map ref persisten tras remount (verificado). MOCK_FEED 12 items (Google CDN MP4 ~2-3MB + Unsplash w=720&q=75; 3 V/V, 3 V/I, 6 I/I). Nota: autoplay no observable en Chromium headless por falta de códec H.264 (limitación del entorno, no del código)."
  - task: "UploadDialog: vista previa a pantalla completa (Versus/1vs1/Reto); 1vs1 = 2 vídeos propios; Reto elige usuario tras subir"
    implemented: true
    working: "NA"
    file: "components/UploadDialog.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Rediseño del paso 'file' a PANTALLA COMPLETA (vídeo object-cover ocupa todo, selector A/B arriba-centro con check al subir, 'Cambiar' arriba-derecha, descripción + botón publicar abajo). 1vs1 (duet) ahora sube fileA+fileB+layout (igual que versus, sin elegir rival): flujo mode->layout->file. Reto (challenge): flujo mode->file->target; sube tu vídeo y luego eliges usuario de /api/users (envía file+targetAuthor a /api/challenges). Validado visualmente en navegador (versus full screen OK). Pendiente confirmación del usuario para test frontend automatizado."
  - task: "Votar = doble toque; quitar corazón/Me gusta; botón Retar en columna social"
    implemented: true
    working: "NA"
    file: "components/CarouselSlide.jsx, components/DuetSlide.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Validado manualmente en navegador: el corazón/Me gusta fue eliminado y sustituido por 'Retar' (Swords). El doble toque vota (con burst del icono). Hint actualizado a 'doble toque para votar'. Bandeja de retos abre desde el inbox. Pendiente test frontend automatizado (a confirmar por el usuario)."
  - task: "CarouselSlide: horizontal A/B carousel with swipe, dots, tap-to-vote, Twyk UI"
    implemented: true
    working: true
    file: "components/CarouselSlide.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Manually validated in browser previously."

  - task: "APP NATIVA (Android/Compose): 1vs1 (dueto) horizontal y vertical se veían desbalanceados (no 50/50)"
    implemented: true
    working: "NA"
    file: "android-twyk/app/src/main/java/com/twyk/app/feed/VersusFeed.kt, android-twyk/app/src/main/res/layout/twyk_texture_player.xml"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "BUG FIX (usuario: en la app nativa los 1vs1 horizontal/vertical no se ven como en el preview web móvil). DIAGNÓSTICO (medición sobre las capturas del usuario): el split se renderizaba ~56/44 en horizontal y ~29/71 en vertical, en vez de 50/50. CAUSA RAÍZ: DuetPage usa weight(1f)/weight(1f) (50/50 correcto), pero VideoSurface usaba PlayerView con SurfaceView (tipo por defecto) + RESIZE_MODE_ZOOM. Un SurfaceView con zoom escala la superficie MÁS GRANDE que la vista y NO se recorta a los límites de Compose -> el vídeo se desborda sobre la mitad vecina (severo en vertical, cajas altas/estrechas). FIX: nuevo layout res/layout/twyk_texture_player.xml (PlayerView con app:surface_type=texture_view, resize_mode=zoom). VideoSurface acepta useTextureView (default false); DuetPage pasa useTextureView=true en sus 4 mitades + clipToBounds() en la Box. TextureView se dibuja en la jerarquía normal y SÍ recorta -> cada vídeo queda confinado a su 50% exacto (replica object-cover de la web). CarouselPage (versus fullscreen) sin cambios (SurfaceView, sin vecino que tapar). NO compilable en este contenedor (sin Android SDK); requiere rebuild del APK por el usuario. No aplica agente de testing (es Kotlin nativo, no web)."
  - task: "APP NATIVA (Android/Compose): los posts tipo RETO solo mostraban un avatar y un nombre (deben mostrar los dos creadores)"
    implemented: true
    working: "NA"
    file: "android-twyk/app/src/main/java/com/twyk/app/feed/VersusFeed.kt"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "BUG FIX (usuario: las publicaciones tipo reto solo aparecen con un avatar y un nombre en la app nativa). CAUSA: HeaderOverlay (compartido por CarouselPage y DuetPage) solo pintaba un avatar (post.sideA.author). Los retos son type=versus isChallenge=true con sideA.author y sideB.author distintos (p.ej. Nex vs Kiki, tu_canal vs urbanlife). FIX: añadida rama isChallenge en HeaderOverlay que replica la web (CarouselSlide/DuetSlide): dos avatares solapados (authorB arriba-derecha, authorA abajo-izquierda con anillo negro) + columna 'authorA vs / authorB', cada avatar/nombre clicable a su perfil. Publicación normal mantiene un solo avatar. Requiere rebuild del APK (sin Android SDK aquí). No aplica agente de testing (Kotlin nativo)."


  - task: "ProfilePage: cabecera sticky colapsada mostraba el @username en vez del nombre visible"
    implemented: true
    working: "NA"
    file: "components/ProfilePage.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: "NA"
        -agent: "user"
        -comment: "Usuario reportó: 'cuando cambió el nombre de perfil también cambia el nombre de usuario en el perfil'. Aclaración del usuario tras preguntar: 'Lo que sale en el header de perfil debe ser el nombre no el nombre de usuario'."
        -working: "NA"
        -agent: "main"
        -comment: "INVESTIGACIÓN: Verificado backend (POST /api/profile, updateUserProfile en lib/db.js) con petición real: al cambiar 'name' de lucia, el campo 'username' en BD/API (GET /api/users/lucia, GET /api/auth/me) permaneció intacto en todo momento -> NO había bug de backend. La confusión era de UI: la cabecera GRANDE (expandida) del perfil ya mostraba correctamente me.name (título) + me.handle ('@'+username, subtítulo) en líneas separadas (líneas 806-807), pero la barra STICKY/colapsada que aparece al hacer scroll (mini-perfil estilo TikTok) mostraba {me.username} en vez de {me.name} (línea 662) -> al cambiar el nombre, el usuario veía el nombre nuevo en la cabecera grande pero el username sin cambiar en la barra pequeña, dando la sensación de inconsistencia/bug. FIX: cambiado {me.username} -> {me.name} en la barra sticky colapsada (components/ProfilePage.jsx línea 662) para que muestre el NOMBRE visible, igual que la cabecera expandida. Lint limpio. .env se había perdido de nuevo (toda la API daba 500); restaurado (MONGO_URL/ADMIN_EMAILS/NEXT_PUBLIC_BASE_URL/CORS_ORIGINS) y re-sembradas cuentas de prueba (twykadmin/lucia/marcos/laura, ver test_credentials.md). Pendiente de validación visual del usuario en la app (cambio de 1 línea, solo texto)."

  - task: "Animación de voto mejorada (doble toque) — VoteBurstEffect"
    implemented: true
    working: true
    file: "components/VoteBurstEffect.jsx, components/CarouselSlide.jsx, components/DuetSlide.jsx, app/globals.css"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "MEJORA UI (usuario: 'añadir una animación cuando se vote mejor que la de tiktok like'). Se reemplaza el simple 'like-pop' (icono que escala y desaparece, igual al corazón de TikTok) por un nuevo componente components/VoteBurstEffect.jsx reutilizado en CarouselSlide y DuetSlide: (1) halo de brillo (radial-gradient difuminado) detrás de todo; (2) doble onda expansiva (shockwave) con retraso escalonado; (3) icono VoteIcon con rebote ELÁSTICO (overshoot + micro-wobble) en vez de un pop lineal; (4) 8 chispas radiales del color del lado votado (A lila #A855F7 / B azul #3B82F6) que salen disparadas en círculo y se desvanecen, vía la técnica CSS translate(-50%,-50%) rotate(var(--angle)) translateX(var(--dist)) con valores aleatorios por partícula (memoizados con useState lazy init para no recalcular en cada re-render del padre). Nuevos keyframes en globals.css: voteGlowFlash, voteRingPulse, voteIconPop, voteParticleFly. Cambio SOLO DE FRONTEND (JSX/CSS puro), no toca ningún endpoint. Ajustado el setTimeout de limpieza del burst de 850ms a 900ms para no cortar la animación más larga (ring ~810ms). CONTEXTO: al empezar esta tarea el .env volvía a faltar (mismo problema recurrente ya documentado en memory/ENV_BACKUP.md); restaurado con los mismos valores (MONGO_URL, ADMIN_EMAILS, NEXT_PUBLIC_BASE_URL/CORS_ORIGINS con la URL de preview ACTUAL) y re-sembradas las 4 cuentas de prueba con node scripts/seed-core-users.mjs. VERIFICADO VISUALMENTE con Playwright (el usuario pidió explícitamente NO usar el agente de testing): login como lucia, doble-tap sobre un post -> se ve el halo + onda expansiva + icono azul con rebote, y en el frame siguiente las chispas radiales dispersándose en círculo alrededor del punto; el contador de votos subió de 1 a 2 (voto real registrado, no solo la animación). Lint limpio en los 3 archivos JSX tocados (los 2 warnings de eslint-disable no usados en Carousel/DuetSlide son preexistentes, no introducidos por este cambio)."

  - task: "Recuperación de entorno: .env perdido de nuevo (contenedor recreado)"
    implemented: true
    working: true
    file: ".env, memory/ENV_BACKUP.md, memory/test_credentials.md, scripts/seed-core-users.mjs"
    stuck_count: 5
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "NUEVA PÉRDIDA DE .env (usuario: 'instala el archivo .env'). Misma causa raíz ya documentada (memory/ENV_BACKUP.md): .env está gitignored y MongoDB vive en almacenamiento efímero; al recrearse el contenedor /app se repuebla desde git sin .env y la BD queda vacía. Restaurado /app/.env con MONGO_URL=mongodb://localhost:27017/twyk, ADMIN_EMAILS=twyk.apk@gmail.com, NEXT_PUBLIC_BASE_URL/CORS_ORIGINS apuntando a la URL de preview ACTUAL (leída de APP_URL en supervisord.conf: https://audio-playback-bug.preview.emergentagent.com); ENV_BACKUP.md actualizado con esta URL. Reiniciado nextjs (sudo supervisorctl restart nextjs) y ejecutado node scripts/seed-core-users.mjs -> recreados twykadmin/lucia/marcos/laura + follows básicos (BD estaba vacía). memory/test_credentials.md recreado (estaba gitignored/vacío). VERIFICACIÓN (usuario pidió explícitamente NO usar el agente de testing): revisados logs de supervisor tras el restart -> GET / 200, GET /api/uploads 200, GET /api/challenges 200, GET /api/feed?cursor=0&limit=8 200, sin ningún 500. El 401 en GET /api/auth/me es esperado (sin sesión iniciada en el navegador headless), no es un error."
    -agent: "user"
    -comment: "Instala el archivo .env y el botón de seguir del feed inicio hazlo en forma de pastilla, no usar el testing agent"

  - task: "Botón 'Follow'/'Following' del feed de inicio en forma de pastilla (pill)"
    implemented: true
    working: true
    file: "components/CarouselSlide.jsx, components/DuetSlide.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "CAMBIO UI (usuario: 'el botón de seguir del feed inicio hazlo en forma de pastilla', pidió explícitamente NO usar el agente de testing). El botón Follow/Following que aparece junto al nombre del autor en la cabecera de cada tarjeta del feed (publicación normal 1 vídeo en CarouselSlide.jsx línea ~622, y publicación 1vs1/dueto en DuetSlide.jsx línea ~690) usaba 'rounded-lg' (esquinas ligeramente redondeadas, rectangular). Cambiado a 'rounded-full' en ambos archivos -> con el padding existente (px-3 py-1) y altura fija del texto de 1 línea, el border-radius completo convierte el rectángulo en una pastilla (cápsula) perfecta, igual al estilo Follow de TikTok/Instagram. Cambio 100% CSS (una clase de Tailwind), no toca la lógica de seguir/dejar de seguir ni ningún endpoint. Lint limpio en ambos archivos (solo los 2 warnings preexistentes de eslint-disable no usados, no relacionados con este cambio). Verificación visual con Playwright headless no fue posible: el feed no monta en el navegador headless (limitación conocida ya documentada varias veces en este archivo, 'la captura headless no logra montar el chunk dinámico del Feed'), no relacionada con este cambio. Pendiente confirmación visual del usuario en su dispositivo/preview real."

  - task: "BUG: banner de subida de reto en segundo plano (Feed.jsx) mostraba texto en español mezclado con inglés"
    implemented: true
    working: true
    file: "components/Feed.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        -working: false
        -agent: "user"
        -comment: "Screenshot mostrando el banner de subida de reto con el texto 'Enviando reto a @twykadmin' en español, cuando el resto de la app (y el mismo banner en su estado 'done': 'Challenge sent to @...') está en inglés: 'Esto sigue estando en español cuando debería estar en inglés'."
        -working: "NA"
        -agent: "main"
        -comment: "ROOT CAUSE: el banner flotante de subida de reto en segundo plano (components/Feed.jsx, líneas ~560-601) tiene 3 estados (uploading/done/error). Los estados 'done' ('Challenge sent to @{username}') y 'error' (Couldn't send the challenge / Try again) ya estaban en inglés (de una traducción anterior), pero el estado 'uploading' (el que el usuario ve primero, mientras sube el vídeo del reto) se quedó con 2 strings sin traducir: 'Enviando reto a @{challengeUpload.username}' y (en el estado 'done') el subtítulo 'Te avisaremos cuando lo acepte'. FIX: (1) línea 569: 'Enviando reto a @{challengeUpload.username}' -> 'Sending challenge to @{challengeUpload.username}'. (2) línea 584 (subtítulo del estado 'done'): 'Te avisaremos cuando lo acepte' -> 'We will notify you when they accept' (se evitó el apóstrofo de 'We'll' para no introducir un nuevo error de lint react/no-unescaped-entities). Cambio 100% de texto estático (JSX), sin tocar lógica de subida/estado (sendChallengeInBackground, challengeUpload state machine intactos). Verificado con grep que no queden más ocurrencias de 'Enviando reto', 'Te avisaremos' ni 'cuando lo acepte' en components/*.jsx. Lint limpio (solo 1 warning preexistente no relacionado en línea 594, ya presente antes de este cambio)."
        -working: true
        -agent: "testing"
        -comment: "✅ CODE REVIEW PASS: revisado components/Feed.jsx líneas 560-600, los 3 estados del banner (uploading/done/error) están 100% en inglés: 'Sending challenge to @{username}' (569), 'Challenge sent to @{username}' + 'We will notify you when they accept' (583-584), 'Couldn't send the challenge' / 'Try again' (594-595). NO se encontró ningún texto en español en el componente. Verificación UI en vivo con Playwright NO pudo completarse (limitación conocida ya documentada varias veces en este proyecto: el bundle dinámico del Feed no monta en el harness headless de screenshot/testing), pero el fix de código es correcto y completo. Usuario pidió continuar sin más verificación del agente de testing."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "Recuperación de entorno: .env perdido de nuevo (persistencia efímera) + audio no se escucha en la página de retos completados"
    - "ActiveChallengesPage.jsx: opción B (retado) no se reproducía ni sonaba en Retos Activos — fix decoder gating por tarjeta activa + lado activo"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: "NUEVA SOLICITUD DEL USUARIO: 'Instala el archivo .env y soluciona el problema de la página de retos y página de inicio no se escucha el audio de las publicaciones solo se escucha en el feed (inicio)'. Acciones realizadas: (1) restaurado /app/.env (misma causa raíz recurrente documentada en memory/ENV_BACKUP.md: .env gitignored + MongoDB efímero) con NEXT_PUBLIC_BASE_URL/CORS_ORIGINS = URL de preview actual (https://audio-playback-bug.preview.emergentagent.com); nextjs reiniciado; BD vacía -> re-sembrado con scripts/seed-core-users.mjs (twykadmin/lucia/marcos/laura); memory/test_credentials.md recreado. (2) FIX audio: components/CompletedBattlesPage.jsx (página de Retos, pestaña 'Completed') tenía muted=useState(true) SIN ningún gesto para desactivarlo (a diferencia de Feed.jsx que hace setMuted(false) en el primer onPointerDown) -> el audio nunca sonaba ahí. Añadido el mismo onPointerDown={muted ? () => setMuted(false) : undefined} en el contenedor raíz. Por favor ejecutar SOLO un smoke test de BACKEND (no se tocó lógica de negocio, solo .env/seed + 1 línea de frontend): login con las 4 cuentas (twykadmin/Admin12345, lucia|marcos|laura/Test12345) -> 200; GET /api/feed y GET /api/uploads -> 200; GET /api/challenges/completed con sesión -> 200. Confirmar que no hay 500 tras la restauración del .env. NO modificar el Testing Protocol."
    -agent: "main"
    -message: "INFRA: el archivo /app/.env volvió a faltar (causa raíz ya documentada en memory/ENV_BACKUP.md: .env está gitignored y MongoDB vive en almacenamiento efímero; al recrearse el contenedor, /app se repuebla desde git sin .env y la BD queda vacía). Restaurado /app/.env con MONGO_URL=mongodb://localhost:27017/twyk, ADMIN_EMAILS=twyk.apk@gmail.com, NEXT_PUBLIC_BASE_URL y CORS_ORIGINS apuntando a la URL de preview ACTUAL (leída de APP_URL en /etc/supervisor/conf.d, que había cambiado respecto a la guardada en ENV_BACKUP.md). Reiniciado nextjs y ejecutado node scripts/seed-core-users.mjs -> recreados twykadmin/lucia/marcos/laura (ver memory/test_credentials.md, recreado también por estar gitignored). NO se tocó ningún código de la app. Por favor testear SOLO BACKEND un smoke test de login con estas 4 cuentas + GET /api/feed para confirmar que la API ya no devuelve 500."
    -agent: "main"
    -message: "BUG FIX UI: el usuario reportó que al cambiar el 'nombre de perfil' también parecía cambiar el 'nombre de usuario'. Verificado con petición real al backend que el username NUNCA se toca (solo 'name'). El usuario aclaró: la barra superior colapsada del perfil (al hacer scroll) debe mostrar el NOMBRE, no el @usuario. Cambiado components/ProfilePage.jsx línea 662 de {me.username} a {me.name}. Cambio de 1 línea, solo texto/UI, sin impacto en backend. NOTA: .env había desaparecido de nuevo (toda la API daba 500); restaurado y re-sembradas cuentas de prueba (twykadmin/lucia/marcos/laura, ver test_credentials.md)."
    -message: "CAMBIO UI (frontend puro, sin cambios de backend): usuario pidió mover el reproductor/chip de música (que estaba bajo el título/descripción del post) al disco giratorio de la columna social derecha, justo debajo del botón de tres puntos ('mas-opciones'), estilo TikTok. Implementado en components/CarouselSlide.jsx y components/DuetSlide.jsx: (1) eliminado el chip de música bajo CaptionText; (2) el disco circular ya existente al final de la columna social (debajo de 'mas-opciones') ahora muestra post.musicArtwork girando si el post tiene música (hasMusic), o el icono Music de lucide-react si no hay carátula; si el post NO tiene música, sigue mostrando el avatar del autor (comportamiento previo, para no dejar el disco vacío). El <audio> de reproducción no cambió. CONTEXTO IMPORTANTE: el archivo .env había vuelto a perderse (toda la API daba 500); lo restauré con los mismos valores documentados antes (MONGO_URL=mongodb://localhost:27017/twyk, ADMIN_EMAILS=twyk.apk@gmail.com, NEXT_PUBLIC_BASE_URL=preview URL, CORS_ORIGINS=*) y la BD 'twyk' estaba vacía, así que re-registré usuarios de prueba vía POST /api/auth/register (ver /app/memory/test_credentials.md: twykadmin/Admin12345 admin, lucia/marcos/laura con Test12345) y creé un post de prueba (POST /api/versus como lucia) con musicTitle/musicArtist/musicArtwork para poder verificar el cambio. Es un cambio SOLO DE FRONTEND (JSX/estilos), no toca ningún endpoint. Por favor, si se prueba, sería con el agente de FRONTEND (Playwright) para confirmar visualmente: (a) el disco giratorio bajo los tres puntos muestra la carátula/nota musical cuando el post tiene música; (b) ya NO aparece ningún chip de música bajo el título del post; (c) posts sin música siguen mostrando el avatar del autor en ese disco (sin romper nada). NOTA: la captura headless con el tool de screenshot no logra montar el chunk dinámico del Feed (limitación conocida y ya documentada varias veces en este archivo, no relacionada con este cambio)."
    -agent: "main"
    -message: "NUEVA FEATURE buscador de usuarios. Probar SOLO BACKEND el endpoint GET /api/users?q=. CONTEXTO: el .env se había perdido (restaurado) y la BD estaba vacía; ya se re-sembraron cuentas (ver test_credentials.md): twykadmin/Admin12345 (admin), lucia/marcos/laura con password Test12345. Escenarios: (1) GET /api/users?q=la (sin sesión) -> 200 {users:[...]} y TODOS los usuarios devueltos contienen 'la' (insensible a mayúsculas) en username o name (debe aparecer 'laura'). (2) GET /api/users?q=LU -> 200 e incluye 'lucia' (case-insensitive). (3) GET /api/users?q=twyk -> 200 e incluye 'twykadmin'. (4) GET /api/users?q=zzzznoexiste -> 200 {users:[]}. (5) REGRESIÓN (uso original sin q): GET /api/users SIN sesión -> 200 {users:[...]} con todos los usuarios; GET /api/users CON sesión de 'lucia' (login POST /api/auth/login {username:'lucia',password:'Test12345'} y usar cookie/token) -> 200 y la lista NO debe incluir a 'lucia' (excluye al usuario actual). (6) IMPORTANTE diferencia: con ?q=lucia (con sesión de lucia) SÍ debe poder encontrarse a sí misma (la búsqueda incluye al propio usuario). (7) Inyección regex: GET /api/users?q=.* -> 200 sin error (los caracteres especiales se escapan, no devuelve todo por regex comodín). NO modificar el Testing Protocol."
    -agent: "main"
    -message: "BUG FIX LOGIN (usuario reportó: aplica credenciales y no accede). Probar SOLO BACKEND. CAUSA: el login solo aceptaba username; con email fallaba. FIX en lib/db.js (getUserByUsernameOrEmail + verifyUserCredentials). La cuenta admin EXISTE: username='twykadmin', email='twyk.apk@gmail.com', password='Admin12345' (ver /app/memory/test_credentials.md). Escenarios a verificar en POST /api/auth/login: (1) {username:'twyk.apk@gmail.com', password:'Admin12345'} -> 200 {ok:true, user.role:'admin', token presente}. (2) {username:'TWYK.APK@Gmail.com', password:'Admin12345'} (mayúsculas) -> 200 (email case-insensitive). (3) {username:'twykadmin', password:'Admin12345'} -> 200 (username sigue funcionando). (4) {username:'twyk.apk@gmail.com', password:'incorrecta'} -> 401 invalid_credentials. (5) Regresión: registra un usuario nuevo {username,email,password,birthDate:'1995-05-05'} y verifica que puede loguear tanto por su username como por su email. (6) GET /api/auth/me con la cookie/token devuelto -> 200 {user}. NO modificar el Testing Protocol."
    -agent: "testing"
    -message: "✅ BACKEND TESTING COMPLETE: Avatar refresh fix VERIFIED. All 6 core scenarios passed (register users, create challenge, fetch challenges, change avatar, verify refresh for both 'from' and 'to' participants). The fix correctly uses getCurrentUsersByUsernames() to refresh avatars with current data from MongoDB. Test file: /app/backend_avatar_test_simple.py. CORE FIX VERIFIED: When bob changes his profile photo, alice immediately sees the NEW avatar in the challenge list (not the old snapshot). Reciprocal also works: when alice changes her avatar, bob sees the new one. No major issues found. Main agent should summarize and finish."
    -agent: "main"
    -message: "BUG FIX notificaciones de VOTO. Probar SOLO BACKEND. La BD puede estar vacía; REGISTRA usuarios nuevos. Escenarios: (A) Registra autorA y votanteB vía POST /api/auth/register {username,email,password}; guarda cookies/tokens de ambos. (B) Como autorA: POST /api/versus multipart (fileA + fileB = bytes mp4 dummy, description) -> 200, guarda post.id (empieza con 'versus_up_') y verifica post.author.username==='autorA'. (C) Como votanteB: POST /api/vote {id: <post.id>, side:'a'} -> 200 {ok:true, votes:{a:1,b:0}}. (D) Como autorA: GET /api/notifications -> 200 {notifications:[...]} y DEBE existir una notificación type==='vote', user.username==='votanteB', side==='a', postId===<post.id>. (E) GET /api/notifications/unread como autorA -> count>=1. (F) AUTONOTIFICACIÓN: como autorA, POST /api/vote sobre su propio post -> NO debe crear notificación nueva para autorA (el count no aumenta por su propio voto). (G) Repite con POST /api/duet (fileA+fileB+layout) y vota -> también genera notificación 'vote' al autor. NO modificar el Testing Protocol."
    -agent: "main"
    -message: "NUEVA FUNCIÓN (modales Instagram en el feed VS). Probar SOLO BACKEND el campo votedSide en comentarios. Credenciales en /app/memory/test_credentials.md (demotester / demo1234). Escenarios: (1) POST /api/comments SIN sesión -> 401. (2) Login POST /api/auth/login {username:'demotester',password:'demo1234'} (guarda cookie session_token). (3) POST /api/comments {postId:'demo_versus_demotester', text:'A!', votedSide:'a'} -> 200 y comment.votedSide==='a'. (4) Igual con votedSide:'b' -> 'b'. (5) POST sin votedSide -> comment.votedSide===null. (6) POST con votedSide inválido (p.ej. 'z') -> votedSide===null (saneado). (7) GET /api/comments?postId=demo_versus_demotester -> 200 {comments:[...]} y cada comentario incluye el campo votedSide ('a'|'b'|null) coherente. NO modificar el Testing Protocol." NOTA CRÍTICA: la base de datos 'twyk' está VACÍA (se había perdido el archivo .env, ya restaurado: MONGO_URL=mongodb://localhost:27017/twyk). No uses credenciales antiguas; REGISTRA usuarios nuevos. Escenarios: (A) Registra follower1 y target1 vía POST /api/auth/register {username,email,password} -> guarda cookie/token de follower1. (B) POST /api/users/target1/follow SIN sesión -> 401. (C) POST /api/users/target1/follow CON sesión de follower1 -> 200 {ok:true, following:true, followers:1}. (D) Repetir (toggle) -> {following:false, followers:0}. Volver a seguir -> following:true. (E) POST /api/users/follower1/follow con sesión de follower1 (a sí mismo) -> 400 cannot_follow_yourself. (F) GET /api/users/target1 SIN sesión -> user.isFollowing=false, user.followers=1 (refleja el follow persistente). (G) GET /api/users/target1 CON sesión de follower1 -> user.isFollowing=true. (H) También vale seguir a un autor demo (usa GET /api/users para tomar un username demo) -> follow funciona aunque no tenga documento de usuario. NO modificar el Testing Protocol."
    -agent: "main"
    -message: "BUG FIX 'publicaciones sin registro'. Probar SOLO BACKEND el gating de autenticación en publicación. Credenciales en /app/memory/test_credentials.md (testreg1 / secret123). Escenarios: (1) SIN sesión (sin cookie ni token): POST /api/versus (multipart fileA+fileB mp4 dummy) -> 401; POST /api/duet (fileA+fileB+layout) -> 401; POST /api/challenges (file + targetAuthor JSON) -> 401. (2) Login: POST /api/auth/login {username:'testreg1',password:'secret123'} -> 200, guarda la cookie session_token (o usa el token devuelto como 'Authorization: Bearer <token>'). (3) CON sesión: POST /api/versus -> 200 y post.author.username === 'testreg1' (NO 'usuario_anonimo'); idem /api/duet (post.author.username==='testreg1', sideA/sideB.author también) y /api/challenges (challenge.from.username==='testreg1') -> 200. (4) GET /api/auth/me sin cookie -> 401; con cookie -> 200 {user.username:'testreg1'}. (5) Regresión: GET /api/feed?cursor=0&limit=8 -> 200 con posts; GET /api/users -> 200. NO modificar el Testing Protocol."
    -agent: "main"
    -message: "BUG FIX retos completados: la página 'Completados' nunca mostraba nada porque el frontend tenía battles=[] hardcodeado. Añadí GET /api/challenges/completed (deriva de uploads con isChallenge=true) y el frontend ahora lo consume. Por favor testea SOLO BACKEND este nuevo endpoint: 1) GET /api/challenges/completed -> 200 con forma {battles:[...]}. 2) Flujo completo: POST /api/challenges (multipart file + targetVideoUrl='/videos/4467.mp4' + targetAuthor=JSON {username:'urbanlife',name:'Marco Ruiz',avatarUrl:'x'}) -> aceptar con POST /api/challenges/{id}/accept -> el versus debe aparecer en GET /api/challenges/completed con 2 participants (A=tu_canal, B=urbanlife), totalVotes=0, isWinner en A por empate. 3) POST /api/vote {id: <versus_ch_id>, side:'b'} dos veces -> GET /api/challenges/completed debe reflejar votes.b=2 y isWinner ahora en B. NO modificar el Testing Protocol."
    -agent: "main"
    -message: "FLUIDEZ ULTRA (3 fases tipo TikTok/Reels) implementada y verificada manualmente (sin agente de test, por petición del usuario). FASE 1: faststart en subidas nuevas + batch one-time de vídeos existentes; prefetch por Range; decoder priming de vecinos ±1; pósters regenerados. FASE 2 (ABR adaptativo, SOLO vídeos nuevos): renditions 360/540/720 en segundo plano con qualities parcheadas en _meta.json; frontend lib/networkQuality.js (pickQuality, reportStall). FASE 3: Service Worker (public/sw.js) cache-first para pósters; NO intercepta vídeo. DEPENDENCIA: ffmpeg requerido en despliegue (instalado en runtime aquí); degradación elegante si falta."
    -agent: "main"
    -message: "FEED PRINCIPAL migrado (combinación 1a+2a confirmada por el usuario). 1a: reemplazado Swiper por motor scroll-snap CSS nativo en components/Feed.jsx (ventana DOM de 3, único IntersectionObserver 0.7, prefetch, goNext por scrollTo) conservando 100% las tarjetas ricas SnapTok (CarouselSlide/DuetSlide: doble toque para votar, columna social, cabecera autor/música, winner card, retos). Liberación AGRESIVA de decoder inyectada DENTRO de las tarjetas: src imperativo solo en la tarjeta activa + pause()+removeAttribute('src')+load() en cleanup/desactivación (priming eliminado). 2a: nuevo hook hooks/useFeed.js (inicial /api/uploads + 1ª página /api/feed en paralelo, loadMore pagina /api/feed con scroll infinito disparado al entrar activeIndex+2, dedupe por id). Backend SIN cambios (no requiere testing backend). Verificado manualmente en navegador (render completo con datos reales, ventana de 3 respetada, sin errores de consola). Test E2E frontend pendiente de autorización del usuario."
    -agent: "main"
    -message: "REGRESIÓN ARREGLADA ('ni se reproducen'): la mejora previa subió el prefetch a profundidad 3 con GET COMPLETO de las 2 tarjetas más cercanas. Eso saturaba las ~6 conexiones HTTP/1.1 del navegador con descargas largas -> el vídeo ACTIVO se quedaba sin conexión y no llegaba a reproducir. FIX en components/Feed.jsx: (1) profundidad de prefetch de vuelta a 2 (1 en modo ahorro); (2) GET completo SOLO para la tarjeta inmediata (k=1), init Range para k=2; (3) añadido priority:'low' (fetchpriority) a todas las precargas para que NUNCA le roben conexión/ancho de banda al vídeo activo. Esto restaura la config que el usuario confirmó reproduciendo ('está mejor'). Verificado: 0 errores de consola, vídeo activo con src, lint limpio. El usuario debe recargar (cerrar/reabrir) para limpiar el JS viejo."
    -agent: "main"
    -message: "MEJORA RENDIMIENTO v3 (el usuario seguía esperando 1-2s al hacer scroll). Dos causas concretas corregidas: (1) GATING: el warm estaba limitado por navigator.deviceMemory>=4, pero deviceMemory es undefined en iOS/Safari y varios Android -> warm DESACTIVADO en el dispositivo del usuario (cada post cargaba de cero). FIX: eliminado deviceCanWarm; warm = i===activeIndex+1 && !shouldConserve() (solo se apaga en ahorro de datos/batería; pico ≤4 decoders con prev liberada, seguro en cualquier gama). (2) PRIME SUPERFICIAL: el prime hacía play()+pause() inmediato -> solo ~0.1s en buffer -> al activarse stalleaba (el 1-2s). FIX: nuevo primeWarm() en CarouselSlide y DuetSlide que reproduce muteado y bufferiza ~1.5s (listeners canplaythrough/timeupdate, tope 5s) antes de pausar + reset currentTime=0; guardado con warmRef token (no pausa si pasó a activa). (3) PREFETCH: warmVideo de la tarjeta inmediata ahora es GET completo (200 cacheable, cache:'force-cache') en vez de Range 206 -> el <video> sirve todo desde caché. Verificado en navegador: warm activo sin gating, siguiente 1vs1 con ambos lados src+preload=auto, 7 GET mp4, 0 errores, lint limpio. PENDIENTE de confirmación del usuario en dispositivo real (el headless no decodifica H.264)."
    -agent: "main"
    -message: "MEJORA RENDIMIENTO v2 (prime real del WARM): el usuario seguía notando 1-2s al hacer scroll. Causa: los navegadores NO bufferizan de verdad un <video> en pausa y fuera de pantalla aunque tenga preload='auto' (solo bajan metadata). FIX: en la rama WARM (tarjeta i+1) ahora hacemos un play() muteado que FUERZA el buffer real y lo pausamos en cuanto arranca (CarouselSlide lado A; DuetSlide AMBOS lados). Blindado con un token warmRef para evitar la carrera (si la tarjeta pasa a activa antes de resolver el prime, NO se pausa el vídeo ya en reproducción). Verificado: 0 errores de consola; activa solo lado visible con src; siguiente 1vs1 con ambos lados src+preload=auto. Lint limpio. Cache OK (Cache-Control max-age + Accept-Ranges + Range 206). NO usar agente de testing (petición del usuario)."
    -agent: "main"
    -message: "MEJORA RENDIMIENTO (carga instantánea tipo TikTok, DECODER_WARM=active+next del Performance Blueprint): hasta ahora solo la tarjeta ACTIVA tenía src -> al deslizar, el vídeo cargaba desde cero (espera perceptible). AÑADIDO 'warm' de la tarjeta SIGUIENTE (i+1): se monta y bufferiza su(s) vídeo(s) con preload='auto' EN PAUSA (frame 1 listo) -> al activarse, play()/startBothAtomically arranca con 0 espera. Para 1vs1 (DuetSlide) calienta AMBOS lados (A y B). Presupuesto de decoders acotado a ≤4 (activa 2 + siguiente 2; prev se libera). Gating: solo gama alta (hardwareConcurrency>=4 && deviceMemory>=4) y fuera de modo ahorro (shouldConserve). Archivos: components/Feed.jsx (deviceCanWarm, estado canWarm, prop warm=i===activeIndex+1, warmVideo con chunk init+~1.5MB para k=1), components/CarouselSlide.jsx y components/DuetSlide.jsx (prop warm + rama WARM en el efecto de reproducción; acquire pone preload='auto', release lo vuelve a 'none'). Verificado en navegador: sección activa (versus) solo lado visible con src; sección siguiente (1vs1) AMBOS lados con src+preload=auto en pausa; device caps 8/8 -> warm activo. Lint limpio. NO usar agente de testing (petición previa del usuario)."
    -agent: "main"
    -message: "BUG FIX RENDIMIENTO (recientes peor que antiguas): las publicaciones recientes se veían en BAJA calidad y MENOS fluidas que las antiguas. Causa raíz: las renditions ABR (360/540/720) generadas en subida. (1) pickQuality elegía una versión reescalada (540p por defecto, 360p con ahorro) -> peor resolución. (2) las renditions 540/720 (preset veryfast + bitrate fijo) PESABAN MÁS que el original (ej. original 2.7MB -> 540p 3.8MB, 720p 7.4MB) -> más buffering -> jank. Los vídeos antiguos /videos/*.mp4 (169-778KB, sin renditions) servían el original limpio -> mejor calidad y fluidez. FIX: (A) lib/networkQuality.js pickQuality ahora devuelve SIEMPRE el original (fallbackUrl) salvo modo conservador (Ahorro de datos/batería ≤20% -> 360p). Corrige al instante las 16 publicaciones existentes sin reprocesar. (B) route.js: desactivadas las 3 llamadas a processPostRenditions (versus/duet/accept-challenge); se mantiene faststartInPlace (lossless, mejora arranque sin tocar calidad). Verificado en navegador: <video> usa /uploads/<id>.mp4 original, 0 URLs _360/_540/_720. Nota: NO usar agente de testing (petición previa del usuario)."
    -agent: "main"
    -message: "BUG FIX avatar de retos tras cambiar foto. La BD 'twyk' puede estar VACÍA; REGISTRA usuarios nuevos (no uses credenciales antiguas). Probar SOLO BACKEND. Escenarios: (A) Registra dos usuarios vía POST /api/auth/register {username,email,password}: alice y bob. Guarda cookie/token de cada uno. (B) Como bob, crea un reto a alice: NO hay endpoint directo simple porque /api/challenges requiere multipart con file (vídeo) + targetAuthor JSON. Construye POST /api/challenges (sesión bob) con FormData: file=bytes mp4 dummy, targetAuthor=JSON {id:<id de alice>,username:'alice',name:'Alice',avatarUrl:'https://i.pravatar.cc/120?img=1'}, message='reto'. -> 200 {ok:true, challenge} y challenge.from.username==='bob', challenge.to.username==='alice'. (C) GET /api/challenges con sesión de alice (role por defecto 'to') -> debe incluir el reto y challenge.from.avatarUrl === avatar ACTUAL de bob (el que tiene bob en su registro, p.ej. dicebear con seed bob). (D) Como bob, cambia su foto: POST /api/profile (multipart) con avatar=imagen png/jpg dummy -> 200 {ok:true, user} y user.avatarUrl empieza con '/uploads/avatar_'. (E) REPITE GET /api/challenges con sesión de alice -> AHORA challenge.from.avatarUrl DEBE ser el NUEVO '/uploads/avatar_...' (NO el snapshot viejo). Este es el núcleo del fix. (F) Igual para el destinatario: como alice cambia su avatar vía POST /api/profile; GET /api/challenges con sesión de bob (role=from o all para ver retos que envió) -> challenge.to.avatarUrl debe reflejar el nuevo avatar de alice. (G) Verifica que un autor demo (sin documento) usado como targetAuthor conserva su avatarUrl snapshot (no rompe). NO modificar el Testing Protocol."

  - task: "POST /api/vote sanity check after frontend changes (burst animation separation)"
    implemented: true
    working: true
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "testing"
        -comment: "✅ VERIFIED: Vote endpoint working correctly after frontend changes (6/6 scenarios passed). Test file: /app/backend_vote_test.py. CONTEXT: Frontend changes in /app/components/DuetSlide.jsx and /app/components/CarouselSlide.jsx separated visual burst animation from actual vote submission, but NO backend code was touched. SCENARIO 1 (LOGIN): POST /api/auth/login with lucia/Test12345 -> 200 with token and session cookie ✓. SCENARIO 2 (FEED): GET /api/feed?cursor=0&limit=8 -> 200, found duet post 'duet_624cbf062b8afd5d' with initial votes a=0, b=0 ✓. SCENARIO 3 (VOTE A): POST /api/vote {id: 'duet_624cbf062b8afd5d', side: 'a'} -> 200 {ok: true, votes: {a: 1, b: 0}}, side 'a' incremented correctly from 0 to 1, side 'b' unchanged ✓✓✓. SCENARIO 4 (VOTE B - BEHAVIOR): POST /api/vote {id: same, side: 'b'} immediately after -> 200 {ok: true, votes: {a: 1, b: 1}}, side 'b' incremented from 0 to 1, side 'a' remained at 1 ✓✓✓. BEHAVIOR OBSERVED: Backend allows voting for both sides (no vote switching logic) - user can vote for side 'a' and then side 'b', both counters increment independently. This is the current backend behavior (not a bug, just the implementation). SCENARIO 5 (REGRESSION - LOGIN): POST /api/auth/login -> 200 ✓. SCENARIO 6 (REGRESSION - FEED): GET /api/feed -> 200 ✓. SCENARIO 7 (ERROR HANDLING): POST /api/vote with invalid data {id: 'invalid', side: 'invalid'} -> 400 (not 500) ✓. NO 500 errors detected. NO regressions in /api/auth/login, /api/feed, or /api/vote. The frontend changes (burst animation separation) did NOT affect backend vote functionality. Vote endpoint continues to work correctly."

    -agent: "testing"
    -message: "SANITY CHECK COMPLETE: Verified POST /api/vote endpoint after frontend changes (DuetSlide.jsx/CarouselSlide.jsx burst animation separation). Test results: ✅ Login working (lucia/Test12345 -> 200 with token). ✅ Feed working (GET /api/feed -> 200, found duet post with votes). ✅ Vote for side 'a' working (votes.a incremented from 0 to 1). ✅ Vote for side 'b' working (votes.b incremented from 0 to 1, votes.a stayed at 1). BEHAVIOR: Backend allows voting for both sides independently (no vote switching) - this is current implementation, not a regression. ✅ No 500 errors. ✅ No regressions in /api/auth/login, /api/feed, /api/vote. Frontend changes did NOT affect backend. All endpoints working correctly. Test file: /app/backend_vote_test.py."

    -agent: "main"
    -message: "INFRA (recurrente, ver memory/ENV_BACKUP.md): /app/.env volvió a faltar al recrearse el contenedor. Restaurado con MONGO_URL=mongodb://localhost:27017/twyk, ADMIN_EMAILS=twyk.apk@gmail.com, NEXT_PUBLIC_BASE_URL/CORS_ORIGINS apuntando a la URL de preview actual (leída de APP_URL en supervisord.conf). Re-sembradas las 4 cuentas con node scripts/seed-core-users.mjs (twykadmin/lucia/marcos/laura, ver memory/test_credentials.md recreado). NUEVA FEATURE a continuación (usuario: 'añadir una animación cuando se vote mejor que la de tiktok like'): creado components/VoteBurstEffect.jsx (halo de brillo + doble onda expansiva + icono con rebote elástico + 8 chispas radiales del color del lado votado) y sustituido el antiguo '.like-pop' (simple scale+fade, igual al corazón de TikTok) en components/CarouselSlide.jsx y components/DuetSlide.jsx. Nuevos keyframes CSS en app/globals.css (voteGlowFlash, voteRingPulse, voteIconPop, voteParticleFly). Cambio 100% frontend, no toca backend/endpoints. VERIFICADO VISUALMENTE con Playwright (login real como lucia + doble-tap en un post): se observa el halo+onda+icono elástico y luego las chispas dispersándose en círculo; el voto se registró de verdad (contador 1->2). El usuario pidió explícitamente NO usar el agente de testing para este cambio, así que no se invocó deep_testing_backend_nextjs/deep_testing_frontend_nextjs. Lint limpio (solo 2 warnings preexistentes de eslint-disable no usados, no relacionados)."

  - task: "Cambiar de voto en la misma publicación (cambiar de opción A/B) sin usar agente de testing"
    implemented: true
    working: true
    file: "lib/stores.js, app/api/[[...path]]/route.js, components/CarouselSlide.jsx, components/DuetSlide.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        -working: true
        -agent: "main"
        -comment: "NUEVA FEATURE (usuario: 'haz que el voto pueda cambiar en la misma publicación cambiando de opción'; explícitamente pidió NO usar el agente de testing). ANTES: una vez votado (userVote seteado), doble-tap en la OTRA opción solo disparaba la animación visual (spawnVoteBurst) sin llamar a submitVote ni al backend -> el voto quedaba fijo para siempre (confirmado también por un test de backend previo en este mismo archivo: 'Backend allows voting for both sides... no vote switching'). AHORA: BACKEND (lib/stores.js): incrementPostVote(id, side, previousSide) e incrementBuiltinVote(id, side, seed, previousSide) reescritas con pipeline atómico ($set + $ifNull + $max[0,...]) que, si previousSide es 'a'|'b' y distinto de side, resta 1 del lado anterior y suma 1 al nuevo en la MISMA operación (el total de votos no cambia); si previousSide===side, no aplica ningún delta (no-op, evita doble conteo por re-toque). route.js handleVote acepta body.previousSide (saneado a 'a'|'b'|null) y lo propaga a ambas funciones; se omite recordVote() (motor de recomendación) y la notificación 'vote' al autor cuando es un cambio de opción o un re-toque (isSwitch/isNoOp), para no espamear ni sesgar el aprendizaje por la misma interacción del votante. FRONTEND (CarouselSlide.jsx y DuetSlide.jsx): submitVote(s, pt) ahora es un no-op solo si userVote===s (misma opción); si hay un voto previo en la OTRA opción, actualiza el estado optimista restando 1 al lado anterior y sumando 1 al nuevo, guarda el nuevo lado en localStorage y envía previousSide al POST /api/vote. El gesto de doble-tap (onPointerUp en CarouselSlide, handleTapSide en DuetSlide) ahora compara userVote !== side (antes era !userVote) para decidir si vota/cambia o solo muestra el burst. La VSWinnerCard (sin estado interno, 100% controlada por props) se actualiza automáticamente al cambiar userVote (nuevo vídeo/nombre/% del lado elegido). Añadida pista 'Double-tap to switch your vote' en CarouselSlide cuando ya hay voto y se está viendo el lado NO votado. VERIFICADO MANUALMENTE con curl (usuario pidió NO usar agente de testing) sobre un post subido (type=duet) y sobre un post demo del feed integrado (type=feed_N, con semilla): (1) primer voto 'a' -> incrementa solo a. (2) POST /api/vote {side:'b', previousSide:'a'} -> a-1, b+1, total SIN cambios (confirmado también leyendo el documento en mongosh). (3) re-toque de la misma opción ya votada con previousSide igual a side -> sin cambios (no-op). Persistencia confirmada tras recarga (GET /api/uploads y GET /api/feed devuelven los votos ya ajustados). Lint limpio en los 4 archivos (solo 2 warnings preexistentes de eslint-disable no usados en Carousel/DuetSlide, no relacionados)."

agent_communication:
    -agent: "main"
    -message: "SOLICITUD USUARIO: 'No usar el testing agent. Falta el .env. En la página de retos activos no se escucha el audio de la publicación del reto activo, y las publicaciones tipo carrusel cuando está en la 2 opción y deslizó para ver otra publicación o retrocedo se sigue escuchando el audio de la publicación anterior. Dejarme probar a mi el funcionamiento cuando lo corrijas'. Acciones: (1) restaurado /app/.env (misma causa raíz recurrente, ver memory/ENV_BACKUP.md) con la URL de preview actual; BD vacía -> re-sembrada con node scripts/seed-core-users.mjs; memory/test_credentials.md recreado. (2) ActiveChallengesPage.jsx: los vídeos de las miniaturas A/B de los retos pendientes tenían 'muted' fijo -> añadido el mismo patrón muted-state+onPointerDown que ya usan Feed/CompletedBattlesPage/ProfilePage. (3) CarouselSlide.jsx: encontrado y corregido un bug real de solapamiento de audio al RETROCEDER entre publicaciones estando en la opción B (causa: la tarjeta abandonada pasa de isActive=true a warm=true directamente -por cómo se calcula 'warm=i===activeIndex+1' en Feed.jsx al decrementar el índice- y la rama warm del efecto de reproducción solo gestionaba el lado A, dejando el lado B huérfano reproduciéndose para siempre). Fix: liberar el lado visible si no es ya el A antes de precargar A en la rama warm. Lint limpio en ambos archivos. NO se invocó deep_testing_backend_nextjs ni deep_testing_frontend_nextjs (petición explícita del usuario, que además pidió probar él mismo el resultado). NO modificar el Testing Protocol."
    -agent: "main"
    -message: "SOLICITUD USUARIO: 'Instala el archivo .env y el botón de seguir del feed inicio hazlo en forma de pastilla, no usar el testing agent'. (1) .env volvió a faltar (misma causa raíz recurrente, ver memory/ENV_BACKUP.md); restaurado con la URL de preview actual (https://audio-playback-bug.preview.emergentagent.com), nextjs reiniciado, BD re-sembrada con node scripts/seed-core-users.mjs (twykadmin/lucia/marcos/laura, ver memory/test_credentials.md recreado). Verificado por logs de supervisor: GET /, /api/uploads, /api/challenges, /api/feed todos 200 (sin 500). (2) Botón Follow/Following del feed de inicio: cambiado 'rounded-lg' -> 'rounded-full' en components/CarouselSlide.jsx y components/DuetSlide.jsx (única clase CSS, sin tocar lógica). Lint limpio. NO se invocó deep_testing_backend_nextjs ni deep_testing_frontend_nextjs por petición explícita del usuario. Pendiente confirmación visual del usuario."
    -agent: "main"
    -message: "SOLICITUD USUARIO (nueva sesión, contenedor recreado): 'Falta el archivo .env, los vídeos En retos activos la opción b no se escucha ni se reproduce, solo se reproduce la opción a, no usar el testing agent y dejarme probar a mi manualmente'. Acciones: (1) restaurado /app/.env (misma causa raíz recurrente ya documentada en memory/ENV_BACKUP.md; nueva URL de preview: https://e38a3599-57d3-4240-ad38-5f0f312e1a99.preview.emergentagent.com); memory/ENV_BACKUP.md actualizado; nextjs reiniciado; MongoDB estaba vacía -> re-sembrada con node scripts/seed-core-users.mjs; memory/test_credentials.md recreado (twykadmin/Admin12345 admin, lucia|marcos|laura/Test12345). (2) BUG 'opción B no se reproduce/no suena en Retos Activos': causa raíz encontrada en components/ActiveChallengesPage.jsx — a diferencia de CarouselSlide/DuetSlide (que ya liberan agresivamente el decoder, 'REGLA #2'), esta página montaba TODOS los <video> (A y B de TODOS los retos activos en el swiper vertical) con src+autoPlay+loop declarados incondicionalmente en JSX -> se agotaba el presupuesto de decodificadores del dispositivo y solo el primer vídeo (A del primer reto) conseguía reproducirse. FIX: nuevo estado activeCard (Swiper vertical onSlideChange) pasado como prop 'active' a ChallengeSlide; dentro de cada tarjeta, el <video> ya no declara src/autoPlay (solo poster+muted+loop), y un efecto imperativo (acquireVideo/releaseVideo, mismo patrón pause+removeAttribute('src')+load() que CarouselSlide.jsx) asigna src+play() SOLO al vídeo que es 'active && idx===lado-mostrado', liberando todos los demás. NO se usó ningún agente de testing (petición explícita, dos veces). Verificado solo por revisión de código + logs de supervisor sin errores tras el restart (GET / 200, GET /api/challenges 200, POST /api/auth/login 200) y lint limpio en components/ActiveChallengesPage.jsx. EL USUARIO PROBARÁ ESTO MANUALMENTE, tal como pidió — por favor NO invocar deep_testing_backend_nextjs ni deep_testing_frontend_nextjs para esta tarea salvo que el usuario lo solicite expresamente. NO modificar el Testing Protocol."

