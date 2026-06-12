'use client'

// Avatar consistente en TODA la app (feed + perfil): muestra la imagen real
// solo si NO es un avatar autogenerado (dicebear/pravatar); en caso contrario
// dibuja la silueta gris por defecto. Así el avatar del feed es idéntico al
// del perfil.
export const isGeneratedAvatar = (url) =>
  !url || url.includes('dicebear') || url.includes('pravatar')

export default function Avatar({ src, alt = '', className = '' }) {
  if (src && !isGeneratedAvatar(src)) {
    return (
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={`object-cover ${className}`}
      />
    )
  }
  return (
    <div className={`bg-gray-200 overflow-hidden ${className}`}>
      <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
        <circle cx="50" cy="40" r="16" fill="#9ca3af" />
        <path d="M16 100C16 75 31 62 50 62s34 13 34 38z" fill="#9ca3af" />
      </svg>
    </div>
  )
}
