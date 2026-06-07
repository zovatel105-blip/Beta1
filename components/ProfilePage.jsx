'use client'
/* eslint-disable react-hooks/set-state-in-effect -- setState dentro de fetch async en efecto de carga; falso positivo de la regla experimental. */

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Settings, Share2, Heart, Bookmark, UserCircle, Plus } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import VoteIcon from './icons/VoteIcon'
import { cn } from '@/lib/utils'

const ME = {
  username: 'tu_canal',
  name: 'Tú',
  avatarUrl: 'https://i.pravatar.cc/120?img=68',
  bio: 'Crea tus versus y deja que la gente vote 🅰️🆚🅱️',
}

const formatNumber = (num) => {
  const n = Number(num)
  if (!n || isNaN(n)) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toString()
}

// Mejor póster disponible para la miniatura del grid.
const thumbFor = (p) =>
  p?.thumbnailUrl || p?.posterUrl || p?.sideA?.posterUrl || p?.sideB?.posterUrl || ''

const Stat = ({ value, label }) => (
  <div className="flex flex-col items-center px-3">
    <span className="text-[17px] font-bold text-gray-900 leading-tight">{value}</span>
    <span className="text-[12px] text-gray-500 leading-tight">{label}</span>
  </div>
)

const GridItem = ({ post }) => {
  const thumb = thumbFor(post)
  const totalVotes = (post?.votes?.a || 0) + (post?.votes?.b || 0)
  return (
    <div className="relative aspect-[9/16] bg-gray-100 overflow-hidden rounded-md">
      {thumb ? (
        <img src={thumb} alt="" className="w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-zinc-200 to-zinc-300" />
      )}
      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-black/55 text-white text-[10px] font-semibold inline-flex items-center gap-1">
        <span className="px-1 rounded bg-fuchsia-500/90">A</span>
        <span className="px-1 rounded bg-blue-500/90">B</span>
      </span>
      <span className="absolute bottom-1 left-1 text-white text-[11px] font-semibold inline-flex items-center gap-1 drop-shadow">
        <VoteIcon className="w-3.5 h-3.5" strokeWidth={260} filled />
        {formatNumber(totalVotes)}
      </span>
    </div>
  )
}

const EmptyState = ({ icon: Icon, title, desc }) => (
  <div className="text-center py-16 space-y-3 px-6">
    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto shadow-sm">
      <Icon className="w-7 h-7 text-gray-400" strokeWidth={1.5} />
    </div>
    <div className="space-y-1">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {desc && <p className="text-gray-400 text-sm">{desc}</p>}
    </div>
  </div>
)

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
    const votaciones = posts.length
    const votos = posts.reduce((acc, p) => acc + (p?.votes?.a || 0) + (p?.votes?.b || 0), 0)
    const likes = posts.reduce((acc, p) => acc + (p?.stats?.likes || 0), 0)
    return { votaciones, votos, likes }
  }, [posts])

  const handleShare = () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: `Perfil de ${ME.name}`, text: `Mira el perfil de @${ME.username}`, url }).catch(() => {})
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {})
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 bg-white overflow-y-auto overscroll-contain">
      {/* Header superior */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur flex items-center justify-between px-3 h-12 border-b border-gray-100"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 0px)' }}>
        <button aria-label="volver" onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-gray-100 active:scale-95 transition">
          <ArrowLeft className="w-5 h-5 text-gray-900" />
        </button>
        <h1 className="text-[15px] font-semibold text-gray-900">{ME.name}</h1>
        <button aria-label="ajustes" className="p-2 -mr-2 rounded-full hover:bg-gray-100 active:scale-95 transition">
          <Settings className="w-5 h-5 text-gray-900" />
        </button>
      </div>

      {/* Cabecera de perfil */}
      <div className="flex flex-col items-center px-4 pt-5 pb-3">
        <div className="rounded-full p-[3px] bg-gradient-to-br from-fuchsia-500 to-blue-500">
          <img
            src={ME.avatarUrl}
            alt={ME.username}
            className="w-24 h-24 rounded-full object-cover border-[3px] border-white"
            draggable={false}
          />
        </div>
        <h2 className="mt-3 text-[19px] font-bold text-gray-900 leading-tight">{ME.name}</h2>
        <p className="text-[13px] text-gray-500">@{ME.username}</p>

        {/* Stats */}
        <div className="mt-4 flex items-center divide-x divide-gray-200">
          <Stat value={formatNumber(stats.votaciones)} label="Votaciones" />
          <Stat value="0" label="Seguidores" />
          <Stat value="0" label="Siguiendo" />
          <Stat value={formatNumber(stats.likes)} label="Me gusta" />
        </div>

        {/* Bio */}
        <p className="mt-3 text-[13px] text-gray-700 text-center max-w-xs leading-snug">{ME.bio}</p>

        {/* Acciones */}
        <div className="mt-4 flex items-center gap-2 w-full max-w-xs">
          <button
            onClick={onOpenUpload}
            className="flex-1 h-9 rounded-lg text-white text-[14px] font-semibold inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
            style={{ background: 'linear-gradient(90deg, #A855F7 0%, #3B82F6 100%)' }}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} /> Crear versus
          </button>
          <button
            onClick={handleShare}
            aria-label="compartir perfil"
            className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-50 active:scale-95 transition"
          >
            <Share2 className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full pb-24">
        <div className="px-3 sticky top-12 z-10 bg-white pt-2 pb-1">
          <TabsList className="grid w-full grid-cols-3 bg-gray-50 rounded-2xl p-1 h-auto">
            <TabsTrigger value="polls" className="rounded-xl py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="3" y1="4" x2="3" y2="20" />
                <line x1="9" y1="4" x2="9" y2="20" />
                <line x1="15" y1="4" x2="15" y2="20" />
                <line x1="21" y1="4" x2="21" y2="20" />
                <line x1="3" y1="12" x2="21" y2="12" />
              </svg>
            </TabsTrigger>
            <TabsTrigger value="liked" className="rounded-xl py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Heart className="w-4 h-4" strokeWidth={1.5} />
            </TabsTrigger>
            <TabsTrigger value="saved" className="rounded-xl py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Bookmark className="w-4 h-4" strokeWidth={1.5} />
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="polls" className="mt-2">
          {loading ? (
            <div className="flex justify-center items-center py-16">
              <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-fuchsia-500 animate-spin" />
            </div>
          ) : posts.length === 0 ? (
            <EmptyState
              icon={UserCircle}
              title="Aún no tienes votaciones"
              desc="Crea tu primer versus para empezar"
            />
          ) : (
            <div className="grid grid-cols-3 gap-1 px-1">
              {posts.map((p) => (
                <GridItem key={p.id} post={p} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="liked" className="mt-2">
          <EmptyState icon={Heart} title="Sin me gusta todavía" desc="Los vídeos que te gusten aparecerán aquí" />
        </TabsContent>

        <TabsContent value="saved" className="mt-2">
          <EmptyState icon={Bookmark} title="Sin guardados" desc="Guarda vídeos para verlos más tarde" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
