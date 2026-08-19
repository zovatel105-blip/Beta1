'use client'

import { useEffect, useState } from 'react'
import { Flame, Trophy, X, Sparkles, Plus } from 'lucide-react'
import BottomSheet from './BottomSheet'
import Avatar from './Avatar'
import CreateTrendingChallengeSheet from './CreateTrendingChallengeSheet'

/**
 * LuxuryBattleSheet — hoja inferior de "Trending Challenge" (petición del
 * usuario: mejora sobre el concepto viral de larpgpt.com -selfie -> escena
 * con IA-, pero integrada en el sistema de Retos/Versus YA existente de
 * esta app). Muestra el tema seleccionado (por defecto, el OFICIAL activo
 * del admin, ej. "Yacht Life") + su leaderboard (votos reales + puntaje de
 * IA, ver GET /api/luxury-battles/leaderboard) + un botón para entrar.
 *
 * TODO EN UN SOLO MODAL (petición explícita del usuario: "los trending con
 * ia deben ser la píldora oficial y la nueva fila no debe ser una nueva
 * fila, debe ser junto a la píldora oficial cuando abre el modal, no una
 * nueva fila" — es decir: UN SOLO punto de entrada en la pantalla de Retos
 * -la píldora dorada de siempre-, y aquí DENTRO, en esta misma hoja, se
 * puede: (a) ver/entrar al tema oficial (comportamiento de siempre), (b)
 * cambiar a cualquier Trending Challenge creado por OTROS usuarios -fila de
 * píldoras, separada visualmente del tema oficial pero en el MISMO modal-,
 * y (c) crear el tuyo propio con IA (botón "+", abre
 * CreateTrendingChallengeSheet apilada encima). Nada de esto vive ya en
 * CompletedBattlesPage.jsx — todo se maneja aquí, internamente.
 *
 * Props:
 *  - open, onClose: control estándar de la hoja.
 *  - onEnter(theme): el padre decide qué hacer al pulsar "Enter" — en
 *    CompletedBattlesPage.jsx/Feed.jsx esto abre UploadDialog en modo
 *    'challenge' con el tema adjunto. Los retos ABIERTOS ('solo') NUNCA
 *    llevan tema.
 */
function formatCount(n) {
  const v = Math.round(Number(n) || 0)
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(v)
}

export default function LuxuryBattleSheet({ open, onClose, onEnter }) {
  const [theme, setTheme] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  // null = tema OFICIAL activo (comportamiento de siempre); un id = un
  // Trending Challenge de la comunidad elegido en la fila de abajo.
  const [selectedThemeId, setSelectedThemeId] = useState(null)
  const [communityThemes, setCommunityThemes] = useState([])
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  // Título del tema OFICIAL para la píldora de la fila (independiente de
  // `theme`, que cambia según lo que esté seleccionado — sin esto, al
  // seleccionar un tema de la comunidad la píldora "oficial" mostraría por
  // error el título del tema de la comunidad en vez del suyo).
  const [officialTheme, setOfficialTheme] = useState(null)

  const loadCommunityThemes = () => {
    fetch('/api/luxury-battles/community', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setCommunityThemes(Array.isArray(d?.themes) ? d.themes : []))
      .catch(() => setCommunityThemes([]))
  }

  // Al abrir la hoja, siempre se empieza mostrando el tema OFICIAL (mismo
  // comportamiento de siempre) + se carga la fila de la comunidad + el
  // título oficial (para la píldora, ver comentario arriba).
  useEffect(() => {
    if (!open) return
    setSelectedThemeId(null)
    loadCommunityThemes()
    fetch('/api/luxury-battles/active', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setOfficialTheme(d?.theme || null))
      .catch(() => setOfficialTheme(null))
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const url = selectedThemeId ? `/api/luxury-battles/leaderboard?themeId=${encodeURIComponent(selectedThemeId)}` : '/api/luxury-battles/leaderboard'
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
  }, [open, selectedThemeId])

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

      {/* Fila de Trending Challenges — el oficial (si hay) resaltado en
          dorado sólido + los de la COMUNIDAD (petición del usuario: "que
          los usuarios puedan crear sus trending challenge") + botón "+"
          para crear uno nuevo. Tocar cualquiera cambia el contenido de ESTA
          MISMA hoja (título/descripción/leaderboard/Enter) al tema
          elegido — nunca abre una pantalla ni fila nueva fuera de aquí. */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar px-4 pb-3">
        <button
          onClick={() => setCreateSheetOpen(true)}
          className="shrink-0 flex items-center gap-1 whitespace-nowrap text-[11px] font-bold px-2.5 py-1.5 rounded-full active:scale-95 transition"
          style={{ background: 'rgba(252,211,77,0.10)', border: '1px dashed rgba(252,211,77,0.4)', color: '#FCD34D' }}
        >
          <Plus size={11} strokeWidth={2.5} /> New
        </button>
        {officialTheme && (
          <button
            onClick={() => setSelectedThemeId(null)}
            className="shrink-0 whitespace-nowrap text-[11px] font-bold px-2.5 py-1.5 rounded-full transition"
            style={{
              background: !selectedThemeId ? 'linear-gradient(135deg, #FCD34D, #F59E0B)' : 'rgba(252,211,77,0.08)',
              color: !selectedThemeId ? '#1a1200' : '#FCD34D',
              border: !selectedThemeId ? 'none' : '1px solid rgba(252,211,77,0.25)',
            }}
          >
            {officialTheme.title}
          </button>
        )}
        {communityThemes.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedThemeId(t.id)}
            className="shrink-0 whitespace-nowrap text-[11px] font-semibold px-2.5 py-1.5 rounded-full transition"
            style={{
              background: selectedThemeId === t.id ? 'linear-gradient(135deg, #FCD34D, #F59E0B)' : 'rgba(252,211,77,0.08)',
              color: selectedThemeId === t.id ? '#1a1200' : '#FCD34D',
              border: selectedThemeId === t.id ? 'none' : '1px solid rgba(252,211,77,0.25)',
            }}
          >
            {t.title}
          </button>
        ))}
      </div>

      {loading && !loaded ? (
        <div className="px-5 pb-10 pt-2 text-center text-zinc-500 text-[13px]">Loading…</div>
      ) : !theme ? (
        <div className="px-5 pb-10 pt-2 text-center text-zinc-500 text-[13px]">No active trending challenge right now — create your own above, or check back soon.</div>
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

          <div className="border-t border-white/10 px-4 pt-3 pb-5 max-h-[36vh] overflow-y-auto">
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

      <CreateTrendingChallengeSheet
        open={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
        onCreated={() => {
          // Petición del usuario: "los creados por la comunidad cuando
          // escribo el challenge no debe cambiar [el oficial]" — crear uno
          // nuevo solo AÑADE su píldora a la fila; NO cambia lo que se está
          // mostrando en el resto de la hoja (que sigue siendo el tema
          // OFICIAL por defecto, o el que ya tuvieras seleccionado). Antes
          // esto seleccionaba automáticamente el recién creado — quitado.
          loadCommunityThemes()
        }}
      />
    </BottomSheet>
  )
}
