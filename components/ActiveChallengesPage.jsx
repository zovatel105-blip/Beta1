'use client'
/* eslint-disable react-hooks/set-state-in-effect -- carga async al abrir; falso positivo de la regla experimental. */

import { useEffect, useRef, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Mousewheel, Keyboard } from 'swiper/modules'
import 'swiper/css'
import { Swords, Check, X, Loader2, Film } from 'lucide-react'
import Avatar from './Avatar'

/**
 * ActiveChallengesPage — Retos activos (premium minimalista, vista completa).
 * Cada reto ocupa la pantalla completa y se desliza VERTICALMENTE entre retos.
 * Dentro de cada reto, se desliza HORIZONTALMENTE entre los 2 vídeos (A = retador,
 * B = retado), tipo carrusel. Aceptar publica el versus; Rechazar lo descarta.
 *
 * props: open, onClose, onAccepted(post), onChanged()
 */
const GOLD = '#E4C79B'

// Avatar SIN anillo que usa el MISMO componente <Avatar> del perfil/feed -> los
// avatares autogenerados (dicebear/pravatar) se muestran como la silueta gris,
// idéntica a la del perfil.
const RingAvatar = ({ src, size = 'w-11 h-11' }) => (
  <div className={`${size} rounded-full overflow-hidden bg-zinc-800 shrink-0`}>
    <Avatar src={src} className="w-full h-full rounded-full" />
  </div>
)

