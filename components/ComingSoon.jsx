// ComingSoon — pantalla mostrada en ordenadores/tablets (ver app/page.js:
// MOBILE_UA + BREAKPOINT). twyk es una experiencia de vídeo vertical pensada
// para gestos táctiles de móvil; en pantallas grandes no tiene sentido
// mostrar el feed, así que en su lugar se ve este aviso minimalista, con la
// misma estética (fondo negro, tipografía blanca, acento degradado
// morado/azul de la marca) que el resto de la app.
export default function ComingSoon() {
  return (
    <div className="w-screen h-[100dvh] bg-black flex flex-col items-center justify-center px-6 text-center">
      <div className="flex items-center gap-2 mb-10">
        <span className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-blue-500" />
        <span className="text-white/50 text-xs font-semibold tracking-[0.25em] uppercase">
          twyk
        </span>
      </div>
      <h1 className="text-white text-2xl sm:text-3xl font-semibold leading-snug max-w-sm">
        We&apos;re building something amazing.
      </h1>
      <p className="mt-4 bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent text-sm sm:text-base font-medium tracking-wide uppercase">
        Coming soon
      </p>
      <p className="mt-10 text-white/30 text-xs sm:text-sm max-w-xs">
        twyk is a mobile-only experience for now. Open this page on your phone.
      </p>
    </div>
  )
}
