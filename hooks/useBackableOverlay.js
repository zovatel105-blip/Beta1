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
// otro medio") hay pendientes. IMPORTANTE: se decrementa de forma DIFERIDA
// (setTimeout), NO dentro del propio listener de popstate. Motivo: cuando
// dos overlays cambian en el MISMO evento (p.ej. "cerrar Completados y abrir
// Activos" en un solo click), TODOS los listeners de popstate registrados
// (uno por cada overlay activo en Feed.jsx, aunque estén cerrados) se
// ejecutan para ESE MISMO evento. Si el contador se decrementara dentro del
// primer listener que lo comprobara, solo ESE quedaría protegido y los
// demás (incluido el overlay que se acaba de abrir, con pushedRef=true) ya
// verían el contador en 0 y tratarían el popstate "sintético" como un gesto
// real, cerrándose por error. Al diferir el decremento, TODOS los listeners
// de este mismo evento lo ven como sintético y lo ignoran por igual.
let ignoreNextPopstate = 0

// BUG FIX (reportado: 'al pulsar Crear un reto desde la página de Retos me
// manda al home feed'): cuando en el MISMO click se cierra un overlay Y se
// abre OTRO distinto (p.ej. cerrar "Retos" + abrir "Subir"), cada overlay usa
// su PROPIA instancia de este hook, y React ejecuta el useEffect de cada
// instancia en el orden en que esos hooks fueron DECLARADOS en el componente
// (Feed.jsx), NO en el orden lógico "primero cerrar, luego abrir". Si el
// hook del overlay que ABRE está declarado ANTES que el del que CIERRA
// (como pasaba con Subir=línea 119 vs Retos=línea 131), el pushState() del
// que abre se ejecutaba ANTES de que el history.back() de limpieza del que
// cierra hubiera movido la posición real -> el pushState quedaba apilado
// SOBRE el marcador viejo, y el back() posterior solo lo desapilaba a medias,
// dejando la posición REAL del historial desincronizada del estado de React
// (se veía "Subir" en pantalla pero la posición de historial seguía
// apuntando al marcador de "Retos") -> el siguiente back()/swipe (o incluso
// un guardián nativo del navegador) podía saltar de golpe hasta ANTES de
// abrir la app -> "me manda al home feed" (o directamente fuera de la app).
//
// FIX: en vez de ejecutar pushState()/history.back() de forma INMEDIATA
// dentro de cada useEffect individual, cada instancia solo ENCOLA su acción
// (cierre u apertura) en una cola COMPARTIDA a nivel de módulo, y se procesa
// TODA la cola en un único microtask por "tanda" de cambios síncronos
// (queueMicrotask corre DESPUÉS de que TODOS los useEffect de la tanda ya se
// ejecutaron, sin importar su orden de declaración) -> dentro de ese
// microtask, se procesan SIEMPRE primero TODOS los cierres pendientes y
// LUEGO todas las aperturas, sin importar en qué orden se encolaron. Así
// "cerrar Retos + abrir Subir" en un mismo click SIEMPRE limpia el marcador
// viejo antes de apilar el nuevo, quedando el historial real sincronizado
// con el estado de React sea cual sea el orden de los hooks en el código.
let pendingCloses = []
let pendingOpens = []
let flushScheduled = false

function scheduleFlush() {
  if (flushScheduled) return
  flushScheduled = true
  queueMicrotask(() => {
    flushScheduled = false
    const closes = pendingCloses
    const opens = pendingOpens
    pendingCloses = []
    pendingOpens = []
    // Cierres SIEMPRE antes que aperturas, sin importar el orden de encolado.
    closes.forEach((fn) => fn())
    opens.forEach((fn) => fn())
  })
}

export function useBackableOverlay(isOpen, onClose) {
  const pushedRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Al abrir: empuja el marcador de historial (una sola vez por apertura).
  // Al cerrar "por otro medio": consume la entrada que habíamos añadido.
  // Ambas acciones se ENCOLAN (ver comentario arriba) en vez de ejecutarse
  // de inmediato, para garantizar el orden correcto entre overlays distintos
  // que cambian en el mismo evento.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isOpen && !pushedRef.current) {
      pushedRef.current = true
      pendingOpens.push(() => {
        window.history.pushState({ twykOverlay: true }, '')
      })
      scheduleFlush()
    } else if (!isOpen && pushedRef.current) {
      pushedRef.current = false
      pendingCloses.push(() => {
        ignoreNextPopstate += 1
        window.history.back()
        // Reset DIFERIDO (no inmediato): da tiempo a que el popstate asíncrono
        // de este back() llegue y sea ignorado por TODOS los listeners activos
        // en ese momento (incluido el de un overlay recién abierto en el mismo
        // click), antes de volver a permitir que un popstate futuro (un gesto
        // real del usuario) se procese con normalidad.
        setTimeout(() => { ignoreNextPopstate = Math.max(0, ignoreNextPopstate - 1) }, 0)
      })
      scheduleFlush()
    }
  }, [isOpen])

  // Escucha el gesto de Atrás (swipe lateral / botón Atrás / tecla Atrás):
  // en vez de dejar que el navegador siga navegando, cerramos el overlay.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onPopState = () => {
      if (ignoreNextPopstate > 0) {
        // Este popstate lo generó nuestro propio history.back() de limpieza
        // (no un gesto real del usuario) -> se ignora (SIN decrementar aquí;
        // el contador se resetea de forma diferida, ver más arriba, para que
        // todos los listeners de este mismo evento lo vean igual).
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
