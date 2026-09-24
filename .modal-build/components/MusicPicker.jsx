'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Search, X, Play, Pause, Music2, Check, Loader2, ChevronDown } from 'lucide-react'

/**
 * MusicPicker — buscador de música (iTunes Search API, alternativa gratuita a
 * Spotify). Permite buscar canciones, escuchar el preview de 30s y seleccionar
 * una para adjuntarla a la publicación.
 *
 * props:
 *   open      bool
 *   onClose   () => void
 *   onSelect  (track | null) => void   // null = quitar música
 *   current   track seleccionado actual (para marcarlo)
 *
 * track: { id, title, artist, artwork, previewUrl, duration }
 */
export default function MusicPicker({ open, onClose, onSelect, current }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [playingId, setPlayingId] = useState(null)
  const audioRef = useRef(null)
  const debounceRef = useRef(null)

  // Audio compartido para los previews.
  useEffect(() => {
    audioRef.current = typeof Audio !== 'undefined' ? new Audio() : null
    const a = audioRef.current
    if (a) a.addEventListener('ended', () => setPlayingId(null))
    return () => {
      if (a) { try { a.pause() } catch { /* ignore */ } a.src = '' }
    }
  }, [])

  // Al cerrar: parar audio y limpiar.
  useEffect(() => {
    if (!open) {
      if (audioRef.current) { try { audioRef.current.pause() } catch { /* ignore */ } }
      setPlayingId(null)
    }
  }, [open])

  const runSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); setLoading(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
      const data = await res.json()
      setResults(data.results || [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Búsqueda con debounce (350ms).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(query), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, runSearch])

  const togglePreview = (track, e) => {
    e.stopPropagation()
    const a = audioRef.current
    if (!a) return
    if (playingId === track.id) {
      try { a.pause() } catch { /* ignore */ }
      setPlayingId(null)
      return
    }
    try {
      a.src = track.previewUrl
      a.currentTime = 0
      a.play().then(() => setPlayingId(track.id)).catch(() => setPlayingId(null))
    } catch { setPlayingId(null) }
  }

  const choose = (track) => {
    if (audioRef.current) { try { audioRef.current.pause() } catch { /* ignore */ } }
    onSelect?.(track)
    onClose?.()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl bg-[#121214] max-h-[88vh] h-[88vh] sm:h-auto overflow-hidden flex flex-col border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cerrar */}
        <button type="button" onClick={onClose} aria-label="close" className="relative z-10 flex justify-center items-center pt-3 pb-1 shrink-0 active:scale-90 transition">
          <ChevronDown className="w-5 h-5 text-zinc-500" strokeWidth={2.2} />
        </button>

        {/* Header + buscador */}
        <div className="px-4 pb-3 shrink-0">
          <h2 className="text-white text-[16px] font-bold tracking-tight flex items-center gap-2 mb-3">
            <Music2 size={18} strokeWidth={2} /> Add music
          </h2>
          <div className="flex items-center gap-2 bg-white/[0.07] border border-white/10 rounded-full px-3.5 h-11">
            <Search size={18} className="text-zinc-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search songs or artists"
              className="flex-1 bg-transparent outline-none text-white text-[14px] placeholder:text-zinc-500"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-zinc-400 hover:text-white shrink-0">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Quitar música (si hay una seleccionada) */}
        {current?.previewUrl && (
          <button
            onClick={() => { onSelect?.(null); onClose?.() }}
            className="mx-4 mb-2 shrink-0 text-[13px] text-rose-400 font-semibold text-left hover:text-rose-300"
          >
            Remove current music
          </button>
        )}

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto px-2 pb-6">
          {loading && (
            <div className="flex items-center justify-center py-10 text-zinc-500">
              <Loader2 size={22} className="animate-spin" />
            </div>
          )}
          {!loading && query && results.length === 0 && (
            <p className="text-center text-zinc-500 text-[14px] py-10">No results for &quot;{query}&quot;</p>
          )}
          {!loading && !query && (
            <p className="text-center text-zinc-500 text-[14px] py-10">Search for a song to add it to your post</p>
          )}
          {results.map((t) => {
            const isPlaying = playingId === t.id
            const isSelected = current?.id === t.id
            return (
              <button
                key={t.id}
                onClick={() => choose(t)}
                className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/[0.05] active:bg-white/[0.08] transition text-left"
              >
                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                  {t.artwork ? <img src={t.artwork} alt="" className="w-full h-full object-cover" /> : <Music2 className="w-6 h-6 text-zinc-500 m-auto mt-3" />}
                  <span
                    onClick={(e) => togglePreview(t, e)}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 active:opacity-100 transition"
                    style={{ opacity: isPlaying ? 1 : undefined }}
                  >
                    {isPlaying ? <Pause size={18} className="text-white" fill="white" /> : <Play size={18} className="text-white" fill="white" />}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-[14px] font-semibold truncate">{t.title}</p>
                  <p className="text-zinc-400 text-[12.5px] truncate">{t.artist}</p>
                </div>
                {isSelected ? (
                  <span className="w-7 h-7 rounded-full bg-white flex items-center justify-center shrink-0">
                    <Check size={16} className="text-black" strokeWidth={2.8} />
                  </span>
                ) : (
                  <span
                    onClick={(e) => togglePreview(t, e)}
                    className="w-8 h-8 rounded-full border border-white/15 flex items-center justify-center shrink-0 text-white active:scale-90 transition"
                  >
                    {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
