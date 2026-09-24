'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Activity, Loader2, RefreshCw, ShieldAlert, Gauge, Target, Eye, PlayCircle, Layers, Sparkles } from 'lucide-react'

function authHeaders() {
  try {
    const t = localStorage.getItem('twyk_token')
    return t ? { Authorization: `Bearer ${t}` } : {}
  } catch {
    return {}
  }
}

function pct(v) {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`
}
function num(v) {
  return v == null ? '—' : v.toFixed(3)
}

function MetricCard({ icon: Icon, label, value, hint, tone = 'cyan' }) {
  const tones = {
    cyan: 'from-cyan-500/20 to-cyan-500/5 text-cyan-300 border-cyan-500/20',
    violet: 'from-violet-500/20 to-violet-500/5 text-violet-300 border-violet-500/20',
    emerald: 'from-emerald-500/20 to-emerald-500/5 text-emerald-300 border-emerald-500/20',
    amber: 'from-amber-500/20 to-amber-500/5 text-amber-300 border-amber-500/20',
  }
  return (
    <div className={`rounded-2xl border bg-gradient-to-b ${tones[tone]} p-5`}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide opacity-80">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-2 text-3xl font-bold text-white">{value}</div>
      {hint ? <div className="mt-1 text-xs text-zinc-400">{hint}</div> : null}
    </div>
  )
}

export default function RecoDashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const isAdmin = !!user && user.role === 'admin'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/reco/metrics?k=10', {
        cache: 'no-store',
        credentials: 'include',
        headers: { ...authHeaders() },
      })
      if (res.status === 403) {
        setError('forbidden')
      } else if (res.ok) {
        const data = await res.json()
        setMetrics(data.metrics || null)
      } else {
        setError('failed')
      }
    } catch {
      setError('failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading) load()
  }, [authLoading, load])

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-300">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!isAdmin || error === 'forbidden') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center text-zinc-300">
        <ShieldAlert className="h-10 w-10 text-red-400" />
        <h1 className="text-xl font-semibold text-white">Admins only</h1>
        <p className="max-w-md text-sm text-zinc-400">
          Log in with an admin account to view the TWYK Engine dashboard.
        </p>
      </div>
    )
  }

  const m = metrics || {}
  const t = m.totals || {}

  return (
    <div className="min-h-screen bg-zinc-950 px-5 py-8 text-zinc-200">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-cyan-500 to-violet-600 p-2.5">
              <Activity className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">TWYK Engine — Métricas</h1>
              <p className="text-sm text-zinc-400">Calidad del recomendador en tiempo real</p>
            </div>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            <RefreshCw className="h-4 w-4" /> Refrescar
          </button>
        </div>

        {/* Métricas de ranking */}
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Calidad de ranking</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard icon={Target} tone="violet" label="AUC pairwise" value={num(m.auc)}
            hint={`${m.aucSamples || 0} votos · >0.5 = aprende`} />
          <MetricCard icon={Gauge} tone="cyan" label={`NDCG@${m.k ?? 10}`} value={num(m.ndcgAtK)}
            hint={`${m.ndcgViewers || 0} viewers`} />
          <MetricCard icon={Eye} tone="emerald" label="CTR (voto/impresión)" value={pct(m.ctr)} />
          <MetricCard icon={Layers} tone="amber" label="Cobertura catálogo" value={pct(m.catalogCoverage)} />
        </div>

        {/* Watch-time */}
        <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-widest text-zinc-500">Retención (watch-time)</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard icon={PlayCircle} tone="emerald" label="Completion rate" value={pct(m.completionRate)} />
          <MetricCard icon={PlayCircle} tone="cyan" label="Watch ratio medio" value={pct(m.avgWatchRatio)} />
          <MetricCard icon={Eye} tone="violet" label="Impresiones" value={t.impressions ?? '—'} />
          <MetricCard icon={Activity} tone="amber" label="Votos" value={t.votes ?? '—'} />
        </div>

        {/* Estado del modelo */}
        <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-widest text-zinc-500">Estado del modelo (Two-Tower)</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard icon={Sparkles} tone="violet" label="Vectores usuario" value={t.userVectors ?? '—'} />
          <MetricCard icon={Sparkles} tone="cyan" label="Vectores item" value={t.itemVectors ?? '—'} />
          <MetricCard icon={Layers} tone="emerald" label="Perfiles afinidad" value={t.profiles ?? '—'} />
          <MetricCard icon={Gauge} tone="amber" label="ANN" value={m.ann?.ready ? `dim ${m.ann.dim}` : '—'}
            hint={m.ann ? `prefiltro >${m.ann.threshold}` : ''} />
        </div>

        <p className="mt-8 text-center text-xs text-zinc-600">
          Generado: {m.generatedAt ? new Date(m.generatedAt).toLocaleString() : '—'}
        </p>
      </div>
    </div>
  )
}
