'use client'
/* eslint-disable react-hooks/set-state-in-effect -- setState dentro de fetch async en efecto de carga; falso positivo de la regla experimental. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Menu, Bookmark, Swords, Users, UserPlus, ArrowLeft } from 'lucide-react'
import VoteIcon from './icons/VoteIcon'
import { useAuth } from '@/contexts/AuthContext'
import Avatar from './Avatar'
import DuetSlide from './DuetSlide'
import CarouselSlide from './CarouselSlide'

// El perfil se deriva del usuario autenticado (useAuth) dentro del componente.
// El avatar usa el componente compartido <Avatar> -> idéntico al del feed.

const formatNumber = (num) => {
  const n = Number(num)
  if (!n || isNaN(n)) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toString()
}

const thumbFor = (p) =>
  p?.thumbnailUrl || p?.posterUrl || p?.sideA?.posterUrl || p?.sideB?.posterUrl || ''

const videoFor = (p) =>
  p?.videoUrl || p?.sideA?.videoUrl || p?.sideB?.videoUrl || ''

// Icono de columnas (HHH) usado en la pestaña de publicaciones y en el estado vacío.
const ColumnsIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="3" y1="4" x2="3" y2="20" />
    <line x1="9" y1="4" x2="9" y2="20" />
    <line x1="15" y1="4" x2="15" y2="20" />
    <line x1="21" y1="4" x2="21" y2="20" />
    <line x1="3" y1="12" x2="21" y2="12" />
  </svg>
)

// Una mitad del split: muestra el póster y, si falla, el primer fotograma del vídeo.
const GridHalf = ({ poster, video }) => {
  const [failed, setFailed] = useState(false)
  const showImg = poster && !failed
  if (showImg) {
    return <img src={poster} alt="" className="w-full h-full object-cover" draggable={false} onError={() => setFailed(true)} />
  }
  if (video) {
    return <video src={`${video}#t=0.1`} muted playsInline preload="auto" className="w-full h-full object-cover" />
  }
  return <div className="w-full h-full bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900" />
}

const GridItem = ({ post, onOpen }) => {
  const thumb = thumbFor(post)
  const video = videoFor(post)
  const [imgFailed, setImgFailed] = useState(false)
  const totalVotes = (post?.votes?.a || 0) + (post?.votes?.b || 0)
  const showImg = thumb && !imgFailed

  // Solo los 1vs1 (dueto) muestran split. Los Versus (carrusel) se muestran como
  // un único post, sin línea divisoria.
  const hasTwo = post?.type === 'duet' && !!(post?.sideA?.videoUrl && post?.sideB?.videoUrl)
  // Vertical (1vs1 izq/der) -> split izquierda/derecha. Horizontal -> arriba/abajo.
  const isRow = post?.layout === 'vertical'

  return (
    <button
      type="button"
      onClick={() => onOpen?.(post)}
      className="group relative aspect-[9/16] overflow-hidden rounded-lg bg-white/[0.04] border border-white/5 cursor-pointer active:scale-[0.98] transition-transform"
    >
      {hasTwo ? (
        <div className={`absolute inset-0 flex bg-white/30 ${isRow ? 'flex-row' : 'flex-col'}`} style={{ gap: '1.5px' }}>
          <div className="relative flex-1 min-w-0 min-h-0 overflow-hidden bg-gray-200">
            <GridHalf poster={post?.sideA?.posterUrl} video={post?.sideA?.videoUrl} />
          </div>
          <div className="relative flex-1 min-w-0 min-h-0 overflow-hidden bg-gray-200">
            <GridHalf poster={post?.sideB?.posterUrl} video={post?.sideB?.videoUrl} />
          </div>
        </div>
      ) : showImg ? (
        <img
          src={thumb}
          alt=""
          className="w-full h-full object-cover rounded-lg"
          draggable={false}
          onError={() => setImgFailed(true)}
        />
      ) : video ? (
        // Fallback: primer fotograma del vídeo (cuando el póster .jpg no existe)
        <video
          src={`${video}#t=0.1`}
          muted
          playsInline
          preload="auto"
          className="w-full h-full object-cover rounded-lg"
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900" />
      )}

      {/* Overlay oscuro */}
      <div className="absolute inset-0 bg-black/20 pointer-events-none z-10" />

      {/* Contador de votos - píldora abajo-izquierda */}
      {totalVotes > 0 && (
        <div className="absolute bottom-1 left-1 flex items-center gap-1 bg-black/55 backdrop-blur-sm px-1.5 py-[2px] rounded-full text-white text-[11px] font-normal pointer-events-none z-30">
          <VoteIcon className="w-3.5 h-3.5" strokeWidth={150} filled={false} />
          <span>{formatNumber(totalVotes)}</span>
        </div>
      )}
    </button>
  )
}

