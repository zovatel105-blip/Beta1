# Twyk — Performance Blueprint (v2)

**Especificación Técnica de Rendimiento y Fluidez para un feed de duelos de vídeo dual (nivel TikTok)**

> Documento de arquitectura "esto es lo que hay que construir". Audiencia: ingeniería senior (web + iOS + Android + backend/streaming). Objetivo no negociable: que dos vídeos por tarjeta arranquen a la vez, sin spinner ni frame congelado, con la percepción de que "el contenido ya estaba ahí".

## Changelog v1 → v2 (correcciones tras revisión técnica)

| # | Corrección | Sección |
|---|---|---|
| C1 | **Decoders en feed DUAL**: pool de 6 nodos pero solo 2–4 con `src` activo (no 6). El caso dual reescribe la matemática de decoders. | §0, §1.1, §1.6, §5.1 |
| C2 | **MP4 progresivo es el DEFAULT** para clips <30 s; LL-HLS/DASH solo para >30 s o live. | §2.1 |
| C3 | **WebCodecs con feature-detect + fallback `<video>`** (Safari iOS no lo soporta). | §1.6, §3.1 |
| C4 | **Feed NO usa WebSocket**: HTTP/2 + caché + SSE; WS solo para mensajería en vivo. | §6.2 |
| C5 | **Watchdog de drift con timeout** (evita congelamiento indefinido). | §3.2 |
| C6 | **Votos: Redis `INCR` + sync eventual** como default; CQRS/Event Sourcing solo a gran escala. | §6.4 |
| G1–G10 | **10 gaps de robustez/UX** añadidos (errores de red, offline, background, ahorro, cold start, deep link, a11y, analytics, moderación, scroll rápido). | §9 |

---

## 0. Principios rectores (los 5 mandamientos)

1. **El usuario nunca espera.** Todo lo visible en los próximos ~6 s ya está descargado; lo inmediato, decodificado y pausado en frame 1.
2. **El póster cubre el gap.** Mientras un decoder no esté listo, se ve una imagen idéntica al frame 1; el cambio imagen→vídeo es invisible.
3. **Presupuesto de decoders sagrado (DUAL).** iOS ≈4 decoders HW, Android 3–6 según SoC. Como **cada tarjeta tiene 2 vídeos**, mantener "±1 decodificados" significaría **6 decoders** → riesgo de crash. **Regla v2: solo la tarjeta ACTIVA mantiene sus 2 vídeos con decoder (2 decoders); las adyacentes muestran póster + bytes en caché (0 decoders), o como mucho la siguiente con 2 decoders en gama alta (máx 4).**
4. **Cero JS/CPU durante el gesto de scroll.** Scroll y transiciones en el compositor/GPU; React solo reacciona a cambios de tarjeta, jamás por píxel.
5. **Los dos vídeos viven y mueren juntos.** Si uno bufferiza, ambos pausan; si uno arranca, ambos arrancan.

**KPIs:** TTFF p95 < **200 ms**/vídeo · voto→siguiente p95 < **300 ms** · rebuffering < **0.5 %** · desync A/B < **1 frame (≈33 ms)**.

---

## 1. Precarga agresiva en cliente (Web y Móvil)

### 1.1 "Ventana de vida" de un duelo (ajustada al caso DUAL)

Estados: `NONE → METADATA → PREFETCH(init+1s) → WARM(frame1, pausado) → LIVE`, con `RELEASED` al salir.

```
Índices:   ... i-2     i-1        i        i+1        i+2     i+3 ...
Estado:    RELEASED  PREFETCH   LIVE   PREFETCH/WARM* PREFETCH PREFETCH
Decoders:    0         0       2(A,B)    0 ó 2*        0        0
Bytes:     evict     cache    cache     cache        cache   cache(parcial)
Póster:    cargado   listo    listo     listo        listo   cargado
```
`*` **Política adaptativa de decoders (C1)**:
- **Gama baja / iOS (≤4 decoders):** solo la **activa** tiene 2 decoders; `i±1` = **póster + bytes** (0 decoders). El arranque de `i+1` usa el póster como cobertura mientras se decodifica on-demand (sub-200 ms gracias al init+1s ya en caché).
- **Gama alta (≥6 decoders):** además se puede WARM la **siguiente** (`i+1` con 2 decoders = 4 totales) para arranque de 0 frames hacia abajo. Nunca se superan 4.

