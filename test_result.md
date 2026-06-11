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
  - task: "GET /api/users devuelve la lista de creadores demo"
    implemented: true
    working: "NA"
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "Nuevo endpoint. Devuelve {users:[{username,name,avatarUrl}]} derivado de los autores de VIDEOS (únicos por username, sin 'tu_canal'). Verificar que devuelve una lista no vacía y con esos campos."
  - task: "POST /api/duet ahora recibe fileA + fileB + layout (2 vídeos propios)"
    implemented: true
    working: "NA"
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "CAMBIO: ya no usa pairVideoUrl. Multipart 'fileA' + 'fileB' (bytes mp4 dummy) + 'layout' ('horizontal'|'vertical') + 'description'. Devuelve {ok:true, post} con type='duet', layout correcto, sideA.videoUrl y sideB.videoUrl empiezan con /uploads/, ambos author.username='tu_canal'. Falta de alguno de los 2 archivos -> 400 'need_two_files'. Verificar que aparece luego en GET /api/uploads."
  - task: "POST /api/challenges con usuario destino (targetVideoUrl opcional)"
    implemented: true
    working: "NA"
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "CAMBIO: 'targetVideoUrl' ahora OPCIONAL. Multipart 'file' (tu vídeo) + 'targetAuthor' (JSON del usuario destino) + 'message' opcional. Devuelve {ok:true, challenge} con status='pending', from.username='tu_canal', to=targetAuthor, challengerVideoUrl empieza con /uploads/, targetVideoUrl=null si no se envía. Sin file -> 400 'no_file'. Sin targetAuthor -> 400 'no_target'. Compat: si se envía targetVideoUrl también debe funcionar (flujo ChallengeDialog)."
  - task: "POST /api/challenges/{id}/accept acepta el vídeo del retado (multipart file)"
    implemented: true
    working: "NA"
    file: "app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        -working: "NA"
        -agent: "main"
        -comment: "CAMBIO: accept ahora puede recibir multipart 'file' (vídeo del retado). Si el reto NO tiene targetVideoUrl y se envía file -> usa ese. Si el reto YA tiene targetVideoUrl y se acepta SIN body -> usa ese (compat). Si no hay ninguno -> 400 'no_response_video'. Devuelve {ok:true, post} type='versus' con sideA=challenger, sideB=respuesta; luego aparece en GET /api/uploads y desaparece de GET /api/challenges. id inexistente -> 404. PROBAR LOS 2 CAMINOS: (1) crear challenge SIN targetVideoUrl y aceptar CON file; (2) crear challenge CON targetVideoUrl y aceptar SIN body."
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

