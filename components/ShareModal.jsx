'use client'

import { useState } from 'react'
import { Send, Link2, Instagram, Check, ChevronDown, Download } from 'lucide-react'
import BottomSheet from './BottomSheet'

const WhatsAppIcon = () => (
  // Logo REAL y COMPLETO de WhatsApp (path oficial de simple-icons: bocadillo + auricular).
  // El path anterior estaba incompleto/deformado (solo un fragmento del glifo del teléfono).
  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="white" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
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
 *
 * `mediaUrl` (opcional, foto o vídeo del lado VISIBLE de la publicación):
 * habilita "Save to device" — petición del usuario tras comparar con
 * larpgpt.com (punto de virality #2/#3 de ese análisis): hoy compartir solo
 * mandaba un LINK de vuelta a Twyk; para que cada publicación (sobre todo
 * las de Luxury Battle, pensadas para "flexear") funcione como su propio
 * anuncio gratis en Instagram/TikTok, la persona necesita el ARCHIVO limpio
 * (sin ninguna UI de la app) para publicarlo nativamente ahí, no solo un
 * enlace. Se descarga vía fetch+blob (no `<a href download>` directo) para
 * forzar la descarga real incluso en Safari/iOS con recursos de otro
 * "path" del mismo origen, y para poder mostrar feedback (spinner/check).
 */
export default function ShareModal({ open, postId, mediaUrl, onClose, onShared }) {
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/?post=${postId}` : ''

  // TWYK Engine: registra el compartido (señal fuerte del algoritmo del feed).
  // Fire-and-forget: nunca bloquea ni rompe la UI de compartir.
  const trackShare = () => {
    try {
      fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: postId }),
        credentials: 'include',
      }).catch(() => {})
    } catch { /* noop */ }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
      trackShare()
    } catch { /* noop */ }
  }
  const openUrl = (url) => { try { trackShare(); window.open(url, '_blank', 'noopener') } catch { /* noop */ } }
  const sendTo = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ url: shareUrl }); trackShare() } catch { /* noop */ }
    } else {
      copyLink()
    }
  }
  const downloadMedia = async () => {
    if (!mediaUrl || downloading) return
    setDownloading(true)
    try {
      const res = await fetch(mediaUrl)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const ext = mediaUrl.match(/\.[a-zA-Z0-9]+($|\?)/)?.[0]?.replace('?', '') || ''
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `twyk-${postId}${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 4000)
      trackShare()
      setDownloaded(true)
      setTimeout(() => setDownloaded(false), 1800)
    } catch { /* noop */ } finally {
      setDownloading(false)
    }
  }

  const options = [
    // Primera opción (prioridad visual, petición del usuario): el archivo
    // limpio para publicar fuera de Twyk. Solo aparece si esta tarjeta pasó
    // un `mediaUrl` (todas los tipos de publicación ya lo hacen, ver
    // CarouselSlide/DuetSlide/OpenChallengeSlide).
    ...(mediaUrl ? [{
      key: 'download',
      label: downloaded ? 'Saved' : downloading ? 'Saving...' : 'Save to device',
      onClick: downloadMedia,
      bg: 'bg-zinc-100',
      icon: downloaded
        ? <Check className="w-6 h-6 text-green-600" strokeWidth={2} />
        : <Download className={`w-6 h-6 text-zinc-700 ${downloading ? 'animate-pulse' : ''}`} strokeWidth={1.6} />,
    }] : []),
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
        <div className="grid grid-cols-3 gap-3">
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
