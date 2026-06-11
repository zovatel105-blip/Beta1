'use client'

import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Cargar usuario desde localStorage
    const loadUser = () => {
      try {
        const stored = localStorage.getItem('twyk_user')
        if (stored) {
          setUser(JSON.parse(stored))
        }
      } catch (err) {
        console.error('Error loading user:', err)
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
      setUser(data.user)
      localStorage.setItem('twyk_user', JSON.stringify(data.user))
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('twyk_user')
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
