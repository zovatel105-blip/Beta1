'use client'

import { useState } from 'react'
import VoteIcon from './icons/VoteIcon'

const PARTICLE_COUNT = 8

/**
 * VoteBurstEffect — animación al votar (doble toque en el vídeo/foto).
 * Más elaborada que el "corazón" clásico de TikTok/Instagram: combina un
 * halo de brillo, una doble onda expansiva (shockwave) y chispas radiales
 * del color del lado votado (A lila / B azul) alrededor del icono de voto,
 * que además tiene un rebote elástico en vez de un simple pop.
 *
 * Todo se anima con CSS puro (sin requestAnimationFrame por partícula), así
 * que es ligero incluso disparándose repetidas veces en la misma tarjeta.
 * El componente vive dentro de un span 0x0 que actúa de "ancla": el padre
 * (CarouselSlide/DuetSlide) decide si esa ancla va en el punto exacto del
 * toque o centrada en pantalla; aquí solo se posicionan las capas alrededor.
 */
function VoteBurstEffect({ color = '#fff' }) {
  const [particles] = useState(() =>
    Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const angle = (360 / PARTICLE_COUNT) * i + (Math.random() * 16 - 8)
      const dist = 46 + Math.random() * 28
      const delay = Math.random() * 70
      const size = 5 + Math.random() * 5
      return { angle, dist, delay, size, key: i }
    })
  )

  return (
    <span className="relative inline-block" style={{ width: 0, height: 0 }}>
      {/* Halo de brillo detrás de todo */}
      <span
        className="vote-glow"
        style={{ background: `radial-gradient(circle, ${color}aa 0%, ${color}00 72%)` }}
      />
      {/* Doble onda expansiva (shockwave), la segunda con un pequeño retraso */}
      <span className="vote-ring" style={{ borderColor: color }} />
      <span className="vote-ring" style={{ borderColor: color, animationDelay: '110ms' }} />
      {/* Chispas radiales del color del lado votado */}
      {particles.map((p) => (
        <span
          key={p.key}
          className="vote-particle"
          style={{
            '--angle': `${p.angle}deg`,
            '--dist': `${p.dist}px`,
            animationDelay: `${p.delay}ms`,
            width: p.size,
            height: p.size,
            background: color,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      ))}
      {/* Icono de voto con rebote elástico (en vez del simple "pop" de TikTok) */}
      <span className="vote-icon-pop" style={{ color, filter: 'drop-shadow(0 6px 20px rgba(0,0,0,0.55))' }}>
        <VoteIcon className="w-24 h-24" strokeWidth={320} filled />
      </span>
    </span>
  )
}

export default VoteBurstEffect
