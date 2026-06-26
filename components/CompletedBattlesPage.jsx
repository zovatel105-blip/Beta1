'use client'
/* eslint-disable react-hooks/set-state-in-effect -- async load on open; false positive of the experimental rule. */

import { useEffect, useRef, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Mousewheel, Keyboard } from 'swiper/modules'
import 'swiper/css'
import { Swords, Plus, User, Trophy, X, Search, Loader2, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import BottomNav from './BottomNav'
import CarouselSlide from './CarouselSlide'
import DuetSlide from './DuetSlide'
import { notificationsUnreadCount } from '@/lib/notifications'

// Suggested accounts to challenge (empty state)
const suggestedAccounts = [
  { id: 's1', username: 'creatorpro', name: 'Creator Pro', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop', meta: 'Follows you' },
  { id: 's2', username: 'dancequeen', name: 'Dance Queen', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop', meta: 'Follows you' },
  { id: 's3', username: 'gamerx', name: 'Gamer X', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop', meta: 'Suggested for you' },
  { id: 's4', username: 'chefmario', name: 'Chef Mario', avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop', meta: 'Follows you' },
  { id: 's5', username: 'pianomaster', name: 'Piano Master', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&h=150&fit=crop', meta: 'Suggested for you' },
]

// Simple avatar with image + initial fallback.
const Avatar = ({ src, alt, className = '', ringClass = '' }) => (
  <div className={cn('rounded-full overflow-hidden bg-gradient-to-br from-zinc-600 to-zinc-700 flex items-center justify-center', ringClass, className)}>
    {src ? (
      <img src={src} alt={alt} className="w-full h-full object-cover" draggable={false} />
    ) : (
      <User className="w-1/2 h-1/2 text-white/80" />
    )}
  </div>
)

// Empty state of "Completed challenges" — premium minimalist design.
const EmptyCompletedState = ({ onOpenUpload, onOpenActive, onOpenProfile }) => {
  const [dismissed, setDismissed] = useState([])
  const visibleAccounts = suggestedAccounts.filter((a) => !dismissed.includes(a.id))

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

        {/* Minimalist search */}
        <div className="mt-12 flex items-center gap-2.5 h-11 px-4 rounded-full bg-white/[0.04] border border-white/10">
          <Search className="w-4 h-4 text-zinc-500" />
          <span className="text-zinc-500 text-sm">Search creators</span>
        </div>

        {/* Suggestions to challenge */}
        <div className="mt-7">
          <h3 className="text-zinc-400 font-medium text-[12px] uppercase tracking-[0.14em] mb-1">
            Suggestions to challenge
          </h3>

          <div className="divide-y divide-white/[0.05]">
            {visibleAccounts.map((acc) => (
              <div key={acc.id} className="flex items-center gap-3 py-3.5">
                <button onClick={onOpenProfile} className="shrink-0">
                  <Avatar src={acc.avatar} alt={acc.name} className="w-11 h-11" ringClass="ring-1 ring-white/10" />
                </button>
                <button onClick={onOpenProfile} className="flex-1 min-w-0 text-left">
                  <p className="text-white font-medium text-[15px] truncate">{acc.name}</p>
                  <p className="text-zinc-500 text-[13px] truncate">{acc.meta}</p>
                </button>
                <button
                  onClick={onOpenUpload}
                  className="shrink-0 h-8 px-4 rounded-full border border-white/15 text-white text-[13px] font-medium flex items-center gap-1.5 hover:bg-white/5 active:scale-95 transition"
                >
                  <Swords className="w-3.5 h-3.5" />
                  Challenge
                </button>
                <button
                  onClick={() => setDismissed((d) => [...d, acc.id])}
                  className="shrink-0 w-7 h-7 flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {visibleAccounts.length === 0 && (
              <p className="text-zinc-500 text-sm py-6 text-center">No more suggestions.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CompletedBattlesPage({ open, onClose, onOpenActive, onOpenUpload, onOpenInbox, onOpenProfile, refreshKey = 0 }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [muted, setMuted] = useState(true)
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

  if (!open) return null

  const isEmpty = !loading && posts.length === 0

  // Share with friends: use the native menu if available; otherwise copy the link.
  const handleShareFriends = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Twyk', text: 'Join my challenges on Twyk! 🥊', url })
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
      }
    } catch { /* user cancelled or no support */ }
  }

  return (
    <div className="fixed inset-0 z-[55] bg-black overflow-hidden">
      {/* Minimalist header — side buttons + central segmented control */}
      <div className="absolute top-0 left-0 right-0 z-40 px-4 pb-4 bg-gradient-to-b from-black/70 to-transparent"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
        <div className="flex items-center justify-between gap-2">
          {/* Left: share with friends */}
          <button
            onClick={handleShareFriends}
            aria-label="Share with friends"
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
          onOpenProfile={onOpenProfile}
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

      {/* Bottom navigation bar — same as the feed */}
      <BottomNav
        onGoHome={onClose}
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
