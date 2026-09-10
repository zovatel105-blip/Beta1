/**
 * Catálogo de mecánicas del Motor de Challenges Dinámico.
 *
 * ARQUITECTURA CLAVE: el motor NO tiene 25 implementaciones distintas de
 * votación. Cada mecánica de este catálogo declara un `inputType` (7 en
 * total: single_choice, multi_select, ranking, points, elimination,
 * save_choice, accept_reject) que reutiliza la MISMA lógica genérica de
 * voto/tally en `lib/challengeEngineStore.js`. Añadir la mecánica #26 es
 * simplemente añadir un objeto a este array — nunca hace falta tocar el
 * motor. Esto es lo que permite escalar más allá de estas 25 sin re-arquitectura.
 *
 * Las mecánicas "estructurales" (votación durante el vídeo / por segmentos)
 * no son un inputType aparte: la propia arquitectura de `moments[]` con
 * startTime/endTime YA implementa eso para cualquier mecánica.
 * Las mecánicas "de regla" (mayoría gana / umbral / desempate) tampoco son
 * un inputType aparte: son el campo `settings.resultRule` que se le puede
 * aplicar a cualquier mecánica de elección.
 */

export const CATEGORIES = [
  { id: 'competencia', label: 'Competencia' },
  { id: 'votacion', label: 'Votación' },
  { id: 'prediccion', label: 'Predicción' },
  { id: 'especial', label: 'Especial' },
]

export const INPUT_TYPES = {
  SINGLE_CHOICE: 'single_choice',   // elegir 1 de N opciones
  MULTI_SELECT: 'multi_select',     // elegir varias de N opciones
  RANKING: 'ranking',               // ordenar todas las opciones
  POINTS: 'points',                 // repartir puntos entre opciones
  ELIMINATION: 'elimination',       // votar para eliminar 1 opción
  SAVE_CHOICE: 'save_choice',       // votar para salvar 1 opción
  ACCEPT_REJECT: 'accept_reject',   // aceptar / rechazar
}