frontend:
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

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "GET /api/challenges/completed lista los retos completados (versus isChallenge) con votos en vivo"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    -agent: "main"
    -message: "BUG FIX retos completados: la página 'Completados' nunca mostraba nada porque el frontend tenía battles=[] hardcodeado. Añadí GET /api/challenges/completed (deriva de uploads con isChallenge=true) y el frontend ahora lo consume. Por favor testea SOLO BACKEND este nuevo endpoint: 1) GET /api/challenges/completed -> 200 con forma {battles:[...]}. 2) Flujo completo: POST /api/challenges (multipart file + targetVideoUrl='/videos/4467.mp4' + targetAuthor=JSON {username:'urbanlife',name:'Marco Ruiz',avatarUrl:'x'}) -> aceptar con POST /api/challenges/{id}/accept -> el versus debe aparecer en GET /api/challenges/completed con 2 participants (A=tu_canal, B=urbanlife), totalVotes=0, isWinner en A por empate. 3) POST /api/vote {id: <versus_ch_id>, side:'b'} dos veces -> GET /api/challenges/completed debe reflejar votes.b=2 y isWinner ahora en B. NO modificar el Testing Protocol."
    -agent: "main"
    -message: "FLUIDEZ ULTRA (3 fases tipo TikTok/Reels) implementada y verificada manualmente (sin agente de test, por petición del usuario). FASE 1: faststart en subidas nuevas + batch one-time de vídeos existentes; prefetch por Range; decoder priming de vecinos ±1; pósters regenerados. FASE 2 (ABR adaptativo, SOLO vídeos nuevos): renditions 360/540/720 en segundo plano con qualities parcheadas en _meta.json; frontend lib/networkQuality.js (pickQuality, reportStall). FASE 3: Service Worker (public/sw.js) cache-first para pósters; NO intercepta vídeo. DEPENDENCIA: ffmpeg requerido en despliegue (instalado en runtime aquí); degradación elegante si falta."
    -agent: "main"
    -message: "FEED PRINCIPAL migrado (combinación 1a+2a confirmada por el usuario). 1a: reemplazado Swiper por motor scroll-snap CSS nativo en components/Feed.jsx (ventana DOM de 3, único IntersectionObserver 0.7, prefetch, goNext por scrollTo) conservando 100% las tarjetas ricas SnapTok (CarouselSlide/DuetSlide: doble toque para votar, columna social, cabecera autor/música, winner card, retos). Liberación AGRESIVA de decoder inyectada DENTRO de las tarjetas: src imperativo solo en la tarjeta activa + pause()+removeAttribute('src')+load() en cleanup/desactivación (priming eliminado). 2a: nuevo hook hooks/useFeed.js (inicial /api/uploads + 1ª página /api/feed en paralelo, loadMore pagina /api/feed con scroll infinito disparado al entrar activeIndex+2, dedupe por id). Backend SIN cambios (no requiere testing backend). Verificado manualmente en navegador (render completo con datos reales, ventana de 3 respetada, sin errores de consola). Test E2E frontend pendiente de autorización del usuario."
    -agent: "main"
    -message: "MEJORA RENDIMIENTO v2 (prime real del WARM): el usuario seguía notando 1-2s al hacer scroll. Causa: los navegadores NO bufferizan de verdad un <video> en pausa y fuera de pantalla aunque tenga preload='auto' (solo bajan metadata). FIX: en la rama WARM (tarjeta i+1) ahora hacemos un play() muteado que FUERZA el buffer real y lo pausamos en cuanto arranca (CarouselSlide lado A; DuetSlide AMBOS lados). Blindado con un token warmRef para evitar la carrera (si la tarjeta pasa a activa antes de resolver el prime, NO se pausa el vídeo ya en reproducción). Verificado: 0 errores de consola; activa solo lado visible con src; siguiente 1vs1 con ambos lados src+preload=auto. Lint limpio. Cache OK (Cache-Control max-age + Accept-Ranges + Range 206). NO usar agente de testing (petición del usuario)."
    -agent: "main"
    -message: "MEJORA RENDIMIENTO (carga instantánea tipo TikTok, DECODER_WARM=active+next del Performance Blueprint): hasta ahora solo la tarjeta ACTIVA tenía src -> al deslizar, el vídeo cargaba desde cero (espera perceptible). AÑADIDO 'warm' de la tarjeta SIGUIENTE (i+1): se monta y bufferiza su(s) vídeo(s) con preload='auto' EN PAUSA (frame 1 listo) -> al activarse, play()/startBothAtomically arranca con 0 espera. Para 1vs1 (DuetSlide) calienta AMBOS lados (A y B). Presupuesto de decoders acotado a ≤4 (activa 2 + siguiente 2; prev se libera). Gating: solo gama alta (hardwareConcurrency>=4 && deviceMemory>=4) y fuera de modo ahorro (shouldConserve). Archivos: components/Feed.jsx (deviceCanWarm, estado canWarm, prop warm=i===activeIndex+1, warmVideo con chunk init+~1.5MB para k=1), components/CarouselSlide.jsx y components/DuetSlide.jsx (prop warm + rama WARM en el efecto de reproducción; acquire pone preload='auto', release lo vuelve a 'none'). Verificado en navegador: sección activa (versus) solo lado visible con src; sección siguiente (1vs1) AMBOS lados con src+preload=auto en pausa; device caps 8/8 -> warm activo. Lint limpio. NO usar agente de testing (petición previa del usuario)."
    -agent: "main"
    -message: "BUG FIX RENDIMIENTO (recientes peor que antiguas): las publicaciones recientes se veían en BAJA calidad y MENOS fluidas que las antiguas. Causa raíz: las renditions ABR (360/540/720) generadas en subida. (1) pickQuality elegía una versión reescalada (540p por defecto, 360p con ahorro) -> peor resolución. (2) las renditions 540/720 (preset veryfast + bitrate fijo) PESABAN MÁS que el original (ej. original 2.7MB -> 540p 3.8MB, 720p 7.4MB) -> más buffering -> jank. Los vídeos antiguos /videos/*.mp4 (169-778KB, sin renditions) servían el original limpio -> mejor calidad y fluidez. FIX: (A) lib/networkQuality.js pickQuality ahora devuelve SIEMPRE el original (fallbackUrl) salvo modo conservador (Ahorro de datos/batería ≤20% -> 360p). Corrige al instante las 16 publicaciones existentes sin reprocesar. (B) route.js: desactivadas las 3 llamadas a processPostRenditions (versus/duet/accept-challenge); se mantiene faststartInPlace (lossless, mejora arranque sin tocar calidad). Verificado en navegador: <video> usa /uploads/<id>.mp4 original, 0 URLs _360/_540/_720. Nota: NO usar agente de testing (petición previa del usuario)."
    -agent: "main"
    -message: "BUG FIX (regresión 1vs1 'disco rallado'): el watchdog de drift A/B que añadí en DuetSlide (tarea a) era INCORRECTO para este caso. En Twyk un 1vs1 son DOS clips INDEPENDIENTES de distinta duración (no dos ángulos del mismo evento), así que su currentTime diverge por naturaleza; el watchdog hacía faster.currentTime=slower.currentTime en bucle -> seeks continuos = stutter ('disco rallado'). FIX: eliminado el watchdog de drift en components/DuetSlide.jsx (efecto de progreso vuelve a ser solo progreso). Se MANTIENE el arranque atómico startBothAtomically + se le añadió TIMEOUT de seguridad 1200ms (un lado lento ya no bloquea al otro). Quitado import reportWatchdog y driftFixRef. Lint limpio, compila. Blueprint §3.2 anotado: el watchdog frame-a-frame solo aplica a streams que comparten línea temporal, NO a clips independientes."
