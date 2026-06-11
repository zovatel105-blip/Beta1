'use client'

import { useState } from 'react'
import { X, Link2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ShareModal — Modal premium minimalista para compartir.
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

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4"
      style={{ zIndex: 9999 }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal Premium */}
      <div
        className="relative w-full max-w-[380px] bg-zinc-900/95 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header minimalista */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <h3 className="text-white text-[16px] font-medium tracking-tight">Compartir</h3>
          <button
            onClick={onClose}
            aria-label="cerrar"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5 text-white/60" strokeWidth={1.5} />
          </button>
        </div>

        {/* Contenido */}
        <div className="px-6 py-6 space-y-4">
          {/* URL Preview */}
          <div className="bg-white/5 rounded-2xl px-4 py-3 border border-white/5">
            <p className="text-white/50 text-[11px] uppercase tracking-wide font-medium mb-2">Enlace</p>
            <p className="text-white/80 text-[13px] truncate">{shareUrl}</p>
          </div>

          {/* Botón copiar */}
          <button
            onClick={handleCopyLink}
            className={cn(
              'w-full py-3.5 rounded-2xl font-medium text-[14px] transition-all flex items-center justify-center gap-2',
              copied
                ? 'bg-green-600 text-white'
                : 'bg-white text-black hover:bg-white/90 active:scale-[0.98]'
            )}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" strokeWidth={2.5} />
                <span>Enlace copiado</span>
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" strokeWidth={2.5} />
                <span>Copiar enlace</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
