'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  ShieldAlert,
  Loader2,
  Megaphone,
  RefreshCw,
  Flame,
  Check,
  Music2,
  Hash,
  History,
  Sparkles,
  Trash2,
  ImageOff,
  Plus,
} from 'lucide-react'

function authHeaders() {
  try {
    const t = localStorage.getItem('twyk_token')
    return t ? { Authorization: `Bearer ${t}` } : {}
  } catch {
    return {}
  }
}

// Tarjeta de UNA pieza del lote diario: imagen de portada generada con IA,
// título/hook/guion, hashtags+sonido listos para copiar, checkbox individual
// de "publicada" y notas editables. `onUpdate`/`onDelete` llaman a la API y
// devuelven el post actualizado (o null si se borró).
function PostCard({ post, fixedHashtags, onUpdate, onDelete }) {
  const [notes, setNotes] = useState(post.notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [busy, setBusy] = useState(false)

  const togglePosted = async () => {
    setBusy(true)
    await onUpdate(post.id, { posted: !post.posted })
    setBusy(false)
  }

  const saveNotes = async () => {
    if (notes === (post.notes || '')) return
    setSavingNotes(true)
    await onUpdate(post.id, { notes })
    setSavingNotes(false)
  }

  const allTags = [...fixedHashtags, ...(post.hashtags || [])]

  return (
    <div className={`rounded-2xl bg-zinc-900 border p-3 transition ${post.posted ? 'border-emerald-400/30' : 'border-white/5'}`}>
      <div className="flex gap-3">
        <div className="w-20 h-28 rounded-xl bg-black/50 border border-white/10 shrink-0 overflow-hidden flex items-center justify-center">
          {post.imageUrl ? (
            <img src={post.imageUrl} alt={post.title} className="w-full h-full object-cover" />
          ) : (
            <ImageOff size={18} className="text-white/20" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-pink-300 text-[10px] font-bold uppercase tracking-wide">{post.pillarLabel}</p>
          <p className="text-white text-sm font-semibold mt-0.5">{post.title}</p>
          <p className="text-white/60 text-xs mt-1">&ldquo;{post.hook}&rdquo;</p>
        </div>
        <button onClick={() => onDelete(post.id)} className="text-white/25 hover:text-red-400 transition shrink-0 p-1" aria-label="discard">
          <Trash2 size={15} />
        </button>
      </div>

      {post.script && <p className="text-white/40 text-xs mt-2.5">{post.script}</p>}

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {allTags.map((h) => (
            <span key={h} className="px-2 py-0.5 rounded-full bg-white/10 text-white/60 text-[11px] font-semibold">{h}</span>
          ))}
        </div>
      )}
      {post.sound && (
        <p className="flex items-center gap-1.5 text-white/50 text-xs mt-2"><Music2 size={12} /> {post.sound}</p>
      )}

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={saveNotes}
        placeholder="Notes (views, what worked...)"
        rows={1}
        className="w-full mt-2.5 rounded-lg bg-black/40 border border-white/10 px-2.5 py-1.5 text-xs text-white placeholder-white/25 outline-none focus:border-pink-400/50 resize-none"
      />
      {savingNotes && <p className="text-white/30 text-[11px] mt-1">Saving...</p>}

      <button
        onClick={togglePosted}
        disabled={busy}
        className={`w-full mt-2.5 py-2 rounded-full text-xs font-semibold inline-flex items-center justify-center gap-1.5 border transition disabled:opacity-50 ${
          post.posted ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300' : 'bg-black/40 border-white/10 text-white/60'
        }`}
      >
        <Check size={13} className={post.posted ? 'opacity-100' : 'opacity-30'} />
        {post.posted ? 'Posted' : 'Mark as posted'}
      </button>
    </div>
  )
}

// Panel de administración "Marketing Playbook" — MOTOR DE MARKETING
// PROFESIONAL (petición del usuario: "esa función debe ser el marketing de
// la apk, subir 3-4 publicaciones por día... debe ser un motor de marketing
// profesional"). Cada día se genera un LOTE de piezas (rotando por ángulos/
// pilares de contenido distintos), cada una lista para publicar: título,
// hook, guion, hashtags, música e imagen de portada generada con IA,
// ancladas a las funciones reales de Twyk (no escenas genéricas). Cada
// pieza tiene su propio checkbox de "publicada" + notas, con racha de días
// consecutivos e historial.
export default function AdminMarketingPlaybookPage() {
  const { user, loading: authLoading } = useAuth()
  const isAdmin = !!user && user.role === 'admin'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/marketing-playbook', {
        cache: 'no-store',
        credentials: 'include',
        headers: { ...authHeaders() },
      })
      if (res.status === 403) {
        setError('forbidden')
        return
      }
      if (!res.ok) {
        setError('Error loading playbook')
        return
      }
      setData(await res.json())
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && isAdmin) load()
    else if (!authLoading) setLoading(false)
  }, [authLoading, isAdmin, load])

  const generateBatch = async () => {
    setGenerating(true)
    setGenError('')
    try {
      const res = await fetch('/api/admin/marketing-playbook/generate-batch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ date: data?.todayKey, count: data?.dailyPostCount || 4, withImages: true }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(json.posts)) {
        setData((prev) => prev ? { ...prev, posts: [...(prev.posts || []), ...json.posts], streak: json.streak } : prev)
      } else {
        setGenError(json?.message || 'The AI could not generate today\'s batch, try again')
      }
    } catch {
      setGenError('Network error')
    } finally {
      setGenerating(false)
    }
  }

  const updatePost = async (id, fields) => {
    try {
      const res = await fetch('/api/admin/marketing-playbook/post', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ id, ...fields }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.ok) {
        setData((prev) => prev ? {
          ...prev,
          streak: json.streak,
          posts: (prev.posts || []).map((p) => (p.id === id ? json.post : p)),
        } : prev)
      }
    } catch {
      // silencioso: el checkbox/nota simplemente no se refleja, sin romper la página
    }
  }

  const deletePost = async (id) => {
    try {
      const res = await fetch(`/api/admin/marketing-playbook/post/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { ...authHeaders() },
      })
      if (res.ok) {
        setData((prev) => prev ? { ...prev, posts: (prev.posts || []).filter((p) => p.id !== id) } : prev)
      }
    } catch { /* noop */ }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-[100dvh] bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/50" />
      </div>
    )
  }

  if (!isAdmin || error === 'forbidden') {
    return (
      <div className="min-h-[100dvh] bg-black text-white flex flex-col items-center justify-center gap-3 px-6 text-center">
        <ShieldAlert className="w-12 h-12 text-red-500" />
        <h1 className="text-xl font-bold">Access denied</h1>
        <p className="text-white/60 text-sm max-w-xs">This page is for administrators only.</p>
        <a href="/" className="mt-2 px-4 py-2 rounded-full bg-white text-black text-sm font-semibold">Back to home</a>
      </div>
    )
  }

  const strategy = data?.strategy
  const posts = data?.posts || []
  const fixedHashtags = strategy?.hashtags?.fixed || []
  const history = data?.history || []
  const postedToday = posts.filter((p) => p.posted).length

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-pink-400" />
            <h1 className="text-xl font-bold">Marketing Playbook</h1>
          </div>
          <button onClick={load} className="p-2 rounded-full hover:bg-white/10 active:scale-90 transition" aria-label="reload">
            <RefreshCw className="w-5 h-5 text-white/70" />
          </button>
        </header>

        {error && error !== 'forbidden' && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* Racha + progreso del lote de hoy */}
        <section
          className="rounded-2xl p-4 mb-6 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg, rgba(244,114,182,0.14), rgba(168,85,247,0.14))', border: '1px solid rgba(244,114,182,0.3)' }}
        >
          <div>
            <div className="flex items-center gap-1.5 text-pink-300 text-[11px] font-bold uppercase tracking-wide mb-1">
              <Flame size={12} className="fill-pink-300" /> Posting streak
            </div>
            <p className="text-2xl font-extrabold text-white">{data?.streak || 0} <span className="text-sm font-semibold text-white/50">day{(data?.streak || 0) === 1 ? '' : 's'}</span></p>
          </div>
          <div className="text-right">
            <p className="text-white/70 text-sm font-semibold">{postedToday}/{posts.length || data?.dailyPostCount || 4} posted today</p>
            <p className="text-white/40 text-xs mt-0.5">Goal: {data?.dailyPostCount || 4}/day</p>
          </div>
        </section>

        {/* Motor de generación: lote de piezas listas para publicar, ancladas
            a las funciones reales de Twyk (Luxury Battle, versus, duetos,
            retos) — no escenas genéricas desconectadas del producto. */}
        <section className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-white text-sm font-bold">
              <Sparkles size={15} className="text-pink-300" /> Today&apos;s content engine
            </div>
          </div>
          <p className="text-white/40 text-xs mb-3">
            Generates {data?.dailyPostCount || 4} ready-to-publish posts a day (title, script, hashtags, sound + AI cover image), rotating content angles based on Twyk&apos;s real features.
          </p>
          {genError && <p className="text-red-400 text-sm mb-3">{genError}</p>}
          <button
            onClick={generateBatch}
            disabled={generating}
            className="w-full py-3 rounded-full text-black text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #F472B6, #A855F7)' }}
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : (posts.length > 0 ? <Plus className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />)}
            {generating ? 'Generating (writing + images)...' : posts.length > 0 ? 'Generate more posts' : `Generate today's ${data?.dailyPostCount || 4} posts`}
          </button>
        </section>

        {/* Piezas del día */}
        {posts.length > 0 && (
          <section className="mb-6 space-y-3">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} fixedHashtags={fixedHashtags} onUpdate={updatePost} onDelete={deletePost} />
            ))}
          </section>
        )}

        {/* Estrategia de referencia (formato, cadencia, CTA, growth loop) */}
        <section className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-6">
          <div className="flex items-center gap-1.5 text-white text-sm font-bold mb-3">
            <Hash size={15} className="text-pink-300" /> Playbook reference
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-white/50 text-[11px] font-bold uppercase tracking-wide mb-0.5">Duration & hook</p>
              <p className="text-white/80">{strategy?.format?.duration}</p>
              <p className="text-white/80 mt-1">{strategy?.format?.hook}</p>
            </div>
            <div>
              <p className="text-white/50 text-[11px] font-bold uppercase tracking-wide mb-0.5">Fixed hashtags</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {fixedHashtags.map((h) => (
                  <span key={h} className="px-2.5 py-1 rounded-full bg-white/10 text-white/70 text-xs font-semibold">{h}</span>
                ))}
              </div>
              <p className="text-white/50 text-xs mt-1.5">{strategy?.hashtags?.variableNote}</p>
            </div>
            <div>
              <p className="text-white/50 text-[11px] font-bold uppercase tracking-wide mb-0.5">Sound & CTA</p>
              <p className="text-white/80">{strategy?.format?.sound}</p>
              <p className="text-white/80 mt-1">{strategy?.format?.cta}</p>
            </div>
            <div>
              <p className="text-white/50 text-[11px] font-bold uppercase tracking-wide mb-0.5">Growth loop</p>
              <p className="text-white/80">{strategy?.growthLoop}</p>
            </div>
          </div>
        </section>

        {/* Historial (resumen por día) */}
        <section>
          <div className="flex items-center gap-1.5 text-white/60 text-[11px] font-bold uppercase tracking-wide mb-3">
            <History size={12} /> Recent history
          </div>
          {history.length === 0 ? (
            <p className="text-white/40 text-sm">No batches generated yet.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.date} className="rounded-xl bg-zinc-900 border border-white/5 p-3 flex items-center justify-between gap-3">
                  <p className="text-white text-sm font-semibold">{h.date}</p>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${h.posted >= h.total && h.total > 0 ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/40'}`}>
                    {h.posted}/{h.total} posted
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
