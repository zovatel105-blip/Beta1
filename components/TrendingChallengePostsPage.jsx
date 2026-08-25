'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Flame, Loader2 } from 'lucide-react'
import BottomNav from './BottomNav'
import { GridItem, PostViewer } from './ProfilePage'
import { notificationsUnreadCount } from '@/lib/notifications'

// Pantalla con TODAS las publicaciones reales de un "Trending Challenge" (ej.
// "Yacht Life") — petición del usuario, corregida 2 veces en esta sesión:
// 1º una hoja con leaderboard (descartada), 2º un vídeo deslizable a pantalla
// completa ("me confundía con la página de Retos" al estar vacío, mismo
// fondo/ícono/pestaña resaltada) — 3ª y DEFINITIVA: "Debería mostrar un grid
// de 3 como el perfil con las publicaciones de ese challenge en tendencia".
// Reutiliza EXACTAMENTE los mismos componentes del grid del perfil
// (GridItem/PostViewer, exportados desde ProfilePage.jsx) para que el
// resultado visual sea idéntico al grid de "Posts" del perfil, solo que
// filtrado a las publicaciones de este challenge concreto (de CUALQUIER
// usuario, no solo las mías). Se abre al tocar el nombre del challenge en
// el buscador (lupa) del feed (SearchOverlay.jsx). Consume GET
// /api/luxury-battles/posts?themeId=....
export default function TrendingChallengePostsPage({ open, themeId, onClose, onOpenAuthorProfile, onOpenUpload, onOpenInbox, onOpenProfile, onGoHome, onGoHomeDouble }) {
  const [theme, setTheme] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(false)
  const [openPost, setOpenPost] = useState(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setOpenPost(null)
    const url = themeId ? `/api/luxury-battles/posts?themeId=${encodeURIComponent(themeId)}` : '/api/luxury-battles/posts'
    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!active) return
        setTheme(d?.theme || null)
        setPosts(Array.isArray(d?.posts) ? d.posts : [])
      })
      .catch(() => { if (active) { setTheme(null); setPosts([]) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open, themeId])

  if (!open) return null

  const isEmpty = !loading && posts.length === 0

  return (
    <div className="fixed inset-0 z-[55] bg-[#0a0a0b] overflow-y-auto overscroll-contain">
      {/* Cabecera: volver + nombre del challenge (mismo estilo de píldora
          dorada usado en el resto de la app para este mismo tema). */}
      <div className="sticky top-0 z-30 bg-[#0a0a0b] px-3 pb-3 flex items-center gap-2.5"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}>
        <button
          onClick={onClose}
          aria-label="Volver"
          className="shrink-0 w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 text-white flex items-center justify-center hover:bg-white/10 active:scale-95 transition"
        >
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-bold"
             style={{ background: 'linear-gradient(135deg, rgba(252,211,77,0.18), rgba(245,158,11,0.18))', border: '1px solid rgba(252,211,77,0.35)', color: '#FCD34D' }}>
          <Flame size={13} className="fill-current" />
          {theme?.title || 'Trending Challenge'}
        </div>
      </div>

      {/* Contenido: grid de 3 columnas (mismo componente GridItem que el
          perfil) o estado vacío/carga. */}
      {loading ? (
        <div className="flex justify-center items-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
        </div>
      ) : isEmpty ? (
        <div className="text-center py-16 space-y-4 px-4">
          <div className="w-16 h-16 bg-white/[0.04] border border-white/10 rounded-full flex items-center justify-center mx-auto">
            <Flame className="w-7 h-7" strokeWidth={1.25} style={{ color: '#FCD34D' }} />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white">No publicaciones todavía</h3>
            <p className="text-zinc-500 text-sm">
              Cuando alguien participe en {theme?.title ? `"${theme.title}"` : 'este challenge'}, aparecerán aquí.
            </p>
          </div>
        </div>
      ) : (
        <div className="px-2 pb-28 pt-1 max-w-md mx-auto w-full">
          <div className="grid grid-cols-3 gap-1">
            {posts.map((p) => <GridItem key={p.id} post={p} onOpen={setOpenPost} />)}
          </div>
        </div>
      )}

      {/* Visor de publicación: mismo componente que el grid del perfil,
          desliza entre TODAS las publicaciones de este challenge. */}
      {openPost && (
        <PostViewer
          posts={posts}
          startId={openPost.id}
          onClose={() => setOpenPost(null)}
          onOpenProfile={(uname) => { setOpenPost(null); onOpenAuthorProfile?.(uname) }}
        />
      )}

      {!openPost && (
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
      )}
    </div>
  )
}
