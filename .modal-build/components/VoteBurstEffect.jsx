'use client'

import VoteIcon from './icons/VoteIcon'

/**
 * VoteBurstEffect — animación al votar (doble toque en el vídeo/foto).
 * Muestra ÚNICAMENTE el icono de voto con un rebote elástico (igual de
 * simple que el "corazón" clásico de TikTok/Instagram al hacer doble tap),
 * sin halo, ondas expansivas ni chispas alrededor.
 *
 * El componente vive dentro de un span 0x0 que actúa de "ancla": el padre
 * (CarouselSlide/DuetSlide) decide si esa ancla va en el punto exacto del
 * toque o centrada en pantalla.
 */
function VoteBurstEffect({ color = '#fff', fillColor, strokeColor }) {
  return (
    <span className="relative inline-block" style={{ width: 0, height: 0 }}>
      <span className="vote-icon-pop" style={{ color, filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.55))' }}>
        <VoteIcon className="w-24 h-24" strokeWidth={320} filled fillColor={fillColor} strokeColor={strokeColor} />
      </span>
    </span>
  )
}

export default VoteBurstEffect
