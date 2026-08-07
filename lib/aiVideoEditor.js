// lib/aiVideoEditor.js
//
// Editor de VÍDEO con IA — 100% viable en CPU (sin GPU) y con la Universal
// Key (Nano Banana / Gemini 2.5 Flash Image para las ediciones de imagen).
//
// ARQUITECTURA (3ª iteración, "PRO"): DOS modos, elegidos automáticamente
// clasificando el prompt del usuario con un LLM de texto:
//
// ── MODO COMPOSICIÓN (añadir un elemento al escenario — el caso de uso
//    principal: "añade un jet privado en el cielo"). Rápido (~30-60s) y de
//    calidad nativa:
//      1) Se edita UN fotograma clave con la IA de imágenes.
//      2) Se pide a la IA la SILUETA del elemento añadido pintada en magenta
//         puro sobre la imagen editada → máscara EXACTA por croma (probado:
//         los enfoques por diff de píxeles fallan porque el modelo regenera
//         toda la imagen con ruido correlacionado; el "highlight" magenta
//         cumple de forma fiable y el magenta casi no existe en vídeo real).
//      3) El elemento recortado ("sticker", píxeles idénticos SIEMPRE →
//         consistencia perfecta) se compone sobre TODOS los fotogramas
//         ORIGINALES del vídeo (calidad y fluidez nativas, hasta 24fps y
//         720px — nada de stop-motion ni smearing), con:
//           • TRACKING de cámara propio (block matching + mediana + subpíxel
//             sobre frames grises reducidos, ~0.5s por vídeo) → el elemento
//             queda anclado al escenario, no a la pantalla.
//           • MOVIMIENTO propio opcional (aviones, pájaros…): se edita
//             también el último fotograma con la 1ª edición como referencia,
//             y el elemento se desplaza linealmente entre ambas posiciones.
//      4) Validaciones en cada paso; si algo no cuadra (máscara vacía,
//         >50% del frame, desalineada…) → se cae al modo estilo.
//
// ── MODO ESTILO (cambios globales: "hazlo anime", "que sea invierno", o
//    ediciones sobre personas/sujetos en movimiento). Fotogramas clave cada
//    ~0.6s editados por IA (en paralelo, con imagen de referencia fija para
//    consistencia) + propagación BIDIRECCIONAL con ebsynth (jamriska/ebsynth,
//    dominio público, compilado en .bin/ebsynth) fusionando ambas direcciones
//    con peso lineal + deflicker + interpolación de movimiento a 15fps + CRF
//    18. Honesto pero LENTO (~6-8 min por vídeo de 5s): es el precio real de
//    reestilizar cada píxel sin GPU.
//
// NOTA DE RENDIMIENTO (medido en ESTE contenedor): la cuota cgroup es de
// EXACTAMENTE 1 núcleo (cpu.max=100000/100000) aunque nproc diga 8 —
// paralelizar ebsynth NO ayuda (probado: 6 procesos a la vez tardan lo mismo
// que en serie). Solo las llamadas a la IA (red) van en paralelo. Costes
// medidos: ebsynth 480px ~9.5s (default) / ~12.5s (searchvoteiters 8,
// elegido); minterpolate mci 5s→15fps ~2s; tracking 120 frames ~0.5s;
// composición+encode 720p/24fps ~3-10s; llamada Nano Banana ~6-14s.

import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import nodePath from 'path'
import crypto from 'crypto'
import { LlmChat, UserMessage, ImageContent } from 'emergentintegrations'
import { getCollection } from './mongodb'

const EBSYNTH_BIN = nodePath.join(process.cwd(), '.bin', 'ebsynth')
const WORK_DIR = nodePath.join(process.cwd(), '.tmp_ai_video')
const UPLOAD_DIR = nodePath.join(process.cwd(), 'public', 'uploads')
const AI_EDIT_MODEL = 'gemini-2.5-flash-image'
const AI_TEXT_MODEL = 'gemini-2.5-flash'

export const MAX_DURATION_SEC = 5

// ── Parámetros del MODO COMPOSICIÓN ─────────────────────────────────────
const ADD_MAX_SIDE = 720 // resolución del vídeo final (lado mayor)
const ADD_FPS_CAP = 24 // fps del vídeo final (o los del original si son menos)
const TRACK_W = 240 // ancho de los frames grises usados para el tracking

// ── Parámetros del MODO ESTILO (ebsynth) ────────────────────────────────
export const SAMPLE_FPS = 5
export const OUTPUT_FPS = 15 // fps finales (interpolación de movimiento)
const KEYFRAME_INTERVAL = 3 // 1 clave cada 3 frames (~0.6s a 5fps)
const AI_CONCURRENCY = 3 // ediciones de claves en paralelo (red, no CPU)
const EBSYNTH_ARGS = ['-weight', '1.5', '-uniformity', '5000', '-patchsize', '7', '-searchvoteiters', '8', '-extrapass3x3', '-backend', 'cpu']

// ═════════════════════════ helpers genéricos ════════════════════════════

async function mapPool(items, limit, worker) {
  let next = 0
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++
      await worker(items[i], i)
    }
  })
  await Promise.all(lanes)
}

function runCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args)
    let stderr = ''
    p.stderr?.on('data', (d) => { stderr += d.toString() })
    p.on('error', reject)
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-400)}`))))
  })
}

function ffprobeOut(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', args)
    let out = ''
    p.stdout.on('data', (d) => { out += d.toString() })
    p.on('error', reject)
    p.on('exit', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error('ffprobe failed'))))
  })
}

async function probeDuration(videoPath) {
  const out = await ffprobeOut(['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath])
  return parseFloat(out) || 0
}

async function probeVideoMeta(videoPath) {
  const out = await ffprobeOut(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'csv=p=0', videoPath])
  const [w, h, fr] = out.split(',')
  const [num, den] = String(fr || '25/1').split('/').map(Number)
  const fps = den ? num / den : num
  return { width: parseInt(w, 10), height: parseInt(h, 10), fps: fps || 25, duration: await probeDuration(videoPath) }
}

async function probeImageDims(imgPath) {
  const out = await ffprobeOut(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', imgPath])
  const [w, h] = out.split(',').map((n) => parseInt(n, 10))
  return { w, h }
}

async function probeHasAudio(videoPath) {
  try {
    const out = await ffprobeOut(['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', videoPath])
    return out.trim().length > 0
  } catch { return false }
}

// Imagen (png/jpg) -> Buffer RGB en bruto (w*h*3), reescalada a w x h.
function decodeRawImage(imgPath, w, h) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', imgPath, '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])
    const chunks = []
    p.stdout.on('data', (d) => chunks.push(d))
    let err = ''
    p.stderr.on('data', (d) => { err += d.toString() })
    p.on('error', reject)
    p.on('exit', (c) => (c === 0 && chunks.length ? resolve(Buffer.concat(chunks)) : reject(new Error('decode image failed: ' + err.slice(-200)))))
  })
}

// Decodifica el vídeo a frames en bruto y los procesa EN ORDEN (cadena de
// promesas + pausa del stream si el consumidor va lento). onFrame(buf, idx).
function streamVideoFrames(videoPath, dur, vf, pixFmt, frameBytes, onFrame) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-i', videoPath, '-t', String(dur), '-vf', vf, '-f', 'rawvideo', '-pix_fmt', pixFmt, 'pipe:1'])
    let buf = Buffer.alloc(0)
    let idx = 0
    let pending = 0
    let chain = Promise.resolve()
    let failed = false
    const fail = (e) => { if (!failed) { failed = true; try { p.kill('SIGKILL') } catch { /* ignore */ } reject(e) } }
    p.stdout.on('data', (d) => {
      if (failed) return
      buf = buf.length ? Buffer.concat([buf, d]) : d
      while (buf.length >= frameBytes) {
        const frame = Buffer.from(buf.subarray(0, frameBytes))
        buf = buf.subarray(frameBytes)
        const i = idx++
        pending++
        if (pending > 6) p.stdout.pause()
        chain = chain.then(async () => {
          if (failed) return
          await onFrame(frame, i)
          pending--
          if (pending <= 3) p.stdout.resume()
        }).catch(fail)
      }
    })
    let err = ''
    p.stderr.on('data', (d) => { err += d.toString() })
    p.on('error', fail)
    p.on('close', (c) => {
      chain.then(() => {
        if (failed) return
        if (c === 0 && idx > 0) resolve(idx)
        else reject(new Error('ffmpeg decode failed: ' + err.slice(-300)))
      }).catch(fail)
    })
  })
}

async function updateJob(jobs, id, fields) {
  await jobs.updateOne({ id }, { $set: { ...fields, updatedAt: new Date() } })
}

// ═══════════════════════ API pública del módulo ═════════════════════════

// Crea el job en Mongo y arranca el procesamiento EN SEGUNDO PLANO
// (fire-and-forget) — devuelve el id inmediatamente, el cliente hace
// polling a getVideoEditJob() para ver el progreso.
export async function createVideoEditJob({ userId, videoPath, prompt, modeHint }) {
  const jobs = await getCollection('ai_video_jobs')
  const id = crypto.randomUUID()
  await jobs.insertOne({
    id, userId, prompt,
    status: 'queued', progress: 0, total: 0,
    resultUrl: null, error: null,
    createdAt: new Date(), updatedAt: new Date(),
  })
  processVideoEditJob(id, videoPath, prompt, modeHint).catch(async (err) => {
    console.error('ai video edit job failed', id, err)
    try {
      await updateJob(jobs, id, { status: 'error', error: String(err?.message || err).slice(0, 300) })
    } catch { /* ignore */ }
  })
  return id
}

export async function getVideoEditJob(id) {
  const jobs = await getCollection('ai_video_jobs')
  return jobs.findOne({ id })
}

// Validación de entrada compartida por la ruta API.
export async function validateVideoForAiEdit(videoPath) {
  const duration = await probeDuration(videoPath)
  if (!duration || duration <= 0) throw new Error('invalid_video')
  return { duration }
}

// ═══════════════════════════ orquestador ════════════════════════════════

async function processVideoEditJob(jobId, videoPath, prompt, modeHint) {
  const jobs = await getCollection('ai_video_jobs')
  const apiKey = process.env.EMERGENT_LLM_KEY
  if (!apiKey) throw new Error('AI editor is not configured')

  const work = nodePath.join(WORK_DIR, jobId)
  await fs.mkdir(work, { recursive: true })
  try {
    await updateJob(jobs, jobId, { status: 'extracting' })
    const VALID_MODES = ['ADD_MOVING', 'ADD_STATIC', 'GLOBAL']
    const mode = VALID_MODES.includes(modeHint) ? modeHint : await classifyEditMode(apiKey, jobId, prompt)
    console.log('ai video edit: mode =', mode, 'for job', jobId)
    if (mode !== 'GLOBAL') {
      const ok = await runCompositeMode({ jobId, jobs, apiKey, videoPath, prompt, work, moving: mode === 'ADD_MOVING' })
      if (ok) return
      console.warn('ai video edit: composite mode not applicable, falling back to style mode', jobId)
    }
    await runStyleMode({ jobId, jobs, apiKey, videoPath, prompt, work })
  } finally {
    fs.rm(work, { recursive: true, force: true }).catch(() => {})
    fs.rm(videoPath, { force: true }).catch(() => {}) // el vídeo entrante ya no hace falta
  }
}

// Clasifica el prompt para elegir modo. Ante cualquier duda/fallo devuelve
// ADD_STATIC: el modo composición valida cada paso y se cae solo al modo
// estilo si no aplica. (Exportada: también la usa /api/ai/classify-edit para
// que el FRONTEND decida si editar vía el Space gratuito de Lucy Edit.)
export async function classifyEditMode(apiKey, jobId, prompt) {
  try {
    const chat = new LlmChat(apiKey, `vid-cls-${jobId}`,
      'You classify video editing instructions. Reply with EXACTLY one word and nothing else.'
    ).withModel('gemini', AI_TEXT_MODEL)
    const answer = await chat.sendMessage(new UserMessage({
      text: `A user wants to edit a short video with this instruction: "${prompt}"\n\n` +
        'Classify it as exactly one of:\n' +
        'ADD_MOVING - it adds a NEW element to the scenery/background that would naturally move on its own across the scene (a plane, a bird, a UFO, a car driving by, a boat sailing...)\n' +
        'ADD_STATIC - it adds a NEW element to the scenery/background that stays in place (a building, the moon, a tree, a mountain, a parked car...)\n' +
        'GLOBAL - anything else: it changes the style/colors/weather/lighting of the whole scene, removes or modifies EXISTING content, or adds/changes something ON a person or on a moving subject (clothes, hats, faces...)\n\n' +
        'Answer with one word: ADD_MOVING, ADD_STATIC or GLOBAL.',
    }))
    const a = String(answer || '').toUpperCase()
    if (a.includes('ADD_MOVING')) return 'ADD_MOVING'
    if (a.includes('ADD_STATIC')) return 'ADD_STATIC'
    if (a.includes('GLOBAL')) return 'GLOBAL'
  } catch (e) {
    console.warn('ai video edit: classify failed, defaulting to ADD_STATIC', e?.message)
  }
  return 'ADD_STATIC'
}

// ═══════════════ MODO COMPOSICIÓN (rápido, calidad nativa) ═══════════════

// Llama a Nano Banana para editar un fotograma. Devuelve el PNG (base64) o null.
async function aiEditFrame(apiKey, sessionId, prompt, frameB64, referenceB64, movingHint) {
  const chat = new LlmChat(apiKey, sessionId,
    'You are an expert photo editing AI. Preserve everything else in the frame exactly as it is. Always return the edited image.'
  ).withModel('gemini', AI_EDIT_MODEL)
  const fileContents = [new ImageContent(frameB64)]
  let text = `${prompt}\n\n(Make the added element photorealistic and naturally integrated: match the scene's lighting, colors, perspective and grain. No outlines or glow.)`
  if (referenceB64) {
    fileContents.push(new ImageContent(referenceB64))
    text = `${prompt}\n\n(Two images attached: image 1 is the video frame you must edit — it is a LATER moment of the same video shown in image 2, which was already edited with this exact instruction. Reproduce the SAME added element with IDENTICAL design, colors and size as in image 2${movingHint ? ', but placed at a plausibly ADVANCED position along its natural direction of movement' : ', in the same position relative to the scenery'}.)`
  }
  const [, images] = await chat.sendMessageMultimodalResponse(new UserMessage({ text, file_contents: fileContents }))
  return images && images.length ? images[0].data : null
}

