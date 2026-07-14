'use client'

import { useEffect, useRef } from 'react'

/**
 * useBackableOverlay — hace que el gesto nativo de "deslizar desde el borde
 * lateral" (o el botón/gesto Atrás del navegador/móvil) CIERRE el overlay
 * actual en vez de salir de la app por completo.
 *
 * PROBLEMA: esta app navega entre "páginas" (Perfil, Retos, Bandeja, Subir,
 * Buscador...) con estados de React (open/close), SIN crear entradas de
 * historial del navegador. Como no hay ninguna entrada de historial que
 * corresponda a "estoy viendo el Perfil", el gesto de swipe-back de
 * iOS Safari/Chrome (que internamente es un history.back()) no tiene nada
 * propio que deshacer y navega FUERA de la app (a lo que hubiera antes en la
 * pestaña), en vez de simplemente cerrar el overlay -> "se sale por
 * completo" (a diferencia de TikTok, donde ese gesto vuelve a la pantalla
 * anterior DENTRO de la app).
 *
 * FIX: al abrir el overlay, empujamos una entrada de historial "marcador"
 * (history.pushState). El swipe-back / botón Atrás dispara un evento
 * `popstate` que consumimos para CERRAR el overlay (llamando a onClose) en
 * vez de dejar que el navegador continúe navegando. Si el overlay se cierra
 * por otro medio (botón "X" propio de la UI), consumimos la entrada de
 * historial que habíamos empujado con un history.back() silencioso, para no
 * dejar marcadores "fantasma" que exijan un segundo gesto de Atrás.
 *
 * Varios overlays pueden usar este hook a la vez de forma independiente: si
 * se abren en cascada (p.ej. Perfil -> modal de Auth encima), cada uno añade
 * su propia entrada, y el gesto de Atrás los cierra en orden inverso
 * (LIFO), igual que una pila de navegación nativa.
 */
export function useBackableOverlay(isOpen, onClose) {
  const pushedRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Al abrir: empuja el marcador de historial (una sola vez por apertura).
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isOpen && !pushedRef.current) {
      window.history.pushState({ twykOverlay: true }, '')
      pushedRef.current = true
    } else if (!isOpen && pushedRef.current) {
      // Se cerró por otro medio (botón X, acción interna...): consumimos la
      // entrada de historial que habíamos añadido para no dejarla huérfana.
      pushedRef.current = false
      window.history.back()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Escucha el gesto de Atrás (swipe lateral / botón Atrás / tecla Atrás):
  // en vez de dejar que el navegador siga navegando, cerramos el overlay.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onPopState = () => {
      if (pushedRef.current) {
        pushedRef.current = false
        onCloseRef.current?.()
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
}
