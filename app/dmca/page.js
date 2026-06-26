'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, Copyright, Send } from 'lucide-react'

const UPDATED = '26 de junio de 2025'

export default function DmcaPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    description: '',
    url: '',
    goodFaith: false,
  })

  const valid =
    form.name.trim() &&
    form.email.trim() &&
    form.description.trim() &&
    form.url.trim() &&
    form.goodFaith

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    const subject = encodeURIComponent('Notificación de infracción DMCA — Twyk')
    const body = encodeURIComponent(
      `Nombre del titular de los derechos: ${form.name}\n` +
      `Email de contacto: ${form.email}\n\n` +
      `Descripción del contenido protegido infringido:\n${form.description}\n\n` +
      `URL del contenido infractor en Twyk:\n${form.url}\n\n` +
      `Declaración de buena fe: El reclamante declara, de buena fe, que el uso del material descrito ` +
      `no está autorizado por el titular de los derechos, su agente o la ley, y que la información de ` +
      `esta notificación es exacta. Bajo pena de perjurio, el reclamante está autorizado para actuar ` +
      `en nombre del titular de los derechos.`
    )
    window.location.href = `mailto:twyk.apk@gmail.com?subject=${subject}&body=${body}`
  }

  const inputCls =
    'w-full bg-white/5 text-white placeholder:text-white/30 px-4 py-3 rounded-xl text-[14px] outline-none focus:bg-white/10 transition-all border border-white/10 focus:border-white/25'

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-8 transition">
          <ArrowLeft className="w-4 h-4" /> Volver a Twyk
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Copyright className="w-7 h-7 text-white" strokeWidth={1.6} />
          <h1 className="text-2xl font-bold tracking-tight">Política DMCA</h1>
        </div>
        <p className="text-white/40 text-sm mb-8">Última actualización: {UPDATED}</p>

        <div className="space-y-7 text-[15px] leading-relaxed text-white/75">
          <section>
            <p>
              Twyk respeta los derechos de propiedad intelectual y responde a las notificaciones de
              infracción conforme a la Digital Millennium Copyright Act (<strong>DMCA</strong>) de los
              Estados Unidos. Si crees que un vídeo u otro contenido publicado en Twyk infringe tus
              derechos de autor, envíanos una notificación usando el formulario de más abajo.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">Cómo reportar una infracción</h2>
            <p>
              Una notificación DMCA válida debe incluir: tu nombre, un email de contacto, la descripción
              del contenido protegido que se ha infringido, la URL exacta del contenido infractor en
              Twyk y una declaración de buena fe. Completa todos los campos del formulario y se generará
              un correo dirigido a nuestro agente DMCA.
            </p>
          </section>

          <form onSubmit={submit} className="space-y-4 rounded-2xl bg-zinc-900/60 border border-white/10 p-5">
            <div>
              <label className="block text-white/60 text-[12px] uppercase tracking-wide font-medium mb-2">Nombre</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Tu nombre completo"
                className={inputCls}
                required
              />
            </div>

            <div>
              <label className="block text-white/60 text-[12px] uppercase tracking-wide font-medium mb-2">Email de contacto</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="tu@email.com"
                className={inputCls}
                required
              />
            </div>

            <div>
              <label className="block text-white/60 text-[12px] uppercase tracking-wide font-medium mb-2">Descripción del contenido infringido</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe la obra protegida por derechos de autor que ha sido infringida"
                rows={3}
                className={inputCls + ' resize-y'}
                required
              />
            </div>

            <div>
              <label className="block text-white/60 text-[12px] uppercase tracking-wide font-medium mb-2">URL del contenido en Twyk</label>
              <input
                type="text"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://twyk.app/?post=..."
                className={inputCls}
                required
              />
            </div>

            <label className="flex items-start gap-3 text-[13px] text-white/70 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.goodFaith}
                onChange={(e) => setForm({ ...form, goodFaith: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-white"
                required
              />
              <span>
                Declaro, de buena fe y bajo pena de perjurio, que el uso del contenido descrito no está
                autorizado por el titular de los derechos, su agente o la ley, y que la información
                facilitada es exacta.
              </span>
            </label>

            <button
              type="submit"
              disabled={!valid}
              className={
                'w-full py-3.5 rounded-xl font-semibold text-[14px] transition-all flex items-center justify-center gap-2 ' +
                (valid ? 'bg-white text-black hover:bg-white/90 active:scale-[0.98]' : 'bg-white/15 text-white/40 cursor-not-allowed')
              }
            >
              <Send className="w-4 h-4" /> Enviar notificación DMCA
            </button>
            <p className="text-white/40 text-[11px] text-center">
              Se abrirá tu cliente de correo con la notificación dirigida a twyk.apk@gmail.com
            </p>
          </form>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">Cuentas reincidentes</h2>
            <p>
              Twyk aplica una <strong>política de terminación de cuentas reincidentes</strong>: los
              usuarios que infrinjan de forma repetida los derechos de autor de terceros verán su cuenta
              suspendida o eliminada de forma permanente.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">Contranotificación</h2>
            <p>
              Si tu contenido fue retirado por error, puedes enviar una contranotificación a{' '}
              <a href="mailto:twyk.apk@gmail.com" className="underline text-white/90 hover:text-white">twyk.apk@gmail.com</a>{' '}
              explicando por qué el material no infringe derechos de autor.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 text-sm text-white/50 flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/terms" className="hover:text-white">Términos de Uso</Link>
          <Link href="/privacy" className="hover:text-white">Política de Privacidad</Link>
        </div>
      </div>
    </div>
  )
}
