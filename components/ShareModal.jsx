'use client'

import { useState } from 'react'
import { X, Link2, Check, Facebook, Twitter, Send as Telegram, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ShareModal — Modal para compartir (copiar enlace + redes sociales).
 */
export default function ShareModal({ open, postId, onClose }) {
  const [copied, setCopied] = useState(false)

  if (!open) return null

  const shareUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/?post=${postId}` 
    : ''

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Error copying link:', err)
    }
  }

  const handleShare = (platform) => {
    const text = '¡Mira este video increíble!'
    let url = ''

    switch (platform) {
      case 'whatsapp':
        url = `https://wa.me/?text=${encodeURIComponent(text + ' ' + shareUrl)}`
        break
      case 'facebook':
        url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
        break
      case 'twitter':
        url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`
        break
      case 'telegram':
        url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`
        break
    }

    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full sm:w-[420px] bg-[#0a0a0b] sm:rounded-2xl rounded-t-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="text-white text-[17px] font-semibold">Compartir</h3>
          <button
            onClick={onClose}
            aria-label="cerrar"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        {/* Contenido */}
        <div className="px-5 py-6 space-y-6">
          {/* Copiar enlace */}
          <div>
            <p className="text-white/60 text-[13px] mb-2">Enlace del video</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white/5 rounded-lg px-4 py-3 overflow-hidden">
                <p className="text-white/80 text-[13px] truncate">{shareUrl}</p>
              </div>
              <button
                onClick={handleCopyLink}
                className={cn(
                  'px-5 py-3 rounded-lg font-medium text-[14px] transition-all flex items-center gap-2',
                  copied
                    ? 'bg-green-600 text-white'
                    : 'bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:scale-105 active:scale-95'
                )}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Redes sociales */}
          <div>
            <p className="text-white/60 text-[13px] mb-3">Compartir en redes sociales</p>
            <div className="grid grid-cols-4 gap-4">
              {/* WhatsApp */}
              <button
                onClick={() => handleShare('whatsapp')}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="w-14 h-14 rounded-full bg-[#25D366] flex items-center justify-center group-hover:scale-110 transition-transform">
                  <MessageCircle className="w-7 h-7 text-white" fill="white" />
                </div>
                <span className="text-white/80 text-[12px]">WhatsApp</span>
              </button>

              {/* Facebook */}
              <button
                onClick={() => handleShare('facebook')}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="w-14 h-14 rounded-full bg-[#1877F2] flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Facebook className="w-7 h-7 text-white" fill="white" />
                </div>
                <span className="text-white/80 text-[12px]">Facebook</span>
              </button>

              {/* Twitter/X */}
              <button
                onClick={() => handleShare('twitter')}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="w-14 h-14 rounded-full bg-black flex items-center justify-center ring-2 ring-white/20 group-hover:scale-110 transition-transform">
                  <Twitter className="w-6 h-6 text-white" fill="white" />
                </div>
                <span className="text-white/80 text-[12px]">Twitter</span>
              </button>

              {/* Telegram */}
              <button
                onClick={() => handleShare('telegram')}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="w-14 h-14 rounded-full bg-[#0088cc] flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Telegram className="w-6 h-6 text-white" />
                </div>
                <span className="text-white/80 text-[12px]">Telegram</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-lg border border-white/15 text-white/80 font-medium text-[14px] hover:bg-white/5 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
