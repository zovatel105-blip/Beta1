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

user_problem_statement: "Las publicaciones normales deben ser un carrusel de 2 vídeos (opción A / opción B) entre los que se desliza y se vota tocando el vídeo. Se suben 2 vídeos. Reemplaza el vídeo normal. AÑADIDO: votar = doble toque, quitar el corazón/Me gusta, y nueva función 'Retar' (solicitud de enfrentamiento con un vídeo subido que el retado acepta/cancela en la Bandeja)."

backend:
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


metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "Refrescar avatar de participantes en retos (activos y completados) tras cambiar foto de perfil"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
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