// Pide la silueta del elemento añadido pintada en magenta puro (croma).
async function aiMagentaMask(apiKey, sessionId, origB64, editedB64) {
  const chat = new LlmChat(apiKey, sessionId,
    'You are a precise image annotation AI. Always return the requested image.'
  ).withModel('gemini', AI_EDIT_MODEL)
  const [, images] = await chat.sendMessageMultimodalResponse(new UserMessage({
    text: 'Image 1 is the ORIGINAL photo. Image 2 is the same photo after an AI edit added new element(s). ' +
      'Return image 2 again, IDENTICAL, with ONE change: paint the newly added element(s) (their entire silhouette, including any trail/shadow they produce) in solid opaque pure magenta (#FF00FF). ' +
      'Everything else must stay exactly like image 2. Do not add text or outlines.',
    file_contents: [new ImageContent(origB64), new ImageContent(editedB64)],
  }))
  return images && images.length ? images[0].data : null
}

// Extrae la máscara (alpha 0-255 con feather) desde la imagen magenta.
// Valida: fracción razonable + alineación con la edición real (dE medio).
// Umbral croma calibrado con muestras reales del modelo (r 160-200, g ~30,
// b 110-140).
function extractStickerMask(magRaw, origRaw, editRaw, W, H) {
  const n = W * H
  let bin = new Uint8Array(n)
  let count = 0
  let sumDE = 0
  for (let i = 0; i < n; i++) {
    const j = i * 3
    const r = magRaw[j], g = magRaw[j + 1], b = magRaw[j + 2]
    if (r > 130 && r - g > 60 && b - g > 40) {
      bin[i] = 1
      count++
      sumDE += Math.max(Math.abs(editRaw[j] - origRaw[j]), Math.abs(editRaw[j + 1] - origRaw[j + 1]), Math.abs(editRaw[j + 2] - origRaw[j + 2]))
    }
  }
  const frac = count / n
  if (frac < 0.0002) return { ok: false, reason: 'mask_empty' }
  if (frac > 0.5) return { ok: false, reason: 'mask_too_big' } // edición global, no un elemento
  const meanDE = sumDE / count
  if (meanDE < 20) return { ok: false, reason: 'mask_misaligned' } // la silueta no coincide con la edición

  // Recorte fino: fuera los píxeles de la silueta cuyo contenido editado es
  // (casi) idéntico al original — huecos de fondo dentro de la silueta
  // (cielo entre torres, etc.). Si se pegaran, al moverse la cámara esos
  // trozos de fondo "congelado" caerían sobre otro fondo y se verían como
  // parches. Con esto la máscara queda ceñida al elemento real.
  const tight = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (!bin[i]) continue
    const j = i * 3
    const dE = Math.max(Math.abs(editRaw[j] - origRaw[j]), Math.abs(editRaw[j + 1] - origRaw[j + 1]), Math.abs(editRaw[j + 2] - origRaw[j + 2]))
    if (dE > 22) tight[i] = 1
  }
  bin = dilateMask(tight, W, H, 1)
  const { mask, area } = filterComponents(bin, W, H, Math.max(50, Math.round(n * 0.0004)))
  if (!area) return { ok: false, reason: 'mask_empty_after_filter' }
  let cx = 0, cy = 0
  let x0 = W, x1 = 0, y0 = H, y1 = 0
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue
    const x = i % W, y = (i / W) | 0
    cx += x; cy += y
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  cx /= area; cy /= area
  const alpha = featherMask(mask, W, H, 2)
  const pad = 4
  return {
    ok: true, alpha, frac: area / n,
    centroid: { x: cx, y: cy },
    bbox: { x0: Math.max(0, x0 - pad), x1: Math.min(W - 1, x1 + pad), y0: Math.max(0, y0 - pad), y1: Math.min(H - 1, y1 + pad) },
  }
}

