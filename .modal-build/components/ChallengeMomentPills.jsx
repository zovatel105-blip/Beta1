'use client'

/**
 * ChallengeMomentPills — presentación COMPARTIDA de "pregunta + opciones"
 * de un momento de Challenge.
 *
 * ÚNICA fuente de verdad del marcado/estilo que ve el espectador en el feed
 * (ChallengeMomentOverlay.jsx) Y el creador en el editor
 * (ChallengeTimelineEditor.jsx). Antes el editor dibujaba su propia
 * aproximación de las pastillas (mismas clases copiadas a mano, con riesgo
 * de irse desincronizando del feed real con el tiempo). Ahora ambos sitios
 * importan este mismo componente, así que la vista previa de edición es
 * IDÉNTICA, píxel a píxel, al resultado publicado — cero deriva visual.
 *
 * Modos:
 *  - Interactivo (feed, con voto): pasar `onOptionClick` (+ opcionalmente
 *    `isSelected`/`isCorrect`/`getLabel`) — las opciones se dibujan como
 *    <button>.
 *  - Solo lectura (editor, vista previa mientras se edita): omitir
 *    `onOptionClick` — las opciones se dibujan como <span> no interactivos,
 *    con exactamente las mismas clases visuales.
 *
 * `renderOptionIcon` — NEW, OPTIONAL, additive prop (Universal Challenge
 * Engine's "Guess the Actor" participant structure, see
 * `lib/universalChallengeParticipantStructures.js`): `(opt) => ReactNode`,
 * rendered before the option's label — e.g. a participant avatar, so a
 * vote-for-a-participant moment can show identity, not just text. Every
 * EXISTING call site (the legacy `ChallengeMomentOverlay.jsx` /
 * `ChallengeTimelineEditor.jsx`, and the Universal engine's own
 * ELIMINATION/SEQUENTIAL_MATCHUP/plain-PREDICTION renders) never passes
 * this prop, so their pills are byte-for-byte unchanged.
 */
export default function ChallengeMomentPills({
  question,
  options,
  isSelected,
  isCorrect,
  getLabel,
  onOptionClick,
  footer,
  className = '',
  renderOptionIcon,
}) {
  return (
    <div className={className}>
      <p className="text-white text-[12px] font-semibold drop-shadow-md mb-1.5 truncate">{question}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((opt) => {
          const selected = isSelected ? isSelected(opt) : false
          const correct = isCorrect ? isCorrect(opt) : false
          const label = getLabel ? getLabel(opt) : opt.label
          const Tag = onOptionClick ? 'button' : 'span'
          return (
            <Tag
              key={opt.id}
              {...(onOptionClick ? { onClick: (e) => { e.stopPropagation(); onOptionClick(opt) } } : {})}
              className={`px-3 py-1.5 rounded-full text-[12.5px] font-semibold border backdrop-blur-md transition whitespace-nowrap ${onOptionClick ? 'active:scale-95' : ''} ${renderOptionIcon ? 'inline-flex items-center gap-1.5' : ''} ${
                selected ? 'bg-white text-black border-white' : 'bg-black/40 text-white border-white/40'
              } ${correct ? 'ring-2 ring-emerald-400' : ''}`}
            >
              {renderOptionIcon && renderOptionIcon(opt)}
              {label}{correct && ' ✓'}
            </Tag>
          )
        })}
      </div>
      {footer}
    </div>
  )
}