> **Justificación (C1)**: el cuello de botella real en móvil son los decoders HW. En un feed *dual* hay que dividir por dos la "ventana de decoders" frente a un feed de un solo vídeo. La fluidez se preserva con el póster=frame1 + bytes pre-descargados, no con más decoders.

### 1.2 Pre-fetch predictivo (adaptativo)

```text
PREFETCH_DEPTH = clamp(
  base=2
  + (bandwidthMbps>8 ? 2:0)
  + (avgScrollVelocity>FAST ? 2:0)
  + (avgVoteIntervalMs<2500 ? 1:0),  min=2, max=6)

DECODER_WARM = deviceDecoderBudget>=6 ? "active+next" : "active-only"   # C1
```
Orquestador (corre en `onActiveIndexChange`, NO en scroll):
```text
function onActiveIndexChange(i):
    # decoders (C1): activa siempre; siguiente solo en gama alta
    for j in mountedDecoders: if not inDecoderWindow(j,i): releaseDecoder(j)
    acquireDecoder(i)                          # 2 decoders (A,B)
    if DECODER_WARM=="active+next": acquireDecoder(i+1)
    play(i); pauseAtFrame1(decoderNeighbors)

    # red: bytes init+1s + póster de i+1 .. i+PREFETCH_DEPTH (sin decoder)
    for j in [i+1 .. i+PREFETCH_DEPTH]:
        prefetchInitAndFirstSeconds(j.A); prefetchInitAndFirstSeconds(j.B)
        warmPoster(j.posterA); warmPoster(j.posterB)
    evictBeyond(i-2)
```

### 1.3 Caché multinivel
| Nivel | Web | Móvil | Límite | Expulsión |
|---|---|---|---|---|
| L0 Decoder/GPU | `<video>`/WebCodecs `VideoFrame` | `MediaCodec`/`TextureView` | **2–4 vídeos** (C1) | la más lejana al activo |
| L1 RAM | MSE `SourceBuffer` / blobs | ExoPlayer buffers | ~80–120 MB | LRU |
| L2 Disco | **IndexedDB / Cache API** (SW) | **`SimpleCache` LRU** | 200–400 MB | LRU + TTL |
| L3 CDN | HTTP/3 | HTTP/3 | — | TTL por viralidad |

Bajo presión (`deviceMemory`, `onTrimMemory`, `didReceiveMemoryWarning`): `PREFETCH_DEPTH→2`, `DECODER_WARM→active-only`, L2 purgada a `[i-1, i+3]`.

### 1.4 Chunk inicial
Solo init segment + primer media segment (≈150–400 KB @240–360p) → basta para `HAVE_CURRENT_DATA` y pausar en frame 1. Web: `fetch(url,{headers:{Range:'bytes=0-N'}})`.

### 1.5 Doble búfer
```
[ Capa A: D[i]   LIVE   z=2, opacity=1 ]
[ Capa B: D[i+1] WARM*  z=1, opacity=0 ]   (* WARM solo en gama alta; si no, póster)
avanzar -> A.opacity:0 (crossfade 120ms), B.play(), B.z=2
```

