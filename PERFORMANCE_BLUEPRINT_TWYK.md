# Twyk — Performance Blueprint

**Especificación Técnica de Rendimiento y Fluidez para un feed de duelos de vídeo dual (nivel TikTok)**

> Documento de arquitectura "esto es lo que hay que construir". Audiencia: ingeniería senior (web + iOS + Android + backend/streaming). Objetivo no negociable: que dos vídeos por tarjeta arranquen a la vez, sin spinner ni frame congelado, con la percepción de que "el contenido ya estaba ahí".

---

## 0. Principios rectores (los 5 mandamientos de Twyk)

1. **El usuario nunca espera.** Todo lo que se va a ver en los próximos ~6 s ya está decodificado y pausado en el frame 1.
2. **El póster cubre el gap.** Mientras un decoder no esté listo, se ve una imagen estática idéntica al frame 1; el cambio imagen→vídeo es invisible.
3. **Presupuesto de decoders sagrado.** Móvil tiene 4–6 decoders de hardware. Nunca se mantienen más de 3 pares (6 vídeos) "vivos"; el resto libera el decoder agresivamente.
4. **Cero trabajo de JS/CPU durante el gesto de scroll.** El scroll y las transiciones corren en el compositor/GPU. React/JS solo reacciona a cambios de tarjeta, jamás por píxel.
5. **Los dos vídeos viven y mueren juntos.** Si uno bufferiza, ambos pausan; si uno arranca, ambos arrancan. Nunca uno corriendo y el otro congelado.

**KPIs que gobiernan el diseño** (detallados en §7):
- TTFF (Time-To-First-Frame) p95 < **200 ms** por vídeo.
- Latencia voto → siguiente duelo (el "wow moment") p95 < **300 ms**.
- Rebuffering ratio < **0.5 %**.
- Desincronización entre los dos vídeos < **1 frame (≈33 ms @30fps)**.

---

## 1. Arquitectura de precarga agresiva en cliente (Web y Móvil)

### 1.1 Modelo mental: la "ventana de vida" de un duelo

Cada duelo `D[i]` transita por 5 estados:

```
NONE → METADATA → PREFETCH(chunk init+1s) → WARM(decodificado, frame 1, pausado) → LIVE(reproduciendo)
                                                          ↓
                                              RELEASED (decoder devuelto)
```

La regla de oro: **solo `D[activo]` está en LIVE**; `D[activo±1]` están en WARM (decoder ocupado, pausados en frame 1); `D[activo+2..+N]` están en PREFETCH (bytes en caché, sin decoder); el resto en METADATA o RELEASED.

```
Índices:   ... i-2     i-1      i       i+1     i+2     i+3 ...
Estado:    RELEASED  WARM    LIVE    WARM   PREFETCH PREFETCH
Decoder:     no       sí      sí      sí      no       no
Bytes:     evict     cache   cache   cache   cache    cache(parcial)
Póster:    cargado   listo   listo   listo   listo    cargado
```

> **Justificación**: mantener WARM en `±1` da arranque de 0 frames al deslizar en ambas direcciones. Mantener solo PREFETCH (bytes, sin decoder) en `+2..+N` respeta el presupuesto de decoders de hardware (el verdadero cuello de botella en móvil), mientras la red ya trabajó por adelantado.

### 1.2 Algoritmo de pre-fetch predictivo

Cuántos duelos se precargan **no es fijo**: se adapta a (a) ancho de banda estimado, (b) velocidad de scroll, (c) probabilidad de voto rápido (cuanto más rápido vota el usuario, más lejos hay que precargar porque consume duelos más rápido).

```text
PREFETCH_DEPTH = clamp(
    base = 2,
    + (bandwidthMbps > 8  ? 2 : 0)          // red holgada -> más profundidad
    + (avgScrollVelocity > FAST ? 2 : 0)    // scroll rápido -> consume rápido
    + (avgVoteIntervalMs < 2500 ? 1 : 0),   // votante compulsivo -> +1
    min = 2, max = 6
)

WARM_WINDOW = 1           // siempre ±1 decodificados (decoders fijos)
PREFETCH_WINDOW = PREFETCH_DEPTH   // bytes+init segment en caché
```

