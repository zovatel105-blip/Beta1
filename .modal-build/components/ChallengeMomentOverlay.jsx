'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import ChallengeMomentPills from './ChallengeMomentPills'

/**
 * ChallengeMomentOverlay — Fase C del Motor de Challenges Dinámico.
 *
 * Se renderiza EN FLUJO NORMAL (no absoluto) justo ANTES de la fila de
 * avatar+nombre de cada tarjeta del feed (petición del usuario: "no debe
 * ser una tarjeta, deben ser pastillas que estén encima del avatar en
 * horizontal") — así el bloque inferior (avatar/caption) simplemente crece
 * hacia arriba para dejar sitio, sin overlays flotantes ni z-index a pelear.
 *
 * Lee `videoRef.current.currentTime` (o `getVideoEl()` si el lado visible
 * cambia dinámicamente, ver CarouselSlide.jsx) en su PROPIO
 * requestAnimationFrame, independiente del bucle de progreso de cada
 * tarjeta, para aparecer/desaparecer sincronizado con el vídeo sin
 * recargarlo ni pausarlo.
 */

const fetchedCache = new Map() // postId -> challenge doc (con resultados) | null

export default function ChallengeMomentOverlay({ postId, videoRef, getVideoEl, isActive }) {
  const { user } = useAuth()
  const [challenge, setChallenge] = useState(fetchedCache.get(postId) || null)
  const [activeMomentId, setActiveMomentId] = useState(null)
  const [selectionByMoment, setSelectionByMoment] = useState({})
  const [resultsByMoment, setResultsByMoment] = useState({})
  const [pointsDraft, setPointsDraft] = useState({})
  const [rankDraft, setRankDraft] = useState([])
  const [authHint, setAuthHint] = useState(false)
  const rafRef = useRef(0)
  const fetchedRef = useRef(false)

  const resolveVideoEl = useCallback(() => (getVideoEl ? getVideoEl() : videoRef?.current), [getVideoEl, videoRef])

  // Carga los momentos (una vez, cuando la tarjeta se activa por primera vez).
  useEffect(() => {
    if (!postId || !isActive || fetchedRef.current) return
    fetchedRef.current = true
    if (fetchedCache.has(postId)) { setChallenge(fetchedCache.get(postId)); return }
    fetch(`/api/posts/${encodeURIComponent(postId)}/challenge`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const doc = data?.challenge || null
        fetchedCache.set(postId, doc)
        setChallenge(doc)
        if (doc) {
          const sel = {}
          const res = {}
          for (const m of doc.moments) {
            if (m.results?.viewerSelection != null) sel[m.id] = m.results.viewerSelection
            res[m.id] = m.results
          }
          setSelectionByMoment(sel)
          setResultsByMoment(res)
        }
      })
      .catch(() => {})
  }, [postId, isActive])

  // Bucle propio: detecta en qué momento (por tiempo) está el vídeo activo.
  useEffect(() => {
    if (!isActive || !challenge?.moments?.length) { setActiveMomentId(null); return }
    const tick = () => {
      const el = resolveVideoEl()
      const t = el ? el.currentTime : 0
      const found = challenge.moments.find((m) => t >= m.startTime && t < m.endTime)
      setActiveMomentId((prev) => (found?.id !== prev ? (found?.id || null) : prev))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isActive, challenge, resolveVideoEl])

  const moment = challenge?.moments?.find((m) => m.id === activeMomentId) || null

  useEffect(() => { setPointsDraft({}); setRankDraft([]) }, [activeMomentId])

  const submitVote = useCallback((selection) => {
    if (!moment) return
    if (!user) { setAuthHint(true); setTimeout(() => setAuthHint(false), 2200); return }
    setSelectionByMoment((s) => ({ ...s, [moment.id]: selection }))
    fetch(`/api/posts/${encodeURIComponent(postId)}/challenge/moments/${encodeURIComponent(moment.id)}/vote`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selection }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.results) setResultsByMoment((r) => ({ ...r, [moment.id]: data.results })) })
      .catch(() => {})
  }, [moment, postId, user])

  if (!moment) return null

  const results = resultsByMoment[moment.id]
  const mySelection = selectionByMoment[moment.id]
  const hasVoted = mySelection != null
  const totalPoints = moment.settings?.maxPoints || 10
  const pctFor = (optId) => results?.options?.find((o) => o.id === optId)?.percent ?? 0

  const handleTap = (opt) => {
    if (moment.inputType === 'multi_select') {
      const cur = Array.isArray(mySelection) ? mySelection : []
      submitVote(cur.includes(opt.id) ? cur.filter((id) => id !== opt.id) : [...cur, opt.id])
    } else if (moment.inputType === 'points') {
      const used = Object.values(pointsDraft).reduce((a, b) => a + b, 0)
      if (used >= totalPoints) return
      const next = { ...pointsDraft, [opt.id]: (pointsDraft[opt.id] || 0) + 1 }
      setPointsDraft(next)
      submitVote(next)
    } else if (moment.inputType === 'ranking') {
      if (rankDraft.includes(opt.id)) return
      const next = [...rankDraft, opt.id]
      setRankDraft(next)
      if (next.length === moment.options.length) submitVote(next)
    } else {
      submitVote(opt.id)
    }
  }

  const pillLabel = (opt) => {
    if (moment.inputType === 'points') {
      const pts = pointsDraft[opt.id] || 0
      return pts > 0 ? `${opt.label} +${pts}` : opt.label
    }
    if (moment.inputType === 'ranking') {
      const rank = rankDraft.indexOf(opt.id)
      return rank >= 0 ? `${rank + 1}. ${opt.label}` : opt.label
    }
    return hasVoted ? `${opt.label} · ${pctFor(opt.id)}%` : opt.label
  }

  const isSelected = (opt) => {
    if (moment.inputType === 'multi_select') return Array.isArray(mySelection) && mySelection.includes(opt.id)
    if (moment.inputType === 'points') return (pointsDraft[opt.id] || 0) > 0
    if (moment.inputType === 'ranking') return rankDraft.includes(opt.id)
    return mySelection === opt.id
  }

  return (
    <ChallengeMomentPills
      className="mb-2.5 max-w-[calc(100%-1rem)] pointer-events-auto"
      question={moment.question}
      options={moment.options}
      isSelected={isSelected}
      isCorrect={(opt) => results?.correctOptionId === opt.id}
      getLabel={pillLabel}
      onOptionClick={handleTap}
      footer={
        <>
          {hasVoted && results?.totalVoters > 0 && (
            <p className="mt-1 text-[10.5px] text-white/60">{results.totalVoters} voto{results.totalVoters === 1 ? '' : 's'}</p>
          )}
          {authHint && <p className="mt-1 text-[10.5px] text-amber-300">Inicia sesión para votar</p>}
        </>
      }
    />
  )
}
