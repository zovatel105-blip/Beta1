// lib/aiVideoEditor.js
//
// Editor de VÍDEO con IA — enfoque 100% viable en CPU (sin GPU), construido
// tras investigar a fondo (a petición del usuario, "busca en GitHub y si
// falta algo lo solucionas tú"): ni la Universal Key de Emergent ni ninguna
// API comercial (Sora, Gemini Omni, Runway, Pika, Luma, Kling) ofrecen
// edición de vídeo existente gratis e ilimitada — todas cobran por uso o
// exigen GPU. La única vía real y gratuita encontrada:
//
//   1) Editar unos pocos FOTOGRAMAS clave del vídeo con la IA de imágenes
//      que YA funciona (Gemini 2.5 Flash Image "Nano Banana", vía la misma
//      Universal Key — gratis, sin límite artificial más allá del saldo).
//   2) Propagar cada edición a los fotogramas cercanos con `ebsynth`
//      (jamriska/ebsynth, dominio público, algoritmo clásico de síntesis
//      por parches — NO usa redes neuronales, así que corre perfectamente
//      en CPU). Compilado para este servidor (aarch64, sin GPU) con
//      `build-linux-cpu_only.sh` y vendido en `.bin/ebsynth` (persistente,
//      comiteado a git, igual que ffmpeg tuvo que serlo).
//   3) Reensamblar los fotogramas editados en un vídeo nuevo con ffmpeg,
//      re-adjuntando el audio original.
//
// LIMITACIONES HONESTAS (probadas manualmente antes de integrar, ver
// test_result.md): la propagación de ebsynth pierde calidad cuanto más
// lejos está un fotograma de su "fotograma clave" más cercano (funciona
// bien hasta ~0.3-0.5s de distancia) — por eso se usan VARIOS fotogramas
// clave repartidos por todo el vídeo (uno cada ~1s), cada uno editado por
// la IA de forma independiente (misma sesión de chat para máxima
// consistencia de estilo entre ellos). El proceso es LENTO (varios minutos
// por vídeo corto, ya que cada fotograma no-clave tarda ~9-10s en CPU) — es
// el precio real de no depender de GPU ni de ninguna API de pago.

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

// Parámetros del pipeline (ajustados tras pruebas manuales reales).
export const SAMPLE_FPS = 5
export const MAX_DURATION_SEC = 5
const KEYFRAME_INTERVAL = 3 // 1 fotograma clave cada 3 frames (~0.6s a 5fps) — más
// denso que el valor inicial (5) tras observar en pruebas reales que los
// fotogramas a mitad de camino entre 2 claves pueden perder el elemento
// añadido por completo en escenas oscuras/con mucho movimiento (ver
// test_result.md) — acortar la distancia máxima mejora la fiabilidad a
// costa de más llamadas a la IA (más tiempo total).
// Parámetros de ebsynth AFINADOS manualmente (los valores por defecto daban
// artefactos claros -formas "arco" falsas-; estos los eliminan).
const EBSYNTH_ARGS = ['-weight', '1.5', '-uniformity', '5000', '-patchsize', '7', '-extrapass3x3', '-backend', 'cpu']

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

async function updateJob(jobs, id, fields) {
  await jobs.updateOne({ id }, { $set: { ...fields, updatedAt: new Date() } })
}