### 1.6 Implementación web (C1, C3)
- Pool de **6 elementos `<video>`** en el DOM, pero **solo 2–4 con `src` activo** (los decoders reales). El resto son **slots vacíos** (sin `src`) que se reutilizan. **Liberación agresiva**: `pause()` → `removeAttribute('src')` → `load()` devuelve el decoder + RAM.
- `fetchpriority="high"` en el init del par activo; `low` en el resto. `<link rel="preload" as="fetch">` del siguiente.
- **Service Worker** cache-first sobre IndexedDB/Cache API (no bloquea, sirve rangos); **Web Worker** ordena el prefetch off-main-thread vía `postMessage`.
- **Decodificación (C3):** `<video>`+MSE por defecto. **WebCodecs solo con feature-detect** (`'VideoDecoder' in window`, Chromium/Android); **fallback transparente** a `<video>` nativo + póster=frame1 en Safari iOS (~mitad del mercado móvil). El póster cubre el gap en ambos caminos.
```js
const USE_WEBCODECS = ('VideoDecoder' in window);  // C3: Safari iOS -> false -> <video> nativo
acquire(slot, src){ const v=pool[slot]; if(v.getAttribute('src')!==src){v.src=src; v.load();} }
release(slot){ const v=pool[slot]; v.pause(); v.removeAttribute('src'); v.load(); } // máx 2–4 con src (C1)
```

### 1.7 Móvil
**Android (ExoPlayer/Media3):** pool de instancias con `Surface` adjunta; **activa = 2 decoders** (gama alta hasta 4); `SimpleCache` LRU; prefetch con `WorkManager`/`CacheWriter` (solo init+1s). **iOS (AVPlayer):** pool con `AVPlayerLayer` ya en jerarquía; **pre-warming** = `AVPlayerItem` + `preroll(atRate:)`, `rate=0`; `AVAssetResourceLoaderDelegate` para caché de disco. Instancias con media activa acotadas por `deviceDecoderBudget` (C1); se **reusan** (no se destruye el `MediaCodec`).

---

## 2. Streaming de latencia ultrabaja

### 2.1 Protocolo — DEFAULT: MP4 progresivo (C2)
> **CORRECCIÓN v2:** LL-HLS es para *directo*. Para clips pre-grabados de 5–15 s es overkill y no mejora el TTFF frente a un MP4 bien empaquetado (ByteDance sirve la mayoría de TikToks como MP4 progresivo).

- **Clips cortos (<30 s) → MP4 progresivo con faststart + Range (DEFAULT de Twyk):** `moov` al inicio, `Range: bytes=0-N` para init+1s. TTFF idéntico a HLS, mínimo overhead, máxima compatibilidad con CDN/SW. El "ABR" se reduce a elegir variante (240p/540p/720p) por URL.
- **Clips largos (>30 s) o live → LL-HLS / MPEG-DASH con CMAF:** LL-HLS (`PART-TARGET 0.2–0.5 s`) solo para live; DASH (segmentos 1–2 s) alternativa; **CMAF** como contenedor común.

### 2.2 Empaquetado faststart
`ftyp`+`moov` al inicio, **GOP corto (keyframe ≤1 s)** para arranque sin esperar IDR.
```bash
# MP4 progresivo corto (DEFAULT)
ffmpeg -i in.mp4 -c:v libx264 -profile:v main -g 30 -keyint_min 30 -sc_threshold 0 \
  -movflags +faststart out_540p.mp4
# CMAF/DASH solo para clips largos / live
ffmpeg -i in.mp4 ... -f dash -seg_duration 1 -use_template 1 -use_timeline 1 out.mpd
```

### 2.3 Códecs
**Móvil:** H.265/HEVC + fallback H.264. **Web:** AV1 > VP9 > H.264 según `MediaCapabilities.decodingInfo()` (no por suposición).

### 2.4 ABR "empezar feo, escalar"
Primera reproducción a **240p ~120 kbps** (TTFF<200 ms aun con BW incierto), sube a 540p/720p en 1–2 s. Ladder 9:16: `240p@120k → 360p@300k → 540p@700k → 720p@1.2M → 1080p@2.5M`.

### 2.5 CDN + HTTP/3
Multi-PoP, **QUIC** (0/1-RTT + multiplexación de A y B en paralelo, sin head-of-line). TTL largo para virales, corto para fresco; **pre-warming de edges** (init+1s) para duelos de alto potencial. `Cache-Control: immutable` en init con hash de contenido.

---

## 3. Sincronización exacta de los dos vídeos