function dilateMask(bin, w, h, r) {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0
    outer: for (let dy = -r; dy <= r; dy++) {
      const yy = y + dy
      if (yy < 0 || yy >= h) continue
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx
        if (xx < 0 || xx >= w) continue
        if (bin[yy * w + xx]) { v = 1; break outer }
      }
    }
    out[y * w + x] = v
  }
  return out
}

function filterComponents(bin, w, h, minArea) {
  const n = w * h
  const labels = new Int32Array(n)
  const sizes = new Map()
  let next = 1
  const stack = []
  for (let s = 0; s < n; s++) {
    if (!bin[s] || labels[s]) continue
    const lbl = next++
    let size = 0
    stack.push(s); labels[s] = lbl
    while (stack.length) {
      const i = stack.pop(); size++
      const x = i % w, y = (i / w) | 0
      if (x > 0 && bin[i - 1] && !labels[i - 1]) { labels[i - 1] = lbl; stack.push(i - 1) }
      if (x < w - 1 && bin[i + 1] && !labels[i + 1]) { labels[i + 1] = lbl; stack.push(i + 1) }
      if (y > 0 && bin[i - w] && !labels[i - w]) { labels[i - w] = lbl; stack.push(i - w) }
      if (y < h - 1 && bin[i + w] && !labels[i + w]) { labels[i + w] = lbl; stack.push(i + w) }
    }
    sizes.set(lbl, size)
  }
  const out = new Uint8Array(n)
  let area = 0
  for (let i = 0; i < n; i++) if (labels[i] && sizes.get(labels[i]) >= minArea) { out[i] = 1; area++ }
  return { mask: out, area }
}

function featherMask(bin, w, h, r) {
  const tmp = new Float32Array(w * h)
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    let acc = 0
    for (let x = -r; x <= r; x++) acc += bin[y * w + Math.min(w - 1, Math.max(0, x))] ? 255 : 0
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / (2 * r + 1)
      acc += (bin[y * w + Math.min(w - 1, x + r + 1)] ? 255 : 0) - (bin[y * w + Math.max(0, x - r)] ? 255 : 0)
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = Math.round(acc / (2 * r + 1))
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return out
}

// Desplazamiento global de cámara entre 2 frames grises: SAD por bloques
// (descartando bloques planos sin textura), mediana robusta de los vectores
// (inmune a sujetos en movimiento) y refinamiento subpíxel por parábola.
function estimateShift(a, b, w, h, search = 7) {
  const bs = 24
  const step = bs + 10
  const vectors = []
  for (let y0 = step; y0 + bs + search < h - 1; y0 += step) {
    for (let x0 = step; x0 + bs + search < w - 1; x0 += step) {
      let mean = 0
      for (let y = 0; y < bs; y++) for (let x = 0; x < bs; x++) mean += a[(y0 + y) * w + x0 + x]
      mean /= bs * bs
      let variance = 0
      for (let y = 0; y < bs; y++) for (let x = 0; x < bs; x++) { const d = a[(y0 + y) * w + x0 + x] - mean; variance += d * d }
      if (variance / (bs * bs) < 40) continue // bloque plano: no ancla nada
      let best = Infinity, bdx = 0, bdy = 0
      const sad = new Map()
      for (let dy = -search; dy <= search; dy++) {
        for (let dx = -search; dx <= search; dx++) {
          const yy0 = y0 + dy, xx0 = x0 + dx
          if (yy0 < 0 || xx0 < 0 || yy0 + bs > h || xx0 + bs > w) continue
          let s = 0
          for (let y = 0; y < bs; y += 2) for (let x = 0; x < bs; x += 2) s += Math.abs(a[(y0 + y) * w + x0 + x] - b[(yy0 + y) * w + xx0 + x])
          sad.set(dx + ',' + dy, s)
          if (s < best) { best = s; bdx = dx; bdy = dy }
        }
      }
      let fx = bdx, fy = bdy
      const c0 = sad.get(bdx + ',' + bdy)
      const l = sad.get((bdx - 1) + ',' + bdy), r = sad.get((bdx + 1) + ',' + bdy)
      if (l !== undefined && r !== undefined && l + r - 2 * c0 > 0) fx += 0.5 * (l - r) / (l + r - 2 * c0)
      const u = sad.get(bdx + ',' + (bdy - 1)), d2 = sad.get(bdx + ',' + (bdy + 1))
      if (u !== undefined && d2 !== undefined && u + d2 - 2 * c0 > 0) fy += 0.5 * (u - d2) / (u + d2 - 2 * c0)
      vectors.push({ dx: fx, dy: fy })
    }
  }
  if (!vectors.length) return { dx: 0, dy: 0 }
  const med = (arr) => { const s = [...arr].sort((x, y) => x - y); return s[s.length >> 1] }
  return { dx: med(vectors.map(v => v.dx)), dy: med(vectors.map(v => v.dy)) }
}

