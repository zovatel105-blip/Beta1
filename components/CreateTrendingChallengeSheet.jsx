'use client'

import { useState } from 'react'
import { Flame, X, Sparkles, Loader2, Check, RotateCcw } from 'lucide-react'
import BottomSheet from './BottomSheet'

/**
 * CreateTrendingChallengeSheet — petición del usuario: "que los usuarios
 * puedan crear sus trending challenge... un botón nuevo en la pantalla de
 * Retos donde el usuario escribe el nombre/idea y la IA genera la
 * descripción, similar a como ya funciona en el panel de administración
 * pero simplificado para usuarios normales". A diferencia del panel de
 * administración (que primero genera VARIAS ideas para elegir y luego las
 * activa en 2 pasos), aquí el usuario solo escribe UNA idea corta y la IA
 * la expande y la crea en un solo paso (POST /api/luxury-battles/community/
 * create) — más simple para un usuario normal. El resultado queda SEPARADO
 * del tema oficial del admin (petición explícita: "los creados por
 * usuarios aparte"), listado en la fila de la comunidad de
 * CompletedBattlesPage.jsx.
 *
 * Props:
 *  - open, onClose: control estándar de la hoja.
 *  - onCreated(theme): se llama tras crear con éxito, para que el padre
 *    refresque la lista de la comunidad.
 */
export default function CreateTrendingChallengeSheet({ open, onClose, onCreated }) {
  const [idea, setIdea] = useState('')
  const [stage, setStage] = useState('input') // input | loading | result | error
  const [theme, setTheme] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  const reset = () => {
    setIdea('')
    setStage('input')
    setTheme(null)
    setErrorMsg(null)
  }

  const handleClose = () => {
    reset()
    onClose?.()
  }

  const generate = async () => {
    const trimmed = idea.trim()
    if (trimmed.length < 3) return
    setStage('loading')
    setErrorMsg(null)
    try {
      const res = await fetch('/api/luxury-battles/community/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: trimmed }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.theme) {
        throw new Error(data?.message || 'Could not create your trending challenge')
      }
      setTheme(data.theme)
      setStage('result')
      onCreated?.(data.theme)
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong, please try again')
      setStage('error')
    }
  }

  return (
    <BottomSheet open={open} onClose={handleClose} className="bg-zinc-950" maxWidth="max-w-[480px]">
      <div className="flex items-center justify-between px-4 pt-2.5 pb-3">
        <div className="flex items-center gap-1.5 text-amber-300 text-[12px] font-bold uppercase tracking-wide">
          <Flame size={13} className="fill-amber-300" />
          Create Trending Challenge
        </div>
        <button
          onClick={handleClose}
          aria-label="Close"
          className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 active:scale-90 transition"
        >
          <X size={15} strokeWidth={1.9} />
        </button>
      </div>

      {(stage === 'input' || stage === 'loading') && (
        <div className="px-4 pb-5">
          <p className="text-zinc-400 text-[13px] mb-3 leading-relaxed">
            Type your idea and AI will turn it into a challenge others can join — inspired by what&apos;s actually trending right now.
          </p>
          <div className="rounded-2xl bg-black/45 backdrop-blur-xl border border-white/10 px-4 py-3">
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              disabled={stage === 'loading'}
              placeholder="e.g. cowboy core aesthetic, met gala glam, F1 grid walk…"
              rows={2}
              maxLength={120}
              className="w-full bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-400 focus:outline-none resize-none disabled:opacity-50"
            />
          </div>
          <button
            onClick={generate}
            disabled={idea.trim().length < 3 || stage === 'loading'}
            className="w-full mt-3 py-3.5 rounded-full text-black font-bold text-[16px] disabled:opacity-40 active:scale-[0.99] transition flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #FCD34D, #F59E0B)' }}
          >
            {stage === 'loading' ? (
              <><Loader2 size={17} className="animate-spin" /> Creating…</>
            ) : (
              <><Sparkles size={17} strokeWidth={2} /> Generate with AI</>
            )}
          </button>
        </div>
      )}

      {stage === 'error' && (
        <div className="px-4 pb-5">
          <div className="rounded-2xl bg-rose-500/10 border border-rose-500/25 px-4 py-3 mb-3">
            <p className="text-rose-300 text-[13px]">{errorMsg}</p>
          </div>
          <button
            onClick={generate}
            className="w-full py-3.5 rounded-full bg-white text-black font-bold text-[16px] active:scale-[0.99] transition flex items-center justify-center gap-2"
          >
            <RotateCcw size={17} strokeWidth={2} /> Try again
          </button>
        </div>
      )}

      {stage === 'result' && theme && (
        <div className="px-4 pb-5">
          <div className="rounded-2xl px-4 py-4 mb-3"
               style={{ background: 'linear-gradient(135deg, rgba(252,211,77,0.12), rgba(245,158,11,0.12))', border: '1px solid rgba(252,211,77,0.3)' }}>
            <div className="flex items-center gap-1.5 text-amber-300 text-[11px] font-bold uppercase tracking-wide mb-1.5">
              <Flame size={12} className="fill-amber-300" /> Your Trending Challenge
            </div>
            <h3 className="text-white text-[18px] font-bold tracking-tight">{theme.title}</h3>
            <p className="text-zinc-300 text-[13px] mt-1 leading-relaxed">{theme.description}</p>
          </div>
          <p className="text-zinc-500 text-[12px] text-center mb-3">It&apos;s live — other users can already find and join it.</p>
          <button
            onClick={handleClose}
            className="w-full py-3.5 rounded-full bg-white text-black font-bold text-[16px] active:scale-[0.99] transition flex items-center justify-center gap-2"
          >
            <Check size={18} strokeWidth={2.5} /> Done
          </button>
        </div>
      )}
    </BottomSheet>
  )
}
