'use client'

import { useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Mousewheel, Keyboard } from 'swiper/modules'
import 'swiper/css'
import {
  Home, Swords, Plus, Inbox, User, Heart, MessageCircle, Share2, Bookmark,
  Trophy, Crown, Play, Eye, ChevronUp, ChevronDown, X, UserPlus, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Cuentas sugeridas para retar (estado vacío)
const suggestedAccounts = [
  { id: 's1', username: 'creatorpro', name: 'Creator Pro', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop', meta: 'Te sigue' },
  { id: 's2', username: 'dancequeen', name: 'Dance Queen', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop', meta: 'Te sigue' },
  { id: 's3', username: 'gamerx', name: 'Gamer X', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop', meta: 'Sugerido para ti' },
  { id: 's4', username: 'chefmario', name: 'Chef Mario', avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop', meta: 'Te sigue' },
  { id: 's5', username: 'pianomaster', name: 'Piano Master', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&h=150&fit=crop', meta: 'Sugerido para ti' },
]

// Datos de ejemplo para retos completados
const mockCompletedBattles = [
  {
    id: 'completed1',
    title: 'Battle Épico: Arte Digital vs Tradicional',
    participants: [
      { id: 'user1', username: 'CreatorPro', displayName: 'Creator Pro', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop', votes: 15420, isWinner: true },
      { id: 'user2', username: 'ArtistMaster', displayName: 'Artist Master', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop', votes: 12350, isWinner: false },
    ],
    totalViews: 45000, totalVotes: 27770, completedAt: '2025-01-14T10:30:00Z',
    media: { type: 'image', url: 'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=1080&h=1920&fit=crop' },
    category: 'Arte', duration: '2h 30min',
  },
  {
    id: 'completed2',
    title: 'Dance Challenge: Hip Hop vs K-Pop',
    participants: [
      { id: 'user3', username: 'DanceQueen', displayName: 'Dance Queen', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop', votes: 23100, isWinner: true },
      { id: 'user4', username: 'MoveMaster', displayName: 'Move Master', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop', votes: 19800, isWinner: false },
    ],
    totalViews: 89000, totalVotes: 42900, completedAt: '2025-01-13T18:45:00Z',
    media: { type: 'image', url: 'https://images.unsplash.com/photo-1547153760-18fc86324498?w=1080&h=1920&fit=crop' },
    category: 'Baile', duration: '1h 45min',
  },
  {
    id: 'completed3',
    title: 'Gaming Battle: Speed Run Challenge',
    participants: [
      { id: 'user5', username: 'GamerX', displayName: 'Gamer X', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop', votes: 8900, isWinner: false },
      { id: 'user6', username: 'ProPlayer', displayName: 'Pro Player', avatar: 'https://images.unsplash.com/photo-1599566150163-29194dcabd36?w=150&h=150&fit=crop', votes: 11200, isWinner: true },
    ],
    totalViews: 32000, totalVotes: 20100, completedAt: '2025-01-12T22:00:00Z',
    media: { type: 'image', url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1080&h=1920&fit=crop' },
    category: 'Gaming', duration: '3h 15min',
  },
  {
    id: 'completed4',
    title: 'Cooking Battle: Italian vs Asian',
    participants: [
      { id: 'user7', username: 'ChefMario', displayName: 'Chef Mario', avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop', votes: 18500, isWinner: true },
      { id: 'user8', username: 'MasterWok', displayName: 'Master Wok', avatar: 'https://images.unsplash.com/photo-1507591064344-4c6ce005b128?w=150&h=150&fit=crop', votes: 16200, isWinner: false },
    ],
    totalViews: 56000, totalVotes: 34700, completedAt: '2025-01-11T14:20:00Z',
    media: { type: 'image', url: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1080&h=1920&fit=crop' },
    category: 'Cocina', duration: '2h 00min',
  },
  {
    id: 'completed5',
    title: 'Music Battle: Guitar vs Piano',
    participants: [
      { id: 'user9', username: 'GuitarHero', displayName: 'Guitar Hero', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop', votes: 21000, isWinner: false },
      { id: 'user10', username: 'PianoMaster', displayName: 'Piano Master', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&h=150&fit=crop', votes: 24500, isWinner: true },
    ],
    totalViews: 78000, totalVotes: 45500, completedAt: '2025-01-10T20:15:00Z',
    media: { type: 'image', url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1080&h=1920&fit=crop' },
    category: 'Música', duration: '1h 30min',
  },
]

const formatNumber = (num) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k'
  return num.toString()
}

const formatTimeAgo = (dateString) => {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays > 0) return `hace ${diffDays}d`
  if (diffHours > 0) return `hace ${diffHours}h`
  return 'hace poco'
}

// Avatar simple con imagen + fallback de inicial.
const Avatar = ({ src, alt, className = '', ringClass = '' }) => (
  <div className={cn('rounded-full overflow-hidden bg-gradient-to-br from-zinc-600 to-zinc-700 flex items-center justify-center', ringClass, className)}>
    {src ? (
      <img src={src} alt={alt} className="w-full h-full object-cover" draggable={false} />
    ) : (
      <User className="w-1/2 h-1/2 text-white/80" />
    )}
  </div>
)

const CompletedBattleCard = ({ battle, onUserClick }) => {
  const [isLiked, setIsLiked] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

  const winner = battle.participants.find((p) => p.isWinner)
  const loser = battle.participants.find((p) => !p.isWinner)
  const getVotePercentage = (votes) => Math.round((votes / battle.totalVotes) * 100)

  return (
    <div className="relative w-full h-full bg-black">
      {/* Background Media */}
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${battle.media.url})` }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/60" />
      </div>

      {/* Header - Título y categoría */}
      <div className="absolute top-0 left-0 right-16 z-20 p-4 pt-16">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2 py-1 bg-purple-500/80 rounded-full text-xs font-semibold text-white">{battle.category}</span>
          <span className="px-2 py-1 bg-green-500/80 rounded-full text-xs font-semibold text-white flex items-center gap-1">
            <Trophy className="w-3 h-3" />
            COMPLETADO
          </span>
        </div>
        <h2 className="text-white text-xl font-bold drop-shadow-lg line-clamp-2">{battle.title}</h2>
        <p className="text-white/60 text-sm mt-1">{formatTimeAgo(battle.completedAt)} • {battle.duration}</p>
      </div>

      {/* Contenido principal - Participantes y resultados */}
      <div className="absolute bottom-32 left-0 right-20 z-20 px-4">
        <div className="bg-black/60 backdrop-blur-md rounded-2xl p-4 border border-white/10">
          <div className="flex items-center justify-between">
            {/* Ganador */}
            <div className="flex-1 flex flex-col items-center">
              <button onClick={() => onUserClick(winner.id)} className="relative">
                <Avatar src={winner.avatar} alt={winner.displayName} className="w-16 h-16 shadow-lg shadow-yellow-500/30" ringClass="ring-4 ring-yellow-500" />
                <div className="absolute -top-2 -right-2 bg-yellow-500 rounded-full p-1">
                  <Crown className="w-4 h-4 text-white" />
                </div>
              </button>
              <span className="text-white font-semibold text-sm mt-2">@{winner.username}</span>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-yellow-400 font-bold text-lg">{getVotePercentage(winner.votes)}%</span>
              </div>
              <span className="text-white/60 text-xs">{formatNumber(winner.votes)} votos</span>
            </div>

            {/* VS Divider */}
            <div className="px-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">VS</span>
              </div>
            </div>

            {/* Perdedor */}
            <div className="flex-1 flex flex-col items-center">
              <button onClick={() => onUserClick(loser.id)} className="relative">
                <Avatar src={loser.avatar} alt={loser.displayName} className="w-16 h-16 opacity-80" ringClass="ring-2 ring-gray-500" />
              </button>
              <span className="text-white/80 font-semibold text-sm mt-2">@{loser.username}</span>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-white/60 font-bold text-lg">{getVotePercentage(loser.votes)}%</span>
              </div>
              <span className="text-white/40 text-xs">{formatNumber(loser.votes)} votos</span>
            </div>
          </div>

          {/* Barra de progreso de votos */}
          <div className="mt-4 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full transition-all duration-500" style={{ width: `${getVotePercentage(winner.votes)}%` }} />
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-center gap-6 mt-4 text-white/80 text-sm">
          <span className="flex items-center gap-1"><Eye className="w-4 h-4" />{formatNumber(battle.totalViews)} vistas</span>
          <span className="flex items-center gap-1"><Trophy className="w-4 h-4" />{formatNumber(battle.totalVotes)} votos</span>
        </div>
      </div>

      {/* Acciones sociales - lado derecho */}
      <div className="absolute right-3 bottom-40 flex flex-col items-center gap-5 z-30">
        <button onClick={() => setIsLiked(!isLiked)} className="flex flex-col items-center gap-1">
          <div className={cn('w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300', isLiked ? 'bg-red-500/20 backdrop-blur-sm' : 'bg-black/40 backdrop-blur-sm hover:bg-black/60')}>
            <Heart className={cn('w-6 h-6 transition-all duration-300', isLiked ? 'text-red-500 fill-red-500 scale-110' : 'text-white')} />
          </div>
          <span className="text-white text-xs font-medium">{formatNumber(Math.floor(battle.totalVotes * 0.3))}</span>
        </button>

        <button className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:bg-black/60 transition-colors">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="text-white text-xs font-medium">{formatNumber(Math.floor(battle.totalViews * 0.02))}</span>
        </button>

        <button className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center hover:bg-black/60 transition-colors">
            <Share2 className="w-6 h-6 text-white" />
          </div>
          <span className="text-white text-xs font-medium">{formatNumber(Math.floor(battle.totalViews * 0.01))}</span>
        </button>

        <button onClick={() => setIsSaved(!isSaved)} className="flex flex-col items-center gap-1">
          <div className={cn('w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300', isSaved ? 'bg-yellow-500/20 backdrop-blur-sm' : 'bg-black/40 backdrop-blur-sm hover:bg-black/60')}>
            <Bookmark className={cn('w-6 h-6 transition-all duration-300', isSaved ? 'text-yellow-500 fill-yellow-500' : 'text-white')} />
          </div>
        </button>

        <button className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-purple-500/80 backdrop-blur-sm flex items-center justify-center hover:bg-purple-600/80 transition-colors">
            <Play className="w-6 h-6 text-white fill-white" />
          </div>
          <span className="text-white text-xs font-medium">Replay</span>
        </button>
      </div>
    </div>
  )
}

// Estado vacío de "Retos completados" inspirado en la pantalla de referencia.
const EmptyCompletedState = ({ onOpenUpload, onOpenActive, onOpenProfile }) => {
  const [dismissed, setDismissed] = useState([])
  const visibleAccounts = suggestedAccounts.filter((a) => !dismissed.includes(a.id))

  return (
    <div className="relative w-full h-full overflow-y-auto bg-black">
      {/* Decoración de fondo (líneas/halos suaves como en la referencia) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-purple-600/20 blur-3xl" />
        <div className="absolute top-40 -left-20 w-72 h-72 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute right-6 top-24 w-64 h-80 rounded-[40px] border border-white/[0.06] rotate-6" />
        <div className="absolute right-10 top-32 w-64 h-80 rounded-[40px] border border-white/[0.05] rotate-12" />
      </div>

      <div className="relative z-10 px-5 pt-24 pb-32">
        {/* Barra de búsqueda superior */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex-1 flex items-center gap-2 h-11 px-4 rounded-xl bg-zinc-800/80 border border-white/5">
            <Search className="w-4 h-4 text-zinc-400" />
            <span className="text-zinc-400 text-sm">Buscar creadores</span>
          </div>
        </div>

        {/* Título grande estilo referencia */}
        <h1 className="text-white font-extrabold leading-[0.95] tracking-tight text-[44px]">
          Mira los
          <br />
          retos
          <br />
          completados
        </h1>
        <p className="text-zinc-400 text-base mt-4 max-w-[18rem]">
          Aún no se ha completado ningún reto. ¡Crea uno y empieza la batalla!
        </p>

        {/* Botón principal (blanco con borde degradado, como la referencia) */}
        <button
          onClick={onOpenUpload}
          className="mt-7 w-full h-[52px] rounded-xl font-bold text-base text-black flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
          style={{
            border: '3px solid transparent',
            backgroundImage: 'linear-gradient(#fff, #fff), linear-gradient(90deg, #3B82F6 0%, #A855F7 50%, #EC4899 100%)',
            backgroundOrigin: 'border-box',
            backgroundClip: 'padding-box, border-box',
          }}
        >
          <Plus className="w-5 h-5" />
          Crear un reto
        </button>

        {/* Botón secundario */}
        <button
          onClick={onOpenActive}
          className="mt-3 w-full h-[52px] rounded-xl bg-zinc-800/90 hover:bg-zinc-700/90 font-bold text-base text-white flex items-center justify-center gap-2 active:scale-[0.99] transition"
        >
          <Swords className="w-5 h-5" />
          Ver retos activos
        </button>

        {/* Cuentas sugeridas */}
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-white font-semibold text-[15px]">Cuentas sugeridas</h3>
            <Trophy className="w-3.5 h-3.5 text-zinc-500" />
          </div>

          <div className="divide-y divide-white/[0.04]">
            {visibleAccounts.map((acc) => (
              <div key={acc.id} className="flex items-center gap-3 py-3">
                <button onClick={onOpenProfile} className="shrink-0">
                  <Avatar src={acc.avatar} alt={acc.name} className="w-12 h-12" />
                </button>
                <button onClick={onOpenProfile} className="flex-1 min-w-0 text-left">
                  <p className="text-white font-semibold text-[15px] truncate">{acc.name}</p>
                  <p className="text-zinc-500 text-sm truncate">{acc.meta}</p>
                </button>
                <button
                  onClick={onOpenUpload}
                  className="shrink-0 h-9 px-5 rounded-md font-semibold text-sm text-white flex items-center gap-1.5 active:scale-95 transition-transform"
                  style={{ background: 'linear-gradient(135deg, #A855F7 0%, #3B82F6 100%)' }}
                >
                  <Swords className="w-4 h-4" />
                  Retar
                </button>
                <button
                  onClick={() => setDismissed((d) => [...d, acc.id])}
                  className="shrink-0 w-7 h-7 flex items-center justify-center text-zinc-500 hover:text-white"
                  aria-label="Descartar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {visibleAccounts.length === 0 && (
              <p className="text-zinc-500 text-sm py-6 text-center">No hay más cuentas sugeridas.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CompletedBattlesPage({ open, onClose, onOpenActive, onOpenUpload, onOpenInbox, onOpenProfile }) {
  const [battles] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)

  if (!open) return null

  const handleUserClick = () => onOpenProfile?.()
  const isEmpty = battles.length === 0

  return (
    <div className="fixed inset-0 z-[55] bg-black overflow-hidden">
      {/* Header fijo */}
      <div className="absolute top-0 left-0 right-0 z-40 px-4 py-3 bg-gradient-to-b from-black/90 to-transparent"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
        <div className="flex items-center justify-between">
          <h1 className="text-white text-lg font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Retos completados
          </h1>
          <button onClick={onOpenActive} className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 rounded-full text-white text-sm font-medium transition-colors flex items-center gap-1">
            <Swords className="w-4 h-4" />
            Ver activos
          </button>
        </div>
      </div>

      {/* Swiper de batallas completadas o estado vacío */}
      {isEmpty ? (
        <EmptyCompletedState
          onOpenUpload={onOpenUpload}
          onOpenActive={onOpenActive}
          onOpenProfile={onOpenProfile}
        />
      ) : (
        <Swiper
          direction="vertical"
          slidesPerView={1}
          spaceBetween={0}
          mousewheel
          keyboard
          modules={[Mousewheel, Keyboard]}
          onSlideChange={(s) => setActiveIndex(s.activeIndex)}
          className="w-full h-full"
        >
          {battles.map((battle) => (
            <SwiperSlide key={battle.id}>
              <CompletedBattleCard battle={battle} onUserClick={handleUserClick} />
            </SwiperSlide>
          ))}
        </Swiper>
      )}

      {/* Menú lateral derecho */}
      <div className="fixed right-2 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-50">
        {/* Home/Feed */}
        <button onClick={onClose} className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-white/20 backdrop-blur-sm hover:bg-white/30 border border-white/10">
          <Home className="w-5 h-5 text-white" />
        </button>
        {/* Retos Activos */}
        <button onClick={onOpenActive} className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-white/20 backdrop-blur-sm hover:bg-white/30 border border-white/10">
          <Swords className="w-5 h-5 text-white" />
        </button>
        {/* Retos Completados (actual) */}
        <button className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-yellow-500 hover:bg-yellow-600 shadow-lg shadow-yellow-500/30">
          <Trophy className="w-5 h-5 text-white" />
        </button>
        {/* Crear */}
        <button
          onClick={onOpenUpload}
          className="w-12 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 relative overflow-hidden hover:scale-105 shadow-xl"
          style={{
            border: '2px solid transparent',
            backgroundImage: 'linear-gradient(#000, #000), linear-gradient(180deg, #A855F7 0%, #3B82F6 100%)',
            backgroundOrigin: 'border-box',
            backgroundClip: 'padding-box, border-box',
          }}
        >
          <Plus className="w-6 h-6 text-white" />
        </button>
        {/* Mensajes */}
        <button onClick={onOpenInbox} className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-white/20 backdrop-blur-sm hover:bg-white/30 border border-white/10">
          <Inbox className="w-5 h-5 text-white" />
        </button>
        {/* Perfil */}
        <button onClick={onOpenProfile} className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 bg-white/20 backdrop-blur-sm hover:bg-white/30 border border-white/10">
          <User className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Indicador de progreso */}
      <div className="absolute right-16 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-30">
        {battles.map((_, index) => (
          <div key={index} className={cn('w-1 rounded-full transition-all duration-300', index === activeIndex ? 'h-6 bg-white' : 'h-1.5 bg-white/40')} />
        ))}
      </div>

      {/* Indicadores de navegación */}
      {activeIndex > 0 && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 animate-bounce">
          <ChevronUp className="w-6 h-6 text-white/60" />
        </div>
      )}
      {activeIndex < battles.length - 1 && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 animate-bounce">
          <ChevronDown className="w-6 h-6 text-white/60" />
        </div>
      )}
    </div>
  )
}
