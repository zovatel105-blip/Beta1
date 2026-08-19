'use client'
/* eslint-disable react-hooks/set-state-in-effect -- async load on open; false positive of the experimental rule. */

import { useEffect, useRef, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Mousewheel, Keyboard } from 'swiper/modules'
import 'swiper/css'
import { Swords, Plus, Trophy, Loader2, UserPlus, Flame, Sparkles } from 'lucide-react'
import BottomNav from './BottomNav'
import CarouselSlide from './CarouselSlide'
import DuetSlide from './DuetSlide'
import LuxuryBattleSheet from './LuxuryBattleSheet'
import CreateTrendingChallengeSheet from './CreateTrendingChallengeSheet'
import { notificationsUnreadCount } from '@/lib/notifications'
import { subscribeCommentCountChange, patchCommentCountInList } from '@/lib/commentCountBus'

// Empty state of "Completed challenges" — premium minimalist design.
const EmptyCompletedState = ({ onOpenUpload, onOpenActive }) => {
  return (
    <div className="relative w-full h-full overflow-y-auto bg-[#0a0a0b]">
      {/* Warm, very subtle top glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80"
           style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(255,255,255,0.10), transparent 70%)' }} />

      <div className="relative z-10 px-6 pt-28 pb-32 max-w-md mx-auto">
        {/* Hero — emblem + title + actions */}
        <div className="flex flex-col items-center text-center">
          <div
            className="w-20 h-20 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center mb-6"
            style={{ boxShadow: '0 0 48px -14px rgba(255,255,255,0.45)' }}
          >
            <Trophy className="w-9 h-9" strokeWidth={1.25} style={{ color: '#FFFFFF' }} />
          </div>
          <h1 className="text-white text-[26px] font-semibold tracking-tight leading-snug">
            No completed challenges yet
          </h1>
          <p className="text-zinc-400 text-[15px] mt-3 leading-relaxed max-w-[18rem]">
            Create your first challenge and start competing. Winners will appear here.
          </p>

          <button
            onClick={onOpenUpload}
            className="mt-8 w-full h-12 rounded-full bg-white text-black font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-zinc-100 active:scale-[0.99] transition"
          >
            <Plus className="w-[18px] h-[18px]" strokeWidth={2.5} />
            Create a challenge
          </button>
          <button
            onClick={onOpenActive}
            className="mt-3 w-full h-12 rounded-full border border-white/15 text-white font-medium text-[15px] flex items-center justify-center gap-2 hover:bg-white/[0.04] active:scale-[0.99] transition"
          >
            <Swords className="w-[18px] h-[18px]" strokeWidth={1.75} />
            See active challenges
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CompletedBattlesPage({ open, onClose, onOpenActive, onOpenUpload, onOpenInbox, onOpenProfile, onOpenSuggestions, onGoHome, onGoHomeDouble, onEnterLuxuryBattle, refreshKey = 0 }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [muted, setMuted] = useState(true)
  const [luxurySheetOpen, setLuxurySheetOpen] = useState(false)
  // Pill de "Luxury Battle" (petición del usuario: mejora sobre larpgpt.com
  // integrada AQUÍ, en la pestaña Batallas) — solo se muestra si HAY un tema
  // activo (evita un botón vacío/confuso si nunca se configuró ninguno, ver
  // GET /api/luxury-battles/active). Se consulta una sola vez al abrir esta
  // pantalla; la hoja (LuxuryBattleSheet) vuelve a pedir el detalle completo
  // + leaderboard al abrirse, así que aquí solo hace falta saber SI existe.
  const [luxuryThemeTitle, setLuxuryThemeTitle] = useState(null)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/luxury-battles/active', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setLuxuryThemeTitle(d?.theme?.title || null) })
      .catch(() => { if (!cancelled) setLuxuryThemeTitle(null) })
    return () => { cancelled = true }
  }, [open])
  // Fila SEPARADA de "Trending Challenges" creados por USUARIOS normales
  // (petición explícita: "que los usuarios puedan crear sus trending
  // challenge" + "los creados por usuarios aparte" — nunca se mezclan con
  // la píldora dorada oficial de arriba, que sigue siendo solo del admin).
  // `luxurySheetThemeId`: null = la hoja muestra el tema OFICIAL activo
  // (comportamiento de siempre); un id = muestra ESE tema de la comunidad.
  const [communityThemes, setCommunityThemes] = useState([])
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const [luxurySheetThemeId, setLuxurySheetThemeId] = useState(null)
  const loadCommunityThemes = () => {
    fetch('/api/luxury-battles/community', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setCommunityThemes(Array.isArray(d?.themes) ? d.themes : []))
      .catch(() => setCommunityThemes([]))
  }
  useEffect(() => {
    if (!open) return
    loadCommunityThemes()
  }, [open])
  const swiperRef = useRef(null)

  // Loads completed challenges from the backend each time the page opens
  // or when a new challenge is accepted (refreshKey). Returns real versus posts.
  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setActiveIndex(0)
    fetch('/api/challenges/completed', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (active) setPosts(Array.isArray(d?.posts) ? d.posts : []) })
      .catch(() => { if (active) setPosts([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open, refreshKey])

  // BUG FIX ("el contador de comentarios debe mostrarse siempre, sin abrir el
  // modal"): ver lib/commentCountBus.js.
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
      {/* Minimalist header — side buttons + central segmented control */}
      <div className="absolute top-0 left-0 right-0 z-40 px-4 pb-4 bg-gradient-to-b from-black/70 to-transparent"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
        <div className="flex items-center justify-between gap-2">
          {/* Left: user suggestions */}
          <button
            onClick={onOpenSuggestions}
            aria-label="User suggestions"
            className="shrink-0 w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/10 active:scale-95 transition"
          >
            <UserPlus className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </button>

          {/* Center: segmented control */}
          <div className="inline-flex p-1 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-md">
            <button className="px-4 py-1.5 rounded-full text-[13px] font-semibold bg-white text-black transition">
              Completed
            </button>
            <button
              onClick={onOpenActive}
              className="px-4 py-1.5 rounded-full text-[13px] font-medium text-zinc-300 hover:text-white transition"
            >
              Active
            </button>
          </div>

          {/* Right: add challenge */}
          <button
            onClick={onOpenUpload}
            aria-label="Add challenge"
            className="shrink-0 w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:bg-zinc-100 active:scale-95 transition"
          >
            <Plus className="w-[18px] h-[18px]" strokeWidth={2.5} />
          </button>
        </div>

        {/* "Luxury Battle" — pill destacada (petición del usuario: mejora
            sobre larpgpt.com integrada aquí, en Batallas) — SOLO si hay un
            tema activo configurado (GET /api/luxury-battles/active). Abre
            LuxuryBattleSheet (tema + leaderboard + botón de entrada). */}
        {luxuryThemeTitle && (
          <div className="flex justify-center mt-2.5">
            <button
              onClick={() => { setLuxurySheetThemeId(null); setLuxurySheetOpen(true) }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-bold active:scale-95 transition"
              style={{ background: 'linear-gradient(135deg, rgba(252,211,77,0.18), rgba(245,158,11,0.18))', border: '1px solid rgba(252,211,77,0.35)', color: '#FCD34D' }}
            >
              <Flame size={12} className="fill-current" />
              Trending Challenge: {luxuryThemeTitle}
            </button>
          </div>
        )}

        {/* Fila de Trending Challenges de la COMUNIDAD (petición del
            usuario: "que los usuarios puedan crear sus trending
            challenge... los creados por usuarios aparte") — SIEMPRE
            SEPARADA de la píldora oficial de arriba. Incluye siempre un
            botón "+" para crear uno nuevo, y luego los ya creados por
            cualquier usuario (más reciente primero). Estilo idéntico
            (ámbar/dorado) pero más compacto, en una fila horizontal
            deslizable — mismo patrón visual que "Trending"/sugerencias del
            editor de IA (AIImageEditor.jsx). */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mt-2 px-1 pb-0.5">
          <button
            onClick={() => setCreateSheetOpen(true)}
            className="shrink-0 flex items-center gap-1 whitespace-nowrap text-[11px] font-bold px-2.5 py-1 rounded-full active:scale-95 transition"
            style={{ background: 'rgba(252,211,77,0.10)', border: '1px dashed rgba(252,211,77,0.4)', color: '#FCD34D' }}
          >
            <Plus size={11} strokeWidth={2.5} /> New Trending Challenge
          </button>
          {communityThemes.map((t) => (
            <button
              key={t.id}
              onClick={() => { setLuxurySheetThemeId(t.id); setLuxurySheetOpen(true) }}
              className="shrink-0 flex items-center gap-1 whitespace-nowrap text-[11px] font-semibold px-2.5 py-1 rounded-full active:scale-95 transition"
              style={{ background: 'rgba(252,211,77,0.08)', border: '1px solid rgba(252,211,77,0.25)', color: '#FCD34D' }}
            >
              <Flame size={10} className="fill-current" /> {t.title}
            </button>
          ))}
        </div>
      </div>

      {/* Content: vertical feed of completed challenges or empty state */}
      {loading ? (
        <div className="w-full h-full flex items-center justify-center bg-[#0a0a0b]">
          <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
        </div>
      ) : isEmpty ? (
        <EmptyCompletedState
          onOpenUpload={onOpenUpload}
          onOpenActive={onOpenActive}
        />
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
                    onRequestNext={() => swiperRef.current?.slideNext()}
                  />
                )}
              </SwiperSlide>
            )
          })}
        </Swiper>
      )}

      {/* Bottom navigation bar — same as the feed. BUG FIX ("cuando estoy en
          otra página [Retos > Completados] y presiono Home, no actualiza el
          feed"): antes `onGoHome={onClose}` solo cerraba esta pantalla,
          dejando el feed de fondo TAL CUAL estaba (sin refrescar ni volver
          arriba) — a diferencia del `<BottomNav>` real del feed principal
          (Feed.jsx), que usa `handleGoHome` (cierra overlays + refresca +
          resetea scroll). Ahora se recibe y reutiliza ESE MISMO handler
          (que ya incluye `setBattlesOpen(false)`, así que también cierra
          esta pantalla correctamente) en vez de un simple `onClose`. */}
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

      <LuxuryBattleSheet
        open={luxurySheetOpen}
        themeId={luxurySheetThemeId}
        onClose={() => setLuxurySheetOpen(false)}
        onEnter={(theme) => {
          setLuxurySheetOpen(false)
          onEnterLuxuryBattle?.(theme)
        }}
      />
      <CreateTrendingChallengeSheet
        open={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
        onCreated={loadCommunityThemes}
      />
    </div>
  )
}