// Pipeline del modo composición. Devuelve true si terminó bien; false si el
// modo no aplica (→ el orquestador cae al modo estilo).
async function runCompositeMode({ jobId, jobs, apiKey, videoPath, prompt, work, moving }) {
  const meta = await probeVideoMeta(videoPath)
  if (!meta.width || !meta.height) return false
  const dur = Math.min(MAX_DURATION_SEC, meta.duration || MAX_DURATION_SEC)
  const outFps = Math.max(5, Math.min(ADD_FPS_CAP, Math.round(meta.fps || ADD_FPS_CAP)))
  const scaleF = Math.min(1, ADD_MAX_SIDE / Math.max(meta.width, meta.height))
  const W = Math.round((meta.width * scaleF) / 2) * 2
  const H = Math.round((meta.height * scaleF) / 2) * 2
  const n = W * H

  // 1) Fotograma(s) clave a resolución final.
  const kfT1 = moving ? 0 : dur / 2
  const kf1Png = nodePath.join(work, 'kf1.png')
  await runCmd('ffmpeg', ['-y', '-ss', String(kfT1), '-i', videoPath, '-frames:v', '1', '-vf', `scale=${W}:${H}`, kf1Png])
  const kf1B64 = (await fs.readFile(kf1Png)).toString('base64')

  // 2) Edición IA + máscara magenta del clave 1 (con validación y reintento).
  const totalCalls = moving ? 4 : 2
  await updateJob(jobs, jobId, { status: 'editing_keyframes', progress: 0, total: totalCalls })
  const orig1 = await decodeRawImage(kf1Png, W, H)

  let edit1B64 = null, edit1Raw = null, sticker = null
  for (let attempt = 1; attempt <= 2 && !sticker; attempt++) {
    try {
      edit1B64 = await aiEditFrame(apiKey, `vidc-e1-${jobId}-a${attempt}`, prompt, kf1B64, null, false)
      if (!edit1B64) continue
      const edit1Png = nodePath.join(work, 'edit1.png')
      await fs.writeFile(edit1Png, Buffer.from(edit1B64, 'base64'))
      edit1Raw = await decodeRawImage(edit1Png, W, H)
      await updateJob(jobs, jobId, { progress: 1 })
      const magB64 = await aiMagentaMask(apiKey, `vidc-m1-${jobId}-a${attempt}`, kf1B64, edit1B64)
      if (!magB64) continue
      const magPng = nodePath.join(work, 'mag1.png')
      await fs.writeFile(magPng, Buffer.from(magB64, 'base64'))
      const magRaw = await decodeRawImage(magPng, W, H)
      const m = extractStickerMask(magRaw, orig1, edit1Raw, W, H)
      if (m.ok) sticker = m
      else console.warn('ai video edit: sticker mask invalid', m.reason, `(attempt ${attempt})`)
    } catch (e) {
      console.warn('ai video edit: composite keyframe attempt failed', e?.message)
    }
  }
  if (!sticker) return false
  await updateJob(jobs, jobId, { progress: 2 })

  // 3) (opcional) 2º clave al final del vídeo para el movimiento propio.
  let endCentroid = null
  let kfT2 = Math.max(0, dur - 0.12)
  if (moving) {
    try {
      const kf2Png = nodePath.join(work, 'kf2.png')
      await runCmd('ffmpeg', ['-y', '-ss', String(kfT2), '-i', videoPath, '-frames:v', '1', '-vf', `scale=${W}:${H}`, kf2Png])
      const kf2B64 = (await fs.readFile(kf2Png)).toString('base64')
      const edit2B64 = await aiEditFrame(apiKey, `vidc-e2-${jobId}`, prompt, kf2B64, edit1B64, true)
      await updateJob(jobs, jobId, { progress: 3 })
      if (edit2B64) {
        const edit2Png = nodePath.join(work, 'edit2.png')
        await fs.writeFile(edit2Png, Buffer.from(edit2B64, 'base64'))
        const mag2B64 = await aiMagentaMask(apiKey, `vidc-m2-${jobId}`, kf2B64, edit2B64)
        if (mag2B64) {
          const mag2Png = nodePath.join(work, 'mag2.png')
          await fs.writeFile(mag2Png, Buffer.from(mag2B64, 'base64'))
          const orig2 = await decodeRawImage(kf2Png, W, H)
          const edit2Raw = await decodeRawImage(edit2Png, W, H)
          const m2 = extractStickerMask(await decodeRawImage(mag2Png, W, H), orig2, edit2Raw, W, H)
          // sanidad: que el destino no esté absurdamente lejos (>60% del ancho)
          if (m2.ok && Math.hypot(m2.centroid.x - sticker.centroid.x, m2.centroid.y - sticker.centroid.y) < 0.6 * W) {
            endCentroid = m2.centroid
          } else if (m2.ok) {
            console.warn('ai video edit: end position too far, keeping element static')
          }
        }
      }
    } catch (e) {
      console.warn('ai video edit: moving end keyframe failed, keeping element static', e?.message)
    }
  }
  await updateJob(jobs, jobId, { progress: totalCalls })

  // 4) Tracking de cámara (pasada rápida en gris reducido).
  const tw = TRACK_W
  const th = Math.max(2, Math.round((H / W) * TRACK_W / 2) * 2)
  const grays = []
  await streamVideoFrames(videoPath, dur, `fps=${outFps},scale=${tw}:${th}`, 'gray', tw * th, (f, i) => { grays[i] = f })
  const nFrames = grays.length
  if (!nFrames) return false
  const cam = new Array(nFrames)
  cam[0] = { x: 0, y: 0 }
  for (let i = 1; i < nFrames; i++) {
    const s = estimateShift(grays[i - 1], grays[i], tw, th)
    cam[i] = { x: cam[i - 1].x + s.dx, y: cam[i - 1].y + s.dy }
  }
  const trackScale = W / tw
  const kfIdx1 = Math.min(nFrames - 1, Math.max(0, Math.round(kfT1 * outFps)))
  const kfIdx2 = Math.min(nFrames - 1, Math.max(0, Math.round(kfT2 * outFps)))

  // Vector de movimiento PROPIO del elemento (descontando el de la cámara).
  let objVec = { x: 0, y: 0 }
  if (endCentroid && kfIdx2 > kfIdx1) {
    objVec = {
      x: (endCentroid.x - sticker.centroid.x) - (cam[kfIdx2].x - cam[kfIdx1].x) * trackScale,
      y: (endCentroid.y - sticker.centroid.y) - (cam[kfIdx2].y - cam[kfIdx1].y) * trackScale,
    }
  }

  // 5) Composición streaming sobre los frames ORIGINALES + encode CRF 18.
  await updateJob(jobs, jobId, { status: 'synthesizing', progress: 0, total: nFrames })
  const outId = crypto.randomBytes(8).toString('hex')
  const outFilename = `ai_video_${outId}.mp4`
  const outVideoPath = nodePath.join(UPLOAD_DIR, outFilename)
  await fs.mkdir(UPLOAD_DIR, { recursive: true })
  const hasAudio = await probeHasAudio(videoPath)
  const encArgs = ['-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(outFps), '-i', 'pipe:0']
  if (hasAudio) encArgs.push('-i', videoPath, '-map', '0:v:0', '-map', '1:a:0', '-shortest')
  encArgs.push('-t', String(dur), '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outVideoPath)
  const enc = spawn('ffmpeg', encArgs)
  enc.stdin.on('error', () => {}) // evita crash EPIPE si el encoder muere
  let encErr = ''
  enc.stderr.on('data', (d) => { encErr += d.toString() })
  const encDone = new Promise((resolve, reject) => {
    enc.on('error', reject)
    enc.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('encode failed: ' + encErr.slice(-300)))))
  })
  const writeFrame = (buf) => new Promise((resolve) => {
    if (enc.exitCode !== null || enc.stdin.destroyed) return resolve() // encoder muerto: no colgarse esperando drain
    if (enc.stdin.write(buf)) resolve()
    else enc.stdin.once('drain', resolve)
  })

  const { alpha, bbox } = sticker
  const denom = Math.max(1, nFrames - 1)
  let doneFrames = 0
  await streamVideoFrames(videoPath, dur, `fps=${outFps},scale=${W}:${H}`, 'rgb24', n * 3, async (frame, i) => {
    const ci = cam[Math.min(i, nFrames - 1)]
    const ck = cam[kfIdx1]
    const camDx = Math.round((ci.x - ck.x) * trackScale)
    const camDy = Math.round((ci.y - ck.y) * trackScale)
    const wMove = i / denom
    const dx = camDx + Math.round(objVec.x * (wMove - kfIdx1 / denom))
    const dy = camDy + Math.round(objVec.y * (wMove - kfIdx1 / denom))
    // recorre solo la bbox del sticker (desplazada) — mucho más rápido
    for (let sy = bbox.y0; sy <= bbox.y1; sy++) {
      const y = sy + dy
      if (y < 0 || y >= H) continue
      for (let sx = bbox.x0; sx <= bbox.x1; sx++) {
        const x = sx + dx
        if (x < 0 || x >= W) continue
        let a = alpha[sy * W + sx] / 255
        if (a <= 0.01) continue
        const ti = (y * W + x) * 3
        // OCLUSIÓN por diferencia de fondo (sin ML): si el frame actual
        // difiere mucho del fotograma clave ORIGINAL alineado por cámara,
        // algo (una persona, un objeto) se ha movido DELANTE de esa zona →
        // el elemento debe quedar detrás (no se pega ahí). min-filter 3x3
        // para tolerar desalineación subpíxel del tracking, y atenuación
        // gradual (45→80) en vez de corte duro para evitar bordes duros.
        const ox = x - camDx, oy = y - camDy
        if (ox >= 1 && ox < W - 1 && oy >= 1 && oy < H - 1) {
          let dMin = 255
          for (let ny = -1; ny <= 1; ny++) {
            for (let nx = -1; nx <= 1; nx++) {
              const oi = ((oy + ny) * W + ox + nx) * 3
              const d = Math.max(
                Math.abs(frame[ti] - orig1[oi]),
                Math.abs(frame[ti + 1] - orig1[oi + 1]),
                Math.abs(frame[ti + 2] - orig1[oi + 2])
              )
              if (d < dMin) dMin = d
            }
          }
          if (dMin > 45) {
            const occ = 1 - Math.min(1, (dMin - 45) / 35)
            a *= occ
            if (a <= 0.01) continue
          }
        }
        const si = (sy * W + sx) * 3
        frame[ti] = Math.round(edit1Raw[si] * a + frame[ti] * (1 - a))
        frame[ti + 1] = Math.round(edit1Raw[si + 1] * a + frame[ti + 1] * (1 - a))
        frame[ti + 2] = Math.round(edit1Raw[si + 2] * a + frame[ti + 2] * (1 - a))
      }
    }
    await writeFrame(frame)
    doneFrames++
    if (doneFrames % 8 === 0) await updateJob(jobs, jobId, { progress: doneFrames })
  })
  await updateJob(jobs, jobId, { status: 'assembling', progress: nFrames })
  enc.stdin.end()
  await encDone

  await updateJob(jobs, jobId, { status: 'done', resultUrl: `/uploads/${outFilename}`, progress: nFrames, total: nFrames })
  return true
}