### 3.1 Arranque atómico (C3)
Ambos a `HAVE_CURRENT_DATA` en pausa; se disparan en el **mismo `requestAnimationFrame`**:
```js
async function startDuel(a,b){
  await Promise.all([untilReady(a), untilReady(b)]);
  requestAnimationFrame(()=>{ a.currentTime=0; b.currentTime=0; Promise.allSettled([a.play(),b.play()]); });
}
const untilReady = v => v.readyState>=2 ? Promise.resolve()
  : new Promise(r=>v.addEventListener('loadeddata', r, {once:true}));
```
> **C3:** el control sub-frame con **WebCodecs** (`VideoDecoder` → pintar primer `VideoFrame` en `<canvas>` antes de avanzar) es **opt-in solo en Chromium/Android**. En Safari iOS el camino es `<video>` nativo + póster=frame1, que ya garantiza arranque sin salto.

### 3.2 Watchdog de drift con timeout (C5)
> **CORRECCIÓN v2:** la v1 esperaba "hasta que el lento alcance" → si el lento bufferiza, ambos se congelan **indefinidamente**. Se añade timeout y resync forzado al tiempo del más lento.
```text
onRAF():
  drift = abs(a.currentTime - b.currentTime)
  if drift > 1/FPS:
      faster = (a.currentTime > b.currentTime) ? a : b
      slower = (faster===a) ? b : a
      faster.pause()
      ready = waitFor(slower, timeout=500ms)        # NO indefinido
      if ready: resyncStartBoth()
      else:                                          # el lento no alcanza -> reset duro
          faster.currentTime = slower.currentTime    # alinear al más lento
          resyncStartBoth()
  if a.stalled or b.stalled:
      pauseBoth(); showPoster(stalledSide); resumeBothWhenReady(timeout=500ms)
```
> **Regla UX**: nunca uno corriendo y el otro congelado; antes se congelan ambos sobre póster (=frame1, imperceptible) y como mucho 500 ms.

### 3.3 "Primer frame común" (póster→vídeo)
Backend genera póster = frame 1 (WebP). Se pinta en 0 ms bajo el `<video>`; al estar listo, crossfade 80–120 ms (mismo fotograma → sin salto).
```bash
ffmpeg -i in.mp4 -vf "select=eq(n\,0)" -q:v 3 frame1.webp
```

---

## 4. Sonido para fluidez y adicción
- **Por defecto muteado** (autoplay + anti-cacofonía). Audio de un lado solo con **intención ligera**: `hover`/`pointerdown` sostenido (web) o *press & hold* (móvil); al soltar → mute con crossfade.
```text
onHoverStart(side): audioFadeIn(side,80ms); audioFadeOut(other,80ms)
onHoverEnd(side):   audioFadeOut(side,120ms)
```
- **Voto:** micro-SFX pregargado (<50 ms) + preparación del audio del siguiente duelo según "ganador temporal" (predicción) → sin clic extra.
- **Bajo nivel:** Web Audio API (`GainNode` + `setTargetAtTime`, off-main-thread); móvil `AVAudioEngine`/`AudioTrack`, categoría "ambient/mixable".

---

## 5. Renderizado sin jank

### 5.1 Web (C1)
Cada vídeo en su capa compositora (`transform:translateZ(0)`, `will-change:transform`); **`contain:strict`** en la tarjeta; **cero layout en runtime** (50/50 fijo, `h-[100dvh]`); **scroll-snap nativo** + **un único `IntersectionObserver` (≈0.7)**, jamás listener de `scroll`; **pool de 6 `<video>` reutilizados pero solo 2–4 con `src` activo (C1)**.
```css
.duel-layer{position:absolute;inset:0;transform:translateZ(0);will-change:transform;backface-visibility:hidden;}
.duel-card{contain:strict;height:100dvh;}
.feed{overflow-y:auto;scroll-snap-type:y mandatory;overscroll-behavior:contain;}
.feed>section{scroll-snap-align:start;scroll-snap-stop:always;height:100dvh;}
```

