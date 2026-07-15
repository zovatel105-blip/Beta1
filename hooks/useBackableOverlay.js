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
// Contador COMPARTIDO entre TODAS las instancias del hook (a nivel de
// módulo, no de componente): cuenta cuántos popstate "sintéticos" (causados
// por nuestros propios history.back() de limpieza al cerrar un overlay "por
// otro medio") están pendientes de llegar, para que NINGÚN listener (el del
// overlay que se cerró, ni el de uno distinto que se haya abierto justo
// después en el mismo evento) los confunda con un gesto real de "Atrás".
let ignoreNextPopstate = 0

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
      // BUG FIX: si en el MISMO evento (p.ej. "cerrar Completados y abrir
      // Activos" en un solo onClick) OTRO overlay hace su propio pushState
      // justo después de este history.back(), el popstate real de este
      // back() llega de forma ASÍNCRONA y puede terminar cerrando ese OTRO
      // overlay recién abierto por error (pushedRef.current ya estaría en
      // true para él). Marcamos este popstate como "sintético" con un
      // contador COMPARTIDO entre todas las instancias del hook para que
      // ningún listener (ni el propio ni el de otro overlay) lo confunda con
      // un gesto real de "Atrás" del usuario.
      pushedRef.current = false
      ignoreNextPopstate += 1
      window.history.back()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Escucha el gesto de Atrás (swipe lateral / botón Atrás / tecla Atrás):
  // en vez de dejar que el navegador siga navegando, cerramos el overlay.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onPopState = () => {
      if (ignoreNextPopstate > 0) {
        // Este popstate lo generó nuestro propio history.back() de limpieza
        // (no un gesto real del usuario) -> se descarta una sola vez.
        ignoreNextPopstate -= 1
        return
      }
      if (pushedRef.current) {
        pushedRef.current = false
        onCloseRef.current?.()
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
}
