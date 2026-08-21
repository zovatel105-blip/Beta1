// Galería de "estilos" de edición con IA (petición del usuario: "en las
// publicaciones single quiero que añadas una función como larpgpt editar y
// te muestra varios modelos de edición, tú eliges ese modelo y la ia lo
// genera" — confirmado que "modelos" = PLANTILLAS/ESTILOS visuales, no
// proveedores de IA distintos; "fija con más y mejores estilos que
// larpgpt"). Cada estilo tiene una imagen de ejemplo real (thumbnail, vía
// vision_expert_agent) + una instrucción lista para enviar directamente al
// editor de IA (POST /api/ai/edit-image) al elegirlo — un clic, sin tener
// que escribir nada. Usado SOLO en publicaciones "Single"/reto abierto
// (ver UploadDialog.jsx, prop showStyleGallery en AIImageEditor.jsx).
export const AI_STYLE_PRESETS = [
  {
    id: 'yacht-life',
    label: 'Yacht Life',
    thumb: 'https://images.unsplash.com/photo-1731368852160-0673397399a6?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzh8MHwxfHNlYXJjaHw0fHxsdXh1cnklMjB5YWNodCUyMHN1bnNldHxlbnwwfHx8fDE3ODczNDA4MDB8MA&ixlib=rb-4.1.0&q=85',
    promptHint: 'Put me relaxing on a luxury yacht deck at sunset, holding a glass of champagne, ocean and other yachts in the background, photorealistic.',
  },
  {
    id: 'private-jet',
    label: 'Private Jet',
    thumb: 'https://images.unsplash.com/photo-1768346564233-d71f37bd19b6?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODl8MHwxfHNlYXJjaHwzfHxwcml2YXRlJTIwamV0JTIwaW50ZXJpb3J8ZW58MHx8fHwxNzg3MzQwODAwfDA&ixlib=rb-4.1.0&q=85',
    promptHint: 'Put me seated in a luxurious private jet cabin, holding a drink, clouds visible through the window, warm cabin lighting, photorealistic.',
  },
  {
    id: 'penthouse-skyline',
    label: 'Penthouse Skyline',
    thumb: 'https://images.unsplash.com/photo-1674494777503-f5d3484104c9?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzV8MHwxfHNlYXJjaHwxfHxwZW50aG91c2UlMjBjaXR5JTIwc2t5bGluZXxlbnwwfHx8fDE3ODczNDA4MDB8MA&ixlib=rb-4.1.0&q=85',
    promptHint: 'Put me standing on a penthouse balcony at night with a stunning city skyline behind me, city lights glowing, elegant outfit, photorealistic.',
  },
  {
    id: 'red-carpet',
    label: 'Red Carpet Gala',
    thumb: 'https://images.unsplash.com/photo-1778356192459-40546f005dc6?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzd8MHwxfHNlYXJjaHwzfHxyZWQlMjBjYXJwZXQlMjBldmVudHxlbnwwfHx8fDE3ODczNDA4MDB8MA&ixlib=rb-4.1.0&q=85',
    promptHint: 'Put me on a red carpet at a glamorous gala, camera flashes going off around me, wearing an elegant gala outfit, photorealistic.',
  },
  {
    id: 'supercar-garage',
    label: 'Supercar Garage',
    thumb: 'https://images.unsplash.com/photo-1577081395884-e70fc91645ad?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA0MTJ8MHwxfHNlYXJjaHw0fHxsdXh1cnklMjBzdXBlcmNhcnxlbnwwfHx8fDE3ODczNDA4MDF8MA&ixlib=rb-4.1.0&q=85',
    promptHint: 'Put me standing next to a gleaming luxury supercar in a sleek private garage, dramatic lighting, photorealistic.',
  },
  {
    id: 'anime-hero',
    label: 'Anime Hero',
    thumb: 'https://images.unsplash.com/photo-1708034677699-6f39d9c59f6e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTV8MHwxfHNlYXJjaHwyfHxhbmltZSUyMGNoYXJhY3RlciUyMGFydHxlbnwwfHx8fDE3ODczNDA4MDB8MA&ixlib=rb-4.1.0&q=85',
    promptHint: 'Transform me into a vibrant anime/manga style illustrated character, dynamic pose, bold outlines and expressive eyes, anime art style.',
  },
  {
    id: 'cyberpunk-neon',
    label: 'Cyberpunk Neon',
    thumb: 'https://images.unsplash.com/photo-1563863251222-11d3e3bd3b62?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA4Mzl8MHwxfHNlYXJjaHwzfHxjeWJlcnB1bmslMjBuZW9uJTIwY2l0eXxlbnwwfHx8fDE3ODczNDA4MDB8MA&ixlib=rb-4.1.0&q=85',
    promptHint: 'Transform me into a cyberpunk character standing in a neon-lit futuristic city street at night, glowing signs, rain-slicked streets, cinematic.',
  },
  {
    id: 'film-noir',
    label: 'Film Noir',
    thumb: 'https://images.unsplash.com/photo-1495462911434-be47104d70fa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MTN8MHwxfHNlYXJjaHwzfHxmaWxtJTIwbm9pciUyMHBvcnRyYWl0fGVufDB8fHxibGFja19hbmRfd2hpdGV8MTc4NzM0MDgwOXww&ixlib=rb-4.1.0&q=85',
    promptHint: 'Transform this into a dramatic black-and-white film noir portrait, moody shadows, venetian blind lighting, cinematic contrast.',
  },
  {
    id: 'vintage-polaroid',
    label: 'Vintage Polaroid',
    thumb: 'https://images.pexels.com/photos/28398207/pexels-photo-28398207.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    promptHint: 'Transform this into a vintage 90s polaroid-style photo, warm faded colors, soft grain, white polaroid border look.',
  },
  {
    id: 'fantasy-warrior',
    label: 'Fantasy Warrior',
    thumb: 'https://images.pexels.com/photos/13725613/pexels-photo-13725613.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    promptHint: 'Transform me into an epic fantasy warrior wearing ornate armor, standing in a mystical battlefield, dramatic lighting, painterly fantasy art style.',
  },
  {
    id: 'studio-portrait',
    label: 'Studio Portrait',
    thumb: 'https://images.unsplash.com/photo-1571513722275-4b41940f54b8?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNTl8MHwxfHNlYXJjaHwzfHxzdHVkaW8lMjBwb3J0cmFpdHxlbnwwfHx8fDE3ODczNDA4MDl8MA&ixlib=rb-4.1.0&q=85',
    promptHint: 'Transform this into a professional studio portrait with soft key lighting, clean neutral backdrop, sharp focus, magazine-quality photography.',
  },
  {
    id: 'vaporwave',
    label: 'Vaporwave',
    thumb: 'https://images.pexels.com/photos/10082927/pexels-photo-10082927.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    promptHint: 'Transform this into a retro 80s vaporwave aesthetic with neon pink and purple gradients, grid lines, glitch effects, nostalgic synthwave style.',
  },
  {
    id: 'space-explorer',
    label: 'Space Explorer',
    thumb: 'https://images.unsplash.com/photo-1655114722721-5c75114be5ab?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzV8MHwxfHNlYXJjaHwxfHxhc3Ryb25hdXQlMjBzcGFjZXxlbnwwfHx8fDE3ODczNDA4MDl8MA&ixlib=rb-4.1.0&q=85',
    promptHint: 'Put me in a detailed astronaut suit floating in space with Earth and stars in the background, cinematic sci-fi lighting.',
  },
  {
    id: 'renaissance-painting',
    label: 'Renaissance Painting',
    thumb: 'https://images.unsplash.com/photo-1574184180347-527304c53004?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzh8MHwxfHNlYXJjaHwxfHxyZW5haXNzYW5jZSUyMHBvcnRyYWl0fGVufDB8fHx8MTc4NzM0MDgwOXww&ixlib=rb-4.1.0&q=85',
    promptHint: 'Transform this into a classical Renaissance oil painting portrait, rich warm tones, ornate clothing, painterly brushstrokes, museum-quality fine art style.',
  },
]
