import crypto from 'crypto'

/**
 * Hash de contraseña usando SHA-256 (simple para MVP)
 * En producción usar bcrypt
 */
export function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex')
}

/**
 * Verificar contraseña
 */
export function verifyPassword(password, hashedPassword) {
  return hashPassword(password) === hashedPassword
}

/**
 * Generar token de sesión
 */
export function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Generar ID único
 */
export function generateId() {
  return crypto.randomUUID()
}