### 5.2 Transición (crossfade sin parar nada)
```text
advance(): next.play() (póster o WARM); animate(curr.opacity 1->0,120ms,GPU); next.z=above;
           after 120ms: releaseDecoder(out-of-window)
```

### 5.3 Móvil
Android: `TextureView`/`SurfaceView`, reuse de `MediaCodec`/`Surface`, frame1 en textura OpenGL/`SurfaceTexture`; `RecyclerView` con cache alto. iOS: transiciones por `CALayer.opacity`/`zPosition` en Core Animation (fuera del hilo principal), reuse de `AVPlayer`.

---

## 6. Backend/API para latencia cero

### 6.1 Co-entrega de metadatos (sin round-trip)
La respuesta al voto del duelo `i` **incluye** metadatos de `i+K` (init/URL, póster, duración). Va sobre la **respuesta HTTP del voto** (no requiere WS).

### 6.2 Transporte del feed (C4): HTTP/2 + caché + SSE, NO WebSocket
> **CORRECCIÓN v2:** TikTok **no usa WebSockets para el feed** (los usa para mensajería/comentarios en vivo). El feed se sirve con HTTP eficiente + caché; las novedades llegan por push notifications o SSE.

- **Feed**: peticiones **HTTP/2** con caché agresiva + **co-entrega** del siguiente lote en la respuesta del voto. Para "novedades en tiempo real", **SSE (Server-Sent Events)** o long-polling — más escalable, menor overhead de conexión, mejor encaje con CDN.
- **WebSocket**: reservado a mensajería en vivo, comentarios en tiempo real, presencia.
```jsonc
// Respuesta HTTP del voto (co-entrega; sin WS)
{ "duelId":"d_1042","tallied":true,
  "next":[ {"duelId":"d_1043","a":{"url":".../1043a.mp4","poster":".../1043a.webp","dur":7.2},
                                "b":{"url":".../1043b.mp4","poster":".../1043b.webp","dur":6.8}},
           {"duelId":"d_1044", "a":{...}, "b":{...}} ] }
```

### 6.3 Voto fire-and-forget
```text
onUserVote(side): playSfx(); animateConfirm(side); advanceToNext()  # UI no espera
                  POST /vote {duelId, side, clientVoteId, ts}        # async, idempotente
```

### 6.4 Almacén de votos (C6): Redis INCR + sync eventual (CQRS opcional)
> **CORRECCIÓN v2:** CQRS + Event Sourcing completo con Kafka es válido pero **overkill** para conteo de votos. Default más simple:
- **Contadores en Redis con `INCR` atómico (O(1))**; lectura del feed desde Redis (<5 ms).
- **Sync eventual** a la base de datos principal por lotes (cada 1–5 s).
- **Kafka/CQRS solo** si necesitas analytics en tiempo real, auditoría completa o ratios lectura/escritura extremos (p.ej. 1000:1).
```
POST /vote -> Redis INCR duel:{id}:{side}    (O(1))
            -> flush por lotes cada 1-5s -> DB principal
Feed read  -> Redis (cola usuario + counts) -> <5ms
```

### 6.5 Secuencia — voto→siguiente (<300 ms)
```
Usuario  Cliente(UI)            Backend(HTTP/2)   Redis
 |tap A->| playSfx+confirm; advance()(póster/WARM -> 0 espera de vídeo)
 |       |---POST /vote(d,A)------>|--INCR-------->|
 |       |<--200 {next:[i+1,i+2]}--|              |  (co-entrega, no bloquea avance)
```

---

## 7. Métricas y monitoreo

| KPI | Objetivo | Alerta |
|---|---|---|
| TTFF/vídeo (p95) | < 200 ms | > 350 ms |
| Voto→siguiente (p95) | < 300 ms | > 500 ms |
| Rebuffering | < 0.5 % | > 1 % |
| Desync A/B (p99) | < 33 ms | > 66 ms |
| Decoder exhaustion | 0 | > 0 |
| CDN cache-hit init+1s | > 98 % | < 95 % |

