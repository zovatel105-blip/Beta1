'use client'

import { useEffect, useRef, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Mousewheel, Keyboard } from 'swiper/modules'
import 'swiper/css'
import { ArrowLeft, Flame, Loader2 } from 'lucide-react'
import BottomNav from './BottomNav'
import CarouselSlide from './CarouselSlide'
import DuetSlide from './DuetSlide'
import { notificationsUnreadCount } from '@/lib/notifications'
import { subscribeCommentCountChange, patchCommentCountInList } from '@/lib/commentCountBus'

// Pantalla a pantalla completa con TODAS las publicaciones reales de un
// "Trending Challenge" (ej. "Yacht Life") — petición del usuario: "Debe
// mostrar solo el nombre del challenge (son los challenge en tendencia) y
// al hacer click te dirige a las publicaciones en ESE challenge". Se abre
// al tocar el nombre del challenge en el buscador (lupa) del feed
// (SearchOverlay.jsx). Consume GET /api/luxury-battles/posts?themeId=...
// (devuelve la publicación COMPLETA, misma forma que /api/challenges/
// completed, a diferencia de /api/luxury-battles/leaderboard que solo
// devuelve un resumen para el ranking). Vídeo deslizable vertical, MISMO
// componente CarouselSlide/DuetSlide que el resto de la app (Retos >
// Completados usa exactamente el mismo patrón).
export default function TrendingChallengePostsPage({ open, themeId, onClose, onOpenAuthorProfile, onOpenUpload, onOpenInbox, onOpenProfile, onGoHome, onGoHomeDouble }) {
  const [theme, setTheme] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [muted, setMuted] = useState(true)
  const swiperRef = useRef(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setActiveIndex(0)
    const url = themeId ? `/api/luxury-battles/posts?themeId=${encodeURIComponent(themeId)}` : '/api/luxury-battles/posts'
    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!active) return
        setTheme(d?.theme || null)
        setPosts(Array.isArray(d?.posts) ? d.posts : [])
      })
      .catch(() => { if (active) { setTheme(null); setPosts([]) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open, themeId])

  // BUG FIX conocido de esta app ("el contador de comentarios debe mostrarse
  // siempre, sin abrir el modal"): ver lib/commentCountBus.js.
  useEffect(() => subscribeCommentCountChange((postId, count) => {
    setPosts((prev) => patchCommentCountInList(prev, postId, count))
  }), [])

  if (!open) return null

  const isEmpty = !loading && posts.length === 0

  return (
    <div
      className="fixed inset-0 z-[55] bg-black overflow-hidden"
      onPointerDown={muted ? () => setMuted(false) : undefined}
    >
      {/* Cabecera minimalista: volver + nombre del challenge */}
      <div className="absolute top-0 left-0 right-0 z-40 px-3 pb-4 bg-gradient-to-b from-black/70 to-transparent"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            aria-label="Volver"
            className="shrink-0 w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/10 active:scale-95 transition"
          >
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-bold"
               style={{ background: 'linear-gradient(135deg, rgba(252,211,77,0.18), rgba(245,158,11,0.18))', border: '1px solid rgba(252,211,77,0.35)', color: '#FCD34D' }}>
            <Flame size={13} className="fill-current" />
            {theme?.title || 'Trending Challenge'}
          </div>
        </div>
      </div>

      {/* Contenido: vídeos deslizables o estado vacío/carga */}
      {loading ? (
        <div className="w-full h-full flex items-center justify-center bg-[#0a0a0b]">
          <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
        </div>
      ) : isEmpty ? (
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-[#0a0a0b] px-8 text-center">
          <div className="w-16 h-16 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center mb-5">
            <Flame className="w-7 h-7" strokeWidth={1.25} style={{ color: '#FCD34D' }} />
          </div>
          <h1 className="text-white text-[20px] font-semibold tracking-tight">No hay publicaciones todavía</h1>
          <p className="text-zinc-400 text-[14px] mt-2 leading-relaxed max-w-[18rem]">
            Cuando alguien participe en {theme?.title ? `"${theme.title}"` : 'este challenge'}, sus publicaciones aparecerán aquí.
          </p>
        </div>
      ) : (
        <Swiper
          direction="vertical"
          slidesPerView={1}
          spaceBetween={0}
          mousewheel={{ forceToAxis: true, sensitivity: 1, releaseOnEdges: false, thresholdDelta: 20 }}
          keyboard={{ enabled: true, onlyInViewport: true }}
          modules={[Mousewheel, Keyboard]}
          onSwiper={(s) => (swiperRef.current = s)}
          onSlideChange={(s) => setActiveIndex(s.activeIndex)}
          className="w-full h-full"
        >
          {posts.map((post, i) => {
            const isActive = i === activeIndex
            const isNear = i >= activeIndex - 2 && i <= activeIndex + 2
            const isAdjacent = Math.abs(i - activeIndex) <= 1
            return (
              <SwiperSlide key={post.id}>
                {post.type === 'duet' ? (
                  <DuetSlide
                    post={post}
                    isActive={isActive}
                    isNear={isNear}
                    isAdjacent={isAdjacent}
                    muted={muted}
                    infoBottom
                    hideChallenge
                    onOpenProfile={onOpenAuthorProfile}
                    onRequestNext={() => swiperRef.current?.slideNext()}
                  />
                ) : (
                  <CarouselSlide
                    post={post}
                    isActive={isActive}
                    isNear={isNear}
                    isAdjacent={isAdjacent}
                    muted={muted}
                    infoBottom
                    hideChallenge
                    onOpenProfile={onOpenAuthorProfile}
                    onRequestNext={() => swiperRef.current?.slideNext()}
                  />
                )}
              </SwiperSlide>
            )
          })}
        </Swiper>
      )}

      <BottomNav
        onGoHome={onGoHome}
        onGoHomeDouble={onGoHomeDouble}
        onOpenBattles={() => {}}
        onOpenUpload={onOpenUpload}
        onOpenInbox={onOpenInbox}
        onOpenProfile={onOpenProfile}
        unreadCount={notificationsUnreadCount}
        activeTab="explore"
      />
    </div>
  )
}
