/**
 * Agrupación de las 25 mecánicas de lib/challengeMechanics.js en 7
 * categorías simples (petición del cliente: "no quiero que me enseñen 25
 * opciones de golpe, quiero elegir primero qué quiero hacer"). Esto
 * alimenta el selector de DOS PASOS del "+ Challenge" en
 * ChallengeTimelineEditor.jsx: paso 1 = elegir una de estas 7 categorías,
 * paso 2 = lista compacta solo con las mecánicas de esa categoría.
 *
 * IMPORTANTE — esto es SOLO una capa de UI encima del catálogo real:
 *  - No modifica `lib/challengeMechanics.js` (ids, labels, inputType,
 *    minOptions/maxOptions, fixedOptions, resultRule, etc. quedan intactos).
 *  - No modifica las categorías `competencia/votacion/prediccion/especial`
 *    que ya usa el motor y la API pública `/api/challenge-mechanics`
 *    (`mech.category` sigue existiendo y se sigue usando para el punto de
 *    color en las listas — ver CATEGORY_COLOR en ChallengeTimelineEditor).
 *  - No cambia storage, votación, timestamps ni resultados.
 *  - Añadir la mecánica #26 en challengeMechanics.js y olvidarse de este
 *    archivo simplemente la deja sin categoría de UI (no rompe nada); hay
 *    que añadir su id a un `mechanicIds` de aquí para que aparezca en el
 *    selector de 2 pasos.
 *
 * Mapeo hecho por COMPORTAMIENTO real de cada mecánica (no por parecido
 * superficial de nombre con los ejemplos ilustrativos del cliente):
 *  - compete: enfrentamiento directo persona/equipo vs persona/equipo,
 *    incluidas las mecánicas "structural" de bracket/rondas encadenadas
 *    (round_duel, tournament) y el desempate (tiebreak).
 *  - vote: la comunidad elige entre opciones — incluye el reparto de
 *    puntos (points_voting) y la regla "gana mayoría" (majority_wins), que
 *    en esencia siguen siendo votar.
 *  - guess: intentar adivinar/predecir un resultado — incluye "umbral"
 *    (threshold), que es una variante de predicción con corte de %.
 *  - eliminate: hacer avanzar una competición eliminando, salvando,
 *    ordenando (ranking) o acumulando puntuación por rondas
 *    (cumulative_voting).
 *  - interact_video: la pregunta está anclada a un instante o segmento
 *    concreto del vídeo — las únicas 2 mecánicas cuya estructura gira en
 *    torno al propio reproductor (no a un bracket de rondas).
 *  - challenge: retar directamente a otra persona/creador.
 *  - reward: el reto lleva una recompensa/premio.
 */

import { Swords, Vote, Dices, ListOrdered, Video, Megaphone, Gift } from 'lucide-react'

export const MECHANIC_GROUPS = [
  {
    id: 'compete',
    label: 'Competir',
    subtitle: 'Que compitan entre sí',
    icon: Swords,
    mechanicIds: ['1vs1', 'round_duel', 'tournament', 'answer_battle', 'tiebreak'],
  },
  {
    id: 'vote',
    label: 'Votar',
    subtitle: 'Que la comunidad elija',
    icon: Vote,
    mechanicIds: ['a_vs_b', 'multiple_choice', 'poll', 'yes_no', 'choose_one', 'points_voting', 'majority_wins'],
  },
  {
    id: 'guess',
    label: 'Adivinar',
    subtitle: 'Que intenten predecir algo',
    icon: Dices,
    mechanicIds: ['prediction', 'guess_result', 'threshold'],
  },
  {
    id: 'eliminate',
    label: 'Eliminar / Rankear',
    subtitle: 'Eliminar, salvar o clasificar',
    icon: ListOrdered,
    mechanicIds: ['eliminate_one', 'save_one', 'ranking', 'cumulative_voting'],
  },
  {
    id: 'interact_video',
    label: 'Interactuar con el vídeo',
    subtitle: 'Preguntar mientras se reproduce',
    icon: Video,
    mechanicIds: ['timed_voting', 'segmented_voting'],
  },
  {
    id: 'challenge',
    label: 'Retar',
    subtitle: 'Retar a otras personas',
    icon: Megaphone,
    mechanicIds: ['open_challenge', 'challenge_chain', 'accept_reject'],
  },
  {
    id: 'reward',
    label: 'Recompensa',
    subtitle: 'Un reto con premio',
    icon: Gift,
    mechanicIds: ['reward_challenge'],
  },
]

export function getMechanicGroupFor(mechanicId) {
  return MECHANIC_GROUPS.find((g) => g.mechanicIds.includes(mechanicId)) || null
}
