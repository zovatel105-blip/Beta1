'use client'

import React from 'react'

/**
 * ShareIcon - Flecha curva de "envío/compartir" estilo TikTok.
 * Outline por defecto (fill=none) para combinar con el resto de iconos finos.
 */
const ShareIcon = ({
  className = '',
  style,
  strokeWidth = 1.6,
  filled = false,
  ...props
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      style={style}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M21.6 12 L12.8 4.4 V8.6 C7.4 8.9 3.7 11.9 2.4 19 C5 15.2 8.2 13.9 12.8 13.9 V18.1 Z" />
    </svg>
  )
}

export default ShareIcon
