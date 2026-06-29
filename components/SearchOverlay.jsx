'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X, ArrowLeft, BadgeCheck } from 'lucide-react'
import Avatar from './Avatar'

// Overlay de búsqueda de USUARIOS (estilo TikTok). Se abre desde la lupa del
// feed. Busca en vivo (debounce) contra GET /api/users?q=... y al tocar un
// resultado abre el perfil de ese usuario.
export default function SearchOverlay({ open, onClose, onOpenProfile }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  // Autofocus al abrir; limpiar al cerrar.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 120)
      return () => clearTimeout(t)
    } else {
      setQuery('')
      setResults([])
      setLoading(false)
    }
  }, [open])

  // Búsqueda con debounce. Sin texto -> muestra sugerencias (lista general).
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const q = query.trim()
        const url = q ? `/api/users?q=${encodeURIComponent(q)}` : '/api/users'
        const res = await fetch(url, { cache: 'no-store' })
        const data = await res.json()
        setResults(Array.isArray(data.users) ? data.users : [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, open])

  if (!open) return null

  const handleSelect = (username) => {
    if (!username) return
    onClose?.()
    onOpenProfile?.(username)
  }

  return (
    <div className="fixed inset-0 z-[80] bg-[#0a0a0b] flex flex-col">
      {/* Cabecera: volver + input + limpiar */}
      <div
        className="flex items-center gap-2 px-3 pb-3 border-b border-white/10"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <button
          aria-label="cerrar búsqueda"
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
            placeholder="Buscar usuarios"
            className="flex-1 bg-transparent outline-none text-white text-[15px] placeholder:text-white/40"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query && (
            <button
              aria-label="borrar"
              onClick={() => { setQuery(''); inputRef.current?.focus() }}
              className="w-5 h-5 shrink-0 rounded-full bg-white/20 flex items-center justify-center text-white/80"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Resultados */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {!query.trim() && (
          <p className="px-4 pt-4 pb-1 text-white/40 text-[13px] font-medium">Sugerencias</p>
        )}

        {loading && results.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-8">
            <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-3">
              <Search size={24} className="text-white/30" />
            </div>
            <p className="text-white/70 text-[15px] font-semibold">
              {query.trim() ? 'Sin resultados' : 'No hay usuarios todavía'}
            </p>
            {query.trim() && (
              <p className="text-white/40 text-[13px] mt-1">Prueba con otro nombre o usuario</p>
            )}
          </div>
        ) : (
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
        )}
      </div>
    </div>
  )
}
