'use client'
/* eslint-disable react-hooks/set-state-in-effect -- setState dentro de fetch async en efecto de carga; falso positivo de la regla experimental. */

import { useEffect, useMemo, useState } from 'react'
import { Menu, Heart, Users, UserPlus, Bookmark, UserCircle, Link as LinkIcon } from 'lucide-react'
import VoteIcon from './icons/VoteIcon'

const ME = {
  username: 'nexus',
  name: 'nexus',
  avatarUrl: '',
}

// Avatar por defecto: círculo gris claro con silueta de persona (gris medio),
// idéntico al de la imagen de referencia.
const DefaultAvatar = ({ className = '' }) => (
  <div className={`rounded-full bg-gray-200 overflow-hidden flex items-end justify-center ${className}`}>
    <svg viewBox="0 0 64 64" className="w-full h-full" aria-hidden="true">
      <circle cx="32" cy="25" r="12" fill="#9ca3af" />
      <path d="M14 60c0-11 8-18 18-18s18 7 18 18z" fill="#9ca3af" />
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
    <div className="relative aspect-[9/16] bg-gray-100 overflow-hidden">
      {thumb ? (
        <img src={thumb} alt="" className="w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-zinc-200 to-zinc-300" />
      )}
      <span className="absolute bottom-1 left-1 text-white text-[11px] font-semibold inline-flex items-center gap-1 drop-shadow">
        <VoteIcon className="w-3.5 h-3.5" strokeWidth={260} filled />
        {formatNumber(totalVotes)}
      </span>
    </div>
  )
}

const TABS = [
  { key: 'polls', icon: (active) => <ColumnsIcon className="w-5 h-5" /> },
  { key: 'liked', icon: () => <Heart className="w-5 h-5" strokeWidth={1.6} /> },
  { key: 'mentions', icon: () => <UserCircle className="w-5 h-5" strokeWidth={1.6} /> },
  { key: 'saved', icon: () => <Bookmark className="w-5 h-5" strokeWidth={1.6} /> },
  { key: 'links', icon: () => <LinkIcon className="w-5 h-5" strokeWidth={1.6} /> },
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
    const likes = posts.reduce((acc, p) => acc + (p?.stats?.likes || 0), 0)
    return { votos, likes }
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
          <div className="text-center py-14 space-y-3">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-400">
              <ColumnsIcon className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-gray-900">No posts yet</h3>
              <p className="text-gray-400 text-sm">Start creating content</p>
            </div>
          </div>
        )
      }
      return (
        <div className="grid grid-cols-3 gap-[2px]">
          {posts.map((p) => <GridItem key={p.id} post={p} />)}
        </div>
      )
    }

    const emptyMap = {
      liked: { Icon: Heart, title: 'No likes yet', desc: 'Videos you like will appear here' },
      mentions: { Icon: UserCircle, title: 'No mentions yet', desc: 'Polls that mention you appear here' },
      saved: { Icon: Bookmark, title: 'No saved posts', desc: 'Save videos to watch later' },
      links: { Icon: LinkIcon, title: 'No links yet', desc: 'Add your social links here' },
    }
    const e = emptyMap[activeTab]
    return (
      <div className="text-center py-14 space-y-3">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto text-gray-400">
          <e.Icon className="w-8 h-8" strokeWidth={1.6} />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-gray-900">{e.title}</h3>
          <p className="text-gray-400 text-sm">{e.desc}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-40 bg-white overflow-y-auto overscroll-contain">
      {/* Header: título centrado + menú hamburguesa */}
      <div className="relative flex items-center justify-center h-14 px-4"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 0px)' }}>
        <h1 className="text-[20px] font-bold text-gray-900">{ME.username}</h1>
        <button aria-label="menú" className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-900 active:scale-90 transition">
          <Menu className="w-7 h-7" strokeWidth={2} />
        </button>
      </div>

      {/* Avatar con métricas alrededor en diseño 3x3 (estructura exacta del diseño de referencia) */}
      <div className="px-3 sm:px-6 mt-4">
        <div className="relative max-w-sm mx-auto w-full">
          <div className="grid grid-cols-3 gap-1 sm:gap-2 items-center">

            {/* Votos - Esquina superior izquierda */}
            <div className="text-left">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <VoteIcon className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600" strokeWidth={260} filled={false} />
                </div>
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 leading-none">{formatNumber(stats.votos)}</p>
                  <p className="text-xs sm:text-sm text-gray-600">Votes</p>
                </div>
              </div>
            </div>

            {/* Espacio vacío superior centro */}
            <div></div>

            {/* Me gusta - Esquina superior derecha */}
            <div className="text-right">
              <div className="flex items-center gap-2 justify-end">
                <div className="min-w-0 text-right order-1">
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 leading-none">{formatNumber(stats.likes)}</p>
                  <p className="text-xs sm:text-sm text-gray-600">Likes</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-pink-50 flex items-center justify-center flex-shrink-0 order-2">
                  <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-pink-500 fill-pink-500" strokeWidth={1.5} />
                </div>
              </div>
            </div>

            {/* Espacio vacío centro izquierda */}
            <div></div>

            {/* Avatar - Centro */}
            <div className="flex justify-center">
              <div className="relative w-20 h-20 sm:w-24 sm:h-24">
                <div className="w-full h-full bg-white rounded-full overflow-hidden">
                  {ME.avatarUrl ? (
                    <img
                      src={ME.avatarUrl}
                      alt={ME.username}
                      className="w-full h-full rounded-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <DefaultAvatar className="w-full h-full" />
                  )}
                </div>
              </div>
            </div>

            {/* Espacio vacío centro derecha */}
            <div></div>

            {/* Seguidores - Esquina inferior izquierda */}
            <button className="text-left hover:bg-gray-50 rounded-xl p-1 sm:p-2 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" strokeWidth={1.5} />
                </div>
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 leading-none">0</p>
                  <p className="text-xs sm:text-sm text-gray-600">Followers</p>
                </div>
              </div>
            </button>

            {/* Espacio vacío inferior centro */}
            <div></div>

            {/* Seguidos - Esquina inferior derecha */}
            <button className="text-right hover:bg-gray-50 rounded-xl p-1 sm:p-2 transition-colors">
              <div className="flex items-center gap-2 justify-end">
                <div className="min-w-0 text-right order-1">
                  <p className="text-xl sm:text-2xl font-bold text-gray-900 leading-none">0</p>
                  <p className="text-xs sm:text-sm text-gray-600">Following</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0 order-2">
                  <UserPlus className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" strokeWidth={1.5} />
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Nombre */}
      <div className="text-center space-y-2 max-w-sm mx-auto mt-6">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">{ME.username}</h2>
      </div>

      {/* Botones de acción - Edit profile / Statistics */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 max-w-sm mx-auto mt-6 px-3 sm:px-6">
        <button className="h-11 sm:h-12 rounded-2xl bg-gray-50 hover:bg-gray-100 font-medium text-sm text-gray-900 transition-colors">
          Edit profile
        </button>
        <button className="h-11 sm:h-12 rounded-2xl bg-gray-50 hover:bg-gray-100 font-medium text-sm text-gray-900 transition-colors">
          Statistics
        </button>
      </div>

      {/* Tabs */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between bg-gray-50 rounded-2xl p-1">
          {TABS.map((tab) => {
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                aria-label={tab.key}
                className={`flex-1 h-11 rounded-xl flex items-center justify-center transition-all ${
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
      <div className="mt-4 pb-28">
        {renderTabContent()}
      </div>
    </div>
  )
}