Pseudocódigo del orquestador (corre en `onActiveIndexChange`, NO en scroll):

```text
function onActiveIndexChange(i):
    # 1) decoders: solo i-1, i, i+1 vivos
    for j in mountedDecoders:
        if abs(j - i) > WARM_WINDOW: releaseDecoder(j)   # pause + detach surface
    for j in [i-1, i, i+1]:
        if not hasDecoder(j): acquireDecoder(j)          # attach surface, decode frame 1, pause
    play(i); pauseAtFrame1(i-1); pauseAtFrame1(i+1)

    # 2) red: prefetch init segment + 1-2s de i+2 .. i+PREFETCH_DEPTH
    for j in [i+2 .. i+PREFETCH_DEPTH]:
        prefetchInitAndFirstSeconds(j.videoA)
        prefetchInitAndFirstSeconds(j.videoB)
        warmPoster(j.posterA); warmPoster(j.posterB)

    # 3) expulsión: libera bytes de duelos lejanos hacia atrás
    evictBeyond(i - 2)
```

**Probabilidad de voto / dirección**: como el feed es 1-D (solo se baja), la predicción es trivial hacia abajo; pero registramos `voteLatency` para subir `PREFETCH_DEPTH` en usuarios rápidos. Si una sesión muestra "scroll-back" frecuente, mantenemos `i-2` en PREFETCH también.

### 1.3 Caché multinivel y política de expulsión

| Nivel | Web | Móvil | Contenido | Límite | Expulsión |
|---|---|---|---|---|---|
| L0 GPU/Decoder | textura de `<video>`/WebCodecs `VideoFrame` | `MediaCodec`/`TextureView` | frames decodificados | 3 pares (6) | la más lejana al activo |
| L1 RAM | `MediaSource`/`SourceBuffer`, blobs | `ExoPlayer` buffers | segmentos demuxados | ~80–120 MB | LRU |
| L2 Disco | **IndexedDB** (vía Service Worker / Cache API) | **disk LRU cache de ExoPlayer (`SimpleCache`)** | fMP4 init+media | 200–400 MB | LRU + TTL |
| L3 CDN edge | HTTP/3 | HTTP/3 | todo | — | TTL por viralidad |

> **Política adaptativa**: el tamaño de L1/L2 se reduce dinámicamente bajo presión de memoria (`navigator.deviceMemory`, `onTrimMemory` en Android, `didReceiveMemoryWarning` en iOS). Bajo presión, `PREFETCH_DEPTH` cae a 2 y L2 se purga a duelos `[i-1, i+3]`.

### 1.4 Pre-descarga del chunk inicial (arranque inmediato)

Se descarga **solo lo necesario para mostrar el primer 1–2 s**: el *init segment* (`moov`/`ftyp`+`moof` inicial) + el primer *media segment* (CMAF). En web, vía `fetch(url, {headers:{Range:'bytes=0-N'}})` o pidiendo el primer segmento del manifiesto LL-HLS. Esto basta para `readyState >= HAVE_CURRENT_DATA` y poder pausar en frame 1.

```text
prefetchInitAndFirstSeconds(track):
    bytes = fetchRange(track.url, 0, INIT_PLUS_1S_BYTES)   // ~150-400 KB @240-360p
    cache.put(track.url + '#init1s', bytes)                // L2 IndexedDB / SimpleCache
```

### 1.5 Doble búfer (double buffering)

Mientras `D[i]` está LIVE, `D[i+1]` ya está **completamente preparado**: ambos vídeos decodificados, pausados en frame 1, con la superficie/`<video>` ya adjuntada al DOM/árbol (oculto o detrás por z-index). La "transición" es solo `play(i+1)` + cambio de z-index/opacity — sin crear nodos, sin adjuntar superficies, sin decodificar de cero.

