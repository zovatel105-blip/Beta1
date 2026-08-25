// Marketing Playbook (estrategia estilo LarpGPT aplicada a Twyk) — antes solo
// existía como un mensaje de chat de una sesión anterior; ahora vive como
// contenido real de la app (leído por el panel /admin/marketing y la API
// GET /api/admin/marketing-playbook), para que no se pierda y el admin
// tenga siempre a mano qué contenido subir, con qué hashtags y qué sonido.
//
// No usa ninguna IA/API externa: la "idea del día" es una rotación
// DETERMINISTA por fecha (mismo día calendario → misma idea para
// cualquiera que la consulte, sin necesidad de guardar nada en base de
// datos hasta que el admin registra si publicó o no).

export const MARKETING_STRATEGY = {
  format: {
    duration: '21–45s (el rango que mejor funcionó a LarpGPT en TikTok).',
    hook: 'Hook en los primeros 2 segundos: mostrar el RESULTADO primero ("mirá en qué me convertí"), la explicación después — nunca al revés.',
    narrative:
      'Mismo gancho narrativo cada vez: "Le pedí a la IA que me pusiera en [escena de lujo] y esto pasó" → mostrar el editor de Twyk generando la foto → mostrar el resultado → mostrar el botón "Save to device" guardándolo → cortar a "lo subí a Twyk y así quedó en la Luxury Battle".',
    sound: 'Sonidos en tendencia en el 100% de los vídeos — revisar el Centro Creativo de TikTok cada semana.',
    cta: 'CTA fijo y repetido en cada vídeo: "Luxury Battle · link en bio" — la MISMA frase siempre, para construir reconocimiento.',
  },
  hashtags: {
    fixed: ['#twyk', '#luxurybattle', '#ai', '#glowup'],
    variableNote: '+ 1 hashtag de tendencia de esa semana (revisa el Centro Creativo de TikTok).',
  },
  cadence:
    'Publicar TODOS los días durante 2 semanas (LarpGPT probó 42 vídeos en ese lapso; aquí el plan mínimo es 14). Medir cuáles superan 2x las vistas promedio, y repetir SOLO esos formatos.',
  growthLoop:
    'Cada persona que entra a Twyk desde el vídeo ve que puede generar SU PROPIA foto y descargarla gratis (botón "Save to device") — eso la convierte en su propia promotora sin que se le pida.',
}

// Pool de escenas de lujo para el gancho narrativo — cada una rota como
// "idea sugerida del día" (14 = un ciclo de 2 semanas, la cadencia mínima
// recomendada arriba).
export const MARKETING_CONTENT_IDEAS = [
  { title: 'Yacht Life', hook: 'Le pedí a la IA que me pusiera en un yate privado y esto pasó', scene: 'Yate privado, atardecer, copa en mano' },
  { title: 'Private Jet', hook: 'Le pedí a la IA que me subiera a un jet privado y esto pasó', scene: 'Cabina de jet privado, ventanilla con nubes' },
  { title: 'Penthouse View', hook: 'Le pedí a la IA que me pusiera en un ático de lujo y esto pasó', scene: 'Ático con vista panorámica de ciudad de noche' },
  { title: 'Red Carpet', hook: 'Le pedí a la IA que me pusiera en una alfombra roja y esto pasó', scene: 'Alfombra roja, flashes de cámara, look de gala' },
  { title: 'Supercar Garage', hook: 'Le pedí a la IA que me pusiera junto a un superdeportivo y esto pasó', scene: 'Garaje de lujo con superdeportivo' },
  { title: 'Rodeo Drive Spree', hook: 'Le pedí a la IA que me pusiera de compras en Rodeo Drive y esto pasó', scene: 'Calle de tiendas de diseñador, bolsas de compra' },
  { title: 'Private Island', hook: 'Le pedí a la IA que me pusiera en una isla privada y esto pasó', scene: 'Playa privada, aguas turquesa, cabaña de lujo' },
  { title: '5-Star Suite', hook: 'Le pedí a la IA que me pusiera en una suite 5 estrellas y esto pasó', scene: 'Suite de hotel de lujo con vista a la ciudad' },
  { title: 'Rooftop Pool', hook: 'Le pedí a la IA que me pusiera en una fiesta en una piscina rooftop y esto pasó', scene: 'Piscina en azotea, skyline al fondo' },
  { title: 'Designer Closet', hook: 'Le pedí a la IA que me pusiera un closet de diseñador y esto pasó', scene: 'Walk-in closet lleno de ropa y bolsos de lujo' },
  { title: "Chef's Table", hook: 'Le pedí a la IA que me pusiera en una cena de chef privado y esto pasó', scene: 'Mesa de degustación, restaurante exclusivo' },
  { title: 'F1 Paddock', hook: 'Le pedí a la IA que me pusiera en el paddock de Fórmula 1 y esto pasó', scene: 'Paddock de F1, autos de carrera' },
  { title: 'Ski Chalet', hook: 'Le pedí a la IA que me pusiera en un chalet de esquí y esto pasó', scene: 'Chalet de montaña, nieve, chimenea' },
  { title: 'Met Gala Look', hook: 'Le pedí a la IA que me pusiera un look estilo Met Gala y esto pasó', scene: 'Escalinata de gala, outfit de alta costura' },
]

