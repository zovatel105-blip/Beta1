'use client'

import { useEffect, useState } from 'react'
import { Flame, Trophy, X, Sparkles } from 'lucide-react'
import BottomSheet from './BottomSheet'
import Avatar from './Avatar'

/**
 * LuxuryBattleSheet — hoja inferior de "Luxury Battle" (petición del
 * usuario: mejora sobre el concepto viral de larpgpt.com -selfie -> escena
 * de lujo con IA-, pero integrada en el sistema de Retos/Versus YA
 * existente de esta app -sin cámara en vivo, eso se agregará más adelante
 * cuando la app escale-). Muestra el tema de lujo ACTUALMENTE activo (ej.
 * "Yacht Life", configurado por un admin vía POST /api/admin/luxury-battles/
 * theme) + un leaderboard (combina votos reales de la comunidad + un
 * puntaje de IA 0-100 por publicación, ver GET /api/luxury-battles/
 * leaderboard, route.js) + un botón para entrar a la batalla.
 *
 * Props:
 *  - open, onClose: control estándar de la hoja.
 *  - onEnter(theme): el padre decide qué hacer al pulsar "Enter" — en
 *    CompletedBattlesPage.jsx/Feed.jsx esto abre UploadDialog en modo
 *    'challenge' con el tema adjunto (ver luxuryTheme prop de ambos). Los
 *    retos ABIERTOS ('solo') NUNCA llevan tema (petición del usuario: "las
 *    publicaciones single no deben estar en las batallas porque solo
 *    existen para ser retadas").
 */
function formatCount(n) {
  const v = Math.round(Number(n) || 0)
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(v)
}

export default function LuxuryBattleSheet({ open, onClose, onEnter, themeId = null }) {
  const [theme, setTheme] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // `themeId` (petición del usuario: "que los usuarios puedan crear sus
  // trending challenge") — cuando se abre esta hoja desde una píldora de la
  // COMUNIDAD (CompletedBattlesPage.jsx), se pasa el id de ESE tema en vez
  // de dejar que se use siempre el oficial activo del admin (comportamiento
  // por defecto, sin cambios, cuando themeId es null). El endpoint ya
  // soportaba `?themeId=` desde antes (route.js).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const url = themeId ? `/api/luxury-battles/leaderboard?themeId=${encodeURIComponent(themeId)}` : '/api/luxury-battles/leaderboard'
    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        setTheme(d?.theme || null)
        setLeaderboard(Array.isArray(d?.leaderboard) ? d.leaderboard : [])
      })
      .catch(() => { if (!cancelled) { setTheme(null); setLeaderboard([]) } })
      .finally(() => { if (!cancelled) { setLoading(false); setLoaded(true) } })
    return () => { cancelled = true }
  }, [open, themeId])

  return (
    <BottomSheet open={open} onClose={onClose} className="bg-zinc-950" maxWidth="max-w-[480px]">
      <div className="flex items-center justify-between px-4 pt-2.5 pb-3">
        <div className="flex items-center gap-1.5 text-amber-300 text-[12px] font-bold uppercase tracking-wide">
          <Flame size={13} className="fill-amber-300" />
          Trending Challenge
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 active:scale-90 transition"
        >
          <X size={15} strokeWidth={1.9} />
        </button>
      </div>

      {loading && !loaded ? (
        <div className="px-5 pb-10 pt-2 text-center text-zinc-500 text-[13px]">Loading…</div>
      ) : !theme ? (
        <div className="px-5 pb-10 pt-2 text-center text-zinc-500 text-[13px]">No active trending challenge right now — check back soon.</div>
      ) : (
        <>
          <div className="px-5 pb-4">
            <h2 className="text-white text-[21px] font-bold tracking-tight">{theme.title}</h2>
            <p className="text-zinc-400 text-[13px] mt-1.5 leading-relaxed">{theme.description}</p>
          </div>

          <div className="px-4 pb-4">
            <button
              onClick={() => onEnter?.(theme)}
              className="w-full py-3.5 rounded-full text-black font-bold text-[15px] flex items-center justify-center gap-2 active:scale-[0.99] transition"
              style={{ background: 'linear-gradient(135deg, #FCD34D, #F59E0B)' }}
            >
              <Sparkles size={17} strokeWidth={2} /> Enter with an AI photo
            </button>
          </div>

          <div className="border-t border-white/10 px-4 pt-3 pb-5 max-h-[42vh] overflow-y-auto">
            <div className="flex items-center gap-1.5 text-zinc-400 text-[11px] font-bold uppercase tracking-wide mb-2 px-1">
              <Trophy size={12} /> Leaderboard
            </div>
            {leaderboard.length === 0 ? (
              <div className="py-6 text-center text-zinc-500 text-[13px]">No entries yet — be the first to battle!</div>
            ) : (
              <div className="space-y-0.5">
                {leaderboard.map((entry, i) => (
                  <div key={entry.postId} className="flex items-center gap-3 py-2 px-1 rounded-xl hover:bg-white/[0.04] transition">
                    <span className="w-5 text-center text-zinc-500 text-[12px] font-bold shrink-0">{i + 1}</span>
                    <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-zinc-800">
                      <Avatar src={entry.author?.avatarUrl} alt={entry.author?.username || ''} className="w-full h-full rounded-full" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-[13px] font-semibold truncate">
                        {entry.author?.username}{entry.opponent?.username ? ` vs ${entry.opponent.username}` : ''}
                      </p>
                      <p className="text-zinc-500 text-[11px]">
                        {formatCount(entry.votesTotal)} votes{entry.aiAvg != null ? ` · AI ${Math.round(entry.aiAvg)}` : ''}
                      </p>
                    </div>
                    <span className="text-amber-300 text-[14px] font-bold shrink-0">{formatCount(entry.combinedScore)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </BottomSheet>
  )
}
