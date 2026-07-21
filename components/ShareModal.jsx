'use client'

import { useState } from 'react'
import { Send, Link2, Instagram, Check, ChevronDown } from 'lucide-react'
import BottomSheet from './BottomSheet'

const WhatsAppIcon = () => (
  // Glifo REAL de WhatsApp (path oficial de simple-icons) — antes era una
  // aproximación dibujada a mano que no coincidía exactamente con el logo real.
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="white" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.395-.025-.545-.075-.149-.67-1.62-1.12-2.57-.214-.46-.447-.48-.593-.48-.134 0-.278-.005-.42-.005-.143 0-.372.054-.569.266-.197.212-.754.734-.754 1.79s.754 2.37 1.046 2.77c.292.4.883 1.255 1.836 2.098 1.93 1.695 2.914 2.032 4.33 2.46.84.252 1.64.227 2.308.127.746-.112 1.758-.614 1.983-1.24.225-.626.225-1.16.157-1.26s-.297-.15-.594-.299z" />
  </svg>
)

const XIcon = () => (
  // Logo REAL de X (antes Twitter) — path oficial (simple-icons); antes se
  // usaba solo la letra "X" en texto, que no coincidía con el logo real.
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="white" aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)

/**
 * ShareModal — Hoja inferior de compartir estilo Instagram.
 */
export default function ShareModal({ open, postId, onClose, onShared }) {
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
    { key: 'dm', label: 'Send to', onClick: sendTo, bg: 'bg-zinc-100', icon: <Send className="w-6 h-6 text-zinc-700" strokeWidth={1.6} /> },
    { key: 'copy', label: copied ? 'Copied' : 'Copy link', onClick: copyLink, bg: 'bg-zinc-100', icon: copied ? <Check className="w-6 h-6 text-green-600" strokeWidth={2} /> : <Link2 className="w-6 h-6 text-zinc-700" strokeWidth={1.6} /> },
    { key: 'ig', label: 'Instagram', onClick: () => openUrl('https://www.instagram.com/'), bg: 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600', icon: <Instagram className="w-6 h-6 text-white" strokeWidth={1.8} /> },
    { key: 'wa', label: 'WhatsApp', onClick: () => openUrl(`https://wa.me/?text=${encodeURIComponent(shareUrl)}`), bg: 'bg-[#25D366]', icon: <WhatsAppIcon /> },
    { key: 'x', label: 'X', onClick: () => openUrl(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}`), bg: 'bg-black', icon: <XIcon /> },
  ]

  return (
    <BottomSheet open={open} onClose={onClose} hideHandle>
      <button
        type="button"
        onClick={onClose}
        aria-label="close"
        className="flex justify-center items-center pt-1.5 pb-0.5 shrink-0 active:scale-90 transition"
      >
        <ChevronDown className="w-4 h-4 text-zinc-500" strokeWidth={2.2} />
      </button>
      <div className="px-5 pb-1.5 shrink-0">
        <h3 className="text-center text-[12px] font-semibold text-zinc-800">Share</h3>
      </div>
      <div className="border-t border-zinc-100 px-4 py-6">
        <div className="grid grid-cols-5 gap-2">
          {options.map((o) => (
            <button key={o.key} onClick={() => { o.onClick?.(); onShared?.() }} className="flex flex-col items-center gap-2 active:scale-95 transition">
              <span className={`w-14 h-14 rounded-full flex items-center justify-center ${o.bg}`}>{o.icon}</span>
              <span className="text-[11px] text-zinc-600 text-center leading-tight">{o.label}</span>
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  )
}
