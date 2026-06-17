'use client'

import { useState } from 'react'
import { Send, Link2, Instagram, Check } from 'lucide-react'
import BottomSheet from './BottomSheet'

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="white" aria-hidden>
    <path d="M17.6 6.3A7.9 7.9 0 0 0 12 4a7.9 7.9 0 0 0-6.8 11.9L4 20l4.2-1.1A7.9 7.9 0 1 0 17.6 6.3zM12 18.5c-1.2 0-2.4-.3-3.4-.9l-.2-.1-2.5.6.7-2.4-.2-.3A6.5 6.5 0 1 1 12 18.5zm3.6-4.9c-.2-.1-1.2-.6-1.3-.6-.2-.1-.3-.1-.4.1l-.6.7c-.1.1-.2.2-.4.1a5.3 5.3 0 0 1-2.6-2.3c-.2-.3.2-.3.5-.9.1-.1 0-.3 0-.4l-.6-1.4c-.2-.4-.3-.3-.5-.3h-.3c-.1 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.4c.1.1 1.6 2.5 4 3.4.6.2 1 .4 1.3.5.6.2 1 .1 1.4.1.4 0 1.2-.5 1.4-1 .2-.5.2-.9.1-1z" />
  </svg>
)

/**
 * ShareModal — Hoja inferior de compartir estilo Instagram.
 */
export default function ShareModal({ open, postId, onClose }) {
  const [copied, setCopied] = useState(false)

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/?post=${postId}` : ''

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* noop */ }
  }
  const openUrl = (url) => { try { window.open(url, '_blank', 'noopener') } catch { /* noop */ } }
  const sendTo = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ url: shareUrl }) } catch { /* noop */ }
    } else {
      copyLink()
    }
  }

  const options = [
    { key: 'dm', label: 'Enviar a', onClick: sendTo, bg: 'bg-zinc-100', icon: <Send className="w-6 h-6 text-zinc-700" strokeWidth={1.6} /> },
    { key: 'copy', label: copied ? 'Copiado' : 'Copiar enlace', onClick: copyLink, bg: 'bg-zinc-100', icon: copied ? <Check className="w-6 h-6 text-green-600" strokeWidth={2} /> : <Link2 className="w-6 h-6 text-zinc-700" strokeWidth={1.6} /> },
    { key: 'ig', label: 'Instagram', onClick: () => openUrl('https://www.instagram.com/'), bg: 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600', icon: <Instagram className="w-6 h-6 text-white" strokeWidth={1.8} /> },
    { key: 'wa', label: 'WhatsApp', onClick: () => openUrl(`https://wa.me/?text=${encodeURIComponent(shareUrl)}`), bg: 'bg-[#25D366]', icon: <WhatsAppIcon /> },
    { key: 'x', label: 'X', onClick: () => openUrl(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}`), bg: 'bg-black', icon: <span className="text-white text-[20px] font-bold leading-none">X</span> },
  ]

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="px-5 pt-1 pb-3 shrink-0">
        <h3 className="text-center text-[15px] font-semibold text-zinc-900">Compartir</h3>
      </div>
      <div className="border-t border-zinc-100 px-4 py-6">
        <div className="grid grid-cols-5 gap-2">
          {options.map((o) => (
            <button key={o.key} onClick={o.onClick} className="flex flex-col items-center gap-2 active:scale-95 transition">
              <span className={`w-14 h-14 rounded-full flex items-center justify-center ${o.bg}`}>{o.icon}</span>
              <span className="text-[11px] text-zinc-600 text-center leading-tight">{o.label}</span>
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  )
}