// ══════════ MODO ESTILO (reestilizado global con ebsynth, lento) ══════════

async function runStyleMode({ jobId, jobs, apiKey, videoPath, prompt, work }) {
  // 1) Extraer fotogramas (fps reducido, duración limitada, lado mayor
  //    limitado a 480px para que ebsynth sea manejable en CPU).
  await updateJob(jobs, jobId, { status: 'extracting' })
  const framesDir = nodePath.join(work, 'frames')
  await fs.mkdir(framesDir, { recursive: true })
  await runCmd('ffmpeg', [
    '-y', '-i', videoPath,
    '-t', String(MAX_DURATION_SEC),
    '-vf', `fps=${SAMPLE_FPS},scale=480:480:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
    nodePath.join(framesDir, 'f_%04d.png'),
  ])
  const files = (await fs.readdir(framesDir)).filter((f) => f.endsWith('.png')).sort()
  if (files.length === 0) throw new Error('no_frames_extracted')
  const dims = await probeImageDims(nodePath.join(framesDir, files[0]))

  // Índices de fotogramas clave: uno cada KEYFRAME_INTERVAL, + el último.
  const keyframeIdxs = []
  for (let i = 0; i < files.length; i += KEYFRAME_INTERVAL) keyframeIdxs.push(i)
  if (keyframeIdxs[keyframeIdxs.length - 1] !== files.length - 1) keyframeIdxs.push(files.length - 1)

  // 2) Editar cada fotograma clave con IA. El PRIMER clave se edita solo y
  //    su resultado se adjunta como REFERENCIA en las demás ediciones →
  //    consistencia + permite editarlas EN PARALELO (red, no CPU).
  await updateJob(jobs, jobId, { status: 'editing_keyframes', progress: 0, total: keyframeIdxs.length })
  const systemMessage =
    'You are an expert photo editing AI helping edit frames of a short video with the SAME instruction. ' +
    'The added/changed element must look visually consistent (same style, similar relative size) across frames, as if it belongs to one continuous video. ' +
    'When a REFERENCE image (an already-edited frame of the same video) is provided, reproduce the SAME element with identical appearance, colors, scale and placement relative to the scene, adapted only to camera/subject motion. ' +
    'Preserve everything else in the frame. Always return the edited image.'

  const editedDir = nodePath.join(work, 'edited')
  await fs.mkdir(editedDir, { recursive: true })
  const keyframePath = {} // idx -> ruta del clave (editado y redimensionado, u original si falló)
  const keyframeEdited = {} // idx -> true SOLO si la IA lo editó de verdad

  const editKeyframe = async (idx, referenceB64, attempt) => {
    const framePath = nodePath.join(framesDir, files[idx])
    const base64 = (await fs.readFile(framePath)).toString('base64')
    const chat = new LlmChat(apiKey, `vid-edit-${jobId}-k${idx}-a${attempt}`, systemMessage).withModel('gemini', AI_EDIT_MODEL)
    const fileContents = [new ImageContent(base64)]
    let text = prompt
    if (referenceB64) {
      fileContents.push(new ImageContent(referenceB64))
      text = `${prompt}\n\n(Two images attached: image 1 is the video frame you must edit. Image 2 is another frame of the SAME video already edited with this exact instruction — use it as a strict visual REFERENCE and reproduce the SAME added/changed element identically: same design, colors, scale and placement relative to the scene, adjusted only for any camera or subject motion.)`
    }
    const [, images] = await chat.sendMessageMultimodalResponse(
      new UserMessage({ text, file_contents: fileContents })
    )
    if (!images || !images.length) return null
    const rawPath = nodePath.join(editedDir, `raw_${idx}.png`)
    await fs.writeFile(rawPath, Buffer.from(images[0].data, 'base64'))
    const resizedPath = nodePath.join(editedDir, `kf_${idx}.png`)
    await runCmd('ffmpeg', ['-y', '-i', rawPath, '-vf', `scale=${dims.w}:${dims.h}`, resizedPath])
    return resizedPath
  }
  const editKeyframeWithRetry = async (idx, referenceB64) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const p = await editKeyframe(idx, referenceB64, attempt)
        if (p) return p
      } catch (e) {
        console.warn(`ai video edit: keyframe ${idx} edit failed (attempt ${attempt})`, e?.message)
      }
    }
    return null
  }

  let done = 0
  const firstIdx = keyframeIdxs[0]
  {
    const p = await editKeyframeWithRetry(firstIdx, null)
    if (p) { keyframePath[firstIdx] = p; keyframeEdited[firstIdx] = true }
    else keyframePath[firstIdx] = nodePath.join(framesDir, files[firstIdx])
    done++
    await updateJob(jobs, jobId, { progress: done })
  }
  let referenceB64 = null
  if (keyframeEdited[firstIdx]) {
    try {
      referenceB64 = (await fs.readFile(nodePath.join(editedDir, `raw_${firstIdx}.png`))).toString('base64')
    } catch { /* sin referencia, se sigue igualmente */ }
  }
  await mapPool(keyframeIdxs.slice(1), AI_CONCURRENCY, async (idx) => {
    const p = await editKeyframeWithRetry(idx, referenceB64)
    if (p) { keyframePath[idx] = p; keyframeEdited[idx] = true }
    else keyframePath[idx] = nodePath.join(framesDir, files[idx])
    done++
    await updateJob(jobs, jobId, { progress: done })
  })

  // 3) Propagación BIDIRECCIONAL con ebsynth: cada frame no-clave se
  //    sintetiza desde el clave ANTERIOR y el SIGUIENTE y se fusionan con
  //    peso lineal (cross-fade por píxel) → sin saltos entre segmentos. Si
  //    un lado no fue editado de verdad, se usa solo el lado editado (evita
  //    "fantasmas" semitransparentes). Secuencial a propósito (1 núcleo).
  await updateJob(jobs, jobId, { status: 'synthesizing', progress: 0, total: files.length })
  const outDir = nodePath.join(work, 'out')
  await fs.mkdir(outDir, { recursive: true })

  const synthFrom = async (kIdx, i, outPath) => {
    await runCmd(EBSYNTH_BIN, [
      '-style', keyframePath[kIdx],
      '-guide', nodePath.join(framesDir, files[kIdx]), nodePath.join(framesDir, files[i]),
      '-output', outPath,
      ...EBSYNTH_ARGS,
    ])
  }

  done = 0
  for (let i = 0; i < files.length; i++) {
    const outPath = nodePath.join(outDir, files[i])
    try {
      if (keyframePath[i]) {
        await fs.copyFile(keyframePath[i], outPath)
      } else {
        let prev = -1, next = -1
        for (const k of keyframeIdxs) {
          if (k < i) prev = k
          else if (k > i) { next = k; break }
        }
        const bothEdited = prev !== -1 && next !== -1 && keyframeEdited[prev] && keyframeEdited[next]
        if (bothEdited) {
          const fromPrev = nodePath.join(work, `bi_p_${i}.png`)
          const fromNext = nodePath.join(work, `bi_n_${i}.png`)
          await synthFrom(prev, i, fromPrev)
          await synthFrom(next, i, fromNext)
          const w = ((i - prev) / (next - prev)).toFixed(4)
          await runCmd('ffmpeg', [
            '-y', '-i', fromPrev, '-i', fromNext,
            '-filter_complex', `[0:v]format=rgb24[a];[1:v]format=rgb24[b];[a][b]blend=all_expr='A*(1-${w})+B*${w}'`,
            '-frames:v', '1', outPath,
          ])
          await Promise.all([fs.rm(fromPrev, { force: true }), fs.rm(fromNext, { force: true })]).catch(() => {})
        } else {
          const candidates = keyframeIdxs.filter((k) => keyframeEdited[k])
          const pool = candidates.length ? candidates : keyframeIdxs
          let nearest = pool[0]
          let bestDist = Infinity
          for (const k of pool) {
            const d = Math.abs(k - i)
            if (d < bestDist) { bestDist = d; nearest = k }
          }
          await synthFrom(nearest, i, outPath)
        }
      }
    } catch (e) {
      console.warn('ai video edit: synthesis failed for frame', i, e?.message)
      await fs.copyFile(nodePath.join(framesDir, files[i]), outPath).catch(() => {})
    }
    done++
    await updateJob(jobs, jobId, { progress: done })
  }

  // 4) Reensamblado: deflicker + interpolación de movimiento 5→15fps
  //    (minterpolate mci, ~2s medidos) + CRF 18 + audio original.
  await updateJob(jobs, jobId, { status: 'assembling' })
  const outId = crypto.randomBytes(8).toString('hex')
  const outFilename = `ai_video_${outId}.mp4`
  const outVideoPath = nodePath.join(UPLOAD_DIR, outFilename)
  await fs.mkdir(UPLOAD_DIR, { recursive: true })
  const hasAudio = await probeHasAudio(videoPath)
  const args = ['-y', '-framerate', String(SAMPLE_FPS), '-i', nodePath.join(outDir, 'f_%04d.png')]
  if (hasAudio) {
    args.push('-i', videoPath, '-map', '0:v:0', '-map', '1:a:0', '-shortest')
  }
  args.push(
    '-vf', `deflicker=mode=pm:size=4,minterpolate=fps=${OUTPUT_FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`,
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outVideoPath
  )
  await runCmd('ffmpeg', args)

  await updateJob(jobs, jobId, { status: 'done', resultUrl: `/uploads/${outFilename}`, progress: files.length, total: files.length })
}
