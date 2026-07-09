'use client'
/* eslint-disable react-hooks/set-state-in-effect -- async load on open; false positive of the experimental rule. */

import { useEffect, useRef, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Mousewheel, Keyboard } from 'swiper/modules'
import 'swiper/css'
import { Swords, Check, X, Loader2, Film } from 'lucide-react'
import Avatar from './Avatar'

/**
 * ActiveChallengesPage — Active challenges (premium minimalist, full view).
 * Each challenge takes the full screen and scrolls VERTICALLY between challenges.
 * Within each challenge, swipe HORIZONTALLY between the 2 videos (A = challenger,
 * B = challenged), carousel style. Accept publishes the versus; Reject discards it.
 *
 * props: open, onClose, onAccepted(post), onChanged()
 */
const GOLD = '#FFFFFF'

// Avatar WITHOUT a ring that uses the SAME <Avatar> component as profile/feed ->
// auto-generated avatars (dicebear/pravatar) show as the gray silhouette,
// identical to the profile.
const RingAvatar = ({ src, size = 'w-11 h-11' }) => (
  <div className={`${size} rounded-full overflow-hidden bg-zinc-800 shrink-0`}>
    <Avatar src={src} className="w-full h-full rounded-full" />
  </div>
)

const ChallengeSlide = ({ c, active, busy, onAccept, onReject, muted }) => {
  const [idx, setIdx] = useState(0)
  const innerRef = useRef(null)
  const fileRef = useRef(null)
  const pendingAcceptRef = useRef(false)
  const [responseFile, setResponseFile] = useState(null)
  const [responsePreview, setResponsePreview] = useState(null)
  // Refs to the 2 <video> elements (A and B). src is assigned IMPERATIVELY
  // (see effect below) — never declared in JSX — so that only the video that
  // is BOTH (a) on the challenge card currently visible in the vertical
  // scroll AND (b) the side (A/B) currently shown in the horizontal swipe
  // ever gets a real <source>+autoplay. This is the same "REGLA #2" pattern
  // already used in CarouselSlide.jsx/DuetSlide.jsx.
  const videoRefs = useRef([null, null])

  // pause() + removeAttribute('src') + load(): forces the browser to abort
  // the download and give the hardware decoder back. Without this, every
  // challenge card (and both A/B sides within it) kept an <video autoPlay>
  // mounted at once, exhausting the mobile decoder budget — side B (and
  // every other card besides the first) never actually started playing.
  const acquireVideo = (el, src) => {
    if (!el || !src) return
    if (el.preload !== 'auto') el.preload = 'auto'
    if (el.getAttribute('src') !== src) {
      el.setAttribute('src', src)
      try { el.load() } catch { /* ignore */ }
    }
    const p = el.play()
    if (p && p.catch) p.catch(() => { /* blocked until user gesture; muted state handles that */ })
  }
  const releaseVideo = (el) => {
    if (!el) return
    try { el.pause() } catch { /* ignore */ }
    if (el.getAttribute('src') !== null) {
      el.removeAttribute('src')
      try { el.preload = 'none' } catch { /* ignore */ }
      try { el.load() } catch { /* ignore */ }
    }
  }

  // "Mention" challenge: it does NOT carry the challenged user's video (targetVideoUrl).
  // The challenged user must upload their response video to be able to accept.
  const needsVideo = !c.targetVideoUrl && !c.targetImageUrl

  // Clean up the preview object URL when changing/unmounting.
  useEffect(() => () => { if (responsePreview) URL.revokeObjectURL(responsePreview) }, [responsePreview])

  const pickFile = () => fileRef.current?.click()
  const onFileChange = (e) => {
    const f = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!f) return
    if (!f.type.startsWith('video/') && !f.type.startsWith('image/')) return
    setResponseFile(f)
    setResponsePreview((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(f) })
    // "After" flow: if you pressed Accept with no video, selecting it sends automatically.
    if (pendingAcceptRef.current) {
      pendingAcceptRef.current = false
      onAccept(c, f)
    }
  }

  const handleAccept = () => {
    if (needsVideo && !responseFile) {
      // "After" flow: open the picker and send automatically on select.
      pendingAcceptRef.current = true
      pickFile()
      return
    }
    onAccept(c, responseFile) // file can be null if the challenge already carries targetVideoUrl
  }

  // Side B = response media: the existing one (target media) or the preview of
  // the file just selected. If it's a mention challenge with no media yet, side
  // B shows as an upload zone. Soporta imagen O vídeo.
  const responseFileIsImage = !!responseFile && responseFile.type?.startsWith('image/')
  const aUrl = c.challengerVideoUrl || c.challengerImageUrl || c.challengerPosterUrl
  const aIsImage = c.challengerMediaType === 'image' || (!c.challengerVideoUrl && !!c.challengerImageUrl)
  const targetUrl = c.targetVideoUrl || c.targetImageUrl || c.targetPosterUrl
  const targetIsImage = c.targetMediaType === 'image' || (!c.targetVideoUrl && !!c.targetImageUrl)
  const responseUrl = needsVideo ? responsePreview : targetUrl
  const responseIsImage = needsVideo ? responseFileIsImage : targetIsImage
  const aPoster = c.challengerPosterUrl || null
  const responsePoster = needsVideo ? null : (c.targetPosterUrl || null)
  const videos = [
    { url: aUrl, isImage: aIsImage, poster: aPoster, author: c.from, tag: 'A', tagColor: GOLD, isResponse: false },
    { url: responseUrl, isImage: responseIsImage, poster: responsePoster, author: c.to, tag: 'B', tagColor: '#FFFFFF', isResponse: true },
  ]

  // Play/pause + acquire/release the decoder for each of the 2 videos: ONLY
  // the video that is on the currently visible card (active) AND is the
  // currently shown side (idx) is ever assigned a src/play(). The other one
  // (same card's other side, or ANY other card) stays released — showing
  // only its poster/first frame — so it never competes for audio/decoder.
  useEffect(() => {
    videos.forEach((v, i) => {
      const el = videoRefs.current[i]
      if (!el || v.isImage) return
      const shouldPlay = active && idx === i && !!v.url
      if (shouldPlay) acquireVideo(el, v.url + '#t=0.3')
      else releaseVideo(el)
    })
    // Release both on unmount (card removed after accept/reject).
    return () => {
      videoRefs.current.forEach((el) => releaseVideo(el))
    }
  }, [active, idx, aUrl, responseUrl, aIsImage, responseIsImage])

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <input ref={fileRef} type="file" accept="video/*,image/*" className="hidden" onChange={onFileChange} />
      {/* Horizontal carousel of videos A / B */}
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
                  {v.isImage ? (
                    <img
                      src={v.url}
                      alt=""
                      draggable={false}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <video
                      ref={(el) => { videoRefs.current[i] = el }}
                      poster={v.poster || undefined}
                      muted={muted}
                      playsInline
                      loop
                      preload="none"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-black/40" />
                  {/* Side label */}
                  <span
                    className="absolute top-[72px] left-4 z-10 text-[11px] font-bold bg-black/45 backdrop-blur rounded-full px-2.5 py-1"
                    style={{ color: v.tagColor }}
                  >
                    {v.tag} · @{v.author?.username}
                  </span>
                  {/* If it's my freshly uploaded response, allow changing it */}
                  {v.isResponse && needsVideo && (
                    <button
                      onClick={pickFile}
                      className="absolute top-[72px] right-4 z-10 text-[11px] font-semibold bg-black/55 backdrop-blur rounded-full px-3 py-1 text-white border border-white/15 hover:bg-black/70 active:scale-95 transition"
                    >
                      Change
                    </button>
                  )}
                </>
              ) : (
                // Side B with no video (mention challenge) -> zone to upload my response.
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
                  <span className="text-white font-semibold text-[15px]">Upload your response</span>
                  <span className="text-zinc-500 text-[13px]">Tap to record or pick a video or photo</span>
                </button>
              )}
            </div>
          </SwiperSlide>
        ))}
      </Swiper>

      {/* Swipe hint */}
      {videos.length > 1 && (
        <div className="absolute top-[72px] left-1/2 -translate-x-1/2 z-10 pointer-events-none bg-black/45 backdrop-blur text-white/90 text-[10px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
          Swipe to see the other video
        </div>
      )}

      {/* Compact bottom panel (fixed, does not move with the carousel) */}
      <div className="absolute inset-x-0 bottom-0 z-20 px-4 pt-8"
           style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}>
        {/* Carousel dots */}
        {videos.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 mb-2.5">
            {videos.map((_, i) => (
              <button
                key={i}
                aria-label={`video ${i + 1}`}
                onClick={() => innerRef.current?.slideTo(i)}
                className={`rounded-full transition-all duration-200 ${idx === i ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40'}`}
              />
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl px-3 py-2.5">
          {/* Participants on a single compact line */}
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

          {/* For mention challenges: option to upload the video BEFORE accepting. */}
          {needsVideo && (
            <button
              onClick={pickFile}
              disabled={busy}
              className="w-full h-10 mt-2.5 rounded-full border border-white/20 text-white font-semibold text-[14px] flex items-center justify-center gap-1.5 hover:bg-white/[0.06] active:scale-[0.99] transition disabled:opacity-50"
            >
              <Film size={16} strokeWidth={2} />
              {responseFile ? 'Change my video' : 'Upload my video'}
            </button>
          )}

          {/* Compact actions */}
          <div className="flex gap-2 mt-2.5">
            <button
              onClick={handleAccept}
              disabled={busy}
              className="flex-1 h-10 rounded-full bg-white text-black font-semibold text-[14px] flex items-center justify-center gap-1.5 hover:bg-zinc-100 active:scale-[0.99] transition disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={2.5} />}
              {needsVideo && !responseFile ? 'Upload & accept' : 'Accept challenge'}
            </button>
            <button
              onClick={() => onReject(c)}
              disabled={busy}
              className="shrink-0 w-12 h-10 rounded-full border border-white/20 text-white flex items-center justify-center hover:bg-white/[0.06] active:scale-[0.99] transition disabled:opacity-50"
              aria-label="Reject"
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
  // Igual que en Feed.jsx/CompletedBattlesPage.jsx/ProfilePage.jsx: el navegador
  // exige un gesto del usuario para permitir audio con sonido, así que el
  // primer toque en la página desmutea los vídeos de las miniaturas A/B.
  const [muted, setMuted] = useState(true)
  // Which challenge CARD is currently visible in the vertical scroll. Only
  // that card's ChallengeSlide is allowed to acquire a video decoder/play —
  // fixes multiple cards trying to autoplay their A/B videos at once.
  const [activeCard, setActiveCard] = useState(0)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/challenges', { cache: 'no-store' })
      const data = await res.json()
      setList(data.challenges || [])
    } catch { setList([]) } finally { setLoading(false) }
  }

  useEffect(() => {
    if (open) { load(); setActiveCard(0) }
  }, [open])

  if (!open) return null

  const accept = async (c, file = null) => {
    setBusyId(c.id)
    try {
      let res
      if (file) {
        // Mention challenge: we upload the challenged user's response video.
        const fd = new FormData()
        fd.append('file', file)
        res = await fetch(`/api/challenges/${c.id}/accept`, { method: 'POST', body: fd })
      } else {
        // Challenge to a specific content (already carries targetVideoUrl).
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
    <div
      className="fixed inset-0 z-[58] bg-[#0a0a0b] overflow-hidden"
      onPointerDown={muted ? () => setMuted(false) : undefined}
    >
      {/* Header — segmented control */}
      <div className="absolute top-0 left-0 right-0 z-40 px-6 pb-4 bg-gradient-to-b from-black/70 to-transparent"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
        <div className="flex items-center justify-center">
          <div className="inline-flex p-1 rounded-full bg-black/40 border border-white/15 backdrop-blur-md">
            <button onClick={onClose} className="px-5 py-1.5 rounded-full text-[13px] font-medium text-zinc-200 hover:text-white transition">
              Completed
            </button>
            <button className="px-5 py-1.5 rounded-full text-[13px] font-semibold bg-white text-black transition">
              Active
            </button>
          </div>
        </div>
      </div>

      {/* Full-screen content */}
      {loading ? (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
        </div>
      ) : list.length === 0 ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-center px-6">
          <div className="w-20 h-20 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center mb-6"
               style={{ boxShadow: '0 0 48px -14px rgba(255,255,255,0.42)' }}>
            <Swords className="w-9 h-9" strokeWidth={1.25} style={{ color: GOLD }} />
          </div>
          <h2 className="text-white text-[22px] font-semibold tracking-tight">No active challenges</h2>
          <p className="text-zinc-400 text-[15px] mt-2 max-w-[17rem] leading-relaxed">
            When someone challenges you, the request will appear here to accept or reject.
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
          onSlideChange={(s) => setActiveCard(s.activeIndex)}
          className="w-full h-full"
        >
          {list.map((c, i) => (
            <SwiperSlide key={c.id}>
              <ChallengeSlide c={c} active={activeCard === i} busy={busyId === c.id} onAccept={accept} onReject={reject} muted={muted} />
            </SwiperSlide>
          ))}
        </Swiper>
      )}
    </div>
  )
}
