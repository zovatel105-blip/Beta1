// lib/gridfs.js
//
// Almacenamiento de TODO el contenido subido por usuarios (vídeos, imágenes,
// pósters/miniaturas, renditions) en MongoDB usando GridFS, en vez de disco
// local (`public/uploads`). Motivo: la app desplegada corre con 2+ réplicas
// detrás de un balanceador de carga, y el disco local de cada contenedor NO
// se comparte entre réplicas -> un archivo guardado por la réplica A no
// existe en la réplica B, así que el contenido se veía "roto" según qué
// réplica atendiera cada petición. MongoDB SÍ es una única base de datos
// compartida por todas las réplicas, así que GridFS resuelve esto sin
// depender de ningún servicio de almacenamiento de terceros (Tigris/S3).
//
// El "nombre lógico" (filename) de cada archivo es EXACTAMENTE el mismo que
// antes se usaba como nombre de fichero en disco (p.ej. `abc123.mp4`,
// `abc123.jpg`, `avatar_xyz.jpg`) -> las URLs `/uploads/<filename>` que ya
// están guardadas en miles de sitios del código (posts, retos, avatares...)
// NO necesitan cambiar. Solo cambia CÓMO se escriben y se leen esos bytes.
import { getDb } from './mongodb'
import { GridFSBucket } from 'mongodb'

const BUCKET_NAME = 'uploads'

let bucketPromise = null
async function getBucket() {
  if (!bucketPromise) {
    bucketPromise = getDb().then((db) => new GridFSBucket(db, { bucketName: BUCKET_NAME }))
  }
  return bucketPromise
}

// Sube un buffer bajo un nombre lógico (filename). Si ya existía un archivo
// con ese mismo nombre (p.ej. al re-generar un póster), la subida nueva se
// escribe COMPLETA primero y solo después se borran las revisiones
// anteriores -> nunca hay una ventana en la que el archivo no exista.
export async function putBuffer(filename, buffer, contentType) {
  const bucket = await getBucket()
  const previous = await bucket.find({ filename }).toArray()
  await new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: contentType || 'application/octet-stream',
      metadata: { contentType: contentType || 'application/octet-stream' },
    })
    uploadStream.on('error', reject)
    uploadStream.end(buffer, (err) => (err ? reject(err) : resolve()))
  })
  if (previous.length) {
    await Promise.all(previous.map((f) => bucket.delete(f._id).catch(() => {})))
  }
  return filename
}

// Metadata del archivo (length, contentType, uploadDate...) por nombre
// lógico. Si hay varias revisiones con el mismo nombre, devuelve la más
// reciente. null si no existe.
export async function findFile(filename) {
  if (!filename) return null
  const bucket = await getBucket()
  const files = await bucket.find({ filename }).sort({ uploadDate: -1 }).limit(1).toArray()
  return files[0] || null
}

export async function fileExists(filename) {
  return !!(await findFile(filename))
}

// Stream de lectura (Node.js Readable) por nombre lógico. `options` admite
// { start, end } en bytes (end EXCLUSIVO, como en fs.createReadStream) para
// soportar peticiones HTTP Range (necesario para que los vídeos permitan
// adelantar/retroceder).
export async function openReadStream(filename, options) {
  const bucket = await getBucket()
  return bucket.openDownloadStreamByName(filename, options)
}

// Lee el archivo completo en memoria (Buffer). Usar solo para archivos
// pequeños/medianos (pósters, imágenes, o para pasárselos a ffmpeg como
// entrada) — para servir vídeos grandes al navegador, usar openReadStream
// con Range en vez de esto.
export async function getBufferByFilename(filename) {
  const stream = await openReadStream(filename)
  const chunks = []
  await new Promise((resolve, reject) => {
    stream.on('data', (c) => chunks.push(c))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return Buffer.concat(chunks)
}

export async function deleteByFilename(filename) {
  if (!filename) return
  const bucket = await getBucket()
  const files = await bucket.find({ filename }).toArray()
  await Promise.all(files.map((f) => bucket.delete(f._id).catch(() => {})))
}

// Mapeo simple de extensión -> Content-Type para los archivos que la app
// genera ella misma (pósters, imágenes de marketing, avatares...).
export function mimeForExt(ext) {
  const e = (ext || '').toLowerCase().replace(/^\./, '')
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg'
  if (e === 'png') return 'image/png'
  if (e === 'webp') return 'image/webp'
  if (e === 'gif') return 'image/gif'
  if (e === 'mp4' || e === 'm4v') return 'video/mp4'
  if (e === 'webm') return 'video/webm'
  if (e === 'mov') return 'video/quicktime'
  return 'application/octet-stream'
}
