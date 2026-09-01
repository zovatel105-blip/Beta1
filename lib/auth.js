import crypto from 'crypto'
import bcrypt from 'bcryptjs'

// Coste de bcrypt (salt rounds). 12 es un buen equilibrio seguridad/latencia.
const SALT_ROUNDS = 12

/**
 * Hash de contraseña usando bcrypt (salt rounds = 12).
 * Es ASÍNCRONO -> los llamadores deben usar await.
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * Hash SHA-256 legacy. Solo se usa para VERIFICAR y MIGRAR a los usuarios
 * antiguos que se registraron con el esquema anterior. No se usa para crear
 * contraseñas nuevas.
 */
function sha256(password) {
  return crypto.createHash('sha256').update(password).digest('hex')
}

/**
 * ¿El hash almacenado es un hash bcrypt? bcrypt produce strings que empiezan
 * por $2a$ / $2b$ / $2y$.
 */
export function isBcryptHash(hash) {
  return typeof hash === 'string' && /^\$2[aby]\$/.test(hash)
}

/**
 * Verificar contraseña. Devuelve { valid, needsRehash }.
 *  - Si el hash es bcrypt -> bcrypt.compare().
 *  - Si el hash es SHA-256 antiguo (no empieza con $2) -> compara con SHA-256 y,
 *    si coincide, marca needsRehash=true para que el llamador re-hashee con
 *    bcrypt y persista el nuevo hash (migración transparente en login).
 */
export async function verifyPassword(password, hashedPassword) {
  if (!hashedPassword) return { valid: false, needsRehash: false }

  if (isBcryptHash(hashedPassword)) {
    const valid = await bcrypt.compare(password, hashedPassword)
    return { valid, needsRehash: false }
  }

  // Hash SHA-256 legacy: verificar y, si es correcto, pedir re-hash a bcrypt.
  const valid = sha256(password) === hashedPassword
  return { valid, needsRehash: valid }
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
