'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Menu, Bookmark, Swords, Users, UserPlus, ArrowLeft, LogOut, Camera, Loader2, X, Pencil, ShieldAlert, LogIn, CircleUserRound, Activity } from 'lucide-react'
import VoteIcon from './icons/VoteIcon'
import ShareIcon from './icons/ShareIcon'
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

// Icono de cuadrícula (6 rectángulos con bordes redondeados: 3 por fila, 2 filas)
// usado en la pestaña de publicaciones y en el estado vacío.
const ColumnsIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3.8" y="4.35" width="4.6" height="7" rx="1.2" />
    <rect x="9.7" y="4.35" width="4.6" height="7" rx="1.2" />
    <rect x="15.6" y="4.35" width="4.6" height="7" rx="1.2" />
    <rect x="3.8" y="12.65" width="4.6" height="7" rx="1.2" />
    <rect x="9.7" y="12.65" width="4.6" height="7" rx="1.2" />
    <rect x="15.6" y="12.65" width="4.6" height="7" rx="1.2" />
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
  // Igual que en el feed de inicio: arranca muteado (autoplay con sonido no
  // permitido por los navegadores sin gesto del usuario) y se desactiva al
  // primer toque dentro del visor.
  const [muted, setMuted] = useState(true)

  // Gesto "deslizar desde la izquierda para volver" (estilo iOS): al arrastrar
  // hacia la derecha empezando desde el borde izquierdo se cierra el visor.
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const edgeRef = useRef(false)
  const dragXRef = useRef(0)
  const [dragX, setDragX] = useState(0)

  const onTouchStart = (e) => {
    const t = e.touches[0]
    if (!t) return
    startXRef.current = t.clientX
    startYRef.current = t.clientY
    edgeRef.current = t.clientX <= 32 // solo arranca desde el borde izquierdo
  }
  const onTouchMove = (e) => {
    if (!edgeRef.current) return
    const t = e.touches[0]
    if (!t) return
    const dx = t.clientX - startXRef.current
    if (dx > 0) {
      const v = Math.min(dx, 320)
      dragXRef.current = v
      setDragX(v)
    }
  }
  const onTouchEnd = () => {
    if (dragXRef.current > 90) { onClose?.() }
    dragXRef.current = 0
    setDragX(0)
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
    <div
      className="fixed inset-0 z-[70] bg-black"
      onPointerDown={muted ? () => setMuted(false) : undefined}
    >
      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="absolute inset-0 h-[100dvh] w-full overflow-y-auto snap-y snap-mandatory no-scrollbar overscroll-y-contain"
      >
        <div
          style={{
            transform: dragX ? `translateX(${dragX}px)` : undefined,
            transition: dragX ? 'none' : 'transform 0.25s ease',
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
                    muted={muted}
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

export default function ProfilePage({ open, onClose, onOpenUpload, onChallenge, onRequireAuth, onRequireLogin, onOpenProfile, username = null }) {
  const { user, updateUser, logout } = useAuth()
  const [profile, setProfile] = useState(null) // { user, posts } del endpoint
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('polls')
  const [following, setFollowing] = useState(false) // ¿sigo a este usuario? (persistente)
  const [followers, setFollowers] = useState(null)  // contador real de followers
  const [followBusy, setFollowBusy] = useState(false)
  const [openPost, setOpenPost] = useState(null) // publicación abierta en el visor
  const [savedPosts, setSavedPosts] = useState([]) // publicaciones guardadas (pestaña 'saved')
  const [savedLoading, setSavedLoading] = useState(false)
  // Lista de followers/following: { type: 'followers'|'following', users: [], loading }
  const [followList, setFollowList] = useState(null)
  const [editOpen, setEditOpen] = useState(false)   // modal de editar perfil
  const [menuOpen, setMenuOpen] = useState(false)    // menú (cerrar sesión)
  const [guestMenuOpen, setGuestMenuOpen] = useState(false) // menú lateral para invitados

  // ── Cabecera colapsable estilo TikTok ──────────────────────────────────────
  // collapseProgress: 0 (expandida) -> 1 (colapsada). collapseDistRef = distancia
  // de scroll necesaria para fijar las pestañas (cabecera totalmente colapsada).
  const scrollRef = useRef(null)
  const headerRef = useRef(null)
  const barRef = useRef(null)
  const tabsRef = useRef(null)
  const collapseDistRef = useRef(280)
  const [collapseProgress, setCollapseProgress] = useState(0)
  // Altura mínima del contenido: rellena SOLO el área visible bajo las pestañas
  // fijadas. Así, con POCAS publicaciones el scroll se limita justo a colapsar
  // (las publicaciones quedan bajo las pestañas, sin desaparecer detrás del
  // header/pestañas). Con MUCHAS publicaciones esta altura mínima se ignora
  // (scroll natural y las publicaciones pasan por detrás, que es lo deseado).
  const [contentMinH, setContentMinH] = useState(undefined)

  const measureCollapse = () => {
    const scroller = scrollRef.current
    const bar = barRef.current
    const tabs = tabsRef.current
    if (!scroller || !bar || !tabs) return
    const barH = bar.offsetHeight
    const tabsH = tabs.offsetHeight
    collapseDistRef.current = Math.max(1, tabs.offsetTop - barH)
    setContentMinH(Math.max(0, scroller.clientHeight - barH - tabsH - 16))
  }

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const p = Math.min(1, Math.max(0, el.scrollTop / collapseDistRef.current))
    setCollapseProgress(p)
  }

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
    bio: src?.bio || '',
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
    setCollapseProgress(0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
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

  // Al eliminar una publicación (desde el menú de "tres puntos" del visor),
  // se emite el evento global 'twyk:postDeleted'. Aquí la quitamos del listado
  // del perfil y de guardados, y cerramos el visor si era la abierta.
  useEffect(() => {
    const onDeleted = (e) => {
      const id = e?.detail?.postId
      if (!id) return
      setPosts((prev) => prev.filter((p) => p.id !== id))
      setSavedPosts((prev) => prev.filter((p) => p.id !== id))
      setOpenPost((prev) => (prev && prev.id === id ? null : prev))
    }
    window.addEventListener('twyk:postDeleted', onDeleted)
    return () => window.removeEventListener('twyk:postDeleted', onDeleted)
  }, [])

  // Cargar publicaciones GUARDADAS al abrir la pestaña 'saved' (solo perfil propio).
  useEffect(() => {
    if (!open || activeTab !== 'saved' || !isOwn || !user) return
    let cancelled = false
    setSavedLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/saves', { cache: 'no-store' })
        const data = await res.json()
        if (!cancelled) setSavedPosts(data?.posts || [])
      } catch {
        if (!cancelled) setSavedPosts([])
      } finally {
        if (!cancelled) setSavedLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, activeTab, isOwn, user])

  // Medir distancia de colapso y altura mínima del contenido tras renderizar/
  // cambiar de pestaña/cargar datos, y al redimensionar la ventana.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(measureCollapse)
    const onResize = () => measureCollapse()
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', onResize) }
  }, [open, loading, posts, savedPosts, savedLoading, activeTab])

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

  // Compartir el perfil: usa la Web Share API si está disponible; si no, copia
  // el enlace del perfil al portapapeles.
  const handleShare = async () => {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    const url = `${base}/?u=${encodeURIComponent(me.username)}`
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: me.name || me.username, text: `${me.handle} en Twyk`, url })
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
      }
    } catch { /* cancelado / sin permiso: ignorar */ }
  }

  // Abrir la lista de followers / following del perfil mostrado.
  const openFollowList = async (type) => {
    if (!targetUsername) return
    setFollowList({ type, users: [], loading: true })
    try {
      const res = await fetch(
        `/api/users/${encodeURIComponent(targetUsername)}/${type}`,
        { cache: 'no-store' }
      )
      const data = await res.json()
      setFollowList({ type, users: data?.users || [], loading: false })
    } catch {
      setFollowList({ type, users: [], loading: false })
    }
  }

  // Tocar un usuario de la lista -> abrir su perfil.
  const handleOpenListUser = (uname) => {
    if (!uname) return
    setFollowList(null)
    onOpenProfile?.(uname)
  }

  // Tras guardar el perfil: refrescar estado local (cabecera) y contexto auth.
  const handleProfileUpdated = (updatedUser) => {
    if (!updatedUser) return
    setProfile((prev) => ({ ...(prev || {}), user: { ...(prev?.user || {}), ...updatedUser } }))
    updateUser?.(updatedUser)
    setEditOpen(false)
  }

  // Cerrar sesión: limpia la sesión y vuelve al feed.
  const handleLogout = async () => {
    setMenuOpen(false)
    try { await logout?.() } catch { /* ignore */ }
    onClose?.()
  }

  // Publicaciones del perfil (ya vienen filtradas por el endpoint).
  const myPosts = posts

  const stats = useMemo(() => {
    const votos = myPosts.reduce((acc, p) => acc + (p?.votes?.a || 0) + (p?.votes?.b || 0), 0)
    const retos = myPosts.filter((p) => p?.type === 'versus').length
    return { votos, retos }
  }, [myPosts])

  if (!open) return null

  // ── PERFIL DE INVITADO (no autenticado) ────────────────────────────────────
  // Cuando es "mi perfil" (sin username) pero no hay sesión, mostramos un estado
  // de "no has iniciado sesión" al estilo Twyk (tema oscuro + acento de marca).
  if (isOwn && !user) {
    return (
      <div className={`fixed inset-0 ${guestMenuOpen ? 'z-[90]' : 'z-40'} bg-[#0a0a0b] flex flex-col text-white`}>
        {/* Header: título "Perfil" centrado + menú */}
        <div className="sticky top-0 z-20 bg-[#0a0a0b]/70 backdrop-blur-xl"
             style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}>
          <div className="flex items-center justify-between px-2 sm:px-4 h-14 max-w-md mx-auto w-full">
            <span className="w-9" />
            <span className="text-white font-bold text-[18px] tracking-tight">Profile</span>
            <button
              aria-label="menu"
              onClick={() => setGuestMenuOpen(true)}
              className="p-2 -mr-2 text-white active:scale-90 transition"
            >
              <Menu strokeWidth={1.9} className="w-[24px] h-[24px]" />
            </button>
          </div>
        </div>

        {/* Contenido centrado */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 pb-24 -mt-6">
          <div className="w-[120px] h-[120px] rounded-full flex items-center justify-center mb-6">
            <CircleUserRound className="w-[112px] h-[112px] text-zinc-600" strokeWidth={1} />
          </div>

          <p className="text-zinc-300 text-[16px] font-medium mb-7 text-center">
            Log in to your Twyk account
          </p>

          <button
            onClick={() => (onRequireLogin || onRequireAuth)?.()}
            className="w-full max-w-[360px] h-[52px] rounded-full text-white font-bold text-[16px] tracking-tight flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-[0_10px_30px_-8px_rgba(168,85,247,0.6)]"
            style={{ background: 'linear-gradient(90deg, #A855F7 0%, #3B82F6 100%)' }}
          >
            <LogIn className="w-5 h-5" strokeWidth={2.2} />
            Log in
          </button>

          <p className="text-zinc-500 text-[13px] mt-5 text-center">
            Don&apos;t have an account?{' '}
            <button
              onClick={() => onRequireAuth?.()}
              className="text-white font-semibold underline-offset-2 hover:underline"
            >
              Sign up
            </button>
          </p>
        </div>

        {/* Menú lateral para invitados: acceso e información legal */}
        <GuestMenuDrawer
          open={guestMenuOpen}
          onClose={() => setGuestMenuOpen(false)}
          onLogin={() => { setGuestMenuOpen(false); (onRequireLogin || onRequireAuth)?.() }}
        />
      </div>
    )
  }

  const renderTabContent = () => {
    if (activeTab === 'polls') {
      if (loading) {
        return (
          <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white animate-spin" />
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
              <h3 className="text-base font-semibold text-white">No posts yet</h3>
              <p className="text-zinc-500 text-sm">{isOwn ? 'Start creating content' : "This user hasn't posted yet"}</p>
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

    if (activeTab === 'saved') {
      if (savedLoading) {
        return (
          <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white animate-spin" />
          </div>
        )
      }
      if (savedPosts.length === 0) {
        return (
          <div className="text-center py-16 space-y-4 px-4">
            <div className="w-16 h-16 bg-white/[0.04] border border-white/10 rounded-full flex items-center justify-center mx-auto text-zinc-500">
              <Bookmark className="w-7 h-7" strokeWidth={1.5} />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">No saved posts</h3>
              <p className="text-zinc-500 text-sm">Save videos to watch later</p>
            </div>
          </div>
        )
      }
      return (
        <div className="grid grid-cols-3 gap-1">
          {savedPosts.map((p) => <GridItem key={p.id} post={p} onOpen={setOpenPost} />)}
        </div>
      )
    }

    const emptyMap = {
      saved: { Icon: Bookmark, title: 'No saved posts', desc: 'Save videos to watch later' },
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

  // Progreso de revelado del mini-perfil en la barra (aparece pasado el 60%).
  const revealP = collapseProgress <= 0.6 ? 0 : Math.min(1, (collapseProgress - 0.6) / 0.4)

  return (
    <div ref={scrollRef} onScroll={handleScroll} className={`fixed inset-0 ${(menuOpen || editOpen || followList) ? 'z-[90]' : 'z-40'} bg-[#0a0a0b] overflow-y-auto overscroll-contain`}>
      {/* Sin resplandor: todo el perfil usa el mismo negro grisáceo sólido (#0a0a0b) que la barra del header al solaparse con el contenido al hacer scroll. */}

      {/* Header sticky: al colapsar (>60%) revela mini-perfil (avatar+usuario) y acción (Seguir/Edit) — estilo TikTok */}
      <div ref={barRef} className="sticky top-0 z-30 bg-[#0a0a0b]"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 6px)' }}>
        <div className="relative flex items-center px-2 sm:px-4 h-11 max-w-md mx-auto w-full">
          {/* Izquierda: atrás (perfil ajeno) o espaciador (propio) */}
          {isOwn ? (
            <span className="w-9 shrink-0" />
          ) : (
            <button aria-label="back" onClick={onClose} className="relative z-10 p-2 -ml-1 text-white active:scale-90 transition shrink-0">
              <ArrowLeft strokeWidth={1.9} className="w-[24px] h-[24px]" />
            </button>
          )}

          {/* Nombre de usuario: a la IZQUIERDA (nunca centrado), acotado para que si es
              largo se trunque ANTES de llegar al avatar centrado o a los botones de la
              derecha (nunca aparece por detrás de "Edit"/"Follow"/menú). */}
          <div
            className="flex items-center min-w-0 pl-2 pointer-events-none"
            style={{ opacity: revealP, maxWidth: 'calc(50% - 34px)' }}
          >
            <span className="text-white font-semibold text-[15px] truncate">{me.name}</span>
          </div>

          {/* Avatar: SIEMPRE centrado en la barra (posición absoluta, independiente
              de cuánto ocupe el nombre a la izquierda). */}
          <div
            className="absolute left-1/2 pointer-events-none"
            style={{ opacity: revealP, transform: `translateX(-50%) translateY(${(1 - revealP) * 8}px)` }}
          >
            <div className="w-7 h-7 rounded-full overflow-hidden bg-zinc-900 ring-1 ring-white/15 shrink-0">
              <Avatar src={me.avatarUrl} alt={me.username} className="w-full h-full rounded-full" />
            </div>
          </div>

          {/* Derecha: acción revelada (Seguir / Edit) + menú (propio) */}
          <div className="relative z-10 ml-auto flex items-center gap-2 shrink-0">
            {isOwn ? (
              <>
                <button
                  onClick={() => setEditOpen(true)}
                  style={{ opacity: revealP, pointerEvents: revealP > 0.5 ? 'auto' : 'none' }}
                  className="h-7 px-4 rounded-full bg-white text-black font-semibold text-[12px] tracking-tight active:scale-95 transition-transform"
                >
                  Edit
                </button>
                <button
                  onClick={handleShare}
                  aria-label="Share"
                  style={{ opacity: revealP, pointerEvents: revealP > 0.5 ? 'auto' : 'none' }}
                  className="h-7 w-7 rounded-full border border-white/20 text-white flex items-center justify-center active:scale-95 transition-transform"
                >
                  <ShareIcon className="w-[15px] h-[15px]" strokeWidth={1.4} />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleChallenge}
                  aria-label="Challenge"
                  style={{ opacity: revealP, pointerEvents: revealP > 0.5 ? 'auto' : 'none' }}
                  className="h-7 w-7 rounded-full border border-white/20 text-white flex items-center justify-center active:scale-95 transition-transform"
                >
                  <Swords className="w-[15px] h-[15px]" strokeWidth={2} />
                </button>
                <button
                  onClick={handleToggleFollow}
                  disabled={followBusy}
                  style={{ opacity: revealP, pointerEvents: revealP > 0.5 ? 'auto' : 'none' }}
                  className={`h-7 px-5 rounded-full font-semibold text-[12px] tracking-tight active:scale-95 transition-transform disabled:opacity-60 ${
                    following ? 'border border-white/20 text-white' : 'bg-white text-black'
                  }`}
                >
                  {following ? 'Following' : 'Follow'}
                </button>
              </>
            )}
            {isOwn && (
              <button
                aria-label="menu"
                onClick={() => setMenuOpen(true)}
                className="p-2 -mr-2 text-white active:scale-90 transition"
              >
                <Menu strokeWidth={1.9} className="w-[24px] h-[24px]" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Cabecera del perfil: stats con iconos alrededor del avatar (se desvanece al colapsar) */}
      <div
        ref={headerRef}
        className="relative z-10 px-5 sm:px-6 pt-6 pb-5 max-w-md mx-auto w-full"
        style={{
          opacity: 1 - collapseProgress,
          transform: `translateY(${-collapseProgress * 14}px) scale(${1 - collapseProgress * 0.04})`,
          transformOrigin: 'top center',
          pointerEvents: collapseProgress > 0.7 ? 'none' : 'auto',
        }}
      >
        <div className="relative mx-auto w-full max-w-[360px]">
          <div className="grid grid-cols-3 items-center gap-y-7">

            {/* Votos - superior izquierda */}
            <button className="flex items-center gap-2 text-left active:opacity-60 transition">
              <span className="shrink-0 flex items-center justify-center">
                <VoteIcon className="w-9 h-9 text-white" strokeWidth={220} filled={false} />
              </span>
              <span className="min-w-0">
                <p className="text-[17px] font-bold text-white leading-none tabular-nums">{formatNumber(stats.votos)}</p>
                <p className="text-[11px] text-zinc-400 mt-1 font-medium">Votes</p>
              </span>
            </button>
            <div />
            {/* Retos - superior derecha */}
            <button className="flex items-center gap-2 justify-end text-right active:opacity-60 transition">
              <span className="min-w-0 order-1">
                <p className="text-[17px] font-bold text-white leading-none tabular-nums">{formatNumber(stats.retos)}</p>
                <p className="text-[11px] text-zinc-400 mt-1 font-medium">Challenges</p>
              </span>
              <span className="order-2 shrink-0 flex items-center justify-center">
                <Swords className="w-7 h-7 text-white" strokeWidth={1.2} />
              </span>
            </button>

            {/* Avatar - centro */}
            <div />
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-[104px] h-[104px] rounded-full overflow-hidden bg-zinc-900 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.6)]">
                  <Avatar src={me.avatarUrl} alt={me.username} className="w-full h-full rounded-full" />
                </div>
              </div>
            </div>
            <div />

            {/* Followers - inferior izquierda */}
            <button onClick={() => openFollowList('followers')} className="flex items-center gap-2 text-left active:opacity-60 transition">
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
            <button onClick={() => openFollowList('following')} className="flex items-center gap-2 justify-end text-right active:opacity-60 transition">
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
          {me.bio && (
            <p className="text-[13px] text-zinc-300 leading-snug max-w-[300px] mx-auto pt-1.5 whitespace-pre-line">{me.bio}</p>
          )}
        </div>

        {/* Botones de acción - propios vs ajenos */}
        <div className="mt-5 flex items-center justify-center gap-2">
          {isOwn ? (
            <>
              <button onClick={() => setEditOpen(true)} className="h-9 px-6 rounded-full bg-white hover:bg-zinc-100 text-black font-semibold text-[13px] tracking-tight active:scale-[0.97] transition-all">
                Edit profile
              </button>
              <button onClick={handleShare} className="h-9 px-6 rounded-full border border-white/15 hover:bg-white/[0.06] text-white font-semibold text-[13px] tracking-tight active:scale-[0.97] transition-all">
                Share
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
                {following ? 'Following' : 'Follow'}
              </button>
              <button
                onClick={handleChallenge}
                className="h-9 px-6 rounded-full border border-white/15 hover:bg-white/[0.06] text-white font-semibold text-[13px] tracking-tight active:scale-[0.97] transition-all flex items-center gap-1.5"
              >
                <Swords className="w-[15px] h-[15px]" strokeWidth={2} />
                Challenge
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs - chips finos a lo ancho (sticky bajo la barra al colapsar) */}
      <div
        ref={tabsRef}
        className="sticky z-[15] bg-[#0a0a0b] max-w-md mx-auto w-full mt-7 px-2 pt-1 pb-2.5"
        style={{ top: 'calc(max(env(safe-area-inset-top), 8px) + 56px)' }}
      >
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

      {/* Contenido (min-height medido = área visible bajo las pestañas fijadas: limita el scroll a lo justo para colapsar; con pocas/0 publicaciones no quedan detrás del header/pestañas) */}
      <div className="relative z-10 mt-4 px-2 pb-28 max-w-md mx-auto w-full" style={{ minHeight: contentMinH != null ? `${contentMinH}px` : undefined }}>
        {renderTabContent()}
      </div>

      {/* Visor de publicación */}
      {/* Visor de publicaciones (feed deslizable del perfil) */}
      {openPost && (
        <PostViewer
          posts={activeTab === 'saved' ? savedPosts : myPosts}
          startId={openPost.id}
          onClose={() => setOpenPost(null)}
          onChallenge={onChallenge}
          onOpenProfile={onOpenProfile}
        />
      )}

      {/* Lista de followers / following */}
      {followList && (
        <FollowListModal
          type={followList.type}
          users={followList.users}
          loading={followList.loading}
          onClose={() => setFollowList(null)}
          onOpenUser={handleOpenListUser}
          onSwitch={openFollowList}
        />
      )}

      {/* Edit profile (solo perfil propio) */}
      {editOpen && isOwn && (
        <EditProfileModal
          initial={{ name: me.name, bio: me.bio, avatarUrl: me.avatarUrl }}
          onClose={() => setEditOpen(false)}
          onSaved={handleProfileUpdated}
        />
      )}

      {/* Menú / Ajustes: drawer lateral que entra de derecha a izquierda */}
      {isOwn && (
        <SettingsDrawer
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onEdit={() => { setMenuOpen(false); setEditOpen(true) }}
          onLogout={handleLogout}
          isAdmin={user?.role === 'admin'}
        />
      )}
    </div>
  )
}

// Drawer lateral para INVITADOS: acceso a iniciar sesión y enlaces legales.
// Mismo patrón visual que SettingsDrawer (se desliza desde la derecha).
const GuestMenuDrawer = ({ open, onClose, onLogin }) => {
  return (
    <div className={`fixed inset-0 z-[85] ${open ? '' : 'pointer-events-none'}`}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        className={`absolute top-0 right-0 h-full w-[82%] max-w-sm bg-[#121214] border-l border-white/[0.08] shadow-2xl flex flex-col text-white transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="border-b border-white/[0.06]" style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}>
          <div className="flex items-center px-3 h-14 w-full">
            <button aria-label="close" onClick={onClose} className="p-2 -ml-1 text-white active:scale-90 transition">
              <X strokeWidth={1.9} className="w-[22px] h-[22px]" />
            </button>
            <span className="text-white font-semibold text-[15px] ml-1">Menu</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          <button
            onClick={onLogin}
            className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl text-white font-bold text-[15px] active:scale-[0.98] transition"
            style={{ background: 'linear-gradient(90deg, #A855F7 0%, #3B82F6 100%)' }}
          >
            <LogIn className="w-[18px] h-[18px]" strokeWidth={2.1} />
            Log in
          </button>

          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] divide-y divide-white/[0.06] overflow-hidden">
            <a href="/terms" className="w-full flex items-center px-4 py-4 text-white hover:bg-white/5 active:bg-white/10 transition text-[15px] font-medium">
              Terms of Use
            </a>
            <a href="/privacy" className="w-full flex items-center px-4 py-4 text-white hover:bg-white/5 active:bg-white/10 transition text-[15px] font-medium">
              Privacy Policy
            </a>
            <a href="/dmca" className="w-full flex items-center px-4 py-4 text-white hover:bg-white/5 active:bg-white/10 transition text-[15px] font-medium">
              DMCA Policy
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

// Drawer de ajustes que se desliza desde el borde derecho (estilo panel lateral).
// Permanece montado para poder animar la entrada y la salida con translateX.
const SettingsDrawer = ({ open, onClose, onEdit, onLogout, isAdmin }) => {
  return (
    <div className={`fixed inset-0 z-[85] ${open ? '' : 'pointer-events-none'}`}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {/* Panel lateral derecho */}
      <div
        className={`absolute top-0 right-0 h-full w-[82%] max-w-sm bg-[#0a0a0b] border-l border-white/[0.08] shadow-2xl flex flex-col text-white transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="border-b border-white/[0.06]" style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}>
          <div className="flex items-center px-3 h-14 w-full">
            <button aria-label="close" onClick={onClose} className="p-2 -ml-1 text-white active:scale-90 transition">
              <X strokeWidth={1.9} className="w-[22px] h-[22px]" />
            </button>
            <span className="text-white font-semibold text-[15px] ml-1">Settings</span>
          </div>
        </div>

        {/* Opciones */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] divide-y divide-white/[0.06] overflow-hidden">
            {isAdmin && (
              <a
                href="/admin/reports"
                className="w-full flex items-center gap-3 px-4 py-4 text-amber-300 hover:bg-amber-500/10 active:bg-amber-500/15 transition text-[15px] font-medium"
              >
                <ShieldAlert className="w-[19px] h-[19px]" strokeWidth={1.8} />
                Moderation panel
              </a>
            )}
            {isAdmin && (
              <a
                href="/admin/reco"
                className="w-full flex items-center gap-3 px-4 py-4 text-cyan-300 hover:bg-cyan-500/10 active:bg-cyan-500/15 transition text-[15px] font-medium"
              >
                <Activity className="w-[19px] h-[19px]" strokeWidth={1.8} />
                Engine dashboard
              </a>
            )}
            <button
              onClick={onEdit}
              className="w-full flex items-center gap-3 px-4 py-4 text-white hover:bg-white/5 active:bg-white/10 transition text-[15px] font-medium"
            >
              <Pencil className="w-[19px] h-[19px]" strokeWidth={1.8} />
              Edit profile
            </button>
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-4 text-red-400 hover:bg-red-500/10 active:bg-red-500/15 transition text-[15px] font-medium"
            >
              <LogOut className="w-[19px] h-[19px]" strokeWidth={1.8} />
              Log out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Modal a pantalla completa con la lista de followers o seguidos. Cada fila
// es tocable y abre el perfil del usuario correspondiente.
const FollowListModal = ({ type, users, loading, onClose, onOpenUser, onSwitch }) => {
  return (
    <div className="fixed inset-0 z-[80] bg-[#0a0a0b] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0a0a0b]/80 backdrop-blur-xl border-b border-white/[0.06]"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}>
        <div className="flex items-center justify-between px-2 sm:px-4 h-14 max-w-md mx-auto w-full">
          <button aria-label="close" onClick={onClose} className="p-2 -ml-1 text-white active:scale-90 transition">
            <ArrowLeft strokeWidth={1.9} className="w-[24px] h-[24px]" />
          </button>
          {/* Conmutador Followers / Following */}
          <div className="flex items-center gap-1 bg-white/[0.06] rounded-full p-0.5">
            <button
              onClick={() => type !== 'followers' && onSwitch?.('followers')}
              className={`px-4 h-8 rounded-full text-[13px] font-semibold tracking-tight transition-all ${
                type === 'followers' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'
              }`}
            >
              Followers
            </button>
            <button
              onClick={() => type !== 'following' && onSwitch?.('following')}
              className={`px-4 h-8 rounded-full text-[13px] font-semibold tracking-tight transition-all ${
                type === 'following' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'
              }`}
            >
              Following
            </button>
          </div>
          <span className="w-9" />
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto overscroll-contain max-w-md mx-auto w-full px-2 py-2">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-white animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 space-y-4 px-4">
            <div className="w-16 h-16 bg-white/[0.04] border border-white/10 rounded-full flex items-center justify-center mx-auto text-zinc-500">
              <Users className="w-7 h-7" strokeWidth={1.5} />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">
                {type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
              </h3>
              <p className="text-zinc-500 text-sm">
                {type === 'followers' ? 'When someone follows them it will appear here' : 'The users they follow will appear here'}
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {users.map((u) => (
              <li key={u.username}>
                <button
                  type="button"
                  onClick={() => onOpenUser(u.username)}
                  className="w-full flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-white/[0.04] active:bg-white/[0.06] transition text-left"
                >
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-zinc-900 ring-1 ring-white/10 shrink-0">
                    <Avatar src={u.avatarUrl} alt={u.username} className="w-full h-full rounded-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold text-[14px] leading-tight truncate">{u.name || u.username}</p>
                    <p className="text-zinc-400 text-[12px] leading-tight truncate">@{u.username}</p>
                  </div>
                  {u.isFollowing && (
                    <span className="shrink-0 text-[11px] text-zinc-400 border border-white/15 rounded-full px-2.5 py-1">
                      Following
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}


// Modal para editar el perfil propio: avatar (subida de imagen), nombre y bio.
const EditProfileModal = ({ initial, onClose, onSaved }) => {
  const [name, setName] = useState(initial?.name || '')
  const [bio, setBio] = useState(initial?.bio || '')
  const [avatarUrl, setAvatarUrl] = useState(initial?.avatarUrl || '')
  const [avatarFile, setAvatarFile] = useState(null)
  const [preview, setPreview] = useState(initial?.avatarUrl || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const onPickFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { setError('The file must be an image'); return }
    if (f.size > 6 * 1024 * 1024) { setError('The image exceeds the 6MB limit'); return }
    setError('')
    setAvatarFile(f)
    const url = URL.createObjectURL(f)
    setPreview(url)
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('name', name)
      fd.append('bio', bio)
      if (avatarFile) fd.append('avatar', avatarFile)
      const token = (typeof window !== 'undefined' && localStorage.getItem('twyk_token')) || ''
      const res = await fetch('/api/profile', {
        method: 'POST',
        body: fd,
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error('save_failed')
      const data = await res.json()
      onSaved?.(data?.user || { name, bio, avatarUrl })
    } catch {
      setError("Couldn't save. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[82] bg-[#0a0a0b] flex flex-col text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0a0a0b]/80 backdrop-blur-xl border-b border-white/[0.06]"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}>
        <div className="flex items-center justify-between px-2 sm:px-4 h-14 max-w-md mx-auto w-full">
          <button aria-label="cancel" onClick={onClose} className="p-2 -ml-1 text-white active:scale-90 transition">
            <X strokeWidth={1.9} className="w-[22px] h-[22px]" />
          </button>
          <span className="text-white font-semibold text-[15px]">Edit profile</span>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-[14px] font-semibold text-[#0a0a0b] bg-white rounded-full px-4 h-8 disabled:opacity-60 active:scale-95 transition flex items-center gap-1.5"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="flex-1 overflow-y-auto max-w-md mx-auto w-full px-5 py-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative w-[104px] h-[104px] rounded-full overflow-hidden bg-zinc-900 ring-2 ring-white/10 active:scale-95 transition"
          >
            <Avatar src={preview} alt={name} className="w-full h-full rounded-full" />
            <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Camera className="w-6 h-6 text-white" strokeWidth={1.8} />
            </span>
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="text-[13px] font-semibold text-white/90 hover:text-white">
            Change photo
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
        </div>

        {/* Nombre */}
        <div className="mt-7 space-y-1.5">
          <label className="text-[12px] font-medium text-zinc-400 px-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Your name"
            className="w-full h-11 rounded-xl bg-white/[0.05] border border-white/10 px-4 text-[15px] text-white placeholder:text-zinc-500 outline-none focus:border-white/30 transition"
          />
        </div>

        {/* Bio */}
        <div className="mt-5 space-y-1.5">
          <label className="text-[12px] font-medium text-zinc-400 px-1">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={300}
            rows={4}
            placeholder="Tell the world who you are"
            className="w-full rounded-xl bg-white/[0.05] border border-white/10 px-4 py-3 text-[15px] text-white placeholder:text-zinc-500 outline-none focus:border-white/30 transition resize-none"
          />
          <p className="text-[11px] text-zinc-500 text-right px-1">{bio.length}/300</p>
        </div>

        {error && <p className="mt-4 text-[13px] text-red-400 text-center">{error}</p>}
      </div>
    </div>
  )
}
