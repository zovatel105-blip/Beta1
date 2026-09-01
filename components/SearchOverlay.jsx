'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X, ArrowLeft, BadgeCheck, Flame } from 'lucide-react'
import Avatar from './Avatar'

// Overlay de búsqueda de USUARIOS (estilo TikTok). Se abre desde la lupa del
// feed. Busca en vivo (debounce) contra GET /api/users?q=... y al tocar un
// resultado abre el perfil de ese usuario.
//
// "Trending Challenge" (petición del usuario, tras varias correcciones en
// sesiones anteriores): se muestra SOLO el nombre del tema (ej. "Yacht
// Life") como una fila simple; al tocarlo se llama a
// `onOpenTrendingChallenge(themeId)`, que el padre (Feed.jsx) usa para
// cerrar este buscador y abrir TrendingChallengePostsPage.jsx (un vídeo
// deslizable con TODAS las publicaciones reales de ese challenge).
//
// Petición del usuario: "en la página de búsqueda deben aparecer 3
// trending challenge" — antes, sin ninguna búsqueda escrita, solo se
// mostraba 1 fila fija (el tema OFICIAL activo). Ahora se muestran hasta 3:
// el oficial activo primero (si existe) + los más recientes creados por la
// COMUNIDAD (GET /api/luxury-battles/community, sin `q`) hasta completar 3.
const DEFAULT_TRENDING_COUNT = 3
export default function SearchOverlay({ open, onClose, onOpenProfile, onOpenTrendingChallenge }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)
  const [trendingTheme, setTrendingTheme] = useState(null)
  // Hasta 3 Trending Challenges mostrados por defecto (sin búsqueda escrita):
  // el oficial activo + los más recientes de la comunidad, ver comentario
  // arriba. Se recalcula cada vez que `trendingTheme` cambia (llega async).
  const [defaultTrending, setDefaultTrending] = useState([])
  // Resultados de Trending Challenges que coinciden con lo escrito
  // (petición del usuario: "el buscador debe buscar trendings y
  // usuarios") — incluye el oficial (si su título coincide) + los de la
  // COMUNIDAD (GET /api/luxury-battles/community?q=...). Vacío cuando no
  // hay texto (en ese caso se muestra `defaultTrending`, ver arriba).
  const [trendingResults, setTrendingResults] = useState([])
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/luxury-battles/active', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setTrendingTheme(d?.theme || null) })
      .catch(() => { if (!cancelled) setTrendingTheme(null) })
    return () => { cancelled = true }
  }, [open])

  // Construye la lista de hasta 3 Trending Challenges por defecto: oficial
  // activo primero (si existe) + los N más recientes de la comunidad hasta
  // llegar a 3 (fetch sin `q`, devuelve los más recientes primero, ver
  // listCommunityLuxuryThemes en lib/db.js).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/luxury-battles/community', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        const community = Array.isArray(d?.themes) ? d.themes : []
        const seen = new Set()
        const merged = []
        for (const t of [trendingTheme, ...community]) {
          if (!t?.id || seen.has(t.id)) continue
          seen.add(t.id)
          merged.push(t)
          if (merged.length >= DEFAULT_TRENDING_COUNT) break
        }
        setDefaultTrending(merged)
      })
      .catch(() => { if (!cancelled) setDefaultTrending(trendingTheme ? [trendingTheme] : []) })
    return () => { cancelled = true }
  }, [open, trendingTheme])

  // Autofocus al abrir; limpiar al cerrar.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 120)
      return () => clearTimeout(t)
    } else {
      setQuery('')
      setResults([])
      setTrendingResults([])
      setLoading(false)
    }
  }, [open])

  // Búsqueda con debounce. Sin texto -> muestra sugerencias (lista general,
  // sin lista de trending: se sigue viendo solo la fila fija de arriba).
  // Con texto -> busca EN PARALELO usuarios + trending challenges: oficial
  // ACTUAL + comunidad + HISTORIAL de oficiales retirados (petición del
  // usuario tras notar que "Yacht Life" dejó de aparecer al retirarse:
  // "que los temas oficiales antiguos/retirados sigan siendo buscables
  // para siempre").
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const q = query.trim()
        const usersUrl = q ? `/api/users?q=${encodeURIComponent(q)}` : '/api/users'
        const [usersRes, communityRes, historyRes] = await Promise.all([
          fetch(usersUrl, { cache: 'no-store' }),
          q ? fetch(`/api/luxury-battles/community?q=${encodeURIComponent(q)}`, { cache: 'no-store' }) : Promise.resolve(null),
          q ? fetch(`/api/luxury-battles/history?q=${encodeURIComponent(q)}`, { cache: 'no-store' }) : Promise.resolve(null),
        ])
        const usersData = await usersRes.json()
        setResults(Array.isArray(usersData.users) ? usersData.users : [])

        if (!q) {
          setTrendingResults([])
        } else {
          const communityData = communityRes ? await communityRes.json().catch(() => null) : null
          const historyData = historyRes ? await historyRes.json().catch(() => null) : null
          const communityMatches = Array.isArray(communityData?.themes) ? communityData.themes : []
          const historyMatches = Array.isArray(historyData?.themes) ? historyData.themes : []
          const qLower = q.toLowerCase()
          const officialMatches = (trendingTheme?.title || '').toLowerCase().includes(qLower) ? [trendingTheme] : []
          // Dedupe por id: el tema oficial ACTIVO puede venir tanto de
          // `officialMatches` (chequeo rápido de `trendingTheme`) como de
          // `historyMatches` (que incluye TODO el historial, activo o no).
          const seen = new Set()
          const merged = []
          for (const t of [...officialMatches, ...historyMatches, ...communityMatches]) {
            if (!t?.id || seen.has(t.id)) continue
            seen.add(t.id)
            merged.push(t)
          }
          setTrendingResults(merged)
        }
      } catch {
        setResults([])
        setTrendingResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, open, trendingTheme])

  if (!open) return null

  const handleSelect = (username) => {
    if (!username) return
    onClose?.()
    onOpenProfile?.(username)
  }

  const handleOpenTrendingResult = (theme) => {
    if (!theme?.id) return
    onClose?.()
    onOpenTrendingChallenge?.(theme.id)
  }

  return (
    <div className="fixed inset-0 z-[80] bg-[#0a0a0b] flex flex-col">
      {/* Cabecera: volver + input + limpiar */}
      <div
        className="flex items-center gap-2 px-3 pb-3"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <button
          aria-label="close search"
          onClick={onClose}
          className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white/80 hover:bg-white/10 active:scale-95 transition"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 flex items-center gap-2 h-10 px-3 rounded-full bg-white/10">
          <Search size={18} className="text-white/50 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users or trending challenges"
            className="flex-1 bg-transparent outline-none text-white text-[15px] placeholder:text-white/40"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query && (
            <button
              aria-label="clear"
              onClick={() => { setQuery(''); inputRef.current?.focus() }}
              className="w-5 h-5 shrink-0 rounded-full bg-white/20 flex items-center justify-center text-white/80"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* "Trending Challenges" — hasta 3 filas (oficial activo + comunidad),
          visibles mientras no se esté buscando nada en concreto (petición
          del usuario: "en la página de búsqueda deben aparecer 3 trending
          challenge"). Al escribir, esta lista fija se sustituye por la
          sección "Trending challenges" de resultados, más abajo. Título de
          sección con el MISMO estilo que "Suggestions", y filas con el
          MISMO formato que las de usuarios (icono circular 44px + título +
          subtítulo, sin chevron) — petición explícita del usuario. */}
      {defaultTrending.length > 0 && !query.trim() && (
        <>
          <p className="px-4 pt-4 pb-1 text-white/40 text-[13px] font-medium">Trending challenges</p>
          <ul className="py-1">
            {defaultTrending.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => handleOpenTrendingResult(t)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 active:bg-white/10 transition text-left"
                >
                  <div className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center"
                       style={{ background: 'linear-gradient(135deg, rgba(252,211,77,0.18), rgba(245,158,11,0.18))', border: '1px solid rgba(252,211,77,0.35)' }}>
                    <Flame size={17} className="fill-current text-amber-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-white text-[15px] font-semibold truncate block">{t.title}</span>
                    <p className="text-white/50 text-[13px] truncate">
                      {t.source === 'user'
                        ? (t.creator?.username ? `by @${t.creator.username}` : 'Community challenge')
                        : (t.active ? 'Official challenge' : 'Official challenge · ended')}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Resultados */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {!query.trim() && (
          <p className="px-4 pt-4 pb-1 text-white/40 text-[13px] font-medium">Suggestions</p>
        )}

        {loading && results.length === 0 && trendingResults.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        ) : results.length === 0 && trendingResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-8">
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-3">
              <Search size={24} className="text-white/30" />
            </div>
            <p className="text-white/70 text-[15px] font-semibold">
              {query.trim() ? 'No results' : 'No users yet'}
            </p>
            {query.trim() && (
              <p className="text-white/40 text-[13px] mt-1">Try another name or challenge</p>
            )}
          </div>
        ) : (
          <>
            {/* Sección "Trending" — challenges (oficial + comunidad) que
                coinciden con lo escrito. Solo aparece con búsqueda activa. */}
            {trendingResults.length > 0 && (
              <>
                <p className="px-4 pt-3 pb-1 text-white/40 text-[13px] font-medium">Trending challenges</p>
                <ul className="py-1">
                  {trendingResults.map((t) => (
                    <li key={t.id}>
                      <button
                        onClick={() => handleOpenTrendingResult(t)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 active:bg-white/10 transition text-left"
                      >
                        <div className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center"
                             style={{ background: 'linear-gradient(135deg, rgba(252,211,77,0.18), rgba(245,158,11,0.18))', border: '1px solid rgba(252,211,77,0.35)' }}>
                          <Flame size={17} className="fill-current text-amber-300" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-white text-[15px] font-semibold truncate block">{t.title}</span>
                          <p className="text-white/50 text-[13px] truncate">
                            {t.source === 'user'
                              ? (t.creator?.username ? `by @${t.creator.username}` : 'Community challenge')
                              : (t.active ? 'Official challenge' : 'Official challenge · ended')}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Sección "Users" */}
            {results.length > 0 && (
              <>
                {query.trim() && <p className="px-4 pt-3 pb-1 text-white/40 text-[13px] font-medium">Users</p>}
                <ul className="py-1">
                  {results.map((u) => (
                    <li key={u.username}>
                      <button
                        onClick={() => handleSelect(u.username)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 active:bg-white/10 transition text-left"
                      >
                        <Avatar
                          src={u.avatarUrl}
                          alt={u.username}
                          className="w-11 h-11 rounded-full shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="text-white text-[15px] font-semibold truncate">{u.name || u.username}</span>
                            {u.verified && <BadgeCheck size={15} className="text-sky-400 shrink-0" />}
                          </div>
                          <p className="text-white/50 text-[13px] truncate">@{u.username}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
