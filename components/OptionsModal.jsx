'use client'

import { useState } from 'react'
import { EyeOff, Flag, Ban, Link2, Check } from 'lucide-react'
import BottomSheet from './BottomSheet'

/**
 * OptionsModal — Hoja inferior de "tres puntos" estilo Instagram.
 * Opciones: No me interesa, Reportar, Bloquear usuario, Copiar enlace.
 */
export default function OptionsModal({ open, postId, onClose }) {
  const [copied, setCopied] = useState(false)

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/?post=${postId}` : ''

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => { setCopied(false); onClose?.() }, 900)
    } catch {
      onClose?.()
    }
  }

  const rows = [
    { key: 'ni', label: 'No me interesa', icon: <EyeOff className="w-[22px] h-[22px] text-zinc-700" strokeWidth={1.7} />, onClick: () => onClose?.(), danger: false },
    { key: 'report', label: 'Reportar', icon: <Flag className="w-[22px] h-[22px] text-red-600" strokeWidth={1.7} />, onClick: () => onClose?.(), danger: true },
    { key: 'block', label: 'Bloquear usuario', icon: <Ban className="w-[22px] h-[22px] text-red-600" strokeWidth={1.7} />, onClick: () => onClose?.(), danger: true },
    { key: 'copy', label: copied ? 'Enlace copiado' : 'Copiar enlace', icon: copied ? <Check className="w-[22px] h-[22px] text-green-600" strokeWidth={2} /> : <Link2 className="w-[22px] h-[22px] text-zinc-700" strokeWidth={1.7} />, onClick: copyLink, danger: false },
  ]

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="px-2 pt-1 pb-2">
        {rows.map((r) => (
          <button
            key={r.key}
            onClick={r.onClick}
            className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl hover:bg-zinc-50 active:bg-zinc-100 transition-colors ${r.danger ? 'text-red-600' : 'text-zinc-900'}`}
          >
            {r.icon}
            <span className="text-[15px] font-medium">{r.label}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}