// Crea el job en Mongo y arranca el procesamiento EN SEGUNDO PLANO
// (fire-and-forget) — devuelve el id inmediatamente, el cliente hace
// polling a getVideoEditJob() para ver el progreso.
export async function createVideoEditJob({ userId, videoPath, prompt }) {
  const jobs = await getCollection('ai_video_jobs')
  const id = crypto.randomUUID()
  await jobs.insertOne({
    id, userId, prompt,
    status: 'queued', progress: 0, total: 0,
    resultUrl: null, error: null,
    createdAt: new Date(), updatedAt: new Date(),
  })
  processVideoEditJob(id, videoPath, prompt).catch(async (err) => {
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

async function processVideoEditJob(jobId, videoPath, prompt) {
  const jobs = await getCollection('ai_video_jobs')
  const apiKey = process.env.EMERGENT_LLM_KEY
  if (!apiKey) throw new Error('AI editor is not configured')

  const work = nodePath.join(WORK_DIR, jobId)
  await fs.mkdir(work, { recursive: true })
  try {
    // 1) Extraer fotogramas (fps reducido, duración limitada, tamaño
    //    acotado en su lado mayor a 480px para que ebsynth sea manejable
    //    en CPU independientemente de si el vídeo es vertical u horizontal).
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

    // 2) Editar cada fotograma clave con IA — MISMA sesión de chat (secuencial
    //    a propósito, para que el modelo vea las ediciones anteriores como
    //    contexto y mantenga un estilo consistente del elemento añadido).
    await updateJob(jobs, jobId, { status: 'editing_keyframes', progress: 0, total: keyframeIdxs.length })
    const chat = new LlmChat(
      apiKey,
      `vid-edit-${jobId}`,
      'You are an expert photo editing AI helping edit consecutive frames of a short video with the SAME instruction. The added/changed element must look visually consistent (same style, similar relative size) across frames, as if it belongs to one continuous video. Preserve everything else in the frame. Always return the edited image.'
    ).withModel('gemini', AI_EDIT_MODEL)

    const editedDir = nodePath.join(work, 'edited')
    await fs.mkdir(editedDir, { recursive: true })
    const keyframePath = {} // idx -> ruta del fotograma clave (editado y ya redimensionado, o el original si falló)
    let done = 0
    for (const idx of keyframeIdxs) {
      const framePath = nodePath.join(framesDir, files[idx])
      let outPath = null
      try {
        const base64 = (await fs.readFile(framePath)).toString('base64')
        const [, images] = await chat.sendMessageMultimodalResponse(
          new UserMessage({ text: prompt, file_contents: [new ImageContent(base64)] })
        )
        if (images && images.length) {
          const rawPath = nodePath.join(editedDir, `raw_${idx}.png`)
          await fs.writeFile(rawPath, Buffer.from(images[0].data, 'base64'))
          const resizedPath = nodePath.join(editedDir, `kf_${idx}.png`)
          await runCmd('ffmpeg', ['-y', '-i', rawPath, '-vf', `scale=${dims.w}:${dims.h}`, resizedPath])
          outPath = resizedPath
        }
      } catch (e) {
        console.warn('ai video edit: keyframe edit failed', idx, e?.message)
      }
      keyframePath[idx] = outPath || framePath // fallback: sin editar, para no romper el pipeline
      done++
      await updateJob(jobs, jobId, { progress: done })
    }

    // 3) Propagar a los fotogramas no-clave con ebsynth (desde su clave más
    //    cercana — mantiene la distancia corta = mejor calidad, ver notas
    //    arriba).
    await updateJob(jobs, jobId, { status: 'synthesizing', progress: 0, total: files.length })
    const outDir = nodePath.join(work, 'out')
    await fs.mkdir(outDir, { recursive: true })
    done = 0
    for (let i = 0; i < files.length; i++) {
      const outPath = nodePath.join(outDir, files[i])
      if (keyframePath[i]) {
        await fs.copyFile(keyframePath[i], outPath)
      } else {
        let nearest = keyframeIdxs[0]
        let bestDist = Infinity
        for (const k of keyframeIdxs) {
          const d = Math.abs(k - i)
          if (d < bestDist) { bestDist = d; nearest = k }
        }
        const guideTgt = nodePath.join(framesDir, files[i])
        try {
          await runCmd(EBSYNTH_BIN, [
            '-style', keyframePath[nearest],
            '-guide', nodePath.join(framesDir, files[nearest]), guideTgt,
            '-output', outPath,
            ...EBSYNTH_ARGS,
          ])
        } catch (e) {
          console.warn('ai video edit: ebsynth failed for frame', i, e?.message)
          await fs.copyFile(guideTgt, outPath) // fallback: fotograma sin editar
        }
      }
      done++
      await updateJob(jobs, jobId, { progress: done })
    }

    // 4) Reensamblar vídeo + re-adjuntar audio original (si tenía).
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
    args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outVideoPath)
    await runCmd('ffmpeg', args)

    await updateJob(jobs, jobId, { status: 'done', resultUrl: `/uploads/${outFilename}`, progress: files.length, total: files.length })
  } finally {
    fs.rm(work, { recursive: true, force: true }).catch(() => {})
  }
}

// Validación de entrada compartida por la ruta API.
export async function validateVideoForAiEdit(videoPath) {
  const duration = await probeDuration(videoPath)
  if (!duration || duration <= 0) throw new Error('invalid_video')
  return { duration }
}
