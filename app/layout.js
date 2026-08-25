import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import ConsentBanner from '@/components/ConsentBanner'

export const metadata = {
  title: 'SnapTok — Short vertical videos',
  description: 'Vertical feed of short videos, instant TikTok-style scrolling.',
}

// interactive-widget=overlays-content (Chrome/Android): el teclado nativo
// SUPERPONE el contenido en vez de encoger el viewport -pieza necesaria para
// que la barra de "Añadir comentario" del visor de publicaciones del perfil
// quede anclada justo encima del teclado sin que el vídeo de detrás se
// encoja/desplace-. Next.js 14 exige exportar viewport/themeColor aparte de
// metadata (antes daba warning "Unsupported metadata viewport").
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'overlays-content',
  themeColor: '#000000',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body className="bg-black text-white antialiased overscroll-none">
        <AuthProvider>
          {children}
          <ConsentBanner />
        </AuthProvider>
      </body>
    </html>
  )
}