```
[ Capa A: D[i]   LIVE   z=2, opacity=1 ]   <- reproduciendo
[ Capa B: D[i+1] WARM   z=1, opacity=0 ]   <- listo, pausado frame 1
   al avanzar -> A.opacity:0 (crossfade 120ms), B.play(), B.z=2  (sin recrear nada)
```

### 1.6 Implementación web

- `<video preload="auto" muted playsinline>` para los WARM; **`src` asignado imperativamente y liberado** al salir de la ventana (`pause()` → `removeAttribute('src')` → `load()`) para devolver el decoder.
- `fetchpriority="high"` en el init segment del par activo y `±1`; `low` para `+2..+N`.
- `<link rel="preload" as="fetch" href="...init" crossorigin>` para el siguiente duelo.
- **Service Worker** intercepta peticiones de segmentos → cache-first sobre IndexedDB/Cache API; **no** bloquea, sirve rangos. La descarga predictiva se ordena desde un **Web Worker** (off main thread) que habla con el SW por `postMessage`, dejando el hilo de UI 100 % libre para el compositor.
- Decodificación acelerada: `<video>`+MSE por defecto; **WebCodecs** (`VideoDecoder`) para control fino de frame 1 en dispositivos compatibles (ver §3).

```js
// Pool de 6 <video> reutilizados (3 pares). Nunca se crean/destruyen en runtime.
acquire(slotIndex, src) {
  const v = pool[slotIndex];
  if (v.getAttribute('src') !== src) { v.src = src; v.load(); } // init+1s ya en SW cache
}
release(slotIndex) {
  const v = pool[slotIndex];
  v.pause(); v.removeAttribute('src'); v.load(); // devuelve decoder + RAM
}
```

### 1.7 Implementación móvil

- **Android (ExoPlayer/Media3)**: pool de N `ExoPlayer` (3 pares = 6), cada uno con su `TextureView`/`Surface` ya adjuntada. WARM = `setPlayWhenReady(false)` + `prepare()` con la `Surface` adjunta → ExoPlayer decodifica el primer frame y lo deja pintado. Caché de disco con `SimpleCache` (LRU). Prefetch en background con `WorkManager`/coroutines a `CacheWriter` (solo init+1s).
- **iOS (AVPlayer)**: pool de `AVPlayer` + `AVPlayerLayer` ya en la jerarquía de capas. **Pre-warming**: crear `AVPlayerItem`, observar `status == .readyToPlay` y `isPlaybackLikelyToKeepUp`, hacer `preroll(atRate:)` para decodificar el primer frame, mantener `rate = 0`. `AVAssetResourceLoaderDelegate` para servir desde caché de disco propia (LRU).
- **Pool de decodificadores compartido**: en ambos casos el número de instancias vivas = `2 * (WARM_WINDOW*2 + 1)` acotado a 6. Al reciclar, se **reusa** la instancia/`Surface` (no se libera el `MediaCodec`), solo se cambia la fuente.

---

## 2. Pipeline de streaming y entrega de latencia ultrabaja

### 2.1 Protocolo

- **LL-HLS** (preferido por interoperabilidad iOS nativa) con `PART-TARGET ≈ 0.2–0.5 s`, `EXT-X-PART` (partial segments), `Blocking Playlist Reload` y `_HLS_msn/_HLS_part` para tirar de partes apenas existen.
- Alternativa/segundo flujo: **MPEG-DASH** con segmentos cortos (1–2 s), `availabilityTimeOffset`, `$Number$` templating y `SegmentTimeline` para arranque rápido.
- **CMAF** como contenedor común (fragmentos fMP4) → un solo encode sirve a LL-HLS y DASH. Reduce almacenamiento en CDN y unifica caché.

> **Justificación**: los vídeos de Twyk son bucles cortos (5–12 s). Para clips pre-grabados, lo crítico no es "directo" sino **fast-start**: por eso priorizamos fMP4 con `moov` al inicio (faststart) y segmentos cortos, y reservamos LL-HLS real para contenido en vivo/eventos.