**RUM** por ambos vídeos: `duel_view_start → manifest/headers_loaded(A,B) → init_seg_ready(A,B) → first_frame_decoded(A,B) → play_called(A,B) → first_frame_painted(A,B) → [rebuffer]* → vote → next_duel_visible`. Derivar TTFF/wow/desync; agregar por CDN PoP, región, dispositivo, `effectiveType`, códec. Tratar **decoder exhaustion** como señal crítica (fuga de liberación, ver C1).

### 7.4 Instrumentación mínima de validación (gaps de observabilidad)
Tres señales **imprescindibles** para validar en producción C1/C3/C5/G3 (implementadas en el cliente vía `lib/perfMetrics.js`, expuestas en `window.__twykMetrics` y enviables a un endpoint RUM):

| Métrica | Qué mide | Por qué |
|---|---|---|
| `webcodecsSupported` + `webcodecsFallback` (C3) | si el dispositivo soporta WebCodecs y nº de veces que caemos al camino `<video>` nativo | valida que el fallback de Safari iOS no degrada el TTFF |
| `decoderReleaseMs` (avg) + `backgroundEvents` (C1/G3) | tiempo desde `visibilitychange(hidden)` hasta que el árbol libera los decoders | detecta fugas de decoder al ir a background (causa nº1 de crash en gama baja) |
| `watchdogTriggers` + `watchdogTimeouts` (C5) | cuántas veces entra el watchdog de drift A/B y cuántas acaban en reset por timeout | un ratio alto de `timeouts/triggers` señala red/decoder insuficientes para el caso dual |

```text
# pseudocódigo de envío (muestreo 1/10 sesiones para no saturar el RUM)
on session_end / page_hide:
    if sampled(): beacon('/rum', getMetrics())   # navigator.sendBeacon, no bloquea
```
> Sin estas tres señales, G3 (background), G1 (reintentos) y la eficacia de C1 son **imposibles de validar** en producción: se vuela a ciegas.

---

## 8. Plan de pruebas
- **Red:** 3G lento (400 kbps/400 ms/1 %), 4G medio (4 Mbps/80 ms/0.5 %), 4G con pérdida (3 %), WiFi alta latencia (200 ms) — DevTools throttling, `tc netem`, Network Link Conditioner, WebPageTest/Lighthouse. Aprobación: TTFF p95 < 200 ms en 4G medio y **sin spinner/frame congelado** en ningún perfil.
- **Carga:** 10 000 usuarios votando cada ~2 s → `POST /vote` p99 < 100 ms, cola siempre ≥ `PREFETCH_DEPTH` por delante; idempotencia bajo reintentos. `k6`/`Gatling`, `wrk2` (HTTP/3).
- **Decoders (C1):** prueba específica en gama baja (iOS 4 decoders, Android Go) verificando 0 eventos de exhaustion con `DECODER_WARM=active-only`.
- **A/B:** `PREFETCH_DEPTH` (2/3/4/adaptativo), calidad inicial (240p vs 360p), `DECODER_WARM` (active-only vs active+next), tamaño del chunk inicial. Objetivo: maximizar fluidez/retención minimizando datos y exhaustion.

---

## 9. Robustez, ciclo de vida y casos límite (gaps v2)

### G1 — Errores de red y reintentos
```text
Retry: exponential backoff 1s,2s,4s,8s (máx 3).
Circuit breaker: 5 fallos consecutivos -> pausa prefetch 30s.
Fallback de vídeo: mostrar póster + botón "Reintentar"; NUNCA spinner infinito.
```

### G2 — Modo offline
```text
Service Worker cachea los últimos 10 duelos vistos (init+1s + póster + metadatos).
Sin red: banner "Modo offline" + contenido cacheado navegable.
Votos: cola local (IndexedDB) -> sync idempotente al reconectar.
```

### G3 — Background / Foreground
```text
onVisibilityChange(hidden): pauseAll(); releaseAllDecoders(); limpiar L0/L1.
onVisibilityChange(visible): re-acquire decoder del activo; reanudar desde frame actual.
(iOS/Android: liberar decoders en background evita crashes y ahorra batería.)
```

