'use client'
/* eslint-disable react-hooks/set-state-in-effect -- setState dentro de fetch async en efecto de carga; falso positivo de la regla experimental. */

import { useEffect, useMemo, useState } from 'react'
import { Menu, Bookmark, Link as LinkIcon, Plus } from 'lucide-react'
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

const GridItem = ({ post }) => {
  const thumb = thumbFor(post)
  const totalVotes = (post?.votes?.a || 0) + (post?.votes?.b || 0)
  return (
    <div className="group relative aspect-[9/16] overflow-hidden rounded-lg bg-gray-100">
      {thumb ? (
        <img src={thumb} alt="" className="w-full h-full object-cover rounded-lg" draggable={false} />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900" />
      )}
      {/* Overlay oscuro */}
      <div className="absolute inset-0 bg-black/20 pointer-events-none z-10" />
      {/* Contador de votos - píldora abajo-izquierda */}
      {totalVotes > 0 && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-full text-white text-xs font-medium pointer-events-none z-30">
          <VoteIcon className="w-3 h-3" strokeWidth={260} filled />
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
            <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-fuchsia-500 animate-spin" />
          </div>
        )
      }
      if (posts.length === 0) {
        return (
          <div className="text-center py-16 space-y-4 px-4">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto shadow-sm">
              <ColumnsIcon className="w-7 h-7 text-gray-400" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-gray-900">No posts yet</h3>
              <p className="text-gray-400 text-sm">Start creating content</p>
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
      saved: { Icon: Bookmark, title: 'No saved posts', desc: 'Save videos to watch later' },
      links: { Icon: LinkIcon, title: 'No links yet', desc: 'Add your social links here' },
    }
    const e = emptyMap[activeTab]
    return (
      <div className="text-center py-16 space-y-4 px-4">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto shadow-sm text-gray-400">
          <e.Icon className="w-7 h-7" strokeWidth={1.5} />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-gray-900">{e.title}</h3>
          <p className="text-gray-400 text-sm">{e.desc}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-40 bg-white overflow-y-auto overscroll-contain">
      {/* Header minimalista: solo menú */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-gray-100/80"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 8px)' }}>
        <div className="flex items-center justify-end px-4 sm:px-6 h-14 max-w-md mx-auto w-full">
          <button aria-label="menú" className="p-2 -mr-1 text-gray-700 active:scale-90 transition">
            <Menu strokeWidth={1.9} className="w-[24px] h-[24px]" />
          </button>
        </div>
      </div>

      {/* Cabecera del perfil: stats alrededor del avatar */}
      <div className="px-5 sm:px-6 pt-6 pb-5 max-w-md mx-auto w-full">
        <div className="relative mx-auto w-full max-w-[340px]">
          <div className="grid grid-cols-3 items-center gap-y-6">

            {/* Votos - superior izquierda */}
            <button className="text-left active:opacity-60 transition">
              <p className="text-[20px] font-bold text-gray-900 leading-none tabular-nums">{formatNumber(stats.votos)}</p>
              <p className="text-[12px] text-gray-400 mt-1 font-medium">Votos</p>
            </button>
            <div />
            {/* Retos - superior derecha */}
            <button className="text-right active:opacity-60 transition">
              <p className="text-[20px] font-bold text-gray-900 leading-none tabular-nums">{formatNumber(stats.retos)}</p>
              <p className="text-[12px] text-gray-400 mt-1 font-medium">Retos</p>
            </button>

            {/* Avatar - centro */}
            <div />
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-[104px] h-[104px] rounded-full p-[3px] bg-gradient-to-br from-gray-100 to-gray-200 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.18)]">
                  <div className="w-full h-full rounded-full overflow-hidden bg-white ring-[3px] ring-white">
                    {ME.avatarUrl ? (
                      <img src={ME.avatarUrl} alt={ME.username} className="w-full h-full rounded-full object-cover" draggable={false} />
                    ) : (
                      <DefaultAvatar className="w-full h-full" />
                    )}
                  </div>
                </div>
                <button
                  aria-label="cambiar foto"
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-lg ring-[3px] ring-white active:scale-90 transition"
                >
                  <Plus strokeWidth={2.4} className="w-[18px] h-[18px]" />
                </button>
              </div>
            </div>
            <div />

            {/* Followers - inferior izquierda */}
            <button className="text-left active:opacity-60 transition">
              <p className="text-[20px] font-bold text-gray-900 leading-none tabular-nums">0</p>
              <p className="text-[12px] text-gray-400 mt-1 font-medium">Followers</p>
            </button>
            <div />
            {/* Following - inferior derecha */}
            <button className="text-right active:opacity-60 transition">
              <p className="text-[20px] font-bold text-gray-900 leading-none tabular-nums">0</p>
              <p className="text-[12px] text-gray-400 mt-1 font-medium">Following</p>
            </button>
          </div>
        </div>

        {/* Nombre + handle */}
        <div className="text-center mt-6 space-y-0.5">
          <h2 className="text-[22px] font-bold tracking-tight text-gray-900 leading-tight">{ME.name}</h2>
          <p className="text-sm text-gray-400 font-medium">{ME.handle}</p>
        </div>

        {/* Botones de acción */}
        <div className="mt-5 flex items-center gap-2.5">
          <button className="flex-1 h-10 rounded-full bg-gray-900 hover:bg-black text-white font-semibold text-[14px] active:scale-[0.98] transition-all">
            Edit profile
          </button>
          <button className="flex-1 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold text-[14px] active:scale-[0.98] transition-all">
            Share profile
          </button>
        </div>
      </div>

      {/* Tabs - diseño píldora */}
      <div className="px-1 sm:px-2 max-w-md mx-auto w-full">
        <div className="grid grid-cols-3 w-full bg-gray-50 rounded-2xl p-1">
          {TABS.map((tab) => {
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-label={tab.key}
                className={`rounded-xl py-3 text-sm font-medium flex items-center justify-center transition-all ${
                  active ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'
                }`}
              >
                {tab.icon(active)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Contenido */}
      <div className="mt-4 px-0.5 pb-28 max-w-md mx-auto w-full">
        {renderTabContent()}
      </div>
    </div>
  )
}