// Visor de publicaciones: feed vertical deslizable con TODAS las publicaciones
// del perfil (mismas tarjetas y colores del feed). Arranca en la que se tocó.
const PostViewer = ({ posts, startId, onClose, onChallenge, onOpenProfile }) => {
  const containerRef = useRef(null)
  const startIndex = Math.max(0, posts.findIndex((p) => p.id === startId))
  const [activeIndex, setActiveIndex] = useState(startIndex)

  // Gesto "tirar para volver" (estilo TikTok): al deslizar hacia abajo estando
  // arriba del todo se cierra el visor y se vuelve al perfil.
  const startYRef = useRef(0)
  const atTopRef = useRef(false)
  const dragYRef = useRef(0)
  const [dragY, setDragY] = useState(0)

  const onTouchStart = (e) => {
    startYRef.current = e.touches[0]?.clientY || 0
    atTopRef.current = (containerRef.current?.scrollTop || 0) <= 0
  }
  const onTouchMove = (e) => {
    if (!atTopRef.current) return
    const dy = (e.touches[0]?.clientY || 0) - startYRef.current
    if (dy > 0) {
      const v = Math.min(dy, 260)
      dragYRef.current = v
      setDragY(v)
    }
  }
  const onTouchEnd = () => {
    if (dragYRef.current > 110) { onClose?.() }
    dragYRef.current = 0
    setDragY(0)
  }

  // Posicionar el scroll en la publicación tocada al abrir.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const target = el.querySelector(`[data-vindex="${startIndex}"]`)
    if (target) target.scrollIntoView({ block: 'start' })
  }, [startIndex])

  // Detectar la tarjeta activa según el scroll (snap nativo).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const idx = Number(e.target.getAttribute('data-vindex'))
            if (!Number.isNaN(idx)) setActiveIndex(idx)
          }
        })
      },
      { root: el, threshold: 0.6 }
    )
    el.querySelectorAll('[data-vindex]').forEach((s) => obs.observe(s))
    return () => obs.disconnect()
  }, [posts])

  if (!posts || posts.length === 0) return null

  return (
    <div className="fixed inset-0 z-[70] bg-black">
      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="absolute inset-0 h-[100dvh] w-full overflow-y-auto snap-y snap-mandatory no-scrollbar overscroll-y-contain"
      >
        <div
          style={{
            transform: dragY ? `translateY(${dragY}px)` : undefined,
            transition: dragY ? 'none' : 'transform 0.25s ease',
          }}
        >
          {posts.map((post, i) => {
            const inWindow = Math.abs(i - activeIndex) <= 1
            const Slide = post?.type === 'duet' ? DuetSlide : CarouselSlide
            const poster = post?.thumbnailUrl || post?.posterUrl || post?.sideA?.posterUrl || ''
            return (
              <section
                key={post.id}
                data-vindex={i}
                className="h-[100dvh] w-full snap-start snap-always relative"
              >
                {inWindow ? (
                  <Slide
                    post={post}
                    isActive={i === activeIndex}
                    isNear={inWindow}
                    isAdjacent={inWindow}
                    warm={false}
                    muted={true}
                    playbackEnabled={true}
                    infoBottom
                    onRequestNext={() => {}}
                    onChallenge={onChallenge}
                    onOpenProfile={onOpenProfile}
                  />
                ) : poster ? (
                  <img src={poster} alt="" aria-hidden draggable={false} className="absolute inset-0 w-full h-full object-cover" />
                ) : null}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const TABS = [
  { 
    key: 'polls', 
    icon: (active) => <ColumnsIcon className={`w-[18px] h-[18px] transition-transform duration-200 ${active ? 'scale-105' : 'scale-100'}`} />
  },
  { 
    key: 'saved', 
    icon: (active) => <Bookmark className={`w-[18px] h-[18px] transition-transform duration-200 ${active ? 'fill-current scale-105' : 'scale-100'}`} strokeWidth={active ? 1.8 : 1.5} />
  },
]

export default function ProfilePage({ open, onClose, onOpenUpload, onChallenge, onRequireAuth, onOpenProfile, username = null }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null) // { user, posts } del endpoint
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('polls')
  const [following, setFollowing] = useState(false) // ¿sigo a este usuario? (persistente)
  const [followers, setFollowers] = useState(null)  // contador real de followers
  const [followBusy, setFollowBusy] = useState(false)
  const [openPost, setOpenPost] = useState(null) // publicación abierta en el visor

  // ¿Es mi propio perfil? (sin username, o coincide con el usuario autenticado)
  const isOwn = !username || username === user?.username

  // Usuario objetivo: el ajeno (username) o el mío.
  const targetUsername = username || user?.username

  // Perfil a mostrar: datos del endpoint (perfil ajeno/propio) con respaldo en
  // el usuario autenticado para mi propio perfil mientras carga.
  const src = profile?.user || (isOwn ? user : null)
  const me = {
    username: src?.username || 'usuario',
    name: src?.name || src?.username || 'Usuario',
    handle: src?.username ? `@${src.username}` : '@usuario',
    avatarUrl: src?.avatarUrl || '',
    followers: followers != null ? followers : (src?.followers || 0),
    following: src?.following || 0,
  }

  useEffect(() => {
    if (!open || !targetUsername) return
    let cancelled = false
    setLoading(true)
    setActiveTab('polls')
    setFollowing(false)
    setFollowers(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(targetUsername)}`, { cache: 'no-store' })
        const data = await res.json()
        if (!cancelled) {
          setProfile(data || null)
          setPosts(data?.posts || [])
          setFollowing(!!data?.user?.isFollowing)
          setFollowers(typeof data?.user?.followers === 'number' ? data.user.followers : 0)
        }
      } catch {
        if (!cancelled) { setProfile(null); setPosts([]) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, targetUsername])

  // Seguir / dejar de seguir (persistente en backend). Optimista con rollback.
  const handleToggleFollow = async () => {
    if (!user) { onRequireAuth?.(); return }
    if (followBusy) return
    const prevFollowing = following
    const prevFollowers = followers
    setFollowBusy(true)
    setFollowing(!prevFollowing)
    setFollowers((c) => (c == null ? c : Math.max(0, c + (prevFollowing ? -1 : 1))))
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(targetUsername)}/follow`, {
        method: 'POST',
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('follow_failed')
      const data = await res.json()
      setFollowing(!!data.following)
      if (typeof data.followers === 'number') setFollowers(data.followers)
    } catch {
      setFollowing(prevFollowing)
      setFollowers(prevFollowers)
    } finally {
      setFollowBusy(false)
    }
  }

  // Retar a este usuario: reto "con mención" (sin vídeo del retado). Reutiliza
  // el flujo de ChallengeDialog (openChallenge) apuntando SOLO al autor; el
  // usuario retado subirá su vídeo de respuesta cuando acepte. NO se selecciona
  // ningún vídeo del perfil.
  const handleChallenge = () => {
    if (!user) { onRequireAuth?.(); return }
    const target = {
      videoUrl: '', // mención al usuario -> sin vídeo concreto
      author: { username: me.username, name: me.name, avatarUrl: me.avatarUrl },
      description: '',
      music: '',
    }
    onChallenge?.(target)
  }

  // Publicaciones del perfil (ya vienen filtradas por el endpoint).
  const myPosts = posts

  const stats = useMemo(() => {
    const votos = myPosts.reduce((acc, p) => acc + (p?.votes?.a || 0) + (p?.votes?.b || 0), 0)
    const retos = myPosts.filter((p) => p?.type === 'versus').length
    return { votos, retos }
  }, [myPosts])

  if (!open) return null

  const renderTabContent = () => {
    if (activeTab === 'polls') {
      if (loading) {
        return (
          <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-[#E4C79B] animate-spin" />
          </div>
        )
      }
      if (myPosts.length === 0) {
        return (
          <div className="text-center py-16 space-y-4 px-4">
            <div className="w-16 h-16 bg-white/[0.04] border border-white/10 rounded-full flex items-center justify-center mx-auto">
              <ColumnsIcon className="w-7 h-7 text-zinc-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">Aún no hay publicaciones</h3>
              <p className="text-zinc-500 text-sm">{isOwn ? 'Empieza a crear contenido' : 'Este usuario aún no ha publicado'}</p>
            </div>
          </div>
        )
      }
      return (
        <div className="grid grid-cols-3 gap-1">
          {myPosts.map((p) => <GridItem key={p.id} post={p} onOpen={setOpenPost} />)}
        </div>
      )
    }

    const emptyMap = {
      saved: { Icon: Bookmark, title: 'No hay guardados', desc: 'Guarda vídeos para verlos luego' },
    }
    const e = emptyMap[activeTab]
    return (
      <div className="text-center py-16 space-y-4 px-4">
        <div className="w-16 h-16 bg-white/[0.04] border border-white/10 rounded-full flex items-center justify-center mx-auto text-zinc-500">
          <e.Icon className="w-7 h-7" strokeWidth={1.5} />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-white">{e.title}</h3>
          <p className="text-zinc-500 text-sm">{e.desc}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-40 bg-[#0a0a0b] overflow-y-auto overscroll-contain">
      {/* Glow superior cálido (mismo tono dorado que la página de retos) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 z-0"
           style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(214,178,122,0.10), transparent 70%)' }} />

      {/* Header: atrás (perfil ajeno) o menú (perfil propio) */}
      <div className="sticky top-0 z-20 bg-[#0a0a0b]/70 backdrop-blur-xl border-b border-white/[0.06]"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}>
        <div className="flex items-center justify-between px-2 sm:px-4 h-14 max-w-md mx-auto w-full">
          {isOwn ? (
            <span className="w-9" />
          ) : (
            <button aria-label="atrás" onClick={onClose} className="p-2 -ml-1 text-white active:scale-90 transition">
              <ArrowLeft strokeWidth={1.9} className="w-[24px] h-[24px]" />
            </button>
          )}
          {!isOwn && (
            <span className="text-white font-semibold text-[15px] truncate max-w-[60%]">{me.username}</span>
          )}
          <button aria-label="menú" className="p-2 -mr-2 text-white active:scale-90 transition">
            <Menu strokeWidth={1.9} className="w-[24px] h-[24px]" />
          </button>
        </div>
      </div>

      {/* Cabecera del perfil: stats con iconos alrededor del avatar */}
      <div className="relative z-10 px-5 sm:px-6 pt-6 pb-5 max-w-md mx-auto w-full">
        <div className="relative mx-auto w-full max-w-[360px]">
          <div className="grid grid-cols-3 items-center gap-y-7">

            {/* Votos - superior izquierda */}
            <button className="flex items-center gap-2 text-left active:opacity-60 transition">
              <span className="shrink-0 flex items-center justify-center">
                <VoteIcon className="w-9 h-9 text-white" strokeWidth={220} filled={false} />
              </span>
              <span className="min-w-0">
                <p className="text-[17px] font-bold text-white leading-none tabular-nums">{formatNumber(stats.votos)}</p>
                <p className="text-[11px] text-zinc-400 mt-1 font-medium">Votos</p>
              </span>
            </button>
            <div />
            {/* Retos - superior derecha */}
            <button className="flex items-center gap-2 justify-end text-right active:opacity-60 transition">
              <span className="min-w-0 order-1">
                <p className="text-[17px] font-bold text-white leading-none tabular-nums">{formatNumber(stats.retos)}</p>
                <p className="text-[11px] text-zinc-400 mt-1 font-medium">Retos</p>
              </span>
              <span className="order-2 shrink-0 flex items-center justify-center">
                <Swords className="w-7 h-7 text-white" strokeWidth={1.2} />
              </span>
            </button>

            {/* Avatar - centro */}
            <div />
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-[104px] h-[104px] rounded-full p-[3px] bg-gradient-to-br from-white/15 to-white/[0.03] shadow-[0_8px_30px_-8px_rgba(0,0,0,0.6)]">
                  <div className="w-full h-full rounded-full overflow-hidden bg-zinc-900 ring-2 ring-white/10">
                    <Avatar src={me.avatarUrl} alt={me.username} className="w-full h-full rounded-full" />
                  </div>
                </div>
              </div>
            </div>
            <div />

            {/* Followers - inferior izquierda */}
            <button className="flex items-center gap-2 text-left active:opacity-60 transition">
              <span className="shrink-0 flex items-center justify-center">
                <Users className="w-7 h-7 text-white" strokeWidth={1.2} />
              </span>
              <span className="min-w-0">
                <p className="text-[17px] font-bold text-white leading-none tabular-nums">{formatNumber(me.followers)}</p>
                <p className="text-[11px] text-zinc-400 mt-1 font-medium">Followers</p>
              </span>
            </button>
            <div />
            {/* Following - inferior derecha */}
            <button className="flex items-center gap-2 justify-end text-right active:opacity-60 transition">
              <span className="min-w-0 order-1">
                <p className="text-[17px] font-bold text-white leading-none tabular-nums">{formatNumber(me.following)}</p>
                <p className="text-[11px] text-zinc-400 mt-1 font-medium">Following</p>
              </span>
              <span className="order-2 shrink-0 flex items-center justify-center">
                <UserPlus className="w-7 h-7 text-white" strokeWidth={1.2} />
              </span>
            </button>
          </div>
        </div>

        {/* Nombre + handle */}
        <div className="text-center mt-6 space-y-0.5">
          <h2 className="text-[20px] font-bold tracking-tight text-white leading-tight">{me.name}</h2>
          <p className="text-[13px] text-zinc-400 font-medium">{me.handle}</p>
        </div>

        {/* Botones de acción - propios vs ajenos */}
        <div className="mt-5 flex items-center justify-center gap-2">
          {isOwn ? (
            <>
              <button className="h-9 px-6 rounded-full bg-white hover:bg-zinc-100 text-black font-semibold text-[13px] tracking-tight active:scale-[0.97] transition-all">
                Editar perfil
              </button>
              <button className="h-9 px-6 rounded-full border border-white/15 hover:bg-white/[0.06] text-white font-semibold text-[13px] tracking-tight active:scale-[0.97] transition-all">
                Compartir
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleToggleFollow}
                disabled={followBusy}
                className={`h-9 px-7 rounded-full font-semibold text-[13px] tracking-tight active:scale-[0.97] transition-all disabled:opacity-60 ${
                  following
                    ? 'border border-white/15 text-white hover:bg-white/[0.06]'
                    : 'bg-white text-black hover:bg-zinc-100'
                }`}
              >
                {following ? 'Siguiendo' : 'Seguir'}
              </button>
              <button
                onClick={handleChallenge}
                className="h-9 px-6 rounded-full border border-white/15 hover:bg-white/[0.06] text-white font-semibold text-[13px] tracking-tight active:scale-[0.97] transition-all flex items-center gap-1.5"
              >
                <Swords className="w-[15px] h-[15px]" strokeWidth={2} />
                Retar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs - chips finos a lo ancho (activo solo marco blanco) */}
      <div className="relative z-10 max-w-md mx-auto w-full mt-7 px-2">
        <div className="flex items-center gap-2.5">
          {(isOwn ? TABS : TABS.filter((t) => t.key === 'polls')).map((tab) => {
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-label={tab.key}
                aria-selected={active}
                className={`
                  flex-1 flex items-center justify-center h-8 rounded-lg
                  transition-all duration-200 active:scale-95
                  ${active
                    ? 'bg-transparent border border-white text-white'
                    : 'bg-black border border-white/[0.07] text-zinc-400 hover:text-white hover:border-white/20'
                  }
                `}
              >
                {tab.icon(active)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Contenido */}
      <div className="relative z-10 mt-4 px-2 pb-28 max-w-md mx-auto w-full">
        {renderTabContent()}
      </div>

      {/* Visor de publicación */}
      {/* Visor de publicaciones (feed deslizable del perfil) */}
      {openPost && (
        <PostViewer
          posts={myPosts}
          startId={openPost.id}
          onClose={() => setOpenPost(null)}
          onChallenge={onChallenge}
          onOpenProfile={onOpenProfile}
        />
      )}
    </div>
  )
}