### 2.2 Empaquetado y faststart

- fMP4 con `ftyp`+`moov` al **inicio** del archivo (`-movflags +faststart` en ffmpeg) → el reproductor obtiene metadatos en el primer rango de bytes.
- Init segment separado y cacheable indefinidamente; media segments de 1–2 s.
- GOP corto (keyframe cada ≤1 s) → cualquier segmento arranca sin esperar al siguiente IDR. Esto es **imprescindible** para arranque instantáneo.

```bash
# Ejemplo de empaquetado CMAF/fMP4 con faststart y GOP corto
ffmpeg -i in.mp4 \
  -c:v libx264 -profile:v main -g 30 -keyint_min 30 -sc_threshold 0 \
  -movflags +faststart+frag_keyframe+empty_moov \
  -f dash -seg_duration 1 -use_template 1 -use_timeline 1 out.mpd
```

### 2.3 Códecs y decodificación

- **Móvil**: H.265/HEVC (mejor calidad/bitrate, decodificación HW casi universal) con **fallback H.264** para hardware viejo.
- **Web**: **AV1** (donde haya decode HW) > **VP9** > **H.264**, negociados vía MSE/`MediaCapabilities.decodingInfo()`. `WebCodecs` para decode acelerado y control de frame.
- Selección por capacidad real, no por suposición:

```js
const support = await navigator.mediaCapabilities.decodingInfo({
  type: 'media-source',
  video: { contentType: 'video/mp4; codecs="av01.0.05M.08"', width:720, height:1280, bitrate:1_200_000, framerate:30 }
});
const codec = support.smooth && support.powerEfficient ? 'av1' : 'h264';
```

### 2.4 ABR: empezar feo, escalar en 1–2 s

El primer fragmento se sirve a **calidad mínima (≈240p, ~120 kbps)** para garantizar TTFF < 200 ms incluso con ancho de banda incierto; el ABR sube a 540p/720p en los siguientes 1–2 s.

```text
chooseInitialRendition(estBandwidth):
    if firstFragmentOfSession or estBandwidth == UNKNOWN: return LADDER.min   # 240p
    return ladderForBandwidth(estBandwidth * SAFETY_FACTOR=0.7)

onSegmentDownloaded(stats):
    update EWMA(bandwidth)
    if buffer > 3s and bandwidth allows: stepUpRendition()   # 240->540->720
    if rebufferRisk(): stepDownRendition()
```

Ladder sugerido (vertical 9:16): `240p@120k → 360p@300k → 540p@700k → 720p@1.2M → 1080p@2.5M`.

### 2.5 CDN, HTTP/3 y multiplexación

- Todo el contenido tras **CDN multi-PoP**, entrega por **HTTP/3 (QUIC)**: handshake 0/1-RTT y **multiplexación** de los dos streams (A y B) del mismo duelo sobre una conexión → ambos llegan en paralelo sin head-of-line blocking.
- **TTL**: largo para virales (cache hit ≈100 %), corto para contenido fresco. **Pre-warming de CDN** para duelos con alto potencial (predicción de exposición) empujando el init+1s a los edges antes de que el feed los sirva.
- `Cache-Control: immutable` para init segments e identificadores con hash de contenido.

### 2.6 Diagrama de secuencia — arranque de un duelo

```
Cliente            SW/WebWorker        CDN(HTTP/3)        Backend
  | scroll a i         |                   |                 |
  |---onActive(i)------>|                   |                 |
  |                     |--GET init+1s A--->|  (cache hit)    |
  |                     |--GET init+1s B--->|  (mux QUIC)     |
  |                     |<==bytes A,B=======|                 |
  |<--cache ready-------|                   |                 |
  | acquireDecoder(A,B) |                   |                 |
  | decode frame1 (A,B) |                   |                 |
  | rAF: play(A)+play(B)|  <-- 0 frames de espera, póster ya visible
```

---

## 3. Sincronización exacta del inicio de los dos vídeos

### 3.1 Arranque atómico

