'use client'

import { Heart } from 'lucide-react'

/**
 * HeartBurstEffect — animación al dar "like" (corazón) en una publicación
 * single (reto abierto). Mismo patrón/timing elástico que VoteBurstEffect
 * (reutiliza la keyframe `vote-icon-pop` de globals.css), con el icono de
 * corazón en rojo — reacción tipo "like" clásica.
 *
 * Vive dentro de un span 0x0 que actúa de ancla: el padre (OpenChallengeSlide)
 * decide dónde se centra (sobre el propio botón de corazón).
 */
function HeartBurstEffect() {
  return (
    <span className="relative inline-block" style={{ width: 0, height: 0 }}>
      <span className="vote-icon-pop" style={{ color: '#EF4444', filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.55))' }}>
        <Heart className="w-16 h-16" strokeWidth={1.5} fill="#EF4444" />
      </span>
    </span>
  )
}

export default HeartBurstEffect
