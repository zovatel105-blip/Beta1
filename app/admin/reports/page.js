'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { ShieldAlert, Loader2, Flag, User as UserIcon, Film, RefreshCw, Ban, Check, X } from 'lucide-react'

function authHeaders() {
  try {
    const t = localStorage.getItem('twyk_token')
    return t ? { Authorization: `Bearer ${t}` } : {}
  } catch {
    return {}
  }
}

const REASON_COLORS = {
  Spam: 'bg-yellow-500/15 text-yellow-300',
  'Contenido inapropiado': 'bg-orange-500/15 text-orange-300',
  Acoso: 'bg-red-500/15 text-red-300',
  Violencia: 'bg-red-600/20 text-red-300',
  Desnudez: 'bg-pink-500/15 text-pink-300',
  'Información falsa': 'bg-blue-500/15 text-blue-300',
  Otro: 'bg-zinc-500/15 text-zinc-300',
}

export default function AdminReportsPage() {
  const { user, loading: authLoading } = useAuth()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [suspendMap, setSuspendMap] = useState({}) // reportId -> bool
  const [actingId, setActingId] = useState(null)

  const isAdmin = !!user && user.role === 'admin'

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/reports', {
        cache: 'no-store',
        credentials: 'include',
        headers: { ...authHeaders() },
      })
      if (res.status === 403) {
        setError('forbidden')
        setReports([])
      } else if (res.ok) {
        const data = await res.json()
        setReports(data.reports || [])
      } else {
        setError('Error al cargar reportes')
      }
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && isAdmin) load()
    else if (!authLoading) setLoading(false)
  }, [authLoading, isAdmin, load])

  const review = async (reportId) => {
    setActingId(reportId)
    try {
      const suspend = !!suspendMap[reportId]
      const res = await fetch(`/api/admin/reports/${reportId}/review`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ suspend }),
      })
      if (res.ok) setReports((prev) => prev.filter((r) => r.id !== reportId))
    } finally {
      setActingId(null)
    }
  }

  const dismiss = async (reportId) => {
    setActingId(reportId)
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/dismiss`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      })
      if (res.ok) setReports((prev) => prev.filter((r) => r.id !== reportId))
    } finally {
      setActingId(null)
    }
  }

  // Estados de pantalla
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
        <h1 className="text-xl font-bold">Acceso denegado</h1>
        <p className="text-white/60 text-sm max-w-xs">Esta página es solo para administradores.</p>
        <a href="/" className="mt-2 px-4 py-2 rounded-full bg-white text-black text-sm font-semibold">Volver al inicio</a>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-red-500" />
            <h1 className="text-xl font-bold">Moderación</h1>
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/70">{reports.length} pendientes</span>
          </div>
          <button onClick={load} className="p-2 rounded-full hover:bg-white/10 active:scale-90 transition" aria-label="recargar">
            <RefreshCw className="w-5 h-5 text-white/70" />
          </button>
        </header>

        {error && error !== 'forbidden' && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}

        {reports.length === 0 ? (
          <div className="text-center py-20 text-white/40">
            <Check className="w-10 h-10 mx-auto mb-3 text-green-500/70" />
            <p>No hay reportes pendientes.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => {
              const acting = actingId === r.id
              const targetName = r.targetType === 'user'
                ? (r.target?.username || r.targetId)
                : (r.target?.author?.username ? `@${r.target.author.username}` : r.targetId)
              return (
                <li key={r.id} className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {r.targetType === 'user'
                        ? <UserIcon className="w-4 h-4 text-white/50" />
                        : <Film className="w-4 h-4 text-white/50" />}
                      <span className="text-[13px] uppercase tracking-wide text-white/50">
                        {r.targetType === 'user' ? 'Usuario' : 'Publicación'}
                      </span>
                    </div>
                    <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${REASON_COLORS[r.reason] || 'bg-zinc-700 text-white'}`}>
                      <Flag className="w-3 h-3" /> {r.reason}
                    </span>
                  </div>

                  <div className="mt-3 text-sm space-y-1">
                    <p className="text-white/80">
                      Objetivo: <span className="font-medium">{targetName}</span>
                    </p>
                    {r.reporter?.username && (
                      <p className="text-white/50 text-[13px]">Reportado por @{r.reporter.username}</p>
                    )}
                    <p className="text-white/40 text-[12px]">
                      {r.createdAt ? new Date(r.createdAt).toLocaleString('es') : ''}
                    </p>
                    {r.targetUser?.suspended && (
                      <p className="text-red-400 text-[12px] font-medium">Este usuario ya está suspendido</p>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                    <label className={`flex items-center gap-2 text-[13px] cursor-pointer select-none ${r.targetUser ? 'text-white/80' : 'text-white/30'}`}>
                      <input
                        type="checkbox"
                        disabled={!r.targetUser || acting}
                        checked={!!suspendMap[r.id]}
                        onChange={(e) => setSuspendMap((m) => ({ ...m, [r.id]: e.target.checked }))}
                        className="w-4 h-4 accent-red-500"
                      />
                      <Ban className="w-4 h-4" /> Suspender usuario
                    </label>

                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        disabled={acting}
                        onClick={() => dismiss(r.id)}
                        className="px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <X className="w-4 h-4" /> Descartar
                      </button>
                      <button
                        disabled={acting}
                        onClick={() => review(r.id)}
                        className="px-3.5 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Revisar
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