### G4 — Ahorro de datos / batería
```text
Detectar navigator.connection.saveData o battery<20%:
  PREFETCH_DEPTH=1; calidad inicial 240p sin escalar; DECODER_WARM=active-only;
  deshabilitar prefetch de audio.
```

### G5 — Cold start (primer duelo)
```text
SSR/SSG: metadatos + póster del primer duelo embebidos en el HTML inicial.
SW: prefetch init+1s del primer duelo.
UI: skeleton + póster instantáneo. Objetivo TTFF primer duelo < 500 ms (incl. render).
```

### G6 — Deep linking
```text
Ruta /battle/{duelId}: fetch metadatos del duelo + init+1s; renderizar como activo,
prefetch de ±1; permitir scroll desde ese punto (sembrar la cola del feed alrededor).
```

### G7 — Accesibilidad
```text
aria-label en botones de voto ("Votar por opción A"); soporte VoiceOver/TalkBack;
subtítulos opcionales si el vídeo los trae; respetar prefers-reduced-motion
(desactivar crossfades/auto-avance animado).
```

### G8 — Analytics de retención
```text
Correlacionar TTFF p95 con duración de sesión.
"Wow rate": % de usuarios que ven >5 duelos seguidos sin abandono.
A/B optimizado vs sin prefetch agresivo. Objetivo: +5% retención D1.
```

### G9 — Moderación de contenido
```text
Backend filtra reportado/baneado antes de encolarlo en el feed.
Cliente reporta (fire-and-forget). Si un duelo en caché se banea, el backend lo marca
"removed" en la próxima respuesta de voto -> cliente lo salta sin glitch.
```

### G10 — Fallback de scroll rápido (siguiente no WARM)
```text
Si next no está WARM al llegar (scroll veloz):
  1) mostrar póster de next inmediatamente (0 ms);
  2) cargar next con fetchpriority=high (init+1s ya suele estar en caché);
  3) crossfade 120ms al estar listo.
NUNCA spinner ni pantalla en blanco. Este es el caso que el póster=frame1 está diseñado para cubrir.
```

---

## Apéndice A — Orden de implementación
1) Empaquetado **MP4 faststart** (+CMAF solo para largos) + pósters frame-1 + CDN HTTP/3 → 2) Pool con **liberación agresiva y 2–4 decoders activos (C1)** → 3) Scroll nativo + ventana de vida adaptativa → 4) Arranque atómico + **watchdog con timeout (C5)** + póster→vídeo → 5) Prefetch predictivo + caché multinivel + **modos ahorro/offline/background (G2–G4)** → 6) **HTTP/2 + SSE + co-entrega + voto fire-and-forget + Redis INCR (C4,C6)** → 7) ABR → 8) Audio → 9) RUM + analytics retención (G8) → 10) Cold start/deep link/a11y/moderación (G5,G6,G7,G9) → 11) Suite de pruebas (incl. test de decoders en gama baja).

## Apéndice B — Justificaciones clave (v2)
- **Decoders (C1):** feed *dual* ⇒ la ventana de decoders se divide por dos; póster=frame1 + bytes pre-descargados sustituyen al decoder en las adyacentes.
- **MP4 progresivo (C2):** mismo TTFF que HLS sin su complejidad, para clips cortos.
- **WebCodecs opt-in (C3):** Safari iOS no lo soporta; el fallback `<video>`+póster es transparente.
- **HTTP/SSE para feed (C4):** más escalable y CDN-friendly que WS; WS solo para chat en vivo.
- **Watchdog con timeout (C5):** evita el congelamiento indefinido si el lado lento bufferiza.
- **Redis INCR (C6):** simple, O(1), suficiente; CQRS/Kafka solo a gran escala.
- **Póster=frame1:** convierte cualquier latencia residual (incl. scroll rápido, G10) en invisible — es el truco central de TikTok.
- **Scroll nativo + compositor:** cero jank porque el JS no participa en el gesto.