Ambos reproductores se llevan a `readyState >= HAVE_CURRENT_DATA` (frame 1 decodificado) **en pausa**. Solo cuando **ambos** están listos se disparan juntos dentro del **mismo callback de `requestAnimationFrame`** (un "mutex" lógico en el hilo de UI):

```js
async function startDuel(a, b) {
  await Promise.all([untilReady(a), untilReady(b)]); // ambos HAVE_CURRENT_DATA
  requestAnimationFrame(() => {                       // mismo tick -> arranque común
    a.currentTime = 0; b.currentTime = 0;
    Promise.allSettled([a.play(), b.play()]);
  });
}
function untilReady(v){ return v.readyState>=2 ? Promise.resolve()
  : new Promise(r=>v.addEventListener('loadeddata', r, {once:true})); }
```

> En **WebCodecs**, se decodifica explícitamente el primer `VideoFrame` de cada track y se pinta en `<canvas>` antes de arrancar el avance temporal → control sub-frame del instante exacto mostrado.

### 3.2 Manejo de drift (los dos juntos, siempre)

Un *watchdog* compara `currentTime` de A y B cada `rAF`. Si la deriva supera 1 frame o uno entra en `waiting`/buffering: **pausa ambos**, muestra el póster del que falta, y reanuda los dos juntos cuando ambos vuelven a `canplaythrough`/`HAVE_FUTURE_DATA`.

```text
onRAF():
    if abs(a.currentTime - b.currentTime) > 1/FPS:
        slower = a.currentTime < b.currentTime ? a : b
        faster.pause(); waitUntil(slower catches up); resyncStartBoth()
    if a.stalled or b.stalled:
        pauseBoth(); showPoster(stalledSide); resumeBothWhenReady()
```

> **Regla UX**: nunca se ve un vídeo corriendo y el otro congelado. Antes de eso, congelamos ambos sobre su póster (que es idéntico al frame 1 → imperceptible).

### 3.3 "Primer frame común" (técnica póster→vídeo)

El backend genera, por cada vídeo, un **póster del frame 1** (JPEG/WebP ligero, mismas dimensiones). El cliente lo pinta **instantáneamente** debajo del `<video>`. Cuando el vídeo alcanza frame 1 y arranca, el póster se **disuelve** (crossfade 80–120 ms) o simplemente queda tapado: como son el mismo fotograma, no hay salto.

```
[ <img poster frame1> ]  <- visible en 0 ms
[ <video> (decodificando) ] opacity 0 -> 1 al estar listo
```

```bash
ffmpeg -i in.mp4 -vf "select=eq(n\,0)" -q:v 3 frame1.webp   # póster = frame exacto 1
```

---

## 4. Gestión del sonido para fluidez y adicción

### 4.1 Modelo por defecto: silencio inteligente

- Los dos vídeos arrancan **muteados** (requisito de autoplay en navegadores y para evitar cacofonía).
- El audio de un lado se activa **solo bajo intención explícita y ligera**:
  - **Web**: `hover` sostenido (o `pointerdown` mantenido) sobre un lado.
  - **Móvil**: *press & hold* (presión táctil mantenida) sobre un lado.
- Al soltar → vuelve a mute con **crossfade** corto.

```text
onHoverStart(side):  audioFadeIn(side, 80ms);  audioFadeOut(otherSide, 80ms)
onHoverEnd(side):    audioFadeOut(side, 120ms)
```

### 4.2 Voto, micro-sonido y "ganador temporal"

Al tocar para votar: se reproduce un **micro-SFX de voto** (sample pregargado, <50 ms) y el audio del **siguiente** duelo se prepara según una regla de **"ganador temporal"** (predicción del lado que el usuario tiende a votar / el que va ganando) para que, al avanzar, el audio ya esté listo sin un clic extra del usuario.

### 4.3 Implementación de bajo nivel

