'use client'

import { Flame } from 'lucide-react'

/**
 * FireBurstEffect — animación al dar "Fire" 🔥 (like) en una publicación
 * single (reto abierto). Mismo patrón/timing elástico que VoteBurstEffect
 * (reutiliza la keyframe `vote-icon-pop` de globals.css), pero con el icono
 * de llama en naranja — la reacción con el ADN de Twyk (fuego = trending/hot,
 * ya usado en la píldora "Trending" del feed principal).
 *
 * Vive dentro de un span 0x0 que actúa de ancla: el padre (OpenChallengeSlide)
 * decide dónde se centra (sobre el propio botón de fuego).
 */
function FireBurstEffect() {
  return (
    <span className="relative inline-block" style={{ width: 0, height: 0 }}>
      <span className="vote-icon-pop" style={{ color: '#F97316', filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.55))' }}>
        <Flame className="w-16 h-16" strokeWidth={1.5} fill="#F97316" />
      </span>
    </span>
  )
}

export default FireBurstEffect
