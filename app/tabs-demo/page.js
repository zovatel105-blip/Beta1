'use client'
import { useState } from 'react'
import { Bookmark, Link as LinkIcon } from 'lucide-react'

const ColumnsIcon = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="3" y1="4" x2="3" y2="20" />
    <line x1="9" y1="4" x2="9" y2="20" />
    <line x1="15" y1="4" x2="15" y2="20" />
    <line x1="21" y1="4" x2="21" y2="20" />
    <line x1="3" y1="12" x2="21" y2="12" />
  </svg>
)

const ICONS = [
  { key: 'polls', render: (active) => <ColumnsIcon className={`w-[22px] h-[22px] ${active ? 'scale-105' : ''}`} /> },
  { key: 'saved', render: (active) => <Bookmark className="w-[22px] h-[22px]" strokeWidth={active ? 1.9 : 1.5} fill={active ? 'currentColor' : 'none'} /> },
  { key: 'links', render: (active) => <LinkIcon className="w-[22px] h-[22px]" strokeWidth={active ? 2 : 1.5} /> },
]

const GOLD = '#E4C79B'

/* ---------- Variante A: cápsula deslizante (segmented) ---------- */
function VariantA() {
  const [active, setActive] = useState('polls')
  const idx = ICONS.findIndex((t) => t.key === active)
  return (
    <div className="relative max-w-[360px] mx-auto w-full px-1">
      <div className="relative flex items-stretch bg-white/[0.04] border border-white/[0.07] rounded-2xl p-1">
        {/* cápsula */}
        <div
          className="absolute top-1 bottom-1 rounded-xl transition-all duration-300 ease-out"
          style={{
            width: `calc((100% - 0.5rem) / 3)`,
            left: `calc(0.25rem + ${idx} * ((100% - 0.5rem) / 3))`,
            background: 'linear-gradient(180deg, rgba(228,199,155,0.18), rgba(214,178,122,0.10))',
            border: '1px solid rgba(228,199,155,0.35)',
            boxShadow: '0 4px 14px -6px rgba(214,178,122,0.5)',
          }}
        />
        {ICONS.map((t) => {
          const on = active === t.key
          return (
            <button key={t.key} onClick={() => setActive(t.key)}
              className={`relative z-10 flex-1 flex items-center justify-center h-11 transition-colors duration-200 ${on ? 'text-[#E4C79B]' : 'text-zinc-500'}`}>
              {t.render(on)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Variante B: chips de icono (activo relleno dorado) ---------- */
function VariantB() {
  const [active, setActive] = useState('polls')
  return (
    <div className="max-w-[360px] mx-auto w-full px-1">
      <div className="flex items-center justify-center gap-3">
        {ICONS.map((t) => {
          const on = active === t.key
          return (
            <button key={t.key} onClick={() => setActive(t.key)}
              className={`flex-1 flex items-center justify-center h-12 rounded-2xl transition-all duration-200 ${
                on ? 'text-black' : 'text-zinc-400 bg-white/[0.04] border border-white/[0.06] hover:text-white'
              }`}
              style={on ? { background: `linear-gradient(180deg, ${GOLD}, #D6B27A)`, boxShadow: '0 6px 18px -6px rgba(214,178,122,0.6)' } : undefined}>
              {t.render(on)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Variante C: minimal con punto indicador ---------- */
function VariantC() {
  const [active, setActive] = useState('polls')
  return (
    <div className="max-w-[360px] mx-auto w-full px-1">
      <div className="flex items-stretch">
        {ICONS.map((t) => {
          const on = active === t.key
          return (
            <button key={t.key} onClick={() => setActive(t.key)}
              className={`relative flex-1 flex flex-col items-center justify-center gap-2 h-12 transition-colors duration-200 ${
                on ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'
              }`}>
              <span style={on ? { filter: 'drop-shadow(0 0 6px rgba(228,199,155,0.5))' } : undefined}>{t.render(on)}</span>
              <span className={`h-[6px] w-[6px] rounded-full transition-all duration-200 ${on ? 'opacity-100' : 'opacity-0'}`}
                style={{ background: GOLD }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Variante D: subrayado a ancho completo (más marcado) ---------- */
function VariantD() {
  const [active, setActive] = useState('polls')
  return (
    <div className="max-w-[360px] mx-auto w-full px-1">
      <div className="relative flex items-stretch">
        {ICONS.map((t) => {
          const on = active === t.key
          return (
            <button key={t.key} onClick={() => setActive(t.key)}
              className={`relative flex-1 flex items-center justify-center h-12 transition-colors duration-200 ${
                on ? 'text-[#E4C79B]' : 'text-zinc-600 hover:text-zinc-400'
              }`}>
              {t.render(on)}
              <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full transition-all duration-300"
                style={on ? { background: `linear-gradient(90deg, ${GOLD}, #D6B27A)`, boxShadow: '0 0 10px rgba(214,178,122,0.5)' } : { background: 'transparent' }} />
            </button>
          )
        })}
      </div>
      <div className="h-px bg-white/[0.08] -mt-px" />
    </div>
  )
}

export default function TabsDemo() {
  const Section = ({ title, sub, children }) => (
    <div className="space-y-3">
      <div>
        <p className="text-white font-semibold text-sm">{title}</p>
        <p className="text-zinc-500 text-xs">{sub}</p>
      </div>
      <div className="bg-[#0e0e10] border border-white/[0.06] rounded-3xl py-6">{children}</div>
    </div>
  )
  return (
    <div className="min-h-screen bg-[#0a0a0b] py-10 px-4">
      <div className="max-w-md mx-auto space-y-8">
        <h1 className="text-white text-xl font-bold text-center">Opciones de pestañas del perfil</h1>
        <Section title="Opción A — Cápsula deslizante" sub="Fondo dorado tenue que se desliza tras el icono activo">
          <VariantA />
        </Section>
        <Section title="Opción B — Chips (activo relleno dorado)" sub="Cada icono en su chip; el activo se rellena de dorado">
          <VariantB />
        </Section>
        <Section title="Opción C — Minimal con punto" sub="Iconos sueltos, punto dorado bajo el activo">
          <VariantC />
        </Section>
        <Section title="Opción D — Subrayado a ancho completo" sub="Barra dorada que cubre todo el ancho de la pestaña">
          <VariantD />
        </Section>
      </div>
    </div>
  )
}
