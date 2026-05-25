'use client'

import { useRef, useState } from 'react'
import { PlusSquare, Loader2 } from 'lucide-react'

export default function UploadButton({ onUploaded }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const trigger = () => inputRef.current?.click()

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('video/')) {
      alert('Selecciona un vídeo')
      return
    }
    if (file.size > 80 * 1024 * 1024) {
      alert('El vídeo es demasiado grande (máx 80MB)')
      return
    }
    setUploading(true)
    setProgress(0)
    try {
      const xhr = new XMLHttpRequest()
      const promise = new Promise((resolve, reject) => {
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)) } catch (err) { reject(err) }
          } else reject(new Error('upload failed ' + xhr.status))
        }
        xhr.onerror = () => reject(new Error('network'))
      })
      xhr.open('POST', '/api/upload')
      const fd = new FormData()
      fd.append('file', file)
      fd.append('description', 'Mi vídeo subido 📹 #miupload')
      xhr.send(fd)
      const data = await promise
      if (onUploaded) onUploaded(data.post)
    } catch (err) {
      console.error('upload error', err)
      alert('Error al subir el vídeo')
    } finally {
      setUploading(false)
      setProgress(0)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={handleFile} />
      <button onClick={trigger} aria-label="Crear" className="flex flex-col items-center gap-0.5 px-2 py-1 text-white relative">
        <div className="relative">
          <div className="absolute inset-y-0 -left-1 w-3 bg-cyan-400 rounded-l-md" />
          <div className="absolute inset-y-0 -right-1 w-3 bg-rose-500 rounded-r-md" />
          <div className="relative bg-white text-black rounded-md px-3 py-1">
            {uploading ? <Loader2 size={20} className="animate-spin" /> : <PlusSquare size={20} strokeWidth={2.5} />}
          </div>
        </div>
        <span className="text-[10px] mt-0.5">{uploading ? `${progress}%` : 'Crear'}</span>
      </button>
    </>
  )
}