// id, label, category, inputType, minOptions, maxOptions, description, fixedOptions?
export const MECHANICS = [
  { id: '1vs1', label: '1 vs 1', category: 'competencia', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 2, description: 'Dos personas compiten directamente. La comunidad vota quién lo hizo mejor.' },
  { id: 'a_vs_b', label: 'A vs B', category: 'competencia', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 2, description: 'Dos opciones, objetos o acciones. Ideal para vídeos de pruebas.' },
  { id: 'multiple_choice', label: 'Múltiples opciones', category: 'votacion', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 3, maxOptions: 8, description: 'Más de dos alternativas. El usuario vota una sola opción.' },
  { id: 'poll', label: 'Encuesta', category: 'votacion', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 8, description: 'Una pregunta con varias respuestas, sin competición entre creadores.', allowMultipleDefault: true },
  { id: 'yes_no', label: 'Sí / No', category: 'votacion', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 2, description: 'Solo existen dos decisiones.', fixedOptions: ['Sí', 'No'] },
  { id: 'prediction', label: 'Predicción', category: 'prediccion', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 6, description: 'La comunidad predice qué ocurrirá. El resultado se revela después.', reveal: true },
  { id: 'guess_result', label: 'Adivina el resultado', category: 'prediccion', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 6, description: 'El usuario elige el resultado de una situación planteada en el vídeo.', reveal: true },
  { id: 'ranking', label: 'Ranking', category: 'votacion', inputType: INPUT_TYPES.RANKING, minOptions: 3, maxOptions: 8, description: 'La comunidad ordena o clasifica varias opciones.' },
  { id: 'choose_one', label: 'Elige uno', category: 'votacion', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 8, description: 'El creador presenta varias posibilidades y obliga a escoger una.' },
  { id: 'eliminate_one', label: 'Elimina uno', category: 'votacion', inputType: INPUT_TYPES.ELIMINATION, minOptions: 3, maxOptions: 8, description: 'Los usuarios votan qué opción debe desaparecer.' },
  { id: 'save_one', label: 'Salva uno', category: 'votacion', inputType: INPUT_TYPES.SAVE_CHOICE, minOptions: 3, maxOptions: 8, description: 'Lo contrario de eliminar: solo uno puede sobrevivir.' },
  { id: 'round_duel', label: 'Duelo por rondas', category: 'competencia', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 2, description: 'Varias opciones compiten en sucesivas rondas (usa varios momentos encadenados).', structural: true },
  { id: 'tournament', label: 'Torneo', category: 'competencia', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 2, description: 'El motor genera enfrentamientos y avanza a los ganadores (usa varios momentos encadenados).', structural: true },
  { id: 'answer_battle', label: 'Batalla de respuestas', category: 'competencia', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 4, description: 'Varios usuarios responden al mismo reto y la comunidad decide cuál es mejor.' },
  { id: 'open_challenge', label: 'Reto abierto', category: 'competencia', inputType: INPUT_TYPES.ACCEPT_REJECT, minOptions: 2, maxOptions: 2, description: 'El creador lanza un desafío que otras personas pueden responder.', fixedOptions: ['Aceptar', 'Rechazar'] },
  { id: 'challenge_chain', label: 'Cadena de Challenge', category: 'competencia', inputType: INPUT_TYPES.ACCEPT_REJECT, minOptions: 2, maxOptions: 2, description: 'Una persona responde y puede desafiar a otra, creando una cadena A→B→C.', fixedOptions: ['Aceptar', 'Rechazar'] },
  { id: 'accept_reject', label: 'Acepta / Rechaza', category: 'competencia', inputType: INPUT_TYPES.ACCEPT_REJECT, minOptions: 2, maxOptions: 2, description: 'El destinatario recibe un reto y puede aceptarlo o rechazarlo.', fixedOptions: ['Aceptar', 'Rechazar'] },
  { id: 'timed_voting', label: 'Votación durante el vídeo', category: 'especial', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 6, description: 'La opción de voto aparece solo en el instante correspondiente del vídeo.', structural: true },
  { id: 'segmented_voting', label: 'Votación por segmentos', category: 'especial', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 6, description: 'El vídeo se divide en segmentos independientes, cada uno con su propia pregunta.', structural: true },
  { id: 'cumulative_voting', label: 'Votación acumulativa', category: 'especial', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 6, description: 'Los votos de distintas fases se acumulan; gana quien tenga más puntos al final.', cumulative: true },
  { id: 'points_voting', label: 'Votación con puntos', category: 'especial', inputType: INPUT_TYPES.POINTS, minOptions: 2, maxOptions: 6, description: 'El usuario reparte puntos entre las opciones en vez de elegir una sola.', defaultMaxPoints: 10 },
  { id: 'majority_wins', label: 'Mayoría gana', category: 'especial', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 8, description: 'La opción con más votos gana automáticamente.', resultRule: 'majority' },
  { id: 'threshold', label: 'Umbral', category: 'especial', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 8, description: 'Una opción necesita alcanzar un % determinado para considerarse aprobada.', resultRule: 'threshold', defaultThreshold: 70 },
  { id: 'tiebreak', label: 'Desempate', category: 'especial', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 8, description: 'Si dos opciones empatan, se marca para generar una nueva ronda de desempate.', resultRule: 'tiebreak' },
  { id: 'reward_challenge', label: 'Challenge con recompensa', category: 'especial', inputType: INPUT_TYPES.SINGLE_CHOICE, minOptions: 2, maxOptions: 8, description: 'El reto está vinculado a una recompensa en monedas (tip) para quien lo complete.', rewardCapable: true },
]

export function getMechanicById(id) {
  return MECHANICS.find((m) => m.id === id) || null
}

export function getMechanicsByCategory() {
  return CATEGORIES.map((cat) => ({
    ...cat,
    mechanics: MECHANICS.filter((m) => m.category === cat.id),
  }))
}