- **Web Audio API**: cada track de audio enrutado por un `GainNode`; crossfade = automatización de `gain` con `setTargetAtTime` (sin latencia perceptible, off main thread en el audio render thread). El SFX de voto se reproduce desde un `AudioBuffer` pre-decodificado.
- **Móvil**: `AVAudioEngine`/`AudioTrack` con mezcla por ganancia; el SFX desde un buffer en memoria. Categoría de audio configurada para "ambient/mixable" para no cortar música del sistema hasta que haya intención.

---

## 5. Renderizado ultrarrápido (sin jank)

### 5.1 Web

- Cada vídeo en su **propia capa compositora**: `transform: translateZ(0)` + `will-change: transform` → la GPU compone; el main thread no pinta durante la reproducción.
- **`contain: strict`** en el contenedor de la tarjeta → aísla layout/paint/size; el navegador nunca recalcula nada fuera del subárbol durante el scroll.
- **Cero layout en runtime**: tamaños fijos (`h-[100dvh]`, mitades 50/50 fijas). Nada que dependa del contenido del vídeo.
- **Scroll-snap nativo** (`scroll-snap-type: y mandatory`) → el gesto y el snap corren en el compositor; el JS solo recibe el cambio de tarjeta vía **un único `IntersectionObserver` (threshold ~0.7)**, jamás un listener de `scroll`.
- **Pool de 6 `<video>`** reutilizados (3 pares): se reciclan; nunca se crean/destruyen en runtime (evita coste de DOM + decoder churn).

```css
.duel-layer{ position:absolute; inset:0; transform:translateZ(0); will-change:transform; backface-visibility:hidden; }
.duel-card{ contain: strict; height:100dvh; }
.feed{ overflow-y:auto; scroll-snap-type:y mandatory; overscroll-behavior:contain; }
.feed > section{ scroll-snap-align:start; scroll-snap-stop:always; height:100dvh; }
```

### 5.2 Transición entre duelos (crossfade sin parar nada)

No se detiene el duelo anterior para arrancar el siguiente. El siguiente ya está WARM/LIVE detrás; se **cambia z-index y opacidad** en una capa compositora:

```text
advance():
    next.play()                    # ya estaba WARM (frame1) -> 0 espera
    animate(curr.opacity: 1->0, 120ms, GPU)   # crossfade
    animate(next.z: below->above)
    after 120ms: releaseDecoder(curr-1)        # libera el que quedó lejos
```

### 5.3 Móvil

- **Android**: `TextureView` (compositable) o `SurfaceView` por reproductor; reutilización de `MediaCodec`/`Surface`; precarga del primer frame en textura **OpenGL/`SurfaceTexture`** para crossfades GPU. `RecyclerView` con `setItemViewCacheSize` alto + pool de holders.
- **iOS**: `AVPlayerLayer` ya en la jerarquía; transiciones por `CALayer.opacity`/`zPosition` animadas en el render server (Core Animation) — fuera del hilo principal. Reutilización de `AVPlayer` del pool.

---

## 6. Backend y API para latencia cero en voto y metadatos

### 6.1 Co-entrega de metadatos (eliminar el round-trip)

La respuesta al **voto** del duelo `i` **incluye** los metadatos del duelo `i+K` (IDs, URLs init/manifiesto, pósters, duraciones). Así el cliente nunca pide "el siguiente" por separado.

