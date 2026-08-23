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
    category: 'yachts',
    thumb: 'https://images.unsplash.com/photo-1731368852160-0673397399a6?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzh8MHwxfHNlYXJjaHw0fHxsdXh1cnklMjB5YWNodCUyMHN1bnNldHxlbnwwfHx8fDE3ODczNDA4MDB8MA&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me relaxing on a luxury yacht deck at sunset, holding a glass of champagne, ocean and other yachts in the background, photorealistic.',
  },
  {
    id: 'private-jet',
    label: 'Private Jet',
    category: 'jets',
    thumb: 'https://images.unsplash.com/photo-1768346564233-d71f37bd19b6?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODl8MHwxfHNlYXJjaHwzfHxwcml2YXRlJTIwamV0JTIwaW50ZXJpb3J8ZW58MHx8fHwxNzg3MzQwODAwfDA&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me seated in a luxurious private jet cabin, holding a drink, clouds visible through the window, warm cabin lighting, photorealistic.',
  },
  {
    id: 'penthouse-skyline',
    label: 'Penthouse Skyline',
    category: 'luxury',
    thumb: 'https://images.unsplash.com/photo-1674494777503-f5d3484104c9?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzV8MHwxfHNlYXJjaHwxfHxwZW50aG91c2UlMjBjaXR5JTIwc2t5bGluZXxlbnwwfHx8fDE3ODczNDA4MDB8MA&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me standing on a penthouse balcony at night with a stunning city skyline behind me, city lights glowing, elegant outfit, photorealistic.',
  },
  {
    id: 'red-carpet',
    label: 'Red Carpet Gala',
    category: 'fashion',
    thumb: 'https://images.unsplash.com/photo-1778356192459-40546f005dc6?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzd8MHwxfHNlYXJjaHwzfHxyZWQlMjBjYXJwZXQlMjBldmVudHxlbnwwfHx8fDE3ODczNDA4MDB8MA&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me on a red carpet at a glamorous gala, camera flashes going off around me, wearing an elegant gala outfit, photorealistic.',
  },
  {
    id: 'supercar-garage',
    label: 'Supercar Garage',
    category: 'cars',
    thumb: 'https://images.unsplash.com/photo-1577081395884-e70fc91645ad?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA0MTJ8MHwxfHNlYXJjaHw0fHxsdXh1cnklMjBzdXBlcmNhcnxlbnwwfHx8fDE3ODczNDA4MDF8MA&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me standing next to a gleaming luxury supercar in a sleek private garage, dramatic lighting, photorealistic.',
  },
  {
    id: 'anime-hero',
    label: 'Anime Hero',
    category: 'fantasy',
    thumb: 'https://images.unsplash.com/photo-1708034677699-6f39d9c59f6e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTV8MHwxfHNlYXJjaHwyfHxhbmltZSUyMGNoYXJhY3RlciUyMGFydHxlbnwwfHx8fDE3ODczNDA4MDB8MA&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Transform me into a vibrant anime/manga style illustrated character, dynamic pose, bold outlines and expressive eyes, anime art style.',
  },
  {
    id: 'cyberpunk-neon',
    label: 'Cyberpunk Neon',
    category: 'fantasy',
    thumb: 'https://images.unsplash.com/photo-1563863251222-11d3e3bd3b62?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA4Mzl8MHwxfHNlYXJjaHwzfHxjeWJlcnB1bmslMjBuZW9uJTIwY2l0eXxlbnwwfHx8fDE3ODczNDA4MDB8MA&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Transform me into a cyberpunk character standing in a neon-lit futuristic city street at night, glowing signs, rain-slicked streets, cinematic.',
  },
  {
    id: 'film-noir',
    label: 'Film Noir',
    category: 'fantasy',
    thumb: 'https://images.unsplash.com/photo-1495462911434-be47104d70fa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MTN8MHwxfHNlYXJjaHwzfHxmaWxtJTIwbm9pciUyMHBvcnRyYWl0fGVufDB8fHxibGFja19hbmRfd2hpdGV8MTc4NzM0MDgwOXww&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Transform this into a dramatic black-and-white film noir portrait, moody shadows, venetian blind lighting, cinematic contrast.',
  },
  {
    id: 'vintage-polaroid',
    label: 'Vintage Polaroid',
    category: 'fantasy',
    thumb: 'https://images.pexels.com/photos/28398207/pexels-photo-28398207.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Transform this into a vintage 90s polaroid-style photo, warm faded colors, soft grain, white polaroid border look.',
  },
  {
    id: 'fantasy-warrior',
    label: 'Fantasy Warrior',
    category: 'fantasy',
    thumb: 'https://images.pexels.com/photos/13725613/pexels-photo-13725613.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Transform me into an epic fantasy warrior wearing ornate armor, standing in a mystical battlefield, dramatic lighting, painterly fantasy art style.',
  },
  {
    id: 'studio-portrait',
    label: 'Studio Portrait',
    category: 'fantasy',
    thumb: 'https://images.unsplash.com/photo-1571513722275-4b41940f54b8?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNTl8MHwxfHNlYXJjaHwzfHxzdHVkaW8lMjBwb3J0cmFpdHxlbnwwfHx8fDE3ODczNDA4MDl8MA&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Transform this into a professional studio portrait with soft key lighting, clean neutral backdrop, sharp focus, magazine-quality photography.',
  },
  {
    id: 'vaporwave',
    label: 'Vaporwave',
    category: 'fantasy',
    thumb: 'https://images.pexels.com/photos/10082927/pexels-photo-10082927.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Transform this into a retro 80s vaporwave aesthetic with neon pink and purple gradients, grid lines, glitch effects, nostalgic synthwave style.',
  },
  {
    id: 'space-explorer',
    label: 'Space Explorer',
    category: 'fantasy',
    thumb: 'https://images.unsplash.com/photo-1655114722721-5c75114be5ab?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzV8MHwxfHNlYXJjaHwxfHxhc3Ryb25hdXQlMjBzcGFjZXxlbnwwfHx8fDE3ODczNDA4MDl8MA&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me in a detailed astronaut suit floating in space with Earth and stars in the background, cinematic sci-fi lighting.',
  },
  {
    id: 'renaissance-painting',
    label: 'Renaissance Painting',
    category: 'fantasy',
    thumb: 'https://images.unsplash.com/photo-1574184180347-527304c53004?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzh8MHwxfHNlYXJjaHwxfHxyZW5haXNzYW5jZSUyMHBvcnRyYWl0fGVufDB8fHx8MTc4NzM0MDgwOXww&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Transform this into a classical Renaissance oil painting portrait, rich warm tones, ornate clothing, painterly brushstrokes, museum-quality fine art style.',
  },
  // 2ª ronda de estilos (petición del usuario: "Mas estilos") — 12 más,
  // categorías distintas a las 14 anteriores (playa, nieve, deportes,
  // moda, música, cómic, western, submarino, arte urbano, realeza).
  {
    id: 'beach-paradise',
    label: 'Beach Paradise',
    category: 'vacation',
    thumb: 'https://images.pexels.com/photos/2549017/pexels-photo-2549017.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me relaxing on a secluded tropical private beach, turquoise water, white sand, palm trees, golden hour sunlight, photorealistic.',
  },
  {
    id: 'ski-chalet',
    label: 'Ski Chalet',
    category: 'vacation',
    thumb: 'https://images.pexels.com/photos/28179110/pexels-photo-28179110.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me in a cozy luxury ski chalet with a snowy mountain view through the window, fireplace glowing, winter outfit, photorealistic.',
  },
  {
    id: 'f1-paddock',
    label: 'F1 Paddock',
    category: 'cars',
    thumb: 'https://images.unsplash.com/photo-1768370771282-c4df64073dea?w=480&h=480&fit=crop',
    promptHint: 'Put me standing in a Formula 1 racing paddock next to a race car, pit crew and garage in the background, dramatic motorsport lighting, photorealistic.',
  },
  {
    id: 'rooftop-pool',
    label: 'Rooftop Pool Party',
    category: 'vacation',
    thumb: 'https://images.unsplash.com/photo-1572477722570-8a909f42ca6d?w=480&h=480&fit=crop',
    promptHint: 'Put me at a rooftop pool party at golden hour, city skyline in the background, vibrant summer atmosphere, photorealistic.',
  },
  {
    id: 'designer-closet',
    label: 'Designer Closet',
    category: 'fashion',
    thumb: 'https://images.pexels.com/photos/19878531/pexels-photo-19878531.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me inside a luxurious walk-in designer closet filled with high-end fashion and handbags, soft boutique lighting, photorealistic.',
  },
  {
    id: 'met-gala',
    label: 'Met Gala Look',
    category: 'fashion',
    thumb: 'https://images.unsplash.com/photo-1568251188392-ae32f898cb3b?w=480&h=480&fit=crop',
    promptHint: 'Transform my outfit into an avant-garde high-fashion couture gala look, dramatic pose on ornate museum steps, flashes of cameras, editorial photography style.',
  },
  {
    id: 'kpop-idol',
    label: 'K-pop Idol Stage',
    category: 'fashion',
    thumb: 'https://images.unsplash.com/photo-1566477712363-3c75dd39b416?w=480&h=480&fit=crop',
    promptHint: 'Transform me into a K-pop idol performing on a concert stage, colorful neon stage lights, energetic pose, stylish idol outfit, cinematic concert photography.',
  },
  {
    id: 'superhero-comic',
    label: 'Superhero Comic',
    category: 'fantasy',
    thumb: 'https://images.pexels.com/photos/38691362/pexels-photo-38691362.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Transform me into a superhero in a comic book illustrated style, dynamic action pose above a city skyline, bold comic outlines and halftone shading.',
  },
  {
    id: 'wild-west',
    label: 'Wild West',
    category: 'fantasy',
    thumb: 'https://images.unsplash.com/photo-1723750600453-3606c844636b?w=480&h=480&fit=crop',
    promptHint: 'Transform me into a wild west cowboy/cowgirl standing in a desert town at sunset, dusty streets, cinematic western movie style.',
  },
  {
    id: 'underwater-fantasy',
    label: 'Underwater Fantasy',
    category: 'fantasy',
    thumb: 'https://images.pexels.com/photos/26830428/pexels-photo-26830428.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me floating underwater in a magical ocean fantasy scene, rays of sunlight through the water, colorful marine life around me, dreamlike photorealistic style.',
  },
  {
    id: 'street-graffiti',
    label: 'Street Graffiti Art',
    category: 'fantasy',
    thumb: 'https://images.pexels.com/photos/1707640/pexels-photo-1707640.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me standing in front of a vibrant urban graffiti mural wall, streetwear outfit, gritty city street photography style.',
  },
  {
    id: 'royal-portrait',
    label: 'Royal Portrait',
    category: 'fantasy',
    thumb: 'https://images.pexels.com/photos/35493549/pexels-photo-35493549.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Transform me into royalty seated on an ornate throne in a grand palace hall, regal robes and crown, classical royal portrait painting style.',
  },
  // 3ª ronda de estilos (petición del usuario: "Agregar mas estilos de
  // lujo con imagenes") — 10 más, TODOS de temática de lujo, sin
  // solaparse con los anteriores. Imágenes obtenidas vía crawl_tool sobre
  // páginas de búsqueda de Pexels (NO vision_expert_agent — ya se agotaron
  // sus 2 llamadas permitidas en esta sesión), cada una revisada
  // visualmente antes de incluirla.
  {
    id: 'luxury-mansion',
    label: 'Luxury Mansion',
    category: 'luxury',
    thumb: 'https://images.pexels.com/photos/33738275/pexels-photo-33738275.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me standing on the grand entrance steps of a luxurious mansion, manicured gardens around me, elegant outfit, photorealistic.',
  },
  {
    id: 'hotel-suite',
    label: 'Five-Star Hotel Suite',
    category: 'luxury',
    thumb: 'https://images.pexels.com/photos/34496702/pexels-photo-34496702.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me relaxing in a luxurious five-star hotel suite, plush bed and elegant decor, warm ambient lighting, photorealistic.',
  },
  {
    id: 'private-island',
    label: 'Private Island',
    category: 'vacation',
    thumb: 'https://images.pexels.com/photos/11579902/pexels-photo-11579902.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me on a private island resort overlooking turquoise water and overwater villas, tropical paradise, photorealistic.',
  },
  {
    id: 'diamond-jewelry',
    label: 'Diamond Jewelry',
    category: 'luxury',
    thumb: 'https://images.pexels.com/photos/39017189/pexels-photo-39017189.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me trying on fine diamond jewelry in an exclusive luxury jewelry boutique, sparkling gems, elegant lighting, photorealistic.',
  },
  {
    id: 'private-helicopter',
    label: 'Private Helicopter',
    category: 'jets',
    thumb: 'https://images.pexels.com/photos/7271668/pexels-photo-7271668.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me boarding a private luxury helicopter on a rooftop helipad, city skyline behind me, wind blowing, photorealistic.',
  },
  {
    id: 'luxury-train',
    label: 'Luxury Train Cabin',
    category: 'luxury',
    thumb: 'https://images.pexels.com/photos/30654957/pexels-photo-30654957.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me seated in an elegant luxury train cabin, Orient-Express style decor, scenic countryside passing by the window, cinematic photorealistic style.',
  },
  {
    id: 'golf-resort',
    label: 'Golf Resort',
    category: 'vacation',
    thumb: 'https://images.pexels.com/photos/4226146/pexels-photo-4226146.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me on a luxury golf resort course at golden hour, palm trees and ocean in the background, stylish golf outfit, photorealistic.',
  },
  {
    id: 'wine-cellar',
    label: 'Wine Cellar Tasting',
    category: 'luxury',
    thumb: 'https://images.pexels.com/photos/5490196/pexels-photo-5490196.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me tasting fine wine in a private oak-barrel wine cellar, elegant glass in hand, warm cellar lighting, photorealistic.',
  },
  {
    id: 'champagne-vineyard',
    label: 'Champagne Vineyard',
    category: 'luxury',
    thumb: 'https://images.pexels.com/photos/5406583/pexels-photo-5406583.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me on a terrace overlooking a champagne vineyard estate at sunset, glass of champagne in hand, rolling vine hills, photorealistic.',
  },
  {
    id: 'polo-lifestyle',
    label: 'Polo Lifestyle',
    category: 'fashion',
    thumb: 'https://images.pexels.com/photos/31281863/pexels-photo-31281863.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me dressed in elegant polo attire beside a horse on a manicured polo field, upscale equestrian lifestyle, photorealistic.',
  },
  // 4ª ronda de estilos (petición del usuario: "Añade mas estilos, hot,
  // chicas con vestidos calientes, coches, vacation, etc") — SE OMITIÓ
  // deliberadamente la parte de contenido sexualizado/"hot" (explicado al
  // usuario): en esta app cualquiera puede subir la foto de CUALQUIER
  // persona en una publicación Single, y hay usuarios desde 13 años
  // (COPPA) — una categoría de "chicas con ropa reveladora" crearía un
  // riesgo real de generar imágenes sexualizadas de personas reales sin su
  // consentimiento. Se añaden en su lugar 8 estilos de coches/vacaciones
  // (y 2 de estilo de vida, sustituyendo moda/festival por ser demasiado
  // reveladores en las fotos de ejemplo disponibles, mismo criterio).
  {
    id: 'classic-car-cruise',
    label: 'Classic Car Cruise',
    category: 'cars',
    thumb: 'https://images.pexels.com/photos/28226943/pexels-photo-28226943.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me leaning against a shiny restored classic car at a sunset car cruise event, retro atmosphere, photorealistic.',
  },
  {
    id: 'convertible-drive',
    label: 'Convertible Coastal Drive',
    category: 'cars',
    thumb: 'https://images.pexels.com/photos/8631560/pexels-photo-8631560.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me driving a sleek convertible sports car along a scenic coastal road, wind in my hair, ocean views, photorealistic.',
  },
  {
    id: 'muscle-car-night',
    label: 'Muscle Car Night',
    category: 'cars',
    thumb: 'https://images.pexels.com/photos/9661296/pexels-photo-9661296.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me standing next to a powerful muscle car at a nighttime car meet, city lights and crowd in the background, cinematic photorealistic style.',
  },
  {
    id: 'tropical-vacation',
    label: 'Tropical Vacation',
    category: 'vacation',
    thumb: 'https://images.pexels.com/photos/14570522/pexels-photo-14570522.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me on a tropical vacation under swaying palm trees, white sand beach, turquoise water, relaxed vacation vibe, photorealistic.',
  },
  {
    id: 'european-city-vacation',
    label: 'European City Vacation',
    category: 'vacation',
    thumb: 'https://images.pexels.com/photos/16922742/pexels-photo-16922742.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me sightseeing in a charming European old-town city, historic rooftops and a river in the background, travel vacation photo style.',
  },
  {
    id: 'safari-vacation',
    label: 'Safari Adventure',
    category: 'vacation',
    thumb: 'https://images.pexels.com/photos/28812642/pexels-photo-28812642.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me on a safari adventure vacation riding in an open-top safari vehicle across the savanna, adventurous travel photo style.',
  },
  {
    id: 'mountain-hiking',
    label: 'Mountain Hiking',
    category: 'vacation',
    thumb: 'https://images.pexels.com/photos/8659357/pexels-photo-8659357.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me hiking up a dramatic misty mountain trail with a backpack, epic outdoor adventure vacation style, photorealistic.',
  },
  {
    id: 'city-backpacker',
    label: 'City Backpacker',
    category: 'vacation',
    thumb: 'https://images.pexels.com/photos/4881124/pexels-photo-4881124.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me as a backpacker exploring a foreign city street, backpack on, sunglasses, casual travel outfit, candid travel photo style.',
  },
  // 5ª ronda de estilos (petición del usuario: "Crea mas estilos y tambien
  // que se puedan elegir por categoria ej: luxury, vacation, etc. crea
  // estilos dentro/fuera de coches yates jets de lujo") — 13 estilos
  // nuevos centrados en el INTERIOR y EXTERIOR de coches/yates/jets de
  // lujo (categoría `vehicles`, que pasa de 9 a 16 estilos) + unos pocos
  // más de lujo/vacaciones para redondear esas categorías. Imágenes
  // reales vía vision_expert_agent (2ª y última llamada permitida en esta
  // sesión), cada URL verificada con una petición real (200 OK) antes de
  // incluirla.
  {
    id: 'luxury-car-interior',
    label: 'Luxury Car Interior',
    category: 'cars',
    thumb: 'https://images.unsplash.com/photo-1549064233-945d7063292f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDV8MHwxfHNlYXJjaHwzfHxjYXIlMjBpbnRlcmlvcnxlbnwwfHx8fDE3ODc1MTA2MDN8MA&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me sitting inside the driver seat of a luxury car, premium leather interior and dashboard visible, elegant outfit, photorealistic.',
  },
  {
    id: 'chauffeured-arrival',
    label: 'Chauffeured Arrival',
    category: 'cars',
    thumb: 'https://images.unsplash.com/photo-1730800328198-f9efbf9db53f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxNzV8MHwxfHNlYXJjaHwzfHxsaW1vdXNpbmV8ZW58MHx8fHwxNzg3NTEwNjAzfDA&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me stepping out of a chauffeured luxury limousine at a glamorous event entrance, elegant outfit, photorealistic.',
  },
  {
    id: 'supercar-showroom',
    label: 'Supercar Showroom',
    category: 'cars',
    thumb: 'https://images.unsplash.com/photo-1764013290175-2b76e9a00b2e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzN8MHwxfHNlYXJjaHw0fHxzdXBlcmNhciUyMHNob3dyb29tfGVufDB8fHx8MTc4NzUxMDYwM3ww&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me standing inside a sleek exotic supercar showroom surrounded by gleaming luxury cars, dramatic lighting, photorealistic.',
  },
  {
    id: 'yacht-interior-lounge',
    label: 'Yacht Interior Lounge',
    category: 'yachts',
    thumb: 'https://images.unsplash.com/photo-1697124510322-27ef594f67fd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NDh8MHwxfHNlYXJjaHwxfHx5YWNodCUyMGludGVyaW9yfGVufDB8fHx8MTc4NzUxMDYwM3ww&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me relaxing inside a luxury yacht interior lounge, plush seating and wood decor, sea view through the windows, photorealistic.',
  },
  {
    id: 'yacht-marina-exterior',
    label: 'Superyacht Marina',
    category: 'yachts',
    thumb: 'https://images.unsplash.com/photo-1678122878191-79b60410779f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA0MTJ8MHwxfHNlYXJjaHwxfHx5YWNodCUyMG1hcmluYXxlbnwwfHx8fDE3ODc1MTA2MDN8MA&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me standing on a marina dock next to a docked superyacht exterior, sunny day, photorealistic.',
  },
  {
    id: 'jet-tarmac-exterior',
    label: 'Private Jet Tarmac',
    category: 'jets',
    thumb: 'https://images.unsplash.com/photo-1474302770737-173ee21bab63?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDB8MHwxfHNlYXJjaHwxfHxwcml2YXRlJTIwamV0fGVufDB8fHx8MTc4NzUxMDYwM3ww&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me walking down the stairs of a private jet parked on the tarmac, luggage nearby, dramatic sky, photorealistic.',
  },
  {
    id: 'jet-suite-interior',
    label: 'Private Jet Suite',
    category: 'jets',
    thumb: 'https://images.unsplash.com/photo-1625513123245-fcb02d69ad12?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzd8MHwxfHNlYXJjaHwyfHxqZXQlMjBpbnRlcmlvcnxlbnwwfHx8fDE3ODc1MTA2MDN8MA&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me seated in an ultra-luxurious private jet cabin suite, plush seating, warm ambient lighting, photorealistic.',
  },
  {
    id: 'infinity-pool-villa',
    label: 'Infinity Pool Villa',
    category: 'luxury',
    thumb: 'https://images.unsplash.com/photo-1543489822-c49534f3271f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTN8MHwxfHNlYXJjaHwxfHxpbmZpbml0eSUyMHBvb2x8ZW58MHx8fHwxNzg3NTEwNjAzfDA&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me relaxing at the edge of an infinity pool overlooking a stunning view, luxury villa, golden hour, photorealistic.',
  },
  {
    id: 'private-chef-dining',
    label: 'Private Chef Dining',
    category: 'luxury',
    thumb: 'https://images.unsplash.com/photo-1663530761401-15eefb544889?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODF8MHwxfHNlYXJjaHwyfHxmaW5lJTIwZGluaW5nfGVufDB8fHx8MTc4NzUxMDYwM3ww&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me seated at an elegant private chef fine-dining table, beautifully plated dishes and candlelight, photorealistic.',
  },
  {
    id: 'luxury-spa-retreat',
    label: 'Luxury Spa Retreat',
    category: 'luxury',
    thumb: 'https://images.unsplash.com/photo-1696841212541-449ca29397cc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNTl8MHwxfHNlYXJjaHw0fHxzcGElMjByZXRyZWF0fGVufDB8fHx8MTc4NzUxMDYwM3ww&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me relaxing in a luxurious spa retreat, candles and calm ambient lighting, plush robe, photorealistic.',
  },
  {
    id: 'overwater-bungalow',
    label: 'Overwater Bungalow',
    category: 'vacation',
    thumb: 'https://images.unsplash.com/photo-1637576308588-6647bf80944d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTF8MHwxfHNlYXJjaHwxfHxvdmVyd2F0ZXIlMjBidW5nYWxvd3xlbnwwfHx8fDE3ODc1MTA2MDN8MA&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me relaxing on the deck of a tropical overwater bungalow, turquoise water below, paradise vacation style, photorealistic.',
  },
  {
    id: 'desert-glamping',
    label: 'Desert Glamping',
    category: 'vacation',
    thumb: 'https://images.unsplash.com/photo-1613169620329-6785c004d900?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MTN8MHwxfHNlYXJjaHwxfHxkZXNlcnQlMjBnbGFtcGluZ3xlbnwwfHx8fDE3ODc1MTA2MDN8MA&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me relaxing outside a luxury glamping tent in the desert at sunset, warm golden light, adventurous vacation style, photorealistic.',
  },
  {
    id: 'cruise-ship-deck',
    label: 'Cruise Ship Deck',
    category: 'vacation',
    thumb: 'https://images.unsplash.com/photo-1599640842225-85d111c60e6b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTJ8MHwxfHNlYXJjaHwzfHxjcnVpc2UlMjBzaGlwfGVufDB8fHx8MTc4NzUxMDYwM3ww&ixlib=rb-4.1.0&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me standing on the deck of a luxury cruise ship, ocean view and pool area behind me, vacation atmosphere, photorealistic.',
  },
  // 6ª ronda de estilos (petición del usuario: "Quiero todos los estilos
  // de la categoria cars de larpgpt mejorados") — investigada la categoría
  // real "Cars" de larpgpt.com (crawl_tool + web_search_tool_v2: Lambo
  // Huracan, Lambo Studio, McLaren/Corvette/Urus Gas Station, Rolls Royce
  // Cash, Rodeo Drive Lambo, Countach Pose, Maybach Cigar, Dubai AMG Night,
  // Urus Rooftop Night, NYC BMW M4, Mansion Cash — LarpGPT usa fotos/
  // marcas reales de coches con el usuario compuesto encima; aquí se
  // recrean los MISMOS conceptos/escenas ("mejorados": prompts más
  // detallados y fotos de ejemplo curadas a mano, verificadas con fetch
  // real, en vez de depender de un asset de marca concreto). Categoría
  // "vehicles" se DIVIDIÓ en 3 más específicas para poder filtrar "Cars"
  // igual que larpgpt: `cars` (coches, 8 estilos existentes reclasificados
  // + estos 13 nuevos = 21), `yachts` (3) y `jets` (4); `luxury-train` pasó
  // a la categoría `luxury` (no es coche/yate/jet). Imágenes reales vía
  // vision_expert_agent (2ª y ÚLTIMA llamada permitida en esta sesión),
  // las 13 verificadas con fetch real (200 OK) antes de incluirlas.
  {
    id: 'lambo-huracan-night',
    label: 'Lambo Huracan Night',
    category: 'cars',
    thumb: 'https://images.unsplash.com/photo-1708063786668-925a5baf7444?crop=entropy&cs=srgb&fm=jpg&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me leaning against a bright orange Lamborghini Huracán parked on a city street at night, dramatic street lighting, confident pose, photorealistic.',
  },
  {
    id: 'lambo-studio',
    label: 'Lambo Studio Shoot',
    category: 'cars',
    thumb: 'https://images.pexels.com/photos/9545543/pexels-photo-9545543.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me posing next to a Lamborghini in a professional photo studio with dramatic spotlighting on a dark backdrop, magazine-quality automotive photography style.',
  },
  {
    id: 'mclaren-gas-station',
    label: 'McLaren Gas Station',
    category: 'cars',
    thumb: 'https://images.pexels.com/photos/29222191/pexels-photo-29222191.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me standing next to a McLaren supercar at a gas station at night, neon station lights, casual confident pose, photorealistic.',
  },
  {
    id: 'corvette-gas-station',
    label: 'Corvette Gas Station',
    category: 'cars',
    thumb: 'https://images.unsplash.com/photo-1643036166260-887917ea9732?crop=entropy&cs=srgb&fm=jpg&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me standing next to a bright red Corvette C8 at a gas station, daytime, casual pose, photorealistic.',
  },
  {
    id: 'rolls-royce-cash',
    label: 'Rolls Royce Cash',
    category: 'cars',
    thumb: 'https://images.unsplash.com/photo-1687634366070-c06d3f037154?crop=entropy&cs=srgb&fm=jpg&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me sitting in the back seat of a Rolls-Royce, surrounded by neatly stacked cash, luxurious leather interior, dramatic lighting, photorealistic.',
  },
  {
    id: 'rodeo-drive-lambo',
    label: 'Rodeo Drive Lambo',
    category: 'cars',
    thumb: 'https://images.unsplash.com/photo-1570829053985-56e661df1ca2?crop=entropy&cs=srgb&fm=jpg&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me standing next to a Lamborghini parked on an upscale shopping street lined with boutiques and palm trees, photorealistic.',
  },
  {
    id: 'countach-pose',
    label: 'Countach Pose',
    category: 'cars',
    thumb: 'https://images.unsplash.com/photo-1654938900760-1419ee86bc1d?crop=entropy&cs=srgb&fm=jpg&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me posing dramatically beside a classic Lamborghini Countach with its scissor door open, golden hour lighting, photorealistic.',
  },
  {
    id: 'maybach-cigar-night',
    label: 'Maybach Cigar Night',
    category: 'cars',
    thumb: 'https://images.unsplash.com/photo-1607892378625-68c08a8e038d?crop=entropy&cs=srgb&fm=jpg&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me leaning on a Maybach at night, holding a cigar, gold watch and confident expression, moody street lighting, photorealistic.',
  },
  {
    id: 'dubai-amg-night',
    label: 'Dubai AMG Night',
    category: 'cars',
    thumb: 'https://images.pexels.com/photos/17510822/pexels-photo-17510822.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: "Put me posing next to a Mercedes-AMG parked in front of Dubai's illuminated skyscrapers at night, neon city lights, photorealistic.",
  },
  {
    id: 'urus-rooftop-night',
    label: 'Urus Rooftop Night',
    category: 'cars',
    thumb: 'https://images.pexels.com/photos/17564913/pexels-photo-17564913.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me standing next to a Lamborghini Urus parked on a rooftop parking lot at night, city skyline lights in the background, photorealistic.',
  },
  {
    id: 'nyc-bmw-m4',
    label: 'NYC BMW M4',
    category: 'cars',
    thumb: 'https://images.unsplash.com/photo-1576289681078-d32a1bdcf9b5?crop=entropy&cs=srgb&fm=jpg&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me posing next to a BMW M4 parked on a New York City street at night, city lights and traffic in the background, photorealistic.',
  },
  {
    id: 'gas-station-urus',
    label: 'Gas Station Urus',
    category: 'cars',
    thumb: 'https://images.unsplash.com/photo-1775582524187-6c49b9947df5?crop=entropy&cs=srgb&fm=jpg&q=85&w=480&h=480&fit=crop',
    promptHint: 'Put me standing next to a Lamborghini Urus at a gas station at night, dramatic overhead lighting, photorealistic.',
  },
  {
    id: 'mansion-cash-arrival',
    label: 'Mansion Cash Arrival',
    category: 'cars',
    thumb: 'https://images.pexels.com/photos/20474659/pexels-photo-20474659.jpeg?auto=compress&cs=tinysrgb&w=480&h=480',
    promptHint: 'Put me standing beside a luxury SUV parked in the driveway of a grand mansion, holding stacks of cash, golden hour lighting, photorealistic.',
  },
]

// Categorías para el filtro de la galería (petición del usuario: "que se
// puedan elegir por categoria ej: luxury, vacation, etc"). `id: 'all'`
// siempre va primero y no filtra nada (muestra todos los estilos). El
// resto coincide EXACTAMENTE con los valores usados en `category` de cada
// preset de arriba — si se añade una categoría nueva en el futuro, hay que
// añadirla aquí también o sus estilos no aparecerán en ningún filtro salvo
// "All". `vehicles` se dividió en `cars`/`yachts`/`jets` (petición del
// usuario de tener una categoría "cars" explícita, igual que larpgpt).
export const AI_STYLE_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'luxury', label: 'Luxury' },
  { id: 'cars', label: 'Cars' },
  { id: 'yachts', label: 'Yachts' },
  { id: 'jets', label: 'Jets' },
  { id: 'vacation', label: 'Vacation' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'fantasy', label: 'Fantasy' },
]
