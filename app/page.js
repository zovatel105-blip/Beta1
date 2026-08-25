'use client'

import { useEffect, useState } from 'react'
import Feed from '@/components/Feed'
import ComingSoon from '@/components/ComingSoon'

// twyk es un feed vertical de vídeo pensado para gestos táctiles de móvil
// (doble toque para votar, swipe para cambiar de tarjeta...). En
// ordenadores/tablets, en vez del feed, se muestra <ComingSoon/>. Detección
// COMBINADA (pedida explícitamente por el usuario, no solo ancho de
// viewport): (a) user-agent de TELÉFONO real — "Android.*Mobile" solo
// coincide en teléfonos Android (los Android en modo tablet omiten el token
// "Mobile" en su UA); "iPhone"/"iPod" nunca coinciden con un iPad — Y (b) un
// ancho de viewport por debajo del breakpoint estándar donde empiezan las
// tablets (768px, el `md` de Tailwind). Exigir AMBAS señales a la vez evita
// que una tablet grande con UA ambiguo, o un escritorio con el UA de móvil
// forzado (p.ej. el "device toolbar" de las devtools) por sí solos entren al
// feed.
const MOBILE_UA = /iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|IEMobile|Opera Mini/i
const BREAKPOINT = 768

function detectMobile() {
  if (typeof window === 'undefined') return null
  const uaMobile = MOBILE_UA.test(window.navigator?.userAgent || '')
  const narrow = window.innerWidth < BREAKPOINT
  return uaMobile && narrow
}

export default function Page() {
  // null mientras no se ha comprobado todavía (evita mostrar el feed o el
  // aviso "coming soon" equivocado durante el primer render/hidratación).
  const [isMobile, setIsMobile] = useState(null)

  useEffect(() => {
    setIsMobile(detectMobile())
    // Reacciona a redimensionar la ventana (p.ej. rotar una tablet, o
    // cambiar el tamaño de una ventana de escritorio) cruzando el breakpoint
    // — el user-agent no cambia, así que solo se recalcula el ancho.
    const onResize = () => setIsMobile(detectMobile())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (isMobile === null) {
    return <div className="w-screen h-[100dvh] bg-black" />
  }
  return isMobile ? <Feed /> : <ComingSoon />
}
