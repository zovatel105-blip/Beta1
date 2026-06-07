'use client'
/* eslint-disable react-hooks/set-state-in-effect -- setState dentro de fetch async en efecto de carga; falso positivo de la regla experimental. */

import { useEffect, useMemo, useState } from 'react'
import { Menu, Heart, Users, UserPlus, Bookmark, UserCircle, Link as LinkIcon } from 'lucide-react'
import VoteIcon from './icons/VoteIcon'

const ME = {
  username: 'tu_canal',
  name: 'Tú',
  avatarUrl: 'https://i.pravatar.cc/120?img=68',
}

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

// Bloque de estadística en esquina. align='left' → icono a la izquierda; 'right' → icono a la derecha.
const StatCorner = ({ value, label, icon, bg, align = 'left' }) => {
  const IconCircle = (
    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${bg}`}>
      {icon}
    </div>
  )
  const Text = (
    <div className={align === 'left' ? 'text-left' : 'text-right'}>
      <p className="text-[22px] font-bold text-gray-900 leading-none">{value}</p>
      <p className="text-[13px] text-gray-500 leading-tight mt-0.5">{label}</p>
    </div>
  )
  return (
    <div className="flex items-center gap-2.5">
      {align === 'left' ? (<>{IconCircle}{Text}</>) : (<>{Text}{IconCircle}</>)}
    </div>
  )
}

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

      {/* Stats en 4 esquinas alrededor del avatar */}
      <div className="relative px-5 mt-2" style={{ minHeight: '230px' }}>
        {/* Avatar centrado */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <img
            src={ME.avatarUrl}
            alt={ME.username}
            className="w-28 h-28 rounded-full object-cover bg-gray-200"
            draggable={false}
          />
        </div>

        {/* Top-left: Votes */}
        <div className="absolute top-0 left-5">
          <StatCorner
            align="left"
            value={formatNumber(stats.votos)}
            label="Votes"
            bg="bg-blue-50"
            icon={<VoteIcon className="w-6 h-6 text-blue-500" strokeWidth={240} />}
          />
        </div>

        {/* Top-right: Likes */}
        <div className="absolute top-0 right-5">
          <StatCorner
            align="right"
            value={formatNumber(stats.likes)}
            label="Likes"
            bg="bg-pink-50"
            icon={<Heart className="w-6 h-6 text-pink-500 fill-pink-500" strokeWidth={1.5} />}
          />
        </div>

        {/* Bottom-left: Followers */}
        <div className="absolute bottom-0 left-5">
          <StatCorner
            align="left"
            value="0"
            label="Followers"
            bg="bg-green-50"
            icon={<Users className="w-6 h-6 text-green-500" strokeWidth={1.8} />}
          />
        </div>

        {/* Bottom-right: Following */}
        <div className="absolute bottom-0 right-5">
          <StatCorner
            align="right"
            value="0"
            label="Following"
            bg="bg-purple-50"
            icon={<UserPlus className="w-6 h-6 text-purple-500" strokeWidth={1.8} />}
          />
        </div>
      </div>

      {/* Nombre */}
      <h2 className="text-center text-[22px] font-bold text-gray-900 mt-3">{ME.username}</h2>

      {/* Acciones: Edit profile / Statistics */}
      <div className="flex items-center gap-3 px-4 mt-5">
        <button
          className="flex-1 h-12 rounded-2xl bg-gray-100 text-gray-900 text-[16px] font-bold active:scale-[0.98] transition"
        >
          Edit profile
        </button>
        <button
          className="flex-1 h-12 rounded-2xl bg-gray-100 text-gray-900 text-[16px] font-bold active:scale-[0.98] transition"
        >
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