// Idea determinista para una fecha 'YYYY-MM-DD' + posición del lote (misma
// combinación → misma idea para cualquiera que la consulte, sin IA ni base
// de datos). Se usa como FALLBACK textual si la generación con IA falla por
// completo (nunca deja al admin sin nada que publicar).
export function getIdeaForDate(dateKey, slot = 0) {
  const days = Math.floor(new Date(`${dateKey}T00:00:00Z`).getTime() / 86400000) + slot
  const idx = ((days % MARKETING_CONTENT_IDEAS.length) + MARKETING_CONTENT_IDEAS.length) % MARKETING_CONTENT_IDEAS.length
  return MARKETING_CONTENT_IDEAS[idx]
}

// Resumen REAL del proyecto Twyk — se usa para "anclar" a la IA generadora
// de contenido (POST /api/admin/marketing-playbook/generate-batch) a las
// funciones que la app EFECTIVAMENTE tiene, en vez de escenas de lujo
// genéricas sin relación con el producto (petición explícita del usuario:
// "esa función debe crear contenido basado en mi proyecto para promocionar
// la web apk").
export const TWYK_PROJECT_SUMMARY = `Twyk es una app tipo TikTok de "versus": los usuarios suben 2 vídeos (opción A/B) y la comunidad vota deslizando y tocando dos veces el que prefiere; también hay 1vs1 "Duet" (dos personas compiten cara a cara con audio intercambiable) y "Retos" (un usuario reta a otro con un vídeo, el retado acepta/cancela en su bandeja). Función estrella: "Luxury Battle" — un editor de fotos con IA que transforma tu selfie para ponerte en una escena de lujo (yate, jet privado, alfombra roja, etc., tema que cambia cada cierto tiempo), tu foto compite por votos de la comunidad + una puntuación de IA de qué tan bien encaja con el tema; puedes descargar el resultado limpio (sin marca de agua) con el botón "Save to device" para subirlo también a TikTok/Instagram. Otras funciones: comentarios con hilos, seguir usuarios, notificaciones, perfil con grid de publicaciones guardadas.`

// ── MOTOR DE MARKETING PROFESIONAL ──────────────────────────────────────────
// Petición del usuario: "esa función es la que debe ser el marketing de la
// apk, subir 3-4 publicaciones por día promocionando la apk/web con todo lo
// que tengo que publicar... debe ser un motor de marketing profesional".
// En vez de 1 idea/día, cada día genera un LOTE de varias piezas listas para
// publicar (título, guion, hashtags, música E IMAGEN DE PORTADA generada con
// IA), rotando por "pilares de contenido" distintos cada vez — la técnica
// estándar de marketing profesional para no repetir siempre el mismo ángulo
// y poder medir qué formato funciona mejor.
export const DAILY_POST_COUNT = 4

export const CONTENT_PILLARS = [
  {
    key: 'open_battle',
    label: 'Open Battle (Luxury Battle AI Reveal)',
    angle: 'Muestra el editor de IA de Luxury Battle (el reto ABIERTO al que cualquiera puede sumar su foto) transformando una selfie normal en una escena de lujo (yate, jet privado, alfombra roja, etc.) — hook: mostrar el RESULTADO final primero, luego "rebobinar" a cómo se hizo, terminar con el botón "Save to device" y el resultado subido a la Luxury Battle abierta a votos de la comunidad.',
  },
  {
    key: 'duet_challenge',
    label: '1v1 Challenge (Duet)',
    angle: 'Muestra a alguien retando DIRECTAMENTE a un amigo a un "Duet" 1vs1 (pantalla dividida, cada uno con su clip) — hook tipo "reté a mi mejor amigo a esto", terminar con el ganador anunciado y la reacción de ambos.',
  },
]

// Pilar correspondiente a una posición (slot) del lote diario — rota en
// ciclo para que cada pieza del día tenga un ángulo distinto.
export function pillarForSlot(slot) {
  return CONTENT_PILLARS[((slot % CONTENT_PILLARS.length) + CONTENT_PILLARS.length) % CONTENT_PILLARS.length]
}
