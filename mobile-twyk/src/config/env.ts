// ───────────────────────────────────────────────────────────────────────────
// CONFIGURA AQUÍ LA URL DE TU BACKEND (tu app web Twyk).
//
// ⚠️ El teléfono NO puede acceder al `localhost` del contenedor de desarrollo.
//   - Si tu web YA está desplegada: pon su URL pública, p. ej.
//       export const API_BASE_URL = 'https://twyk.tu-dominio.com';
//   - Para pruebas en local contra tu PC: usa la IP LAN de tu máquina (no
//     'localhost'), p. ej. 'http://192.168.1.50:3000' (mismo WiFi que el móvil).
// ───────────────────────────────────────────────────────────────────────────
export const API_BASE_URL = 'https://CAMBIA-ESTO-POR-TU-BACKEND.com';

// Convierte rutas relativas del backend (/uploads/x.mp4, /videos/x.mp4) en
// URLs absolutas que el reproductor nativo pueda abrir.
export function absoluteUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}
