import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import ConsentBanner from '@/components/ConsentBanner'

export const metadata = {
  title: 'SnapTok — Short vertical videos',
  description: 'Vertical feed of short videos, instant TikTok-style scrolling.',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
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
