'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { ShieldAlert, Loader2, Flame, Sparkles, Check, RefreshCw, Trophy } from 'lucide-react'

function authHeaders() {
  try {
    const t = localStorage.getItem('twyk_token')
    return t ? { Authorization: `Bearer ${t}` } : {}
  } catch {
    return {}
  }
}

// Panel de administración de "Luxury Battle" (petición del usuario: hasta
// ahora el único tema activo -"Yacht Life"- solo se podía crear/cambiar
// llamando directamente a POST /api/admin/luxury-battles/theme sin ninguna
// pantalla). Permite: (1) ver el tema activo y su historial, (2) generar
// ideas de tema CON IA basadas en tendencias de lujo actuales (no una lista
// fija, ver POST /api/admin/luxury-battles/generate-ideas) para elegir y
// editar antes de activarlas, (3) crear/activar un tema manualmente.
export default function AdminLuxuryBattlesPage() {
  const { user, loading: authLoading } = useAuth()
  const isAdmin = !!user && user.role === 'admin'

  const [activeTheme, setActiveTheme] = useState(null)
  const [themes, setThemes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [promptHint, setPromptHint] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [ideas, setIdeas] = useState([])
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  // Auto-generar Y activar de un solo clic el tema #1 más viral A NIVEL
  // MUNDIAL ahora mismo (petición explícita del usuario: "el tema
  // principal debe generarse por ia y debe ser lo mas viral mundialmente
  // en este momento") — sin pasar por elegir entre varias ideas.
  const [autoGenerating, setAutoGenerating] = useState(false)
  const [autoGenMsg, setAutoGenMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [activeRes, themesRes] = await Promise.all([
        fetch('/api/luxury-battles/active', { cache: 'no-store' }),
        fetch('/api/admin/luxury-battles/themes', { cache: 'no-store', credentials: 'include', headers: { ...authHeaders() } }),
      ])
      const activeData = await activeRes.json().catch(() => ({}))
      setActiveTheme(activeData?.theme || null)
      if (themesRes.status === 403) {
        setError('forbidden')
        setThemes([])
      } else if (themesRes.ok) {
        const data = await themesRes.json()
        setThemes(data.themes || [])
      } else {
        setError('Error loading themes')
      }
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

  const applyIdea = (idea) => {
    setTitle(idea.title || '')
    setDescription(idea.description || '')
    setPromptHint(idea.promptHint || '')
    setSaveMsg('')
  }

  const autoGenerateAndActivate = async () => {
    setAutoGenerating(true)
    setAutoGenMsg('')
    try {
      const res = await fetch('/api/admin/luxury-battles/auto-generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.theme) {
        setActiveTheme(data.theme)
        setThemes((prev) => [data.theme, ...prev.filter((t) => t.id !== data.theme.id)])
        setAutoGenMsg('Activated: ' + data.theme.title)
      } else {
        setAutoGenMsg(data?.message || 'Could not auto-generate a theme')
      }
    } catch {
      setAutoGenMsg('Network error')
    } finally {
      setAutoGenerating(false)
    }
  }

  const generateIdeas = async () => {
    setGenerating(true)
    setGenError('')
    try {
      const avoid = themes.map((t) => t.title).filter(Boolean)
      const res = await fetch('/api/admin/luxury-battles/generate-ideas', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ count: 4, avoid }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(data.ideas)) {
        setIdeas(data.ideas)
      } else {
        setGenError(data?.message || 'The AI could not generate ideas, try again')
      }
    } catch {
      setGenError('Network error')
    } finally {
      setGenerating(false)
    }
  }

  const activate = async () => {
    if (!title.trim() || !description.trim()) {
      setSaveMsg('Title and description are required')
      return
    }
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await fetch('/api/admin/luxury-battles/theme', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), promptHint: promptHint.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.theme) {
        setActiveTheme(data.theme)
        setThemes((prev) => [data.theme, ...prev.filter((t) => t.id !== data.theme.id)])
        setSaveMsg('Activated!')
        setTitle(''); setDescription(''); setPromptHint(''); setIdeas([])
      } else {
        setSaveMsg(data?.message || 'Could not activate the theme')
      }
    } catch {
      setSaveMsg('Network error')
    } finally {
      setSaving(false)
    }
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

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Flame className="w-6 h-6 text-amber-400" />
            <h1 className="text-xl font-bold">Luxury Battles</h1>
          </div>
          <button onClick={load} className="p-2 rounded-full hover:bg-white/10 active:scale-90 transition" aria-label="reload">
            <RefreshCw className="w-5 h-5 text-white/70" />
          </button>
        </header>

        {error && error !== 'forbidden' && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* Tema activo actual */}
        <section className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-6">
          <div className="flex items-center gap-1.5 text-amber-300 text-[11px] font-bold uppercase tracking-wide mb-2">
            <Flame size={12} className="fill-amber-300" /> Active theme
          </div>
          {activeTheme ? (
            <>
              <h2 className="text-white text-lg font-bold">{activeTheme.title}</h2>
              <p className="text-white/60 text-sm mt-1">{activeTheme.description}</p>
              {activeTheme.promptHint && (
                <p className="text-white/40 text-xs mt-2 italic">&ldquo;{activeTheme.promptHint}&rdquo;</p>
              )}
            </>
          ) : (
            <p className="text-white/40 text-sm">No active theme right now.</p>
          )}
        </section>

        {/* Auto-generar Y activar el #1 más viral MUNDIALMENTE, un solo
            clic (petición explícita del usuario). */}
        <section className="rounded-2xl p-4 mb-6" style={{ background: 'linear-gradient(135deg, rgba(252,211,77,0.12), rgba(245,158,11,0.12))', border: '1px solid rgba(252,211,77,0.3)' }}>
          <div className="flex items-center gap-1.5 text-amber-300 text-sm font-bold mb-1.5">
            <Flame size={15} className="fill-amber-300" /> #1 most viral worldwide, right now
          </div>
          <p className="text-white/50 text-xs mb-3">
            One click: AI picks the single most viral trend on the planet right now and activates it immediately as the official theme.
          </p>
          {autoGenMsg && <p className={`text-sm mb-2 ${autoGenMsg.startsWith('Activated') ? 'text-emerald-400' : 'text-red-400'}`}>{autoGenMsg}</p>}
          <button
            onClick={autoGenerateAndActivate}
            disabled={autoGenerating}
            className="w-full py-3 rounded-full text-black text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #FCD34D, #F59E0B)' }}
          >
            {autoGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
            {autoGenerating ? 'Finding it...' : 'Auto-generate & activate'}
          </button>
        </section>

        {/* Generador de ideas con IA */}
        <section className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-white text-sm font-bold">
              <Sparkles size={15} className="text-amber-300" /> Generate ideas with AI
            </div>
            <button
              onClick={generateIdeas}
              disabled={generating}
              className="px-3.5 py-2 rounded-full text-black text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #FCD34D, #F59E0B)' }}
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? 'Thinking...' : 'Generate ideas'}
            </button>
          </div>
          <p className="text-white/40 text-xs mb-3">
            The AI suggests fresh, currently-trending themes worldwide based on its own up-to-date knowledge — not a fixed list.
          </p>
          {genError && <p className="text-red-400 text-sm mb-3">{genError}</p>}
          {ideas.length > 0 && (
            <div className="space-y-2">
              {ideas.map((idea, i) => (
                <button
                  key={i}
                  onClick={() => applyIdea(idea)}
                  className="w-full text-left rounded-xl bg-black/40 border border-white/10 hover:border-amber-400/50 hover:bg-amber-400/5 p-3 transition"
                >
                  <p className="text-white text-sm font-semibold">{idea.title}</p>
                  <p className="text-white/50 text-xs mt-1">{idea.description}</p>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Crear / activar tema */}
        <section className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-6">
          <div className="flex items-center gap-1.5 text-white text-sm font-bold mb-3">
            <Check size={15} className="text-white/60" /> Create / activate theme
          </div>
          <div className="space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (e.g. Yacht Life)"
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-amber-400/50"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description shown to users"
              rows={2}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-amber-400/50 resize-none"
            />
            <textarea
              value={promptHint}
              onChange={(e) => setPromptHint(e.target.value)}
              placeholder="AI editor prompt hint (e.g. Put me relaxing on a luxury yacht deck...)"
              rows={2}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-amber-400/50 resize-none"
            />
            {saveMsg && <p className={`text-sm ${saveMsg === 'Activated!' ? 'text-emerald-400' : 'text-red-400'}`}>{saveMsg}</p>}
            <button
              onClick={activate}
              disabled={saving}
              className="w-full py-3 rounded-full bg-white text-black text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
              Activate theme
            </button>
          </div>
        </section>

        {/* Historial */}
        <section>
          <div className="flex items-center gap-1.5 text-white/60 text-[11px] font-bold uppercase tracking-wide mb-3">
            <Trophy size={12} /> Theme history
          </div>
          {themes.length === 0 ? (
            <p className="text-white/40 text-sm">No themes yet.</p>
          ) : (
            <ul className="space-y-2">
              {themes.map((t) => (
                <li key={t.id} className="rounded-xl bg-zinc-900 border border-white/5 p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-white text-sm font-semibold">{t.title}</p>
                    <p className="text-white/40 text-xs mt-0.5">{t.createdAt ? new Date(t.createdAt).toLocaleDateString('en') : ''}</p>
                  </div>
                  {t.active && (
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-400/15 text-amber-300 shrink-0">Active</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
