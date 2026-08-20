'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
  CalendarCheck,
  History,
  Sparkles,
} from 'lucide-react'

function authHeaders() {
  try {
    const t = localStorage.getItem('twyk_token')
    return t ? { Authorization: `Bearer ${t}` } : {}
  } catch {
    return {}
  }
}

// Panel de administración "Marketing Playbook" (petición del usuario: guardar
// como página real de la app la estrategia de marketing tipo LarpGPT que
// antes solo se había compartido como mensaje de chat en una sesión
// anterior). Muestra: (1) la estrategia de referencia (formato de vídeo,
// hashtags fijos, cadencia, CTA), (2) la idea de contenido sugerida para HOY
// (rotación determinista por fecha, ver lib/marketingPlaybook.js — sin IA),
// (3) un formulario para registrar si se publicó hoy + hashtags/sonido/notas,
// con racha de días consecutivos, y (4) el historial de los últimos días.
export default function AdminMarketingPlaybookPage() {
  const { user, loading: authLoading } = useAuth()
  const isAdmin = !!user && user.role === 'admin'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [posted, setPosted] = useState(false)
  const [contentIdea, setContentIdea] = useState('')
  const [extraHashtag, setExtraHashtag] = useState('')
  const [sound, setSound] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Generación de contenido con IA, anclada al proyecto real de Twyk
  // (petición del usuario: "esa función debe crear contenido basado en mi
  // proyecto para promocionar la web apk"), en vez de solo la idea
  // determinista/genérica de escena de lujo.
  const [aiIdeas, setAiIdeas] = useState([])
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
      const json = await res.json()
      setData(json)
      const entry = json.todayEntry
      setPosted(!!entry?.posted)
      setContentIdea(entry?.contentIdea || json.suggestedIdea?.hook || '')
      const fixed = json.strategy?.hashtags?.fixed || []
      const savedExtra = (entry?.hashtags || []).find((h) => !fixed.includes(h)) || ''
      setExtraHashtag(savedExtra)
      setSound(entry?.sound || '')
      setNotes(entry?.notes || '')
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

  const generateIdeas = async () => {
    setGenerating(true)
    setGenError('')
    try {
      const avoid = (data?.logs || []).map((l) => l.contentIdea).filter(Boolean)
      const res = await fetch('/api/admin/marketing-playbook/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ count: 3, avoid }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(json.ideas)) {
        setAiIdeas(json.ideas)
      } else {
        setGenError(json?.message || 'The AI could not generate ideas, try again')
      }
    } catch {
      setGenError('Network error')
    } finally {
      setGenerating(false)
    }
  }

  const applyAiIdea = (idea) => {
    setContentIdea(idea.script ? `${idea.hook} — ${idea.script}` : idea.hook)
    if (idea.hashtags?.[0]) setExtraHashtag(idea.hashtags[0].replace(/^#/, ''))
    if (idea.soundHint) setSound(idea.soundHint)
    setSaveMsg('')
  }

  const fixedHashtags = data?.strategy?.hashtags?.fixed || []
  const allHashtags = useMemo(() => {
    const extra = extraHashtag.trim()
    return extra ? [...fixedHashtags, extra.startsWith('#') ? extra : `#${extra}`] : [...fixedHashtags]
  }, [fixedHashtags, extraHashtag])

  const save = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      const res = await fetch('/api/admin/marketing-playbook/log', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          date: data?.todayKey,
          posted,
          contentIdea: contentIdea.trim(),
          hashtags: allHashtags,
          sound: sound.trim(),
          notes: notes.trim(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.ok) {
        setSaveMsg('Saved!')
        setData((prev) => prev ? {
          ...prev,
          streak: json.streak,
          todayEntry: json.entry,
          logs: [json.entry, ...(prev.logs || []).filter((l) => l.date !== json.entry.date)],
        } : prev)
      } else {
        setSaveMsg(json?.message || 'Could not save')
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

  const strategy = data?.strategy
  const logs = data?.logs || []

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

        {/* Racha de días consecutivos publicando */}
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
          <p className="text-white/50 text-xs max-w-[45%] text-right">{strategy?.cadence}</p>
        </section>

        {/* Generar contenido con IA, anclado a las funciones reales de Twyk
            (Luxury Battle, versus, duetos, retos, descarga sin marca de agua)
            — no escenas de lujo genéricas desconectadas del producto. */}
        <section className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-white text-sm font-bold">
              <Sparkles size={15} className="text-pink-300" /> Generate content with AI
            </div>
            <button
              onClick={generateIdeas}
              disabled={generating}
              className="px-3.5 py-2 rounded-full text-black text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #F472B6, #A855F7)' }}
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? 'Thinking...' : 'Generate ideas'}
            </button>
          </div>
          <p className="text-white/40 text-xs mb-3">
            AI-written video ideas based on Twyk&apos;s real features (Luxury Battle AI editor, versus voting, duets, challenges) — ready to film, not generic content.
          </p>
          {genError && <p className="text-red-400 text-sm mb-3">{genError}</p>}
          {aiIdeas.length > 0 && (
            <div className="space-y-2">
              {aiIdeas.map((idea, i) => (
                <button
                  key={i}
                  onClick={() => applyAiIdea(idea)}
                  className="w-full text-left rounded-xl bg-black/40 border border-white/10 hover:border-pink-400/50 hover:bg-pink-400/5 p-3 transition"
                >
                  <p className="text-white text-sm font-semibold">{idea.title}</p>
                  <p className="text-white/70 text-xs mt-1">&ldquo;{idea.hook}&rdquo;</p>
                  {idea.script && <p className="text-white/40 text-xs mt-1">{idea.script}</p>}
                  {(idea.hashtags?.length > 0 || idea.soundHint) && (
                    <p className="text-pink-300/70 text-[11px] mt-1.5">
                      {idea.hashtags?.join(' ')}{idea.soundHint ? `  ·  🎵 ${idea.soundHint}` : ''}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Idea del día + registro de publicación */}
        <section className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-6">
          <div className="flex items-center gap-1.5 text-white text-sm font-bold mb-3">
            <CalendarCheck size={15} className="text-pink-300" /> Today&apos;s content ({data?.todayKey})
          </div>

          {data?.suggestedIdea && (
            <div className="rounded-xl bg-black/40 border border-white/10 p-3 mb-3">
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-wide mb-1">Quick idea (offline, no AI)</p>
              <p className="text-pink-300 text-[11px] font-bold uppercase tracking-wide">{data.suggestedIdea.title}</p>
              <p className="text-white text-sm mt-1">&ldquo;{data.suggestedIdea.hook}&rdquo;</p>
              <p className="text-white/40 text-xs mt-1">Scene: {data.suggestedIdea.scene}</p>
            </div>
          )}

          <div className="space-y-3">
            <textarea
              value={contentIdea}
              onChange={(e) => setContentIdea(e.target.value)}
              placeholder="Content idea / hook you're actually using today"
              rows={2}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-pink-400/50 resize-none"
            />

            <div>
              <div className="flex items-center gap-1.5 text-white/50 text-xs mb-1.5"><Hash size={13} /> Hashtags</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {fixedHashtags.map((h) => (
                  <span key={h} className="px-2.5 py-1 rounded-full bg-white/10 text-white/70 text-xs font-semibold">{h}</span>
                ))}
              </div>
              <input
                value={extraHashtag}
                onChange={(e) => setExtraHashtag(e.target.value)}
                placeholder={strategy?.hashtags?.variableNote || 'This week\'s trending hashtag'}
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-pink-400/50"
              />
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-white/50 text-xs mb-1.5"><Music2 size={13} /> Trending sound used</div>
              <input
                value={sound}
                onChange={(e) => setSound(e.target.value)}
                placeholder="e.g. sound name from TikTok Creative Center"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-pink-400/50"
              />
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (views, what worked, what to try next)"
              rows={2}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-pink-400/50 resize-none"
            />

            <button
              onClick={() => setPosted((p) => !p)}
              className={`w-full py-2.5 rounded-full text-sm font-semibold inline-flex items-center justify-center gap-2 border transition ${
                posted ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300' : 'bg-black/40 border-white/10 text-white/60'
              }`}
            >
              <Check size={15} className={posted ? 'opacity-100' : 'opacity-30'} />
              {posted ? 'Marked as posted today' : 'Mark as posted today'}
            </button>

            {saveMsg && <p className={`text-sm ${saveMsg === 'Saved!' ? 'text-emerald-400' : 'text-red-400'}`}>{saveMsg}</p>}
            <button
              onClick={save}
              disabled={saving}
              className="w-full py-3 rounded-full text-black text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #F472B6, #A855F7)' }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
              Save today&apos;s log
            </button>
          </div>
        </section>

        {/* Estrategia de referencia (formato, cadencia, CTA, growth loop) */}
        <section className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-6">
          <div className="flex items-center gap-1.5 text-white text-sm font-bold mb-3">
            <Megaphone size={15} className="text-pink-300" /> Playbook reference
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-white/50 text-[11px] font-bold uppercase tracking-wide mb-0.5">Duration & hook</p>
              <p className="text-white/80">{strategy?.format?.duration}</p>
              <p className="text-white/80 mt-1">{strategy?.format?.hook}</p>
            </div>
            <div>
              <p className="text-white/50 text-[11px] font-bold uppercase tracking-wide mb-0.5">Narrative arc</p>
              <p className="text-white/80">{strategy?.format?.narrative}</p>
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

        {/* Historial */}
        <section>
          <div className="flex items-center gap-1.5 text-white/60 text-[11px] font-bold uppercase tracking-wide mb-3">
            <History size={12} /> Recent history
          </div>
          {logs.length === 0 ? (
            <p className="text-white/40 text-sm">No entries logged yet.</p>
          ) : (
            <ul className="space-y-2">
              {logs.map((l) => (
                <li key={l.date} className="rounded-xl bg-zinc-900 border border-white/5 p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-semibold">{l.date}</p>
                    {l.contentIdea && <p className="text-white/50 text-xs mt-0.5 truncate">{l.contentIdea}</p>}
                    {l.hashtags?.length > 0 && <p className="text-white/30 text-xs mt-0.5 truncate">{l.hashtags.join(' ')}</p>}
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${l.posted ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/40'}`}>
                    {l.posted ? 'Posted' : 'Skipped'}
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
