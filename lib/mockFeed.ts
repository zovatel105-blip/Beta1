// MOCK_FEED — datos de prueba para el motor de votación de alto rendimiento.
// Vídeos: Google CDN (gtv-videos-bucket), MP4 H.264 de ~2-3MB cada uno.
// Imágenes: Unsplash con ?w=720&q=75 (entrega optimizada para móvil).
// Mezcla de combinaciones: Video/Video, Video/Imagen, Imagen/Imagen.

export type MediaType = 'video' | 'image'

export interface MediaOption {
  type: MediaType
  /** URL del MP4 (video) o de la imagen */
  src: string
  /** Poster mostrado mientras el vídeo NO está activo (decoder liberado) */
  poster?: string
  /** Etiqueta corta de la opción */
  label: string
}

export interface FeedItem {
  id: string
  title: string
  optionA: MediaOption
  optionB: MediaOption
}

const GCS = 'https://storage.googleapis.com/gtv-videos-bucket/sample'

const u = (id: string) => `https://images.unsplash.com/${id}?w=720&q=75&auto=format&fit=crop`

// Posters ligeros (w=480) para los vídeos: se muestran en las tarjetas
// adyacentes pre-montadas SIN consumir un decoder de hardware.
const p = (id: string) => `https://images.unsplash.com/${id}?w=480&q=60&auto=format&fit=crop`

export const MOCK_FEED: FeedItem[] = [
  {
    id: 'b1',
    title: '¿Qué tráiler te atrapa más? 🎬',
    optionA: { type: 'video', src: `${GCS}/ForBiggerBlazes.mp4`, poster: p('photo-1492144534655-ae79c964c9d7'), label: 'Blazes' },
    optionB: { type: 'video', src: `${GCS}/ForBiggerEscapes.mp4`, poster: p('photo-1478720568477-152d9b164e26'), label: 'Escapes' },
  },
  {
    id: 'b2',
    title: '¿Pizza o burger? 🍕🍔',
    optionA: { type: 'image', src: u('photo-1565299624946-b28f40a0ae38'), label: 'Pizza' },
    optionB: { type: 'image', src: u('photo-1568901346375-23c9450c58cd'), label: 'Burger' },
  },
  {
    id: 'b3',
    title: '¿Acción en vídeo o vibra nocturna? 🌃',
    optionA: { type: 'video', src: `${GCS}/ForBiggerFun.mp4`, poster: p('photo-1489599849927-2ee91cede3ba'), label: 'Fun' },
    optionB: { type: 'image', src: u('photo-1519501025264-65ba15a82390'), label: 'City night' },
  },
  {
    id: 'b4',
    title: '¿Playa o montaña? 🏖️⛰️',
    optionA: { type: 'image', src: u('photo-1507525428034-b723cf961d3e'), label: 'Playa' },
    optionB: { type: 'image', src: u('photo-1506905925346-21bda4d32df4'), label: 'Montaña' },
  },
  {
    id: 'b5',
    title: 'Duelo de tráilers: ¿cuál gana? 🔥',
    optionA: { type: 'video', src: `${GCS}/ForBiggerJoyrides.mp4`, poster: p('photo-1503376780353-7e6692767b70'), label: 'Joyrides' },
    optionB: { type: 'video', src: `${GCS}/ForBiggerMeltdowns.mp4`, poster: p('photo-1518709268805-4e9042af9f23'), label: 'Meltdowns' },
  },
  {
    id: 'b6',
    title: '¿Perro o gato? 🐶🐱',
    optionA: { type: 'image', src: u('photo-1517849845537-4d257902454a'), label: 'Perro' },
    optionB: { type: 'image', src: u('photo-1514888286974-6c03e2ca1dba'), label: 'Gato' },
  },
  {
    id: 'b7',
    title: '¿Vídeo épico o atardecer eterno? 🌇',
    optionA: { type: 'video', src: `${GCS}/ForBiggerBlazes.mp4`, poster: p('photo-1492144534655-ae79c964c9d7'), label: 'Épico' },
    optionB: { type: 'image', src: u('photo-1495616811223-4d98c6e9c869'), label: 'Atardecer' },
  },
  {
    id: 'b8',
    title: '¿Aurora boreal o desierto? ✨🏜️',
    optionA: { type: 'image', src: u('photo-1483347756197-71ef80e95f73'), label: 'Aurora' },
    optionB: { type: 'image', src: u('photo-1509316785289-025f5b846b35'), label: 'Desierto' },
  },
  {
    id: 'b9',
    title: 'Revancha de tráilers 🎬⚡',
    optionA: { type: 'video', src: `${GCS}/ForBiggerEscapes.mp4`, poster: p('photo-1478720568477-152d9b164e26'), label: 'Escapes' },
    optionB: { type: 'video', src: `${GCS}/ForBiggerFun.mp4`, poster: p('photo-1489599849927-2ee91cede3ba'), label: 'Fun' },
  },
  {
    id: 'b10',
    title: '¿Café o té? ☕🍵',
    optionA: { type: 'image', src: u('photo-1495474472287-4d71bcdd2085'), label: 'Café' },
    optionB: { type: 'image', src: u('photo-1544787219-7f47ccb76574'), label: 'Té' },
  },
  {
    id: 'b11',
    title: '¿Motor a fondo u olas perfectas? 🏎️🌊',
    optionA: { type: 'video', src: `${GCS}/ForBiggerMeltdowns.mp4`, poster: p('photo-1518709268805-4e9042af9f23'), label: 'Motor' },
    optionB: { type: 'image', src: u('photo-1505142468610-359e7d316be0'), label: 'Olas' },
  },
  {
    id: 'b12',
    title: '¿Coche clásico o bici urbana? 🚗🚲',
    optionA: { type: 'image', src: u('photo-1503376780353-7e6692767b70'), label: 'Coche' },
    optionB: { type: 'image', src: u('photo-1485965120184-e220f721d03e'), label: 'Bici' },
  },
]
