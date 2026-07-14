package com.twyk.app

// ─────────────────────────────────────────────────────────────────
// CONFIGURA AQUI LA URL DE TU BACKEND (tu app web Twyk). Debe acabar en "/".
//
// ⚠ El telefono NO puede acceder al "localhost" del contenedor de desarrollo.
//   - Web desplegada: "https://tu-dominio.com/"
//   - Pruebas locales contra tu PC: usa la IP LAN de tu maquina (mismo WiFi),
//     p. ej. "http://192.168.1.50:3000/"  (cleartext ya esta permitido para dev)
// ─────────────────────────────────────────────────────────────────
object Config {
    // URL del preview de tu app web Twyk (debe acabar en "/").
    const val BASE_URL = "https://env-deploy-manual.preview.emergentagent.com/"
}

// Convierte rutas relativas (/uploads/x.mp4, /videos/x.mp4) en URLs absolutas.
fun absoluteUrl(path: String?): String? {
    if (path.isNullOrBlank()) return null
    if (path.startsWith("http://") || path.startsWith("https://")) return path
    val base = Config.BASE_URL.trimEnd('/')
    return base + (if (path.startsWith("/")) "" else "/") + path
}
