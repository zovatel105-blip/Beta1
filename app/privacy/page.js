import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'

export const metadata = {
  title: 'Política de Privacidad — Twyk',
  description: 'Política de Privacidad de Twyk. Cumple COPPA y CalOPPA.',
}

const UPDATED = '26 de junio de 2025'

export default function PrivacyPage() {
  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-2xl mx-auto px-5 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-8 transition">
          <ArrowLeft className="w-4 h-4" /> Volver a Twyk
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="w-7 h-7 text-white" strokeWidth={1.6} />
          <h1 className="text-2xl font-bold tracking-tight">Política de Privacidad</h1>
        </div>
        <p className="text-white/40 text-sm mb-8">Última actualización: {UPDATED}</p>

        <div className="space-y-7 text-[15px] leading-relaxed text-white/75">
          <section>
            <p>
              Esta Política de Privacidad explica cómo Twyk, la plataforma de retos de vídeo A/B
              (VS split-screen), recopila, usa y protege tu información. Cumplimos con la
              Children&apos;s Online Privacy Protection Act (<strong>COPPA</strong>) y con la California
              Online Privacy Protection Act (<strong>CalOPPA</strong>).
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">1. Datos que recopilamos</h2>
            <p>Para ofrecerte Twyk recopilamos únicamente los datos necesarios:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Email</strong> — para tu cuenta y comunicaciones esenciales.</li>
              <li><strong>Nombre de usuario</strong> — tu identidad pública en la plataforma.</li>
              <li><strong>Fecha de nacimiento</strong> — para verificar la edad mínima de 13 años (COPPA).</li>
              <li><strong>Vídeos subidos</strong> — el contenido que publicas en tus retos.</li>
              <li><strong>Votos</strong> — tus elecciones A/B en los retos.</li>
              <li><strong>Comentarios</strong> — el texto que publicas en las publicaciones.</li>
            </ul>
            <p className="mt-3">
              No recopilamos datos de geolocalización precisa, ni información de pago, ni datos
              biométricos.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">2. Cómo almacenamos tus datos</h2>
            <p>
              Tus datos se almacenan en una base de datos <strong>MongoDB</strong> alojada en
              <strong> servidores ubicados en los Estados Unidos</strong>. Las contraseñas se guardan
              cifradas (hash con bcrypt) y nunca en texto plano.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">3. Cómo usamos tus datos</h2>
            <p>
              Usamos tus datos exclusivamente para operar Twyk: autenticarte, mostrar tu contenido y tus
              retos, contabilizar votos, enviar notificaciones dentro de la app y aplicar la moderación
              de la comunidad. <strong>No vendemos ni alquilamos tus datos a terceros.</strong>
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">4. Privacidad de menores (COPPA)</h2>
            <p>
              Twyk no está dirigida a menores de 13 años y <strong>no recopilamos conscientemente datos
              de menores de 13 años</strong>. Durante el registro verificamos la edad mediante la fecha
              de nacimiento y bloqueamos a quienes no cumplen la edad mínima. Si crees que un menor de 13
              años nos ha facilitado datos, contáctanos y los eliminaremos.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">5. Cookies</h2>
            <p>
              Usamos <strong>únicamente cookies esenciales</strong> necesarias para mantener tu sesión
              iniciada y recordar tus preferencias básicas. No utilizamos cookies de publicidad ni de
              seguimiento de terceros.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">6. Tus derechos y solicitudes de datos</h2>
            <p>
              Puedes solicitar acceder, corregir o eliminar tus datos personales en cualquier momento.
              Para ejercer estos derechos (incluidos los derechos reconocidos por CalOPPA a los
              residentes de California), escríbenos a{' '}
              <a href="mailto:twyk.apk@gmail.com" className="underline text-white/90 hover:text-white">twyk.apk@gmail.com</a>.
              Atenderemos tu solicitud en un plazo razonable.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">7. Cambios en esta política</h2>
            <p>
              Podemos actualizar esta Política de Privacidad ocasionalmente. Publicaremos la versión
              vigente en esta página con su fecha de actualización.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">8. Contacto</h2>
            <p>
              Para cualquier consulta sobre privacidad o solicitudes de datos, contáctanos en{' '}
              <a href="mailto:twyk.apk@gmail.com" className="underline text-white/90 hover:text-white">twyk.apk@gmail.com</a>.
            </p>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 text-sm text-white/50 flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/terms" className="hover:text-white">Términos de Uso</Link>
          <Link href="/dmca" className="hover:text-white">Política DMCA</Link>
        </div>
      </div>
    </div>
  )
}