const ChallengeSlide = ({ c, busy, onAccept, onReject }) => {
  const [idx, setIdx] = useState(0)
  const innerRef = useRef(null)
  const fileRef = useRef(null)
  const pendingAcceptRef = useRef(false)
  const [responseFile, setResponseFile] = useState(null)
  const [responsePreview, setResponsePreview] = useState(null)

  // Reto "con mención": NO trae vídeo del retado (targetVideoUrl). El retado
  // debe subir su vídeo de respuesta para poder aceptar.
  const needsVideo = !c.targetVideoUrl

  // Limpia el object URL del preview al cambiarlo/desmontar.
  useEffect(() => () => { if (responsePreview) URL.revokeObjectURL(responsePreview) }, [responsePreview])

  const pickFile = () => fileRef.current?.click()
  const onFileChange = (e) => {
    const f = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!f) return
    if (!f.type.startsWith('video/')) return
    setResponseFile(f)
    setResponsePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f) })
    // Flujo "después": si pulsaste Aceptar sin vídeo, al elegirlo se envía solo.
    if (pendingAcceptRef.current) {
      pendingAcceptRef.current = false
      onAccept(c, f)
    }
  }

  const handleAccept = () => {
    if (needsVideo && !responseFile) {
      // Flujo "después": abrir el selector y enviar automáticamente al elegir.
      pendingAcceptRef.current = true
      pickFile()
      return
    }
    onAccept(c, responseFile) // file puede ser null si el reto ya trae targetVideoUrl
  }

  // Lado B = vídeo de respuesta: el ya existente (targetVideoUrl) o el preview
  // del archivo recién elegido. Si es reto con mención y aún no hay vídeo, el
  // lado B se muestra como zona para subir.
  const responseUrl = needsVideo ? responsePreview : c.targetVideoUrl
  const videos = [
    { url: c.challengerVideoUrl, author: c.from, tag: 'A', tagColor: GOLD, isResponse: false },
    { url: responseUrl, author: c.to, tag: 'B', tagColor: '#FFFFFF', isResponse: true },
  ]

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={onFileChange} />
      {/* Carrusel horizontal de vídeos A / B */}
      <Swiper
        direction="horizontal"
        nested
        slidesPerView={1}
        spaceBetween={0}
        onSwiper={(s) => (innerRef.current = s)}
        onSlideChange={(s) => setIdx(s.activeIndex)}
        className="w-full h-full"
      >
        {videos.map((v, i) => (
          <SwiperSlide key={i}>
            <div className="relative w-full h-full bg-black">
              {v.url ? (
                <>
                  <video
                    src={v.url + '#t=0.3'}
                    muted
                    playsInline
                    loop
                    autoPlay
                    preload="metadata"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-black/40" />
                  {/* Etiqueta del lado */}
                  <span
                    className="absolute top-[72px] left-4 z-10 text-[11px] font-bold bg-black/45 backdrop-blur rounded-full px-2.5 py-1"
                    style={{ color: v.tagColor }}
                  >
                    {v.tag} · @{v.author?.username}
                  </span>
                  {/* Si es mi respuesta recién subida, permitir cambiarla */}
                  {v.isResponse && needsVideo && (
                    <button
                      onClick={pickFile}
                      className="absolute top-[72px] right-4 z-10 text-[11px] font-semibold bg-black/55 backdrop-blur rounded-full px-3 py-1 text-white border border-white/15 hover:bg-black/70 active:scale-95 transition"
                    >
                      Cambiar vídeo
                    </button>
                  )}
                </>
              ) : (
                // Lado B sin vídeo (reto con mención) -> zona para subir mi respuesta.
                <button
                  onClick={pickFile}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-900 active:bg-zinc-800 transition"
                >
                  <span className="absolute top-[72px] left-4 z-10 text-[11px] font-bold bg-black/45 backdrop-blur rounded-full px-2.5 py-1 text-white">
                    B · @{c.to?.username}
                  </span>
                  <div className="w-16 h-16 rounded-full border border-white/15 bg-white/[0.04] flex items-center justify-center">
                    <Film className="w-7 h-7 text-zinc-400" strokeWidth={1.5} />
                  </div>
                  <span className="text-white font-semibold text-[15px]">Sube tu vídeo de respuesta</span>
                  <span className="text-zinc-500 text-[13px]">Toca para grabar o elegir</span>
                </button>
              )}
            </div>
          </SwiperSlide>
        ))}
      </Swiper>

      {/* Pista para deslizar */}
      {videos.length > 1 && (
        <div className="absolute top-[72px] left-1/2 -translate-x-1/2 z-10 pointer-events-none bg-black/45 backdrop-blur text-white/90 text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
          Desliza para ver el otro vídeo
        </div>
      )}

      {/* Panel inferior compacto (fijo, no se mueve con el carrusel) */}
      <div className="absolute inset-x-0 bottom-0 z-20 px-4 pt-8"
           style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}>
        {/* Puntitos del carrusel */}
        {videos.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 mb-2.5">
            {videos.map((_, i) => (
              <button
                key={i}
                aria-label={`vídeo ${i + 1}`}
                onClick={() => innerRef.current?.slideTo(i)}
                className={`rounded-full transition-all duration-200 ${idx === i ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40'}`}
              />
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl px-3 py-2.5">
          {/* Participantes en una sola línea compacta */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <RingAvatar src={c.from?.avatarUrl} size="w-8 h-8" />
              <span className="text-white font-semibold text-[13px] truncate">@{c.from?.username}</span>
            </div>
            <span className="shrink-0 text-white/80 font-bold text-[12px] tracking-wide">VS</span>
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
              <span className="text-white font-semibold text-[13px] truncate">@{c.to?.username}</span>
              <RingAvatar src={c.to?.avatarUrl} size="w-8 h-8" />
            </div>
          </div>

          {/* En retos con mención: opción de subir el vídeo ANTES de aceptar. */}
          {needsVideo && (
            <button
              onClick={pickFile}
              disabled={busy}
              className="w-full h-10 mt-2.5 rounded-full border border-white/20 text-white font-semibold text-[14px] flex items-center justify-center gap-1.5 hover:bg-white/[0.06] active:scale-[0.99] transition disabled:opacity-50"
            >
              <Film size={16} strokeWidth={2} />
              {responseFile ? 'Cambiar mi vídeo' : 'Subir mi vídeo'}
            </button>
          )}

          {/* Acciones compactas */}
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={handleAccept}
              disabled={busy}
              className="flex-1 h-10 rounded-full bg-white text-black font-semibold text-[14px] flex items-center justify-center gap-1.5 hover:bg-zinc-100 active:scale-[0.99] transition disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.5} />}
              {needsVideo && !responseFile ? 'Subir y aceptar' : 'Aceptar reto'}
            </button>
            <button
              onClick={() => onReject(c)}
              disabled={busy}
              className="shrink-0 w-12 h-10 rounded-full border border-white/20 text-white flex items-center justify-center hover:bg-white/[0.06] active:scale-[0.99] transition disabled:opacity-50"
              aria-label="Rechazar"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ActiveChallengesPage({ open, onClose, onAccepted, onChanged }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/challenges', { cache: 'no-store' })
      const data = await res.json()
      setList(data.challenges || [])
    } catch { setList([]) } finally { setLoading(false) }
  }

  useEffect(() => {
    if (open) load()
  }, [open])

  if (!open) return null

  const accept = async (c, file = null) => {
    setBusyId(c.id)
    try {
      let res
      if (file) {
        // Reto con mención: subimos el vídeo de respuesta del retado.
        const fd = new FormData()
        fd.append('file', file)
        res = await fetch(`/api/challenges/${c.id}/accept`, { method: 'POST', body: fd })
      } else {
        // Reto a un contenido concreto (ya trae targetVideoUrl).
        res = await fetch(`/api/challenges/${c.id}/accept`, { method: 'POST' })
      }
      if (res.ok) {
        const data = await res.json()
        setList((prev) => prev.filter((x) => x.id !== c.id))
        if (onAccepted && data?.post) onAccepted(data.post)
        if (onChanged) onChanged()
      }
    } catch { /* ignore */ } finally { setBusyId(null) }
  }

  const reject = async (c) => {
    setBusyId(c.id)
    try {
      const res = await fetch(`/api/challenges/${c.id}/reject`, { method: 'POST' })
      if (res.ok) {
        setList((prev) => prev.filter((x) => x.id !== c.id))
        if (onChanged) onChanged()
      }
    } catch { /* ignore */ } finally { setBusyId(null) }
  }

  return (
    <div className="fixed inset-0 z-[58] bg-[#0a0a0b] overflow-hidden">
      {/* Header — control segmentado */}
      <div className="absolute top-0 left-0 right-0 z-40 px-6 pb-4 bg-gradient-to-b from-black/70 to-transparent"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
        <div className="flex items-center justify-center">
          <div className="inline-flex p-1 rounded-full bg-black/40 border border-white/15 backdrop-blur-md">
            <button onClick={onClose} className="px-5 py-1.5 rounded-full text-[13px] font-medium text-zinc-200 hover:text-white transition">
              Completados
            </button>
            <button className="px-5 py-1.5 rounded-full text-[13px] font-semibold bg-white text-black transition">
              Activos
            </button>
          </div>
        </div>
      </div>

      {/* Contenido a pantalla completa */}
      {loading ? (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
        </div>
      ) : list.length === 0 ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-center px-6">
          <div className="w-20 h-20 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center mb-6"
               style={{ boxShadow: '0 0 48px -14px rgba(214,178,122,0.42)' }}>
            <Swords className="w-9 h-9" strokeWidth={1.25} style={{ color: GOLD }} />
          </div>
          <h2 className="text-white text-[22px] font-semibold tracking-tight">Sin retos activos</h2>
          <p className="text-zinc-400 text-[15px] mt-2 max-w-[17rem] leading-relaxed">
            Cuando alguien te rete, la solicitud aparecerá aquí para aceptarla o rechazarla.
          </p>
        </div>
      ) : (
        <Swiper
          direction="vertical"
          slidesPerView={1}
          spaceBetween={0}
          mousewheel
          keyboard
          modules={[Mousewheel, Keyboard]}
          className="w-full h-full"
        >
          {list.map((c) => (
            <SwiperSlide key={c.id}>
              <ChallengeSlide c={c} busy={busyId === c.id} onAccept={accept} onReject={reject} />
            </SwiperSlide>
          ))}
        </Swiper>
      )}
    </div>
  )
}
