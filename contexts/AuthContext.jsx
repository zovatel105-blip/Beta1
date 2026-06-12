'use client'

import { createContext, useContext, useState, useEffect, useRef } from 'react'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Marca cuando el usuario hace una acción de auth manual (login/registro/logout).
  // Evita que una validación /api/auth/me EN VUELO (lanzada al montar, antes de
  // existir la cookie) sobrescriba/borre un login o registro recién hecho
  // (la causa del "me registré pero aparezco como no registrado").
  const manualAuthRef = useRef(false)

  useEffect(() => {
    // 1) Carga optimista desde localStorage (UI instantánea).
    // 2) Validación con el servidor (/api/auth/me): la sesión real vive en una
    //    cookie httpOnly. Si la cookie expiró/se perdió pero localStorage aún
    //    tiene un usuario, la UI mostraría "logueado" en falso y las subidas
    //    saldrían como anónimas. Por eso sincronizamos con el servidor y, si la
    //    sesión es inválida, limpiamos el estado local.
    const loadUser = async () => {
      try {
        const stored = localStorage.getItem('twyk_user')
        if (stored) setUser(JSON.parse(stored))
      } catch (err) {
        console.error('Error loading user:', err)
      }

      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' })
        // Si mientras tanto el usuario hizo login/registro, NO tocamos su estado.
        if (manualAuthRef.current) return
        if (res.ok) {
          const data = await res.json()
          if (data?.user) {
            setUser(data.user)
            localStorage.setItem('twyk_user', JSON.stringify(data.user))
          }
        } else {
          // Sesión inválida/ausente -> limpiar estado local desincronizado.
          setUser(null)
          localStorage.removeItem('twyk_user')
        }
      } catch (err) {
        // Error de red: conservamos la carga optimista (no forzamos logout).
        console.error('Error validating session:', err)
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [])

  const login = async (username, password) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Error al iniciar sesión')
      }

      const data = await res.json()
      manualAuthRef.current = true
      setUser(data.user)
      localStorage.setItem('twyk_user', JSON.stringify(data.user))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  const register = async (username, email, password) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.message || 'Error al registrarse')
      }

      const data = await res.json()
      manualAuthRef.current = true
      setUser(data.user)
      localStorage.setItem('twyk_user', JSON.stringify(data.user))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  const logout = async () => {
    manualAuthRef.current = true
    setUser(null)
    localStorage.removeItem('twyk_user')
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch { /* ignore */ }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
