import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Hook para trackear actividad de usuarios invitados (sin cuenta).
 * Muestra modal de registro después de:
 * - 8 videos vistos, O
 * - 3 minutos de navegación
 * (lo que ocurra primero)
 */
export function useGuestTracking() {
  const { user } = useAuth()
  const [showGuestPrompt, setShowGuestPrompt] = useState(false)
  const [videosWatched, setVideosWatched] = useState(0)
  const [timeSpent, setTimeSpent] = useState(0) // en segundos
  const startTimeRef = useRef(null)
  const intervalRef = useRef(null)

  // Umbrales para mostrar el modal
  const VIDEO_THRESHOLD = 8 // videos
  const TIME_THRESHOLD = 180 // 3 minutos = 180 segundos

  // Iniciar timer cuando el usuario no está autenticado
  useEffect(() => {
    if (!user) {
      // Iniciar el contador de tiempo
      startTimeRef.current = Date.now()
      
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setTimeSpent(elapsed)
        
        // Verificar si se alcanzó el umbral de tiempo
        if (elapsed >= TIME_THRESHOLD && !showGuestPrompt) {
          setShowGuestPrompt(true)
          clearInterval(intervalRef.current)
        }
      }, 1000)

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
        }
      }
    } else {
      // Usuario autenticado, resetear contadores
      setVideosWatched(0)
      setTimeSpent(0)
      setShowGuestPrompt(false)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [user, showGuestPrompt])

  // Función para incrementar el contador de videos vistos
  const trackVideoView = useCallback(() => {
    if (!user) {
      setVideosWatched((prev) => {
        const newCount = prev + 1
        console.log(`[Guest Tracking] Videos vistos: ${newCount}/${VIDEO_THRESHOLD}`)
        
        // Verificar si se alcanzó el umbral de videos
        if (newCount >= VIDEO_THRESHOLD) {
          console.log('[Guest Tracking] ¡Umbral alcanzado! Mostrando modal')
          setShowGuestPrompt(true)
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
          }
        }
        
        return newCount
      })
    } else {
      console.log('[Guest Tracking] Usuario autenticado, no se trackea')
    }
  }, [user])

  // Función para cerrar el modal temporalmente
  const dismissPrompt = useCallback(() => {
    setShowGuestPrompt(false)
    
    // Resetear contadores para que vuelva a aparecer después
    // Pero con umbrales más bajos (para no molestar demasiado)
    setVideosWatched(0)
    setTimeSpent(0)
    
    // Reiniciar timer si el usuario sigue sin cuenta
    if (!user) {
      startTimeRef.current = Date.now()
    }
  }, [user])

  // Función para abrir el modal manualmente (cuando intenta una acción social)
  const promptLogin = useCallback(() => {
    if (!user) {
      setShowGuestPrompt(true)
    }
  }, [user])

  return {
    showGuestPrompt,
    dismissPrompt,
    trackVideoView,
    promptLogin,
    videosWatched,
    timeSpent,
    isGuest: !user
  }
}
