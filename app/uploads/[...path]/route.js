// app/uploads/[...path]/route.js
//
// Sirve TODO el contenido subido por usuarios (vídeos, imágenes, pósters)
// directamente desde MongoDB GridFS, bajo la MISMA URL que antes servía
// Next.js como archivo estático (`/uploads/<filename>`) -> no hace falta
// cambiar ninguna de las miles de referencias `/uploads/${filename}` ya
// guardadas en la base de datos o repartidas por el código.
//
// Si el archivo YA existe físicamente en `public/uploads/` (contenido
// antiguo, de antes de esta migración), Next.js lo sirve directo como
// estático SIN pasar por aquí (comportamiento normal de la carpeta
// `public/`) — este route handler solo se ejecuta para nombres que no
// existen ahí, que es exactamente el caso de TODO lo subido después de la
// migración a GridFS.
//
// Soporta peticiones HTTP `Range` (imprescindible para que los vídeos
// permitan adelantar/retroceder en el navegador).
import { findFile, openReadStream } from '@/lib/gridfs'
import { Readable } from 'node:stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request, { params }) {
  try {
    const segs = params?.path || []
    const filename = segs.join('/')
    if (!filename) return new Response('Not found', { status: 404 })

    const info = await findFile(filename)
    if (!info) return new Response('Not found', { status: 404 })

    const total = info.length
    const contentType = info.metadata?.contentType || info.contentType || 'application/octet-stream'
    const rangeHeader = request.headers.get('range')

    let start = 0
    let end = total > 0 ? total - 1 : 0
    let status = 200
    const headers = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=604800',
    }

    if (rangeHeader && total > 0) {
      const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
      if (match && (match[1] || match[2])) {
        if (match[1]) start = parseInt(match[1], 10)
        if (match[2]) end = parseInt(match[2], 10)
        if (Number.isNaN(start) || start < 0) start = 0
        if (Number.isNaN(end) || end >= total) end = total - 1
        if (start > end) { start = 0; end = total - 1 }
        status = 206
        headers['Content-Range'] = `bytes ${start}-${end}/${total}`
      }
    }
    headers['Content-Length'] = String(total > 0 ? end - start + 1 : 0)

    if (total === 0) {
      return new Response(null, { status: 200, headers })
    }

    const nodeStream = await openReadStream(filename, { start, end: end + 1 })
    const webStream = Readable.toWeb(nodeStream)
    return new Response(webStream, { status, headers })
  } catch (err) {
    console.error('[uploads] serve error', err)
    return new Response('error', { status: 500 })
  }
}

export async function HEAD(request, ctx) {
  const res = await GET(request, ctx)
  return new Response(null, { status: res.status, headers: res.headers })
}