- Transporte: **WebSocket persistente** (recomendado) con mensajes combinados, o HTTP/2 *server push*/*preload hints*.

```jsonc
// WS server -> client, tras recibir un voto
{ "type":"vote_ack", "duelId":"d_1042", "tallied":true,
  "next":[ { "duelId":"d_1043",
             "a":{"manifest":"https://cdn/.../1043a.mpd","poster":"https://cdn/.../1043a.webp","dur":7.2},
             "b":{"manifest":"https://cdn/.../1043b.mpd","poster":"https://cdn/.../1043b.webp","dur":6.8} },
           { "duelId":"d_1044", "a":{...}, "b":{...} } ] }   // empuja 2 por delante
```

### 6.2 Feed empujado por adelantado (push, no pull)

El servidor mantiene una **cola personalizada por usuario** (cohortes + embeddings) y **empuja** paquetes de duelos con antelación por el WS, de modo que el cliente siempre tiene metadatos por delante mientras ve el duelo actual.

### 6.3 Voto fire-and-forget

El voto se envía como mensaje **"UDP-like" sobre WebSocket** (envío inmediato, sin esperar respuesta para avanzar). La confirmación (`vote_ack`) llega de forma asíncrona; **la transición al siguiente duelo no se bloquea por la red**.

```text
onUserVote(side):
    playSfx(); animateConfirm(side); advanceToNext()   # UI no espera nada
    ws.send({type:'vote', duelId, side, ts})           # fire-and-forget
    # vote_ack llega después; si falla, reintento idempotente en background
```

> Idempotencia: cada voto lleva `duelId + clientVoteId`; el backend deduplica. Reintentos no inflan el conteo.

### 6.4 Almacén precalentado

- **Redis** con listas precalculadas por cohorte/embedding → "siguiente duelo" disponible en **<5 ms**.
- **CQRS + Event Sourcing**: los votos son eventos append-only; un proyector actualiza conteos/rankings en tiempo real sin tocar la ruta de lectura del feed (lecturas servidas desde proyecciones en Redis).

```
[Voto evento] -> Kafka/Log -> [Proyector tallies] -> Redis(counts)  (lectura O(1))
                              [Proyector ranking]  -> Redis(zset rankings)
Feed read  -> Redis(cola usuario) -> respuesta <5ms  (jamás toca el log de escritura)
```

### 6.5 Diagrama de secuencia — voto → siguiente (wow moment < 300 ms)

```
Usuario     Cliente(UI)        WS/Backend        Redis/CQRS
  | tap A       |                  |                 |
  |------------>| playSfx+confirm  |                 |
  |             | advance()  (next ya WARM) --------> 0 espera de vídeo
  |             |---vote(d,A)----->|                 |
  |             |                  |--append event-->|
  |             |<---vote_ack + next[i+2]------------|  (async, no bloquea)
  |             | cache next metadata                |
```

---

## 7. Métricas y monitoreo en producción

### 7.1 KPIs (presupuesto de error explícito)

| KPI | Objetivo | Umbral de alerta |
|---|---|---|
| TTFF por vídeo (p95) | < 200 ms | > 350 ms |
| Voto → siguiente duelo (p95) | < 300 ms | > 500 ms |
| Rebuffering ratio | < 0.5 % | > 1 % |
| Desync A/B (p99) | < 33 ms (1 frame) | > 66 ms |
| Decoder exhaustion events | 0 | > 0 |
| CDN cache-hit (init+1s) | > 98 % | < 95 % |

### 7.2 RUM — instrumentar cada paso de la pipeline (para AMBOS vídeos)

Eventos con timestamps de alta resolución (`performance.now()` / `CACurrentMediaTime` / `SystemClock.elapsedRealtimeNanos`):

```
duel_view_start  → manifest_loaded(A,B) → init_seg_ready(A,B) →
first_frame_decoded(A,B) → play_called(A,B) → first_frame_painted(A,B) →
[rebuffer_start/stop]* → vote(ts) → next_duel_visible(ts)
```

Se derivan: `TTFF = first_frame_painted - duel_view_start`; `wow = next_duel_visible - vote`; `desync = |first_frame_painted_A - first_frame_painted_B|`. Agregación por **CDN PoP, región, tipo de dispositivo, tipo de red (effectiveType), códec**.

### 7.3 Alertas y dashboards

- Alertas automáticas si cualquier percentil cruza umbral, segmentadas por dimensión (p.ej., "TTFF p95 > 350 ms solo en Android gama baja / 4G en LATAM").
- Dashboards en tiempo casi-real (RUM → pipeline de stream → almacén columnar tipo ClickHouse/BigQuery).
- Traza de **decoder exhaustion** como señal crítica (indica fuga de decoders → revisar liberación agresiva del §1/§5).

---

## 8. Plan de pruebas de rendimiento

### 8.1 Matriz de red (emulación)

| Perfil | Bandwidth | RTT | Pérdida | Herramienta |
|---|---|---|---|---|
| 3G lento | 400 kbps | 400 ms | 1 % | Chrome DevTools throttling / `tc netem` |
| 4G medio | 4 Mbps | 80 ms | 0.5 % | WebPageTest, Lighthouse Mobile |
| 4G con pérdida | 4 Mbps | 120 ms | 3 % | `tc netem` / Network Link Conditioner (iOS) |
| WiFi alta latencia | 20 Mbps | 200 ms | 0 % | Android emulator network profiles |

Criterio de aprobación: TTFF p95 < 200 ms en 4G medio; sin spinner visible y sin frame congelado en **ningún** perfil (el póster cubre el peor caso).

### 8.2 Pruebas de carga / estrés backend

- **10 000 usuarios concurrentes** votando cada ~2 s (ritmo TikTok) → verificar que voto + co-entrega de metadatos + proyecciones CQRS mantienen `vote_ack` p99 < 100 ms y la cola de feed nunca se vacía (siempre ≥ `PREFETCH_DEPTH` por delante).
- Herramientas: `k6`/`Gatling` para WS, `wrk2` para HTTP/3, inyección de eventos en Kafka para validar proyectores.
- Verificar idempotencia bajo reintentos masivos (no inflar conteos).

### 8.3 A/B testing de estrategias de precarga

Variables a experimentar (con TTFF, rebuffer ratio, retención y datos consumidos como métricas):
- `PREFETCH_DEPTH` (2 vs 3 vs 4 vs adaptativo).
- Calidad inicial (240p vs 360p como primer fragmento).
- `seg_duration` (1 s vs 2 s) y longitud del chunk inicial pre-descargado (1 s vs 2 s).
- Tamaño del pool de decoders (3 pares vs 4 pares) frente a eventos de decoder exhaustion en gama baja.

Objetivo del experimento: maximizar fluidez/retención **minimizando** consumo de datos y eventos de exhaustion.

---

## Apéndice A — Checklist de implementación (orden recomendado)

1. **Empaquetado**: fMP4/CMAF faststart + GOP corto + pósters frame-1 en backend. CDN HTTP/3 + TTL.
2. **Pool de reproductores** (6) y **liberación agresiva del decoder** (web: `removeAttribute('src')`+`load()`; móvil: reuse de `Surface`/`AVPlayer`).
3. **Motor de scroll** nativo (scroll-snap + 1 IntersectionObserver) y **ventana de vida** (LIVE/WARM/PREFETCH/RELEASED).
4. **Arranque atómico A/B** + watchdog de drift + póster→vídeo.
5. **Prefetch predictivo** (Web Worker + Service Worker / WorkManager) con caché multinivel y expulsión adaptativa.
6. **WS persistente**: co-entrega de metadatos + voto fire-and-forget + Redis/CQRS.
7. **ABR** "empezar feo, escalar".
8. **Audio** hover/hold + SFX de voto + crossfade.
9. **RUM** completo + dashboards + alertas.
10. **Suite de pruebas** de red/carga/AB.

## Apéndice B — Por qué cada decisión (resumen de justificaciones)

- **Ventana de 3 pares y liberación agresiva** → el límite real en móvil son los decoders HW (4–6), no la red ni la CPU.
- **Póster = frame 1** → convierte cualquier latencia residual en "invisible"; es el truco central de TikTok.
- **Arranque atómico + watchdog** → garantiza la promesa "los dos juntos o ninguno".
- **Empezar a 240p** → desacopla TTFF del ancho de banda incierto; la calidad sube cuando ya estás viendo.
- **HTTP/3 multiplex** → los dos vídeos del par llegan en paralelo sin head-of-line blocking.
- **Voto fire-and-forget + metadatos co-entregados** → elimina los dos round-trips que matarían el "wow moment".
- **Scroll nativo + compositor** → cero jank porque el JS no participa en el gesto.
