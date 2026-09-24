// AudioContext COMPARTIDO (singleton) para toda la app. Crear un
// AudioContext por cada tarjeta del feed sería costoso e innecesario (los
// navegadores limitan/penalizan tener muchos contextos vivos a la vez). Todas
// las instancias de AudioReactiveRings reutilizan esta MISMA instancia,
// conectando cada una su propio MediaElementSourceNode/AnalyserNode.
let sharedCtx = null

export function getSharedAudioContext() {
  if (typeof window === 'undefined') return null
  const AudioCtxClass = window.AudioContext || window.webkitAudioContext
  if (!AudioCtxClass) return null
  try {
    if (!sharedCtx) sharedCtx = new AudioCtxClass()
    if (sharedCtx.state === 'suspended') {
      // Los navegadores solo permiten (re)activar el AudioContext tras un
      // gesto del usuario; en este punto el usuario ya interactuó (el propio
      // audio/vídeo requiere el mismo gesto para sonar), así que el resume()
      // normalmente se resuelve de inmediato.
      sharedCtx.resume().catch(() => {})
    }
    return sharedCtx
  } catch {
    return null
  }
}
