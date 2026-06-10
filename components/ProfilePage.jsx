'use client'
/* eslint-disable react-hooks/set-state-in-effect -- setState dentro de fetch async en efecto de carga; falso positivo de la regla experimental. */

import { useEffect, useMemo, useState } from 'react'
import { Menu, Bookmark, Link as LinkIcon, Swords, Users, UserPlus } from 'lucide-react'
import VoteIcon from './icons/VoteIcon'

const ME = {
  username: 'nexus',
  name: 'nexus',
  handle: '@nexus',
  avatarUrl: '',
}

// Avatar por defecto: círculo gris claro con silueta de persona (gris medio),
// idéntico al de la imagen de referencia (cabeza + busto que rellenan el círculo).
const DefaultAvatar = ({ className = '' }) => (
  <div className={`rounded-full bg-gray-200 overflow-hidden ${className}`}>
    <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
      <circle cx="50" cy="40" r="16" fill="#9ca3af" />
      <path d="M16 100C16 75 31 62 50 62s34 13 34 38z" fill="#9ca3af" />
    </svg>
  </div>
)

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

const GridItem = ({ post }) => {
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
    <div className="group relative aspect-[9/16] overflow-hidden rounded-lg bg-white/[0.04] border border-white/5">
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
          <VoteIcon className="w-3 h-3" strokeWidth={150} filled={false} />
          <span>{formatNumber(totalVotes)}</span>
        </div>
      )}
    </div>
  )
}

const TABS = [
  { key: 'polls', icon: () => <ColumnsIcon className="w-4 h-4" /> },
  { key: 'saved', icon: () => <Bookmark className="w-4 h-4" strokeWidth={1.5} /> },
  { key: 'links', icon: () => <LinkIcon className="w-4 h-4" strokeWidth={1.5} /> },
]

export default function ProfilePage({ open, onClose, onOpenUpload }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('polls')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/uploads', { cache: 'no-store' })
        const data = await res.json()
        if (!cancelled) setPosts(data.posts || [])
      } catch {
        if (!cancelled) setPosts([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open])

  const stats = useMemo(() => {
    const votos = posts.reduce((acc, p) => acc + (p?.votes?.a || 0) + (p?.votes?.b || 0), 0)
    const retos = posts.filter((p) => p?.type === 'versus').length
    return { votos, retos }
  }, [posts])

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
      if (posts.length === 0) {
        return (
          <div className="text-center py-16 space-y-4 px-4">
            <div className="w-16 h-16 bg-white/[0.04] border border-white/10 rounded-full flex items-center justify-center mx-auto">
              <ColumnsIcon className="w-7 h-7 text-zinc-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-white">Aún no hay publicaciones</h3>
              <p className="text-zinc-500 text-sm">Empieza a crear contenido</p>
            </div>
          </div>
        )
      }
      return (
        <div className="grid grid-cols-3 gap-1">
          {posts.map((p) => <GridItem key={p.id} post={p} />)}
        </div>
      )
    }

    const emptyMap = {
      saved: { Icon: Bookmark, title: 'No hay guardados', desc: 'Guarda vídeos para verlos luego' },
      links: { Icon: LinkIcon, title: 'No hay enlaces', desc: 'Añade tus enlaces aquí' },
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

      {/* Header minimalista: solo menú */}
      <div className="sticky top-0 z-20 bg-[#0a0a0b]/70 backdrop-blur-xl border-b border-white/[0.06]"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}>
        <div className="flex items-center justify-end px-4 sm:px-6 h-14 max-w-md mx-auto w-full">
          <button aria-label="menú" className="p-2 -mr-1 text-zinc-300 active:scale-90 transition">
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
                    {ME.avatarUrl ? (
                      <img src={ME.avatarUrl} alt={ME.username} className="w-full h-full rounded-full object-cover" draggable={false} />
                    ) : (
                      <DefaultAvatar className="w-full h-full" />
                    )}
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
                <p className="text-[17px] font-bold text-white leading-none tabular-nums">0</p>
                <p className="text-[11px] text-zinc-400 mt-1 font-medium">Followers</p>
              </span>
            </button>
            <div />
            {/* Following - inferior derecha */}
            <button className="flex items-center gap-2 justify-end text-right active:opacity-60 transition">
              <span className="min-w-0 order-1">
                <p className="text-[17px] font-bold text-white leading-none tabular-nums">0</p>
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
          <h2 className="text-[20px] font-bold tracking-tight text-white leading-tight">{ME.name}</h2>
          <p className="text-[13px] text-zinc-400 font-medium">{ME.handle}</p>
        </div>

        {/* Botones de acción - compactos y limpios */}
        <div className="mt-5 flex items-center justify-center gap-2">
          <button className="h-9 px-6 rounded-full bg-white hover:bg-zinc-100 text-black font-semibold text-[13px] tracking-tight active:scale-[0.97] transition-all">
            Editar perfil
          </button>
          <button className="h-9 px-6 rounded-full border border-white/15 hover:bg-white/[0.06] text-white font-semibold text-[13px] tracking-tight active:scale-[0.97] transition-all">
            Compartir
          </button>
        </div>
      </div>

      {/* Tabs - diseño píldora (tema oscuro) */}
      <div className="relative z-10 px-3 sm:px-4 max-w-md mx-auto w-full">
        <div className="grid grid-cols-3 w-full bg-white/[0.06] border border-white/10 rounded-2xl p-1">
          {TABS.map((tab) => {
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-label={tab.key}
                className={`rounded-xl py-3 text-sm font-medium flex items-center justify-center transition-all ${
                  active ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                }`}
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
    </div>
  )
}
